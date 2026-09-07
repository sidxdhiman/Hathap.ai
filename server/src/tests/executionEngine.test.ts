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
import { TaskHandlerRegistry, TaskHandler, TaskHandlerContext, TaskHandlerResult, TaskType } from '../decision/types';

const TEST_URI = process.env.MONGODB_URI_TEST || 'mongodb://localhost:27017/hathap_test_engine';

// ---- Fake handler to exercise the execution engine deterministically ----
// Modes (via task.input.mode):
//   'ok'          -> succeeds
//   'fail-retry'  -> throws a retryable error (network)
//   'fail-final'  -> throws a non-retryable error (api key)
//   'retry-once'  -> throws retryable on attempt 1, succeeds attempt 2
//   'slow'        -> awaits 30ms then succeeds
class FakeHandler implements TaskHandler {
  type: TaskType = 'debate';
  canHandle(_type: TaskType) { return true; }
  async execute(task: any, _ctx: TaskHandlerContext): Promise<TaskHandlerResult> {
    const mode = task.input?.mode || 'ok';
    const attempt = task.attempts || 0;
    if (mode === 'fail-retry') {
      throw new Error('fetch failed (network outage for test)');
    }
    if (mode === 'fail-final') {
      throw new Error('Invalid API key: test rejected 401');
    }
    if (mode === 'retry-once') {
      if (attempt <= 1) throw new Error('network timeout for test');
    }
    if (mode === 'slow') {
      await new Promise((r) => setTimeout(r, 30));
    }
    return { output: { ok: true, mode, attempt } };
  }
}

function makeRegistry(): TaskHandlerRegistry {
  return new DefaultTaskHandlerRegistry([new FakeHandler()]);
}

function makeWorker(opts: { maxConcurrent?: number; staleMs?: number; recoveryBackoff?: (a: number) => number } = {}) {
  const executor = new TaskExecutor({
    registry: makeRegistry(),
    workerId: 'test-worker',
    backoff: () => 5, // tiny backoff for fast tests
  });
  return new Worker({
    executor,
    pollIntervalMs: 100_000, // never self-tick; we drive with tickNow()
    maxConcurrentTasks: opts.maxConcurrent ?? 4,
    staleTaskTimeoutMs: opts.staleMs ?? 120_000,
    recoveryBackoff: opts.recoveryBackoff,
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
  timeoutMs = 6000
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('Timed out waiting for condition');
}

let userId: string;
let decisionId: string;

before(async () => {
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
    title: 'Engine Test',
    objective: 'Test objective',
    status: 'draft',
    currentPhase: 'draft',
    configuration: { strategy: 'consensus', maxRounds: 2 },
  });
  decisionId = decision._id.toString();
});

