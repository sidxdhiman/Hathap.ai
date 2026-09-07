import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Decision from '../models/Decision';
import Execution from '../models/Execution';
import Task from '../models/Task';
import Claim from '../models/Claim';
import Evidence from '../models/Evidence';
import ExecutionEvent from '../models/ExecutionEvent';
import { TaskExecutor } from '../decision/executor';
import { Worker } from '../tasks/worker';
import { DefaultTaskHandlerRegistry } from '../tasks/handlers';
import { researchHandler } from '../tasks/handlers/researchHandler';
import { researchService } from '../research/researchService';
import { resetResearchSource } from '../research/researchSourceFactory';
import { MockResearchSource } from '../research/mockResearchSource';
import {
  contentKeyForResult,
  evidenceDedupKey,
  normalizeQueryForDedup,
  normalizeUrlForDedup,
} from '../research/dedup';
import { RESEARCH_LIMITS } from '../research/limits';
import { ResearchService } from '../research/researchService';
import {
  TaskHandler,
  TaskHandlerContext,
  TaskHandlerResult,
  TaskHandlerRegistry,
  TaskType,
} from '../decision/types';

const TEST_URI = process.env.MONGODB_URI_TEST_RESEARCH || 'mongodb://localhost:27017/hathap_test_research';

// Use the deterministic mock provider for all integration tests.
process.env.HATHAP_RESEARCH_PROVIDER = 'mock';

/** Spies on the debate handler so the dependency graph can run without an LLM. */
class SpyDebateHandler implements TaskHandler {
  type: TaskType = 'debate';
  canHandle(_type: TaskType) {
    return true;
  }
  calls: Array<{ taskId: string; evidenceCount: number }> = [];
  async execute(_task: any, ctx: TaskHandlerContext): Promise<TaskHandlerResult> {
    const evidence = await researchService.getEvidenceViews(ctx.decisionId);
    this.calls.push({ taskId: ctx.taskId, evidenceCount: evidence.length });
    return { output: { spy: true, evidenceCount: evidence.length } };
  }
}

function makeRegistry(spyDebate?: SpyDebateHandler): TaskHandlerRegistry {
  const handlers: TaskHandler[] = [researchHandler];
  if (spyDebate) handlers.push(spyDebate);
  return new DefaultTaskHandlerRegistry(handlers);
}

function makeWorker(registry: TaskHandlerRegistry, opts: { maxConcurrent?: number; staleMs?: number } = {}) {
  const executor = new TaskExecutor({
    registry,
    workerId: 'research-test-worker',
    backoff: () => 5, // tiny backoff for fast tests
  });
  return new Worker({
    executor,
    pollIntervalMs: 100_000, // never self-tick; driven by tickNow()
    maxConcurrentTasks: opts.maxConcurrent ?? 4,
    staleTaskTimeoutMs: opts.staleMs ?? 120_000,
    recoveryBackoff: () => 5,
  });
}

async function clean(): Promise<void> {
  await Promise.all([
    Decision.deleteMany({}),
    Execution.deleteMany({}),
    Task.deleteMany({}),
    Claim.deleteMany({}),
    Evidence.deleteMany({}),
    ExecutionEvent.deleteMany({}),
  ]);
}

async function waitUntil(
  fn: () => Promise<boolean | null | undefined>,
  timeoutMs = 8000
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('Timed out waiting for condition');
}

async function driveUntil(worker: Worker, execId: string, predicate: (e: any) => boolean, ticks = 24): Promise<void> {
  for (let i = 0; i < ticks; i++) {
    const e = await Execution.findById(execId);
    if (e && predicate(e)) return;
    await worker.tickNow();
    await new Promise((r) => setTimeout(r, 10));
  }
  const e = await Execution.findById(execId);
  assert.ok(predicate(e), `predicate not satisfied; execution status=${e?.status}`);
}

let userId: string;
let decisionId: string;

before(async () => {
  resetResearchSource();
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(TEST_URI);
  }
  await clean();
  userId = new mongoose.Types.ObjectId().toString();
});

after(async () => {
  await clean();
  await mongoose.connection.close();
});

beforeEach(async () => {
  await clean();
  const decision = await Decision.create({
    userId,
    title: 'Research Engine Test',
    objective: 'Evaluate a hypothetical decision.',
    status: 'debating',
    currentPhase: 'debating',
    configuration: { strategy: 'consensus', maxRounds: 2 },
  });
  decisionId = decision._id.toString();
});

