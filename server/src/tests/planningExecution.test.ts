import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Decision from '../models/Decision';
import Execution from '../models/Execution';
import Task from '../models/Task';
import Claim from '../models/Claim';
import Evidence from '../models/Evidence';
import VerificationResult from '../models/VerificationResult';
import RedTeamFinding from '../models/RedTeamFinding';
import ReconciliationResult from '../models/ReconciliationResult';
import EvidenceRelationship from '../models/EvidenceRelationship';
import ExecutionPlan from '../models/DecisionPlan';
import { TaskExecutor } from '../decision/executor';
import { Worker } from '../tasks/worker';
import { DefaultTaskHandlerRegistry } from '../tasks/handlers';
import { verifyClaimHandler } from '../tasks/handlers/verifyClaimHandler';
import { redTeamHandler } from '../tasks/handlers/redTeamHandler';
import { reconciliationHandler } from '../tasks/handlers/reconciliationHandler';
import { schedulePhase4DownstreamTasks } from '../tasks/handlers/debateHandler';
import { DecisionPlanner } from '../planning/planner';
import { makePlanningPolicy } from '../planning/planningPolicy';
import {
  TaskHandler,
  TaskHandlerRegistry,
  TaskHandlerContext,
  TaskType,
} from '../decision/types';
import { DecisionPlan as PlanShape, PlanCallFunction } from '../planning/planTypes';

const TEST_URI = process.env.MONGODB_URI_TEST || 'mongodb://localhost:27017/hathap_test_plan_exec';

/**
 * Fake research handler — creates local evidence without touching any provider.
 */
class FakeResearchHandler implements TaskHandler {
  type: TaskType = 'research';
  canHandle(type: TaskType) {
    return type === 'research';
  }
  async execute(task: any, context: TaskHandlerContext) {
    const query = String(task.input?.query || 'research');
    const evidence = await Evidence.create({
      decisionId: context.decisionId,
      executionId: context.executionId,
      taskId: context.taskId,
      type: 'research',
      title: `Evidence for "${query.slice(0, 60)}"`,
      content: `Content gathered for: ${query}`,
      sourceType: 'web',
      sourceName: 'fake-provider',
      provenanceKind: 'retrieved',
      retrievedAt: new Date(),
      query,
    });
    await Claim.create({
      decisionId: context.decisionId,
      executionId: context.executionId,
      taskId: context.taskId,
      text: `Source asserts: about "${query}"`,
      type: 'fact',
      status: 'proposed',
      evidenceIds: [evidence._id.toString()],
      supportingEvidenceIds: [evidence._id.toString()],
      provenanceKind: 'retrieved',
    });
    return {
      output: { query, provider: 'fake', resultCount: 1, empty: false, evidenceIds: [evidence._id.toString()] },
    };
  }
}

/**
 * Fake debate handler — produces a candidate verdict + claims, then drives the
 * REAL Phase 4 downstream scheduling honoring the plan's termination flags.
 */
class FakeDebateHandler implements TaskHandler {
  type: TaskType = 'debate';
  canHandle(type: TaskType) {
    return type === 'debate';
  }
  async execute(task: any, context: TaskHandlerContext) {
    const evidenceDocs = await Evidence.find({ decisionId: context.decisionId });
    const evidenceIds = evidenceDocs.map((e) => e._id.toString());
    // The assumption intentionally has NO evidence so the deterministic
    // red-team service flags it (invalid_assumption finding persisted).
    const claimants = [
      { text: 'Microservices reduce deployment downtime.', type: 'fact', evidenceIds: evidenceIds.slice(0, 1) },
      { text: 'The team has SRE expertise.', type: 'assumption', evidenceIds: [] },
    ];

    const persisted: string[] = [];
    for (let i = 0; i < claimants.length; i++) {
      const c = claimants[i];
      const doc = await Claim.create({
        decisionId: context.decisionId,
        executionId: context.executionId,
        taskId: context.taskId,
        text: c.text,
        type: c.type,
        status: 'proposed',
        evidenceIds: c.evidenceIds,
        supportingEvidenceIds: c.evidenceIds,
        provenanceKind: 'inferred',
      });
      persisted.push(doc._id.toString());
    }

    const decision = await Decision.findById(context.decisionId);
    const result = {
      verdict: { recommendation: 'Adopt microservices.', confidenceScore: 0.61 },
      messages: [],
    };

    // Honor the plan's termination flags exactly like the real debate handler.
    const termination = await resolveTermination(context.executionId);
    const phase4 = await schedulePhase4DownstreamTasks(context, result, decision, termination);

    return {
      output: {
        strategy: 'consensus',
        verdict: result.verdict,
        claimIds: persisted,
        candidateVerdict: result.verdict,
        phase4,
      },
    };
  }
}