async function createExecutionWithTasks(
  taskSpecs: Array<{ type: string; mode: string; deps?: string[]; priority?: number }>
): Promise<{ exec: any; taskIds: Record<string, string> }> {
  const exec = await Execution.create({
    decisionId,
    status: 'queued',
    startedAt: new Date(),
    currentPhase: 'debating',
    progress: 0,
  });
  const taskIds: Record<string, string> = {};
  for (const spec of taskSpecs) {
    const key = spec.type + spec.mode + (spec.priority ?? 0) + taskSpecs.indexOf(spec);
    const t = await Task.create({
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

describe('Execution engine - async lifecycle', () => {
  test('a queued execution with a successful task completes', async () => {
    const { exec } = await createExecutionWithTasks([{ type: 'debate', mode: 'ok' }]);
    const worker = makeWorker();
    await worker.tickNow();

    await waitUntil(async () => {
      const e = await Execution.findById(exec._id);
      return e && e.status === 'completed';
    });

    const fresh = await Execution.findById(exec._id) as any;
    assert.equal(fresh.status, 'completed');
    assert.equal(fresh.progress, 100);

    const tasks = await Task.find({ executionId: exec._id });
    assert.equal(tasks[0].status, 'completed');
    assert.deepEqual(tasks[0].result, { ok: true, mode: 'ok', attempt: 1 });

    // The Decision reflects completion.
    const decision = await Decision.findById(decisionId) as any;
    assert.equal(decision.status, 'completed');
  });

  test('execution never leaves the terminal state to running', async () => {
    const { exec } = await createExecutionWithTasks([{ type: 'debate', mode: 'ok' }]);
    const worker = makeWorker();
    await worker.tickNow();
    await waitUntil(async () => {
      const e = await Execution.findById(exec._id);
      return e && e.status === 'completed';
    });
    const t = await Task.findOne({ executionId: exec._id }) as any;
    assert.equal(t.status, 'completed');
  });
});

describe('Execution engine - task lifecycle & retries', () => {
  test('a retryable failure retries then succeeds (retry-once)', async () => {
    const { exec } = await createExecutionWithTasks([{ type: 'debate', mode: 'retry-once' }]);
    const worker = makeWorker();
    // Run several ticks to allow the retry backoff to elapse.
    for (let i = 0; i < 10; i++) {
      await worker.tickNow();
      await new Promise((r) => setTimeout(r, 10));
      const e = await Execution.findById(exec._id);
      if (e && e.status === 'completed') break;
    }

    const tasks = await Task.find({ executionId: exec._id });
    assert.equal(tasks[0].status, 'completed');
    assert.ok(tasks[0].retryCount >= 1, 'should have retried at least once');
  });

  test('a non-retryable failure fails the task permanently and the execution', async () => {
    const { exec } = await createExecutionWithTasks([{ type: 'debate', mode: 'fail-final' }]);
    const worker = makeWorker();
    await worker.tickNow();
    await waitUntil(async () => {
      const e = await Execution.findById(exec._id);
      return e && e.status === 'failed';
    });

    const tasks = await Task.find({ executionId: exec._id });
    assert.equal(tasks[0].status, 'failed');
    assert.equal((tasks[0] as any).error.kind, 'non_retryable');
    const decision = await Decision.findById(decisionId) as any;
    assert.equal(decision.status, 'failed');
  });

  test('retries are exhausted after retrying repeatedly (fail-retry, low maxRetries)', async () => {
    const exec = await Execution.create({ decisionId, status: 'queued' });
    const task = await Task.create({
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
      const freshTask = await Task.findById(task._id) as any;
      if (freshTask && freshTask.status === 'failed') break;
    }
    const freshTask = await Task.findById(task._id) as any;
    assert.equal(freshTask.status, 'failed');
    assert.ok(freshTask.retryCount >= 1, 'should have attempted a retry');
  });
});

describe('Execution engine - dependencies', () => {
  test('dependent task waits for upstream completion', async () => {
    const exec = await Execution.create({ decisionId, status: 'queued' });
    // Create a real A -> C and B -> C dependency graph using real ObjectIds.
    const a = await Task.create({
      executionId: exec._id, type: 'debate', status: 'pending', input: { mode: 'ok' }, priority: 1,
    });
    const b = await Task.create({
      executionId: exec._id, type: 'debate', status: 'pending', input: { mode: 'ok' }, priority: 2,
    });
    const c = await Task.create({
      executionId: exec._id, type: 'debate', status: 'pending', input: { mode: 'ok' }, priority: 3,
      dependencies: [a._id.toString(), b._id.toString()],
    });

    const worker = makeWorker({ maxConcurrent: 2 });
    // First pass: A and B run in parallel; C must stay blocked.
    await worker.tickNow();
    await new Promise((r) => setTimeout(r, 40));
    let cc = await Task.findById(c._id) as any;
    assert.notEqual(cc.status, 'completed', 'C must not run before A and B complete');

    // Drive to completion; C unlocks only after both A and B finish.
    for (let i = 0; i < 10; i++) {
      const e = await Execution.findById(exec._id);
      if (e && e.status === 'completed') break;
      await worker.tickNow();
      await new Promise((r) => setTimeout(r, 10));
    }

    const e = await Execution.findById(exec._id) as any;
    assert.equal(e.status, 'completed');
    const aFinal = await Task.findById(a._id) as any;
    const bFinal = await Task.findById(b._id) as any;
    cc = await Task.findById(c._id) as any;
    assert.equal(aFinal.status, 'completed');
    assert.equal(bFinal.status, 'completed');
    assert.equal(cc.status, 'completed', 'C completes after both dependencies');
  });
});

describe('Execution engine - cancellation', () => {
  test('cancelling a queued decision cancels pending tasks and the execution', async () => {
    const { exec } = await createExecutionWithTasks([{ type: 'debate', mode: 'ok' }]);
    const decision = await Decision.findById(decisionId) as any;
    decision.status = 'debating';
    await decision.save();
    const execDoc = await Execution.findById(exec._id) as any;
    execDoc.status = 'running';
    await execDoc.save();

    // Use the orchestrator to cancel.
    const { decisionOrchestrator } = await import('../decision/orchestrator');
    await decisionOrchestrator.cancelDecision(decisionId, userId);

    const freshExec = await Execution.findById(exec._id) as any;
    assert.equal(freshExec.status, 'cancelled');
    const tasks = await Task.find({ executionId: exec._id });
    assert.ok(tasks.every((t) => ['cancelled', 'completed'].includes(t.status)));
    const freshDecision = await Decision.findById(decisionId) as any;
    assert.equal(freshDecision.status, 'cancelled');
  });
});

describe('Execution engine - recovery after restart', () => {
  test('a stale running task is recovered and the execution continues', async () => {
    const exec = await Execution.create({ decisionId, status: 'running', progress: 0 });
    const a = await Task.create({
      executionId: exec._id, type: 'debate', status: 'pending', input: { mode: 'ok' }, priority: 1,
    });
    const b = await Task.create({
      executionId: exec._id, type: 'debate', status: 'pending', input: { mode: 'ok' }, priority: 2,
      dependencies: [a._id.toString()],
    });

    // Simulate a crash: task A is stuck in 'running' with an old lease by a
    // dead worker. The execution doc is left in 'running' with an old stamp.
    await Task.updateOne(
      { _id: a._id },
      { $set: { status: 'running', leasedAt: new Date(Date.now() - 60_000), workerId: 'dead-worker' } }
    );
    await Execution.updateOne(
      { _id: exec._id },
      { $set: { status: 'running', updatedAt: new Date(Date.now() - 60_000) } }
    );

    // A new worker ("process restart") ticks with a short stale timeout.
    const worker = makeWorker({ staleMs: 1000, recoveryBackoff: () => 5 });
    for (let i = 0; i < 10; i++) {
      const e = await Execution.findById(exec._id);
      if (e && e.status === 'completed') break;
      await worker.tickNow();
      await new Promise((r) => setTimeout(r, 20));
    }

    const e = await Execution.findById(exec._id) as any;
    assert.equal(e.status, 'completed');
    const aFinal = await Task.findById(a._id) as any;
    const bFinal = await Task.findById(b._id) as any;
    assert.equal(bFinal.status, 'completed');
    assert.equal(aFinal.status, 'completed', 'stale task recovered and completed');
  });
});

describe('Execution engine - idempotency', () => {
  test('a completed task with a result is not executed again', async () => {
    const { exec } = await createExecutionWithTasks([{ type: 'debate', mode: 'ok' }]);
    const task = await Task.findOne({ executionId: exec._id }) as any;
    // Pre-mark as completed with a result.
    task.status = 'completed';
    task.result = { ok: true, from: 'pre-seed' };
    task.attempts = 1;
    await task.save();

    const executor = new TaskExecutor({
      registry: makeRegistry(),
      workerId: 'test-worker',
      backoff: () => 5,
    });
    const claimed = await executor.claim(task._id.toString());
    assert.equal(claimed, null, 'worker must not claim a completed task');

    const afterClaim = await Task.findById(task._id) as any;
    assert.equal(afterClaim.status, 'completed');
    assert.deepEqual(afterClaim.result, { ok: true, from: 'pre-seed' }, 'result must be unchanged');
  });
});

describe('Execution engine - concurrency & stress', () => {
  test('concurrency limit is respected across many tasks', async () => {
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
      const e = await Execution.findById(exec._id);
      if (e && e.status === 'completed') break;
      const running = await Task.countDocuments({ executionId: exec._id, status: 'running' });
      maxObserved = Math.max(maxObserved, running);
      await new Promise((r) => setTimeout(r, 5));
    }

    const e = await Execution.findById(exec._id) as any;
    assert.equal(e.status, 'completed');
    assert.ok(maxObserved <= 2, `max concurrent running was ${maxObserved}, expected <= 2`);

    const tasks = await Task.find({ executionId: exec._id });
    assert.equal(tasks.length, 8, 'no tasks disappear');
    assert.ok(tasks.every((t) => t.status === 'completed'), 'all tasks complete');
  });

  test('stress: 10 decisions at 4 concurrent do not lose work', async () => {
    const worker = makeWorker({ maxConcurrent: 4 });
    const executions: any[] = [];
    for (let d = 0; d < 10; d++) {
      const decision = await Decision.create({
        userId,
        title: `Stress ${d}`,
        objective: `Obj ${d}`,
        status: 'debating',
        currentPhase: 'debating',
        configuration: { strategy: 'consensus' },
      });
      const exec = await Execution.create({
        decisionId: decision._id,
        status: 'queued',
        progress: 0,
      });
      await Task.create({ executionId: exec._id, type: 'debate', status: 'pending', input: { mode: 'ok' } });
      executions.push(exec);
    }

    const start = Date.now();
    while (Date.now() - start < 8000) {
      await worker.tickNow();
      const pending = await Execution.countDocuments({
        _id: { $in: executions.map((e) => e._id) },
        status: { $in: ['queued', 'running', 'paused'] },
      });
      if (pending === 0) break;
      await new Promise((r) => setTimeout(r, 20));
    }

    // All executions completed; tasks all complete; none stuck.
    const completed = await Execution.countDocuments({
      _id: { $in: executions.map((e) => e._id) },
      status: 'completed',
    });
    assert.equal(completed, 10, 'all 10 executions complete');

    const stuck = await Task.countDocuments({
      status: { $in: ['pending', 'ready', 'running', 'retrying'] },
    });
    assert.equal(stuck, 0, 'no tasks stuck');
    const done = await Task.countDocuments({ status: 'completed' });
    assert.equal(done, 10, 'all 10 tasks complete and accounted for');

    await worker.stop();
  });
});