async function createResearchExecution(
  query: string,
  opts: { maxResults?: number; maxRetries?: number } = {}
): Promise<{ exec: any; task: any }> {
  const exec = await Execution.create({
    decisionId,
    status: 'queued',
    startedAt: new Date(),
    currentPhase: 'debating',
    progress: 0,
  });
  const task = await Task.create({
    executionId: exec._id,
    type: 'research',
    status: 'pending',
    input: { query, maxResults: opts.maxResults },
    maxRetries: opts.maxRetries ?? 2,
    priority: 10,
  });
  return { exec, task };
}

describe('Research engine - provider & handler', () => {
  test('a research task persists evidence with provenance and attribution claims', async () => {
    const { exec, task } = await createResearchExecution('quantum computing markets', { maxResults: 3 });
    const worker = makeWorker(makeRegistry());
    await driveUntil(worker, exec._id, (e) => e.status === 'completed');

    const fresh = await Task.findById(task._id) as any;
    assert.equal(fresh.status, 'completed', 'research task completes');
    assert.ok(fresh.result, 'task has result');
    assert.ok(fresh.result.resultCount >= 1, `mock provider produced results (got ${fresh.result.resultCount})`);
    assert.equal(fresh.result.empty, false);
    assert.ok(Array.isArray(fresh.result.evidenceIds) && fresh.result.evidenceIds.length >= 1);

    const evidenceDocs = await Evidence.find({ decisionId });
    assert.ok(evidenceDocs.length >= 1, 'evidence persisted');
    for (const e of evidenceDocs) {
      assert.equal(e.provenanceKind, 'retrieved');
      assert.equal(e.provider, 'mock');
    }
    const first = evidenceDocs[0] as any;
    assert.equal(String(first.executionId), String(exec._id), 'execution provenance recorded');
    assert.equal(String(first.taskId), String(task._id), 'task provenance recorded');
    assert.ok(first.dedupKey, 'dedup key recorded');
    assert.ok(first.contentKey, 'content key recorded');
    assert.equal(first.sourceReliability, 'medium', 'heuristic reliability label');
    assert.ok(first.relevanceScore >= 0 && first.relevanceScore <= 1, 'relevance score in range');
    assert.ok(first.retrievedAt instanceof Date, 'retrievedAt present');

    const claims = await Claim.find({ decisionId });
    assert.ok(claims.length >= 1, 'attribution claims created');
    const claim = claims[0] as any;
    assert.equal(claim.status, 'proposed');
    assert.equal(claim.provenanceKind, 'retrieved');
    assert.ok(claim.supportingEvidenceIds.length >= 1, 'supporting evidence linked');
    assert.deepEqual(claim.contradictingEvidenceIds, [], 'no contradictions in Phase 3');
    assert.ok(claim.text.includes('asserts'), 'attribution phrasing');
    assert.ok(claim.attribution?.sourceName, 'attribution metadata present');
  });

  test('empty provider results complete the task with empty=true and no evidence', async () => {
    const { exec, task } = await createResearchExecution('empty: nothing found');
    const worker = makeWorker(makeRegistry());
    await driveUntil(worker, exec._id, (e) => e.status === 'completed');

    const fresh = await Task.findById(task._id) as any;
    assert.equal(fresh.status, 'completed');
    assert.equal(fresh.result.empty, true);
    assert.equal(fresh.result.resultCount, 0);
    const evidenceDocs = await Evidence.find({ decisionId });
    assert.equal(evidenceDocs.length, 0, 'no evidence for an empty provider response');
  });

  test('invalid query is a permanent failure classified INVALID_REQUEST (non-retryable)', async () => {
    const { exec, task } = await createResearchExecution('invalid: {{malformed}}');
    const worker = makeWorker(makeRegistry());
    await driveUntil(worker, exec._id, (e) => e.status === 'failed');

    const fresh = await Task.findById(task._id) as any;
    assert.equal(fresh.status, 'failed');
    assert.equal(fresh.error.kind, 'non_retryable');
    assert.equal(fresh.error.code, 'INVALID_REQUEST');
    assert.equal(fresh.retryCount, 0, 'no retries for a permanent failure');
  });

  test('provider outage is retryable and exhausts retries into a permanent failure', async () => {
    const { exec, task } = await createResearchExecution('provider-outage: down', { maxRetries: 1 });
    const worker = makeWorker(makeRegistry());
    await driveUntil(worker, exec._id, (e) => e.status === 'failed');

    const fresh = await Task.findById(task._id) as any;
    assert.equal(fresh.status, 'failed');
    assert.equal(fresh.error.kind, 'retryable', 'outage is transient, so final error remains retryable-kind');
    assert.equal(fresh.error.code, 'PROVIDER_OUTAGE');
    assert.ok(fresh.retryCount >= 1, 'the failure was retried before exhaustion');
  });

  test('research content is clamped to the documented limits', async () => {
    const service = new ResearchService(
      () =>
        new MockResearchSource({
          fixtures: [
            {
              title: 'Huge page',
              url: 'https://example.com/huge',
              snippet: 's',
              content: 'x'.repeat(5000),
              retrievedAt: new Date(),
            },
          ],
        })
    );

    const outcome = await service.runResearch(
      { decisionId, executionId: undefined, taskId: undefined, userId },
      { query: 'big page limits', purpose: 'background', maxResults: 1 }
    );
    assert.equal(outcome.evidenceIds.length, 1);
    const doc = (await Evidence.findById(outcome.evidenceIds[0])) as any;
    assert.ok((doc.content || '').length <= RESEARCH_LIMITS.maxContentPerResult, 'content clamped');
    assert.ok((doc.snippet || '').length <= RESEARCH_LIMITS.maxSnippetLength, 'snippet clamped');
  });
});

