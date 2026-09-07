"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const mongoose_1 = __importDefault(require("mongoose"));
const Decision_1 = __importDefault(require("../models/Decision"));
const Execution_1 = __importDefault(require("../models/Execution"));
const Task_1 = __importDefault(require("../models/Task"));
const Claim_1 = __importDefault(require("../models/Claim"));
const Evidence_1 = __importDefault(require("../models/Evidence"));
const ExecutionEvent_1 = __importDefault(require("../models/ExecutionEvent"));
const executor_1 = require("../decision/executor");
const worker_1 = require("../tasks/worker");
const handlers_1 = require("../tasks/handlers");
const researchHandler_1 = require("../tasks/handlers/researchHandler");
const researchService_1 = require("../research/researchService");
const researchSourceFactory_1 = require("../research/researchSourceFactory");
const mockResearchSource_1 = require("../research/mockResearchSource");
const dedup_1 = require("../research/dedup");
const limits_1 = require("../research/limits");
const researchService_2 = require("../research/researchService");
const TEST_URI = process.env.MONGODB_URI_TEST_RESEARCH || 'mongodb://localhost:27017/hathap_test_research';
// Use the deterministic mock provider for all integration tests.
process.env.HATHAP_RESEARCH_PROVIDER = 'mock';
/** Spies on the debate handler so the dependency graph can run without an LLM. */
class SpyDebateHandler {
    constructor() {
        this.type = 'debate';
        this.calls = [];
    }
    canHandle(_type) {
        return true;
    }
    async execute(_task, ctx) {
        const evidence = await researchService_1.researchService.getEvidenceViews(ctx.decisionId);
        this.calls.push({ taskId: ctx.taskId, evidenceCount: evidence.length });
        return { output: { spy: true, evidenceCount: evidence.length } };
    }
}
function makeRegistry(spyDebate) {
    const handlers = [researchHandler_1.researchHandler];
    if (spyDebate)
        handlers.push(spyDebate);
    return new handlers_1.DefaultTaskHandlerRegistry(handlers);
}
function makeWorker(registry, opts = {}) {
    const executor = new executor_1.TaskExecutor({
        registry,
        workerId: 'research-test-worker',
        backoff: () => 5, // tiny backoff for fast tests
    });
    return new worker_1.Worker({
        executor,
        pollIntervalMs: 100000, // never self-tick; driven by tickNow()
        maxConcurrentTasks: opts.maxConcurrent ?? 4,
        staleTaskTimeoutMs: opts.staleMs ?? 120000,
        recoveryBackoff: () => 5,
    });
}
async function clean() {
    await Promise.all([
        Decision_1.default.deleteMany({}),
        Execution_1.default.deleteMany({}),
        Task_1.default.deleteMany({}),
        Claim_1.default.deleteMany({}),
        Evidence_1.default.deleteMany({}),
        ExecutionEvent_1.default.deleteMany({}),
    ]);
}
async function waitUntil(fn, timeoutMs = 8000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        if (await fn())
            return;
        await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error('Timed out waiting for condition');
}
async function driveUntil(worker, execId, predicate, ticks = 24) {
    for (let i = 0; i < ticks; i++) {
        const e = await Execution_1.default.findById(execId);
        if (e && predicate(e))
            return;
        await worker.tickNow();
        await new Promise((r) => setTimeout(r, 10));
    }
    const e = await Execution_1.default.findById(execId);
    strict_1.default.ok(predicate(e), `predicate not satisfied; execution status=${e?.status}`);
}
let userId;
let decisionId;
(0, node_test_1.before)(async () => {
    (0, researchSourceFactory_1.resetResearchSource)();
    if (mongoose_1.default.connection.readyState === 0) {
        await mongoose_1.default.connect(TEST_URI);
    }
    await clean();
    userId = new mongoose_1.default.Types.ObjectId().toString();
});
(0, node_test_1.after)(async () => {
    await clean();
    await mongoose_1.default.connection.close();
});
(0, node_test_1.beforeEach)(async () => {
    await clean();
    const decision = await Decision_1.default.create({
        userId,
        title: 'Research Engine Test',
        objective: 'Evaluate a hypothetical decision.',
        status: 'debating',
        currentPhase: 'debating',
        configuration: { strategy: 'consensus', maxRounds: 2 },
    });
    decisionId = decision._id.toString();
});
async function createResearchExecution(query, opts = {}) {
    const exec = await Execution_1.default.create({
        decisionId,
        status: 'queued',
        startedAt: new Date(),
        currentPhase: 'debating',
        progress: 0,
    });
    const task = await Task_1.default.create({
        executionId: exec._id,
        type: 'research',
        status: 'pending',
        input: { query, maxResults: opts.maxResults },
        maxRetries: opts.maxRetries ?? 2,
        priority: 10,
    });
    return { exec, task };
}
(0, node_test_1.describe)('Research engine - provider & handler', () => {
    (0, node_test_1.test)('a research task persists evidence with provenance and attribution claims', async () => {
        const { exec, task } = await createResearchExecution('quantum computing markets', { maxResults: 3 });
        const worker = makeWorker(makeRegistry());
        await driveUntil(worker, exec._id, (e) => e.status === 'completed');
        const fresh = await Task_1.default.findById(task._id);
        strict_1.default.equal(fresh.status, 'completed', 'research task completes');
        strict_1.default.ok(fresh.result, 'task has result');
        strict_1.default.ok(fresh.result.resultCount >= 1, `mock provider produced results (got ${fresh.result.resultCount})`);
        strict_1.default.equal(fresh.result.empty, false);
        strict_1.default.ok(Array.isArray(fresh.result.evidenceIds) && fresh.result.evidenceIds.length >= 1);
        const evidenceDocs = await Evidence_1.default.find({ decisionId });
        strict_1.default.ok(evidenceDocs.length >= 1, 'evidence persisted');
        for (const e of evidenceDocs) {
            strict_1.default.equal(e.provenanceKind, 'retrieved');
            strict_1.default.equal(e.provider, 'mock');
        }
        const first = evidenceDocs[0];
        strict_1.default.equal(String(first.executionId), String(exec._id), 'execution provenance recorded');
        strict_1.default.equal(String(first.taskId), String(task._id), 'task provenance recorded');
        strict_1.default.ok(first.dedupKey, 'dedup key recorded');
        strict_1.default.ok(first.contentKey, 'content key recorded');
        strict_1.default.equal(first.sourceReliability, 'medium', 'heuristic reliability label');
        strict_1.default.ok(first.relevanceScore >= 0 && first.relevanceScore <= 1, 'relevance score in range');
        strict_1.default.ok(first.retrievedAt instanceof Date, 'retrievedAt present');
        const claims = await Claim_1.default.find({ decisionId });
        strict_1.default.ok(claims.length >= 1, 'attribution claims created');
        const claim = claims[0];
        strict_1.default.equal(claim.status, 'proposed');
        strict_1.default.equal(claim.provenanceKind, 'retrieved');
        strict_1.default.ok(claim.supportingEvidenceIds.length >= 1, 'supporting evidence linked');
        strict_1.default.deepEqual(claim.contradictingEvidenceIds, [], 'no contradictions in Phase 3');
        strict_1.default.ok(claim.text.includes('asserts'), 'attribution phrasing');
        strict_1.default.ok(claim.attribution?.sourceName, 'attribution metadata present');
    });
    (0, node_test_1.test)('empty provider results complete the task with empty=true and no evidence', async () => {
        const { exec, task } = await createResearchExecution('empty: nothing found');
        const worker = makeWorker(makeRegistry());
        await driveUntil(worker, exec._id, (e) => e.status === 'completed');
        const fresh = await Task_1.default.findById(task._id);
        strict_1.default.equal(fresh.status, 'completed');
        strict_1.default.equal(fresh.result.empty, true);
        strict_1.default.equal(fresh.result.resultCount, 0);
        const evidenceDocs = await Evidence_1.default.find({ decisionId });
        strict_1.default.equal(evidenceDocs.length, 0, 'no evidence for an empty provider response');
    });
    (0, node_test_1.test)('invalid query is a permanent failure classified INVALID_REQUEST (non-retryable)', async () => {
        const { exec, task } = await createResearchExecution('invalid: {{malformed}}');
        const worker = makeWorker(makeRegistry());
        await driveUntil(worker, exec._id, (e) => e.status === 'failed');
        const fresh = await Task_1.default.findById(task._id);
        strict_1.default.equal(fresh.status, 'failed');
        strict_1.default.equal(fresh.error.kind, 'non_retryable');
        strict_1.default.equal(fresh.error.code, 'INVALID_REQUEST');
        strict_1.default.equal(fresh.retryCount, 0, 'no retries for a permanent failure');
    });
    (0, node_test_1.test)('provider outage is retryable and exhausts retries into a permanent failure', async () => {
        const { exec, task } = await createResearchExecution('provider-outage: down', { maxRetries: 1 });
        const worker = makeWorker(makeRegistry());
        await driveUntil(worker, exec._id, (e) => e.status === 'failed');
        const fresh = await Task_1.default.findById(task._id);
        strict_1.default.equal(fresh.status, 'failed');
        strict_1.default.equal(fresh.error.kind, 'retryable', 'outage is transient, so final error remains retryable-kind');
        strict_1.default.equal(fresh.error.code, 'PROVIDER_OUTAGE');
        strict_1.default.ok(fresh.retryCount >= 1, 'the failure was retried before exhaustion');
    });
    (0, node_test_1.test)('research content is clamped to the documented limits', async () => {
        const service = new researchService_2.ResearchService(() => new mockResearchSource_1.MockResearchSource({
            fixtures: [
                {
                    title: 'Huge page',
                    url: 'https://example.com/huge',
                    snippet: 's',
                    content: 'x'.repeat(5000),
                    retrievedAt: new Date(),
                },
            ],
        }));
        const outcome = await service.runResearch({ decisionId, executionId: undefined, taskId: undefined, userId }, { query: 'big page limits', purpose: 'background', maxResults: 1 });
        strict_1.default.equal(outcome.evidenceIds.length, 1);
        const doc = (await Evidence_1.default.findById(outcome.evidenceIds[0]));
        strict_1.default.ok((doc.content || '').length <= limits_1.RESEARCH_LIMITS.maxContentPerResult, 'content clamped');
        strict_1.default.ok((doc.snippet || '').length <= limits_1.RESEARCH_LIMITS.maxSnippetLength, 'snippet clamped');
    });
});
(0, node_test_1.describe)('Research engine - dedup & idempotency', () => {
    (0, node_test_1.test)('re-running the same query across executions does not duplicate evidence', async () => {
        // First run: creates evidence for the query.
        const { exec: execA, task: taskA } = await createResearchExecution('dedup target tech');
        const worker = makeWorker(makeRegistry());
        await driveUntil(worker, execA._id, (e) => e.status === 'completed');
        const countAfterFirst = await Evidence_1.default.countDocuments({ decisionId });
        strict_1.default.ok(countAfterFirst >= 1, 'first run produced evidence');
        const taskAId = (await Task_1.default.findById(taskA._id))._id.toString();
        // Second run: NEW execution, same decision, same normalized query.
        const { exec: execB } = await createResearchExecution('DEDUP TARGET    TECH', { maxResults: 3 });
        await driveUntil(worker, execB._id, (e) => e.status === 'completed');
        const countAfterSecond = await Evidence_1.default.countDocuments({ decisionId });
        strict_1.default.equal(countAfterSecond, countAfterFirst, 'dedup key prevents duplicate evidence');
        const taskB = (await Task_1.default.find({ executionId: execB._id }))[0];
        strict_1.default.ok(taskB.result.reusedEvidenceIds.includes(taskAId) || taskB.result.reusedEvidenceIds.length >= 1, 'second run reused existing evidence');
    });
    (0, node_test_1.test)('content-hash dedup reuses evidence already persisted by an earlier task', async () => {
        // Persist evidence manually (simulating an earlier research run), then run
        // a research task whose provider would return identical content for the
        // same query — it must reuse rather than duplicate.
        const { exec } = await createResearchExecution('content hash source');
        const worker = makeWorker(makeRegistry());
        await driveUntil(worker, exec._id, (e) => e.status === 'completed');
        const before = await Evidence_1.default.countDocuments({ decisionId });
        // Simulate a retry of the SAME task (e.g. it crashed before commit).
        const taskDoc = (await Task_1.default.find({ executionId: exec._id }))[0];
        await researchHandler_1.researchHandler.execute({
            _id: taskDoc._id,
            type: 'research',
            input: { query: 'content hash source', maxResults: 3 },
        }, { userId, decisionId, executionId: exec._id.toString(), taskId: taskDoc._id.toString(), onUsage: () => { } });
        const after = await Evidence_1.default.countDocuments({ decisionId });
        strict_1.default.equal(after, before, 'retried execution does not create duplicate evidence');
    });
    (0, node_test_1.test)('dedup identity functions are deterministic (unit)', async () => {
        const base = { decisionId: 'd1', provider: 'mock' };
        // evidenceDedupKey expects pre-normalized source keys, which the service
        // produces via sourceKeyForResult (URL normalization). Use those helpers so
        // the test mirrors real usage.
        const urlKey = (0, dedup_1.normalizeUrlForDedup)('https://Example.com/Page?utm_source=x#frag');
        strict_1.default.equal(urlKey, 'https://example.com/page');
        const a = (0, dedup_1.evidenceDedupKey)({ ...base, query: 'Cloud Security Best Practices', sourceKey: urlKey });
        const b = (0, dedup_1.evidenceDedupKey)({ ...base, query: 'cloud   security best practices', sourceKey: 'https://example.com/page' });
        strict_1.default.equal(a, b, 'normalized query + normalized url collapse to one identity');
        const c = (0, dedup_1.evidenceDedupKey)({ ...base, query: 'totally different query', sourceKey: 'https://example.com/page' });
        strict_1.default.notEqual(a, c, 'different query produces a different identity');
        strict_1.default.equal((0, dedup_1.normalizeQueryForDedup)('  Foo  BAR '), 'foo bar');
        strict_1.default.notEqual((0, dedup_1.contentKeyForResult)({ title: 'a', content: 'hello world' }), (0, dedup_1.contentKeyForResult)({ title: 'a', content: 'goodbye world' }), 'different content hashes differ');
    });
});
(0, node_test_1.describe)('Research engine - research -> debate dependency graph', () => {
    (0, node_test_1.test)('startDecision with 3 research queries runs research first, then the debate, to completion', async () => {
        const spy = new SpyDebateHandler();
        const registry = makeRegistry(spy);
        const decision = await Decision_1.default.create({
            userId,
            title: 'Dependency decision',
            objective: 'Decide on a platform.',
            status: 'draft',
            currentPhase: 'draft',
            configuration: { strategy: 'consensus', maxRounds: 2 },
        });
        const { decisionOrchestrator } = await Promise.resolve().then(() => __importStar(require('../decision/orchestrator')));
        const execution = await decisionOrchestrator.startDecision(decision._id.toString(), userId, {
            researchQueries: [
                { query: 'q1: platform A', purpose: 'market_research' },
                { query: 'q2: platform B', purpose: 'technical_research' },
                { query: 'q3: platform C', purpose: 'competitive_research' },
            ],
        });
        const researchTasks = await Task_1.default.find({ executionId: execution._id, type: 'research' }).sort({ createdAt: 1 });
        const debateTasks = await Task_1.default.find({ executionId: execution._id, type: 'debate' });
        strict_1.default.equal(researchTasks.length, 3, 'three research tasks created');
        strict_1.default.equal(debateTasks.length, 1, 'one debate task created');
        const debate = debateTasks[0];
        strict_1.default.equal(debate.dependencies.length, 3, 'debate depends on the research tasks');
        const depIds = debate.dependencies.map((d) => d.toString());
        for (const rt of researchTasks) {
            strict_1.default.ok(depIds.includes(rt._id.toString()), 'dependency uses the real research task id');
        }
        const worker = makeWorker(registry);
        await driveUntil(worker, execution._id.toString(), (e) => e.status === 'completed');
        const researchFinal = await Task_1.default.find({ executionId: execution._id, type: 'research' });
        strict_1.default.ok(researchFinal.every((t) => t.status === 'completed'), 'all research tasks completed');
        const debateFinal = await Task_1.default.findById(debate._id);
        strict_1.default.equal(debateFinal.status, 'completed', 'debate task completed');
        strict_1.default.equal(spy.calls.length, 1, 'debate handler ran once');
        strict_1.default.ok(spy.calls[0].evidenceCount >= 1, 'debate saw research evidence in context');
        strict_1.default.ok(debateFinal.completedAt &&
            researchFinal.every((t) => t.completedAt && t.completedAt <= debateFinal.completedAt), 'debate ran only after research completed');
        const execFinal = await Execution_1.default.findById(execution._id);
        strict_1.default.equal(execFinal.status, 'completed');
    });
    (0, node_test_1.test)('startDecision without researchQueries keeps the single debated-task graph (backward compatible)', async () => {
        const { decisionOrchestrator } = await Promise.resolve().then(() => __importStar(require('../decision/orchestrator')));
        const decision = await Decision_1.default.create({
            userId,
            title: 'Legacy decision',
            objective: 'Something to decide.',
            status: 'draft',
            currentPhase: 'draft',
            configuration: { strategy: 'consensus', maxRounds: 2 },
        });
        const execution = await decisionOrchestrator.startDecision(decision._id.toString(), userId);
        const tasks = await Task_1.default.find({ executionId: execution._id });
        strict_1.default.equal(tasks.length, 1);
        strict_1.default.equal(tasks[0].type, 'debate');
        strict_1.default.deepEqual(tasks[0].dependencies, [], 'no research tasks => no dependencies');
    });
});
(0, node_test_1.describe)('Research engine - error classification mapping (unit)', () => {
    (0, node_test_1.test)('ResearchError codes map onto the shared ExecutionError codes', async () => {
        const { ResearchError } = await Promise.resolve().then(() => __importStar(require('../research/researchError')));
        const { classifyError, isRetryableError } = await Promise.resolve().then(() => __importStar(require('../decision/errorClassifier')));
        strict_1.default.equal(classifyError(new ResearchError('TIMEOUT', 't')), 'PROVIDER_OUTAGE');
        strict_1.default.equal(isRetryableError(new ResearchError('TIMEOUT', 't')), true);
        strict_1.default.equal(classifyError(new ResearchError('PROVIDER_UNAVAILABLE', 'p')), 'PROVIDER_OUTAGE');
        strict_1.default.equal(isRetryableError(new ResearchError('PROVIDER_UNAVAILABLE', 'p')), true);
        strict_1.default.equal(classifyError(new ResearchError('RATE_LIMITED', 'r')), 'RATE_LIMIT');
        strict_1.default.equal(isRetryableError(new ResearchError('RATE_LIMITED', 'r')), true);
        strict_1.default.equal(classifyError(new ResearchError('AUTHENTICATION_FAILURE', 'a')), 'INVALID_API_KEY');
        strict_1.default.equal(isRetryableError(new ResearchError('AUTHENTICATION_FAILURE', 'a')), false);
        strict_1.default.equal(classifyError(new ResearchError('INVALID_QUERY', 'q')), 'INVALID_REQUEST');
        strict_1.default.equal(isRetryableError(new ResearchError('INVALID_QUERY', 'q')), false);
    });
});
