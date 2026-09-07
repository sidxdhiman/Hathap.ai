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
const TEST_URI = process.env.MONGODB_URI_TEST || 'mongodb://localhost:27017/hathap_test_engine';
// ---- Fake handler to exercise the execution engine deterministically ----
// Modes (via task.input.mode):
//   'ok'          -> succeeds
//   'fail-retry'  -> throws a retryable error (network)
//   'fail-final'  -> throws a non-retryable error (api key)
//   'retry-once'  -> throws retryable on attempt 1, succeeds attempt 2
//   'slow'        -> awaits 30ms then succeeds
class FakeHandler {
    constructor() {
        this.type = 'debate';
    }
    canHandle(_type) { return true; }
    async execute(task, _ctx) {
        const mode = task.input?.mode || 'ok';
        const attempt = task.attempts || 0;
        if (mode === 'fail-retry') {
            throw new Error('fetch failed (network outage for test)');
        }
        if (mode === 'fail-final') {
            throw new Error('Invalid API key: test rejected 401');
        }
        if (mode === 'retry-once') {
            if (attempt <= 1)
                throw new Error('network timeout for test');
        }
        if (mode === 'slow') {
            await new Promise((r) => setTimeout(r, 30));
        }
        return { output: { ok: true, mode, attempt } };
    }
}
function makeRegistry() {
    return new handlers_1.DefaultTaskHandlerRegistry([new FakeHandler()]);
}
function makeWorker(opts = {}) {
    const executor = new executor_1.TaskExecutor({
        registry: makeRegistry(),
        workerId: 'test-worker',
        backoff: () => 5, // tiny backoff for fast tests
    });
    return new worker_1.Worker({
        executor,
        pollIntervalMs: 100000, // never self-tick; we drive with tickNow()
        maxConcurrentTasks: opts.maxConcurrent ?? 4,
        staleTaskTimeoutMs: opts.staleMs ?? 120000,
        recoveryBackoff: opts.recoveryBackoff,
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
async function waitUntil(fn, timeoutMs = 6000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        if (await fn())
            return;
        await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error('Timed out waiting for condition');
}
let userId;
let decisionId;
(0, node_test_1.before)(async () => {
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
        title: 'Engine Test',
        objective: 'Test objective',
        status: 'draft',
        currentPhase: 'draft',
        configuration: { strategy: 'consensus', maxRounds: 2 },
    });
    decisionId = decision._id.toString();
});
async function createExecutionWithTasks(taskSpecs) {
    const exec = await Execution_1.default.create({
        decisionId,
        status: 'queued',
        startedAt: new Date(),
        currentPhase: 'debating',
        progress: 0,
    });
    const taskIds = {};
    for (const spec of taskSpecs) {
        const key = spec.type + spec.mode + (spec.priority ?? 0) + taskSpecs.indexOf(spec);
        const t = await Task_1.default.create({
            executionId: exec._id,
            type: spec.type,
            status: 'pending',
            mode: spec.mode,
            input: { mode: spec.mode },
            dependencies: spec.deps || [],
            priority: spec.priority ?? 0,
        });
        taskIds[t._id.toString()] = key;
    }
    return { exec, taskIds };
}
(0, node_test_1.describe)('Execution engine - async lifecycle', () => {
    (0, node_test_1.test)('a queued execution with a successful task completes', async () => {
        const { exec } = await createExecutionWithTasks([{ type: 'debate', mode: 'ok' }]);
        const worker = makeWorker();
        await worker.tickNow();
        await waitUntil(async () => {
            const e = await Execution_1.default.findById(exec._id);
            return e && e.status === 'completed';
        });
        const fresh = await Execution_1.default.findById(exec._id);
        strict_1.default.equal(fresh.status, 'completed');
        strict_1.default.equal(fresh.progress, 100);
        const tasks = await Task_1.default.find({ executionId: exec._id });
        strict_1.default.equal(tasks[0].status, 'completed');
        strict_1.default.deepEqual(tasks[0].result, { ok: true, mode: 'ok', attempt: 1 });
        // The Decision reflects completion.
        const decision = await Decision_1.default.findById(decisionId);
        strict_1.default.equal(decision.status, 'completed');
    });
    (0, node_test_1.test)('execution never leaves the terminal state to running', async () => {
        const { exec } = await createExecutionWithTasks([{ type: 'debate', mode: 'ok' }]);
        const worker = makeWorker();
        await worker.tickNow();
        await waitUntil(async () => {
            const e = await Execution_1.default.findById(exec._id);
            return e && e.status === 'completed';
        });
        const t = await Task_1.default.findOne({ executionId: exec._id });
        strict_1.default.equal(t.status, 'completed');
    });
});
(0, node_test_1.describe)('Execution engine - task lifecycle & retries', () => {
    (0, node_test_1.test)('a retryable failure retries then succeeds (retry-once)', async () => {
        const { exec } = await createExecutionWithTasks([{ type: 'debate', mode: 'retry-once' }]);
        const worker = makeWorker();
        // Run several ticks to allow the retry backoff to elapse.
        for (let i = 0; i < 10; i++) {
            await worker.tickNow();
            await new Promise((r) => setTimeout(r, 10));
            const e = await Execution_1.default.findById(exec._id);
            if (e && e.status === 'completed')
                break;
        }
        const tasks = await Task_1.default.find({ executionId: exec._id });
        strict_1.default.equal(tasks[0].status, 'completed');
        strict_1.default.ok(tasks[0].retryCount >= 1, 'should have retried at least once');
    });
    (0, node_test_1.test)('a non-retryable failure fails the task permanently and the execution', async () => {
        const { exec } = await createExecutionWithTasks([{ type: 'debate', mode: 'fail-final' }]);
        const worker = makeWorker();
        await worker.tickNow();
        await waitUntil(async () => {
            const e = await Execution_1.default.findById(exec._id);
            return e && e.status === 'failed';
        });
        const tasks = await Task_1.default.find({ executionId: exec._id });
        strict_1.default.equal(tasks[0].status, 'failed');
        strict_1.default.equal(tasks[0].error.kind, 'non_retryable');
        const decision = await Decision_1.default.findById(decisionId);
        strict_1.default.equal(decision.status, 'failed');
    });
    (0, node_test_1.test)('retries are exhausted after retrying repeatedly (fail-retry, low maxRetries)', async () => {
        const exec = await Execution_1.default.create({ decisionId, status: 'queued' });
        const task = await Task_1.default.create({
            executionId: exec._id,
            type: 'debate',
            status: 'pending',
            input: { mode: 'fail-retry' },
            maxRetries: 1,
        });
        const worker = makeWorker();
        for (let i = 0; i < 20; i++) {
            await worker.tickNow();
            await new Promise((r) => setTimeout(r, 10));
            const freshTask = await Task_1.default.findById(task._id);
            if (freshTask && freshTask.status === 'failed')
                break;
        }
        const freshTask = await Task_1.default.findById(task._id);
        strict_1.default.equal(freshTask.status, 'failed');
        strict_1.default.ok(freshTask.retryCount >= 1, 'should have attempted a retry');
    });
});
(0, node_test_1.describe)('Execution engine - dependencies', () => {
    (0, node_test_1.test)('dependent task waits for upstream completion', async () => {
        const exec = await Execution_1.default.create({ decisionId, status: 'queued' });
        // Create a real A -> C and B -> C dependency graph using real ObjectIds.
        const a = await Task_1.default.create({
            executionId: exec._id, type: 'debate', status: 'pending', input: { mode: 'ok' }, priority: 1,
        });
        const b = await Task_1.default.create({
            executionId: exec._id, type: 'debate', status: 'pending', input: { mode: 'ok' }, priority: 2,
        });
        const c = await Task_1.default.create({
            executionId: exec._id, type: 'debate', status: 'pending', input: { mode: 'ok' }, priority: 3,
            dependencies: [a._id.toString(), b._id.toString()],
        });
        const worker = makeWorker({ maxConcurrent: 2 });
        // First pass: A and B run in parallel; C must stay blocked.
        await worker.tickNow();
        await new Promise((r) => setTimeout(r, 40));
        let cc = await Task_1.default.findById(c._id);
        strict_1.default.notEqual(cc.status, 'completed', 'C must not run before A and B complete');
        // Drive to completion; C unlocks only after both A and B finish.
        for (let i = 0; i < 10; i++) {
            const e = await Execution_1.default.findById(exec._id);
            if (e && e.status === 'completed')
                break;
            await worker.tickNow();
            await new Promise((r) => setTimeout(r, 10));
        }
        const e = await Execution_1.default.findById(exec._id);
        strict_1.default.equal(e.status, 'completed');
        const aFinal = await Task_1.default.findById(a._id);
        const bFinal = await Task_1.default.findById(b._id);
        cc = await Task_1.default.findById(c._id);
        strict_1.default.equal(aFinal.status, 'completed');
        strict_1.default.equal(bFinal.status, 'completed');
        strict_1.default.equal(cc.status, 'completed', 'C completes after both dependencies');
    });
});
(0, node_test_1.describe)('Execution engine - cancellation', () => {
    (0, node_test_1.test)('cancelling a queued decision cancels pending tasks and the execution', async () => {
        const { exec } = await createExecutionWithTasks([{ type: 'debate', mode: 'ok' }]);
        const decision = await Decision_1.default.findById(decisionId);
        decision.status = 'debating';
        await decision.save();
        const execDoc = await Execution_1.default.findById(exec._id);
        execDoc.status = 'running';
        await execDoc.save();
        // Use the orchestrator to cancel.
        const { decisionOrchestrator } = await Promise.resolve().then(() => __importStar(require('../decision/orchestrator')));
        await decisionOrchestrator.cancelDecision(decisionId, userId);
        const freshExec = await Execution_1.default.findById(exec._id);
        strict_1.default.equal(freshExec.status, 'cancelled');
        const tasks = await Task_1.default.find({ executionId: exec._id });
        strict_1.default.ok(tasks.every((t) => ['cancelled', 'completed'].includes(t.status)));
        const freshDecision = await Decision_1.default.findById(decisionId);
        strict_1.default.equal(freshDecision.status, 'cancelled');
    });
});
(0, node_test_1.describe)('Execution engine - recovery after restart', () => {
    (0, node_test_1.test)('a stale running task is recovered and the execution continues', async () => {
        const exec = await Execution_1.default.create({ decisionId, status: 'running', progress: 0 });
        const a = await Task_1.default.create({
            executionId: exec._id, type: 'debate', status: 'pending', input: { mode: 'ok' }, priority: 1,
        });
        const b = await Task_1.default.create({
            executionId: exec._id, type: 'debate', status: 'pending', input: { mode: 'ok' }, priority: 2,
            dependencies: [a._id.toString()],
        });
        // Simulate a crash: task A is stuck in 'running' with an old lease by a
        // dead worker. The execution doc is left in 'running' with an old stamp.
        await Task_1.default.updateOne({ _id: a._id }, { $set: { status: 'running', leasedAt: new Date(Date.now() - 60000), workerId: 'dead-worker' } });
        await Execution_1.default.updateOne({ _id: exec._id }, { $set: { status: 'running', updatedAt: new Date(Date.now() - 60000) } });
        // A new worker ("process restart") ticks with a short stale timeout.
        const worker = makeWorker({ staleMs: 1000, recoveryBackoff: () => 5 });
        for (let i = 0; i < 10; i++) {
            const e = await Execution_1.default.findById(exec._id);
            if (e && e.status === 'completed')
                break;
            await worker.tickNow();
            await new Promise((r) => setTimeout(r, 20));
        }
        const e = await Execution_1.default.findById(exec._id);
        strict_1.default.equal(e.status, 'completed');
        const aFinal = await Task_1.default.findById(a._id);
        const bFinal = await Task_1.default.findById(b._id);
        strict_1.default.equal(bFinal.status, 'completed');
        strict_1.default.equal(aFinal.status, 'completed', 'stale task recovered and completed');
    });
});
(0, node_test_1.describe)('Execution engine - idempotency', () => {
    (0, node_test_1.test)('a completed task with a result is not executed again', async () => {
        const { exec } = await createExecutionWithTasks([{ type: 'debate', mode: 'ok' }]);
        const task = await Task_1.default.findOne({ executionId: exec._id });
        // Pre-mark as completed with a result.
        task.status = 'completed';
        task.result = { ok: true, from: 'pre-seed' };
        task.attempts = 1;
        await task.save();
        const executor = new executor_1.TaskExecutor({
            registry: makeRegistry(),
            workerId: 'test-worker',
            backoff: () => 5,
        });
        const claimed = await executor.claim(task._id.toString());
        strict_1.default.equal(claimed, null, 'worker must not claim a completed task');
        const afterClaim = await Task_1.default.findById(task._id);
        strict_1.default.equal(afterClaim.status, 'completed');
        strict_1.default.deepEqual(afterClaim.result, { ok: true, from: 'pre-seed' }, 'result must be unchanged');
    });
});
(0, node_test_1.describe)('Execution engine - concurrency & stress', () => {
    (0, node_test_1.test)('concurrency limit is respected across many tasks', async () => {
        const specs = Array.from({ length: 8 }, (_, i) => ({
            type: 'debate',
            mode: 'slow',
            priority: 1,
        }));
        const { exec } = await createExecutionWithTasks(specs);
        const worker = makeWorker({ maxConcurrent: 2 });
        let maxObserved = 0;
        const start = Date.now();
        while (Date.now() - start < 5000) {
            await worker.tickNow();
            const e = await Execution_1.default.findById(exec._id);
            if (e && e.status === 'completed')
                break;
            const running = await Task_1.default.countDocuments({ executionId: exec._id, status: 'running' });
            maxObserved = Math.max(maxObserved, running);
            await new Promise((r) => setTimeout(r, 5));
        }
        const e = await Execution_1.default.findById(exec._id);
        strict_1.default.equal(e.status, 'completed');
        strict_1.default.ok(maxObserved <= 2, `max concurrent running was ${maxObserved}, expected <= 2`);
        const tasks = await Task_1.default.find({ executionId: exec._id });
        strict_1.default.equal(tasks.length, 8, 'no tasks disappear');
        strict_1.default.ok(tasks.every((t) => t.status === 'completed'), 'all tasks complete');
    });
    (0, node_test_1.test)('stress: 10 decisions at 4 concurrent do not lose work', async () => {
        const worker = makeWorker({ maxConcurrent: 4 });
        const executions = [];
        for (let d = 0; d < 10; d++) {
            const decision = await Decision_1.default.create({
                userId,
                title: `Stress ${d}`,
                objective: `Obj ${d}`,
                status: 'debating',
                currentPhase: 'debating',
                configuration: { strategy: 'consensus' },
            });
            const exec = await Execution_1.default.create({
                decisionId: decision._id,
                status: 'queued',
                progress: 0,
            });
            await Task_1.default.create({ executionId: exec._id, type: 'debate', status: 'pending', input: { mode: 'ok' } });
            executions.push(exec);
        }
        const start = Date.now();
        while (Date.now() - start < 8000) {
            await worker.tickNow();
            const pending = await Execution_1.default.countDocuments({
                _id: { $in: executions.map((e) => e._id) },
                status: { $in: ['queued', 'running', 'paused'] },
            });
            if (pending === 0)
                break;
            await new Promise((r) => setTimeout(r, 20));
        }
        // All executions completed; tasks all complete; none stuck.
        const completed = await Execution_1.default.countDocuments({
            _id: { $in: executions.map((e) => e._id) },
            status: 'completed',
        });
        strict_1.default.equal(completed, 10, 'all 10 executions complete');
        const stuck = await Task_1.default.countDocuments({
            status: { $in: ['pending', 'ready', 'running', 'retrying'] },
        });
        strict_1.default.equal(stuck, 0, 'no tasks stuck');
        const done = await Task_1.default.countDocuments({ status: 'completed' });
        strict_1.default.equal(done, 10, 'all 10 tasks complete and accounted for');
        await worker.stop();
    });
});