describe('Research engine - dedup & idempotency', () => {
  test('re-running the same query across executions does not duplicate evidence', async () => {
    // First run: creates evidence for the query.
    const { exec: execA, task: taskA } = await createResearchExecution('dedup target tech');
    const worker = makeWorker(makeRegistry());
    await driveUntil(worker, execA._id, (e) => e.status === 'completed');
    const countAfterFirst = await Evidence.countDocuments({ decisionId });
    assert.ok(countAfterFirst >= 1, 'first run produced evidence');
    const taskAId = (await Task.findById(taskA._id))!._id.toString();

    // Second run: NEW execution, same decision, same normalized query.
    const { exec: execB } = await createResearchExecution('DEDUP TARGET    TECH', { maxResults: 3 });
    await driveUntil(worker, execB._id, (e) => e.status === 'completed');

    const countAfterSecond = await Evidence.countDocuments({ decisionId });
    assert.equal(countAfterSecond, countAfterFirst, 'dedup key prevents duplicate evidence');

    const taskB = (await Task.find({ executionId: execB._id }))[0] as any;
    assert.ok(taskB.result.reusedEvidenceIds.includes(taskAId) || taskB.result.reusedEvidenceIds.length >= 1,
      'second run reused existing evidence');
  });

  test('content-hash dedup reuses evidence already persisted by an earlier task', async () => {
    // Persist evidence manually (simulating an earlier research run), then run
    // a research task whose provider would return identical content for the
    // same query — it must reuse rather than duplicate.
    const { exec } = await createResearchExecution('content hash source');
    const worker = makeWorker(makeRegistry());
    await driveUntil(worker, exec._id, (e) => e.status === 'completed');
    const before = await Evidence.countDocuments({ decisionId });

    // Simulate a retry of the SAME task (e.g. it crashed before commit).
    const taskDoc = (await Task.find({ executionId: exec._id }))[0];
    await researchHandler.execute(
      {
        _id: taskDoc._id,
        type: 'research',
        input: { query: 'content hash source', maxResults: 3 },
      } as any,
      { userId, decisionId, executionId: exec._id.toString(), taskId: taskDoc._id.toString(), onUsage: () => {} }
    );

    const after = await Evidence.countDocuments({ decisionId });
    assert.equal(after, before, 'retried execution does not create duplicate evidence');
  });

  test('dedup identity functions are deterministic (unit)', async () => {
    const base = { decisionId: 'd1', provider: 'mock' };
    // evidenceDedupKey expects pre-normalized source keys, which the service
    // produces via sourceKeyForResult (URL normalization). Use those helpers so
    // the test mirrors real usage.
    const urlKey = normalizeUrlForDedup('https://Example.com/Page?utm_source=x#frag');
    assert.equal(urlKey, 'https://example.com/page');

    const a = evidenceDedupKey({ ...base, query: 'Cloud Security Best Practices', sourceKey: urlKey });
    const b = evidenceDedupKey({ ...base, query: 'cloud   security best practices', sourceKey: 'https://example.com/page' });
    assert.equal(a, b, 'normalized query + normalized url collapse to one identity');

    const c = evidenceDedupKey({ ...base, query: 'totally different query', sourceKey: 'https://example.com/page' });
    assert.notEqual(a, c, 'different query produces a different identity');

    assert.equal(normalizeQueryForDedup('  Foo  BAR '), 'foo bar');
    assert.notEqual(
      contentKeyForResult({ title: 'a', content: 'hello world' }),
      contentKeyForResult({ title: 'a', content: 'goodbye world' }),
      'different content hashes differ'
    );
  });
});