async function resolveTermination(
  executionId: string
): Promise<{ verify: boolean; redTeam: boolean; reconciliation: boolean }> {
  const exec = await Execution.findById(executionId);
  if (!exec?.planId) return { verify: true, redTeam: true, reconciliation: true };
  const plan = await ExecutionPlan.findById(exec.planId);
  if (!plan?.termination) return { verify: true, redTeam: true, reconciliation: true };
  return {
    verify: plan.termination.requiresVerification !== false,
    redTeam: plan.termination.requiresRedTeam !== false,
    reconciliation: plan.termination.requiresReconciliation !== false,
  };
}

function makeRegistry(): TaskHandlerRegistry {
  return new DefaultTaskHandlerRegistry([
    new FakeResearchHandler(),
    new FakeDebateHandler(),
    verifyClaimHandler,
    redTeamHandler,
    reconciliationHandler,
  ]);
}

function makeWorker() {
  const executor = new TaskExecutor({
    registry: makeRegistry(),
    workerId: 'test-plan-worker',
    backoff: () => 5,
  });
  return new Worker({
    executor,
    pollIntervalMs: 100_000,
    maxConcurrentTasks: 6,
    staleTaskTimeoutMs: 120_000,
  });
}

function fullPlan(): PlanShape {
  return {
    version: '1.0',
    source: 'intelligent',
    tasks: [
      {
        tempId: 'research-1',
        type: 'research',
        purpose: 'Market research.',
        input: { query: 'market size for microservices', purpose: 'market_research', maxResults: 3 },
        dependsOn: [],
        priority: 10,
      },
      {
        tempId: 'research-2',
        type: 'research',
        purpose: 'Technical research.',
        input: { query: 'microservices operational complexity', purpose: 'technical_research', maxResults: 3 },
        dependsOn: [],
        priority: 10,
      },
      {
        tempId: 'debate',
        type: 'debate',
        purpose: 'Weigh the evidence and decide.',
        input: { strategy: 'consensus', description: 'Weigh the evidence.' },
        dependsOn: ['research-1', 'research-2'],
        priority: 1,
      },
    ],
    termination: { requiresVerification: true, requiresRedTeam: true, requiresReconciliation: true },
    rationale: { summary: 'full', research: '2', debate: '1', verification: 'on', redTeam: 'on' },
    estimates: { estimatedTasks: 3, estimatedResearchTasks: 2, estimatedLLMTasks: 1 },
  };
}

function simplifiedPlan(): PlanShape {
  return {
    version: '1.0',
    source: 'intelligent',
    tasks: [
      {
        tempId: 'debate',
        type: 'debate',
        purpose: 'Simple decision: debate it.',
        input: { strategy: 'judge', description: 'Simple decision.' },
        dependsOn: [],
        priority: 1,
      },
    ],
    termination: { requiresVerification: false, requiresRedTeam: false, requiresReconciliation: true },
    rationale: { summary: 'simple', research: 'none', debate: '1', verification: 'off', redTeam: 'off' },
    estimates: { estimatedTasks: 1, estimatedResearchTasks: 0, estimatedLLMTasks: 1 },
  };
}

let userId: string;
let decisionId: string;

before(async () => {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(TEST_URI);
  }
  await clean();
  userId = new mongoose.Types.ObjectId().toString();
  const decision = await Decision.create({
    userId,
    title: 'Planning E2E',
    objective: 'Should we adopt microservices?',
    context: 'Full graph.',
    status: 'debating',
    configuration: { strategy: 'consensus', maxRounds: 2 },
    assumptions: ['We can migrate gradually.'],
  });
  decisionId = decision._id.toString();
});

after(async () => {
  await clean();
  await mongoose.connection.close();
});

async function clean(): Promise<void> {
  await Promise.all([
    Decision.deleteMany({}),
    Execution.deleteMany({}),
    Task.deleteMany({}),
    Claim.deleteMany({}),
    Evidence.deleteMany({}),
    VerificationResult.deleteMany({}),
    RedTeamFinding.deleteMany({}),
    ReconciliationResult.deleteMany({}),
    EvidenceRelationship.deleteMany({}),
    ExecutionPlan.deleteMany({}),
  ]);
}

async function waitUntil(fn: () => Promise<boolean>, timeoutMs = 10_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 30));
  }
  throw new Error('Timed out waiting for condition');
}

const planCallFor = (plan: unknown): PlanCallFunction =>
  async () => ({ ok: true as const, text: JSON.stringify(plan) });