describe('Research engine - research -> debate dependency graph', () => {
  test('startDecision with 3 research queries runs research first, then the debate, to completion', async () => {
    const spy = new SpyDebateHandler();
    const registry = makeRegistry(spy);
    const decision = await Decision.create({
      userId,
      title: 'Dependency decision',
      objective: 'Decide on a platform.',
      status: 'draft',
      currentPhase: 'draft',
      configuration: { strategy: 'consensus', maxRounds: 2 },
    });
    const { decisionOrchestrator } = await import('../decision/orchestrator');

    const execution = await decisionOrchestrator.startDecision(decision._id.toString(), userId, {
      researchQueries: [
        { query: 'q1: platform A', purpose: 'market_research' },
        { query: 'q2: platform B', purpose: 'technical_research' },
        { query: 'q3: platform C', purpose: 'competitive_research' },
      ],
    });

    const researchTasks = await Task.find({ executionId: execution._id, type: 'research' }).sort({ createdAt: 1 });
    const debateTasks = await Task.find({ executionId: execution._id, type: 'debate' });
    assert.equal(researchTasks.length, 3, 'three research tasks created');
    assert.equal(debateTasks.length, 1, 'one debate task created');
    const debate = debateTasks[0];
    assert.equal(
      debate.dependencies.length,
      3,
      'debate depends on the research tasks'
    );
    const depIds = debate.dependencies.map((d) => d.toString());
    for (const rt of researchTasks) {
      assert.ok(depIds.includes(rt._id.toString()), 'dependency uses the real research task id');
    }

    const worker = makeWorker(registry);
    await driveUntil(worker, execution._id.toString(), (e) => e.status === 'completed');

    const researchFinal = await Task.find({ executionId: execution._id, type: 'research' });
    assert.ok(researchFinal.every((t) => t.status === 'completed'), 'all research tasks completed');
    const debateFinal = await Task.findById(debate._id) as any;
    assert.equal(debateFinal.status, 'completed', 'debate task completed');

    assert.equal(spy.calls.length, 1, 'debate handler ran once');
    assert.ok(spy.calls[0].evidenceCount >= 1, 'debate saw research evidence in context');
    assert.ok(
      debateFinal.completedAt &&
        researchFinal.every((t) => t.completedAt && t.completedAt <= debateFinal.completedAt),
      'debate ran only after research completed'
    );

    const execFinal = await Execution.findById(execution._id) as any;
    assert.equal(execFinal.status, 'completed');
  });

  test('startDecision without researchQueries keeps the single debated-task graph (backward compatible)', async () => {
    const { decisionOrchestrator } = await import('../decision/orchestrator');
    const decision = await Decision.create({
      userId,
      title: 'Legacy decision',
      objective: 'Something to decide.',
      status: 'draft',
      currentPhase: 'draft',
      configuration: { strategy: 'consensus', maxRounds: 2 },
    });
    const execution = await decisionOrchestrator.startDecision(decision._id.toString(), userId);
    const tasks = await Task.find({ executionId: execution._id });
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].type, 'debate');
    assert.deepEqual(tasks[0].dependencies, [], 'no research tasks => no dependencies');
  });
});

describe('Research engine - error classification mapping (unit)', () => {
  test('ResearchError codes map onto the shared ExecutionError codes', async () => {
    const { ResearchError } = await import('../research/researchError');
    const { classifyError, isRetryableError } = await import('../decision/errorClassifier');

    assert.equal(classifyError(new ResearchError('TIMEOUT', 't')), 'PROVIDER_OUTAGE');
    assert.equal(isRetryableError(new ResearchError('TIMEOUT', 't')), true);

    assert.equal(classifyError(new ResearchError('PROVIDER_UNAVAILABLE', 'p')), 'PROVIDER_OUTAGE');
    assert.equal(isRetryableError(new ResearchError('PROVIDER_UNAVAILABLE', 'p')), true);

    assert.equal(classifyError(new ResearchError('RATE_LIMITED', 'r')), 'RATE_LIMIT');
    assert.equal(isRetryableError(new ResearchError('RATE_LIMITED', 'r')), true);

    assert.equal(classifyError(new ResearchError('AUTHENTICATION_FAILURE', 'a')), 'INVALID_API_KEY');
    assert.equal(isRetryableError(new ResearchError('AUTHENTICATION_FAILURE', 'a')), false);

    assert.equal(classifyError(new ResearchError('INVALID_QUERY', 'q')), 'INVALID_REQUEST');
    assert.equal(isRetryableError(new ResearchError('INVALID_QUERY', 'q')), false);
  });
});