async function runPlannedExecution(plan: PlanShape): Promise<string> {
  const execution = await Execution.create({
    decisionId,
    status: 'pending',
    startedAt: new Date(),
    currentPhase: 'debating',
    progress: 0,
    planningStatus: 'planning',
    planningMode: 'intelligent',
  });
  const executionId = execution._id.toString();

  const planner = new DecisionPlanner({ policy: makePlanningPolicy() });
  const result = await planner.planExecution({
    executionId,
    userId,
    planningMode: 'intelligent',
    planCall: planCallFor(plan),
  });
  assert.equal(result.planSource, 'intelligent');

  // Persisted REAL task IDs from the planner (never tempIds).
  const compiled = result.compiled;
  assert.ok(compiled.taskIds.length >= 1);
  const tasks = await Task.find({ executionId });
  assert.equal(tasks.length, compiled.taskIds.length);
  assert.ok(tasks.every((t) => !String(t.type).startsWith('rm -rf')), 'no dangerous tasks compiled');

  // Queue the execution, exactly as startDecisionWithPlanning does.
  await Execution.updateOne({ _id: execution._id }, { $set: { status: 'queued', planningStatus: 'planned' } });

  const worker = makeWorker();
  for (let i = 0; i < 50 && (await Execution.findById(executionId))?.status !== 'completed'; i++) {
    await worker.tickNow();
    await new Promise((r) => setTimeout(r, 30));
  }
  await waitUntil(async () => {
    const e = await Execution.findById(executionId);
    return !!e && e.status === 'completed';
  });
  return executionId;
}

describe('Phase 5 — intelligent planning full execution graph (persistent, real task IDs)', () => {
  test('Decision → Planner → Validate → Compile → Scheduler → Research → Debate → Verify/RedTeam → Reconciliation → completed', async () => {
    const executionId = await runPlannedExecution(fullPlan());

    const tasks = await Task.find({ executionId }).sort({ type: 1 });
    const byType: Record<string, number> = {};
    for (const t of tasks) byType[t.type] = (byType[t.type] || 0) + 1;

    assert.ok(byType['research'] === 2, 'two planned research tasks executed');
    assert.ok(byType['debate'] === 1, 'planned debate executed');
    assert.ok(byType['verify_claim'] >= 1, 'verification tasks ran per selected claims');
    assert.ok(byType['red_team'] === 1, 'red team ran exactly once');
    assert.ok(byType['reconciliation'] === 1, 'reconciliation ran exactly once');

    for (const t of tasks) {
      assert.equal(t.status, 'completed', `task ${t.type} should complete`);
    }

    const verifications = await VerificationResult.find({ decisionId });
    assert.ok(verifications.length >= 1, 'verification results persisted');

    const findings = await RedTeamFinding.find({ decisionId });
    assert.ok(findings.length >= 1, 'red team findings persisted');

    const recon = await ReconciliationResult.findOne({ decisionId });
    assert.ok(recon, 'reconciliation persisted');
    assert.ok(recon.recommendation, 'reconciliation carries the final recommendation');

    const decision = await Decision.findById(decisionId);
    assert.equal(decision!.status, 'completed', 'decision completed via the planned graph');
    assert.equal(decision!.currentPhase, 'completed');

    const planDoc = await ExecutionPlan.findOne({ executionId });
    assert.ok(planDoc);
    assert.equal(planDoc!.status, 'compiled');
    assert.equal(planDoc!.termination.requiresVerification, true);
  });

  test('a simplified plan (no verification/red team) executes fewer tasks end-to-end', async () => {
    const executionId = await runPlannedExecution(simplifiedPlan());

    const tasks = await Task.find({ executionId }).sort({ type: 1 });
    const types = tasks.map((t) => t.type);
    assert.ok(types.includes('debate'));
    assert.ok(!types.includes('research'), 'simplified plan skipped research');
    assert.ok(!types.includes('verify_claim'), 'simplified plan skipped verification');
    assert.ok(!types.includes('red_team'), 'simplified plan skipped red team');

    const exec = await Execution.findById(executionId);
    assert.equal(exec!.status, 'completed');
    assert.equal(exec!.planningStatus, 'planned');
  });

  test('malformed planner output falls back to a valid baseline and still executes', async () => {
    const execution = await Execution.create({
      decisionId,
      status: 'pending',
      startedAt: new Date(),
      currentPhase: 'debating',
      progress: 0,
      planningStatus: 'planning',
      planningMode: 'intelligent',
    });
    const executionId = execution._id.toString();

    const planner = new DecisionPlanner({ policy: makePlanningPolicy() });
    const result = await planner.planExecution({
      executionId,
      userId,
      planningMode: 'intelligent',
      planCall: planCallFor('{{{ not json'),
    });
    assert.equal(result.planSource, 'baseline');
    assert.ok(result.compiled.taskIds.length >= 1);

    await Execution.updateOne({ _id: execution._id }, { $set: { status: 'queued', planningStatus: 'planned' } });

    const worker = makeWorker();
    for (let i = 0; i < 50 && (await Execution.findById(executionId))?.status !== 'completed'; i++) {
      await worker.tickNow();
      await new Promise((r) => setTimeout(r, 30));
    }
    await waitUntil(async () => {
      const e = await Execution.findById(executionId);
      return !!e && e.status === 'completed';
    });
    assert.equal((await Execution.findById(executionId))!.status, 'completed');
    const planDoc = await ExecutionPlan.findOne({ executionId });
    assert.ok(['fallback','baseline'].includes(planDoc!.source));
  });
});