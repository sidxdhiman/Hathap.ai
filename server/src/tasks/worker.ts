import Execution, { IExecution } from '../models/Execution';
import Decision, { IDecision } from '../models/Decision';
import Task, { ITask } from '../models/Task';
import { StateMachine } from '../decision/stateMachine';
import { TaskExecutor } from '../decision/executor';
import { taskHandlerRegistry } from './handlers';
import { schedule } from '../decision/scheduler';
import { executionEventBus } from '../decision/eventBus';
import { aggregateUsage } from '../decision/usage';
import { TokenUsage } from '../decision/types';

export interface WorkerOptions {
  pollIntervalMs?: number;
  maxConcurrentTasks?: number;
  staleTaskTimeoutMs?: number;
  recoveryBackoff?: (attempt: number) => number;
  executor?: TaskExecutor;
}

/**
 * Background worker for the execution engine.
 *
 * Responsibilities:
 *   - Periodically scan active executions.
 *   - Recover tasks stuck in `running` (stale worker detection) so an execution
 *     resumes after a process restart.
 *   - Detect executions that were interrupted mid-run and bring them back to a
 *     running state so they can make progress.
 *   - Pull scheduler-ready tasks and execute them, respecting a concurrency
 *     limit (no unbounded LLM calls).
 *   - Mark executions completed/failed when all tasks are terminal.
 *
 * This is a lightweight internal worker. The Decision layer talks to the
 * scheduler + executor through clean interfaces, so a real queue can be
 * swapped in later without rewriting the Decision logic.
 */
export class Worker {
  private readonly pollIntervalMs: number;
  private readonly maxConcurrentTasks: number;
  private readonly staleTaskTimeoutMs: number;
  private readonly executor: TaskExecutor;
  private readonly recoveryBackoffFn: (attempt: number) => number;
  private timer: NodeJS.Timeout | null = null;
  private stopping = false;
  private active = false;
  private inFlight = 0;
  private readonly workerId =
    `worker-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;

  constructor(options: WorkerOptions = {}) {
    this.pollIntervalMs = options.pollIntervalMs ?? 1500;
    this.maxConcurrentTasks = options.maxConcurrentTasks ?? 4;
    this.staleTaskTimeoutMs = options.staleTaskTimeoutMs ?? 120_000;
    this.recoveryBackoffFn =
      options.recoveryBackoff || ((attempt: number) => Math.min(1000 * 2 ** attempt, 30_000));
    this.executor =
      options.executor ||
      new TaskExecutor({ registry: taskHandlerRegistry, workerId: this.workerId });
  }

  start(): void {
    if (this.timer) return;
    this.stopping = false;
    this.active = true;
    console.log(`[Worker] started (id=${this.workerId}, maxConcurrent=${this.maxConcurrentTasks})`);
    this.timer = setInterval(() => {
      void this.tick().catch((err) => {
        console.error('[Worker] tick error', err?.message);
      });
    }, this.pollIntervalMs);
    // Initial pass.
    void this.tick().catch((err) => {
      console.error('[Worker] initial tick error', err?.message);
    });
  }

  /**
   * Trigger an immediate tick (used when a new execution is created so work
   * starts without waiting for the next poll). No-op unless the worker has been
   * started, so the singleton never interferes before boot (or in tests).
   */
  wake(): void {
    if (!this.active) return;
    void this.tick().catch((err) => {
      console.error('[Worker] wake tick error', err?.message);
    });
  }

  /**
   * Synchronously drive a single scheduling/execution pass. Available for tests
   * and manual admin tooling to force a poll without waiting.
   */
  async tickNow(): Promise<void> {
    await this.tick();
  }

  async stop(): Promise<void> {
    this.stopping = true;
    this.active = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    const deadline = Date.now() + 10_000;
    while (this.inFlight > 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 100));
    }
    console.log('[Worker] stopped');
  }

  private async tick(): Promise<void> {
    if (this.stopping) return;

    // 1. Recover stale running tasks across all executions (process restart).
    await this.recoverStaleTasks();

    // 2. Find active executions (queued or running).
    const activeExecutions = await Execution.find({
      status: { $in: ['queued', 'running'] },
    });

    for (const execution of activeExecutions) {
      if (this.stopping || this.inFlight >= this.maxConcurrentTasks) break;
      await this.processExecution(execution);
    }
  }

  /**
   * Bring any running execution that has no active worker back to `queued` so
   * its ready tasks get processed again. This is the recovery path after a
   * process restart: an execution left in `running` with in-flight tasks is
   * resumed rather than becoming permanently stuck.
   */
  private async recoverInterruptedExecutions(): Promise<void> {
    // The stale task recovery handles individual tasks; here we simply ensure
    // executions aren't in a state that prevents new tasks from starting.
    const interrupted = await Execution.find({
      status: 'running',
      updatedAt: { $lt: new Date(Date.now() - this.staleTaskTimeoutMs) },
    });
    for (const execution of interrupted) {
      if (!StateMachine.canTransitionExecution('running', 'queued').valid) continue;
      execution.status = 'queued';
      await execution.save();
      executionEventBus.emit({
        type: 'execution.resumed',
        executionId: String(execution._id),
        decisionId: String(execution.decisionId),
      });
    }
  }

  private async processExecution(execution: IExecution): Promise<void> {
    const execStatus = execution.status as any;
    const decision = execution.decisionId
      ? await Decision.findById(execution.decisionId)
      : null;

    // If the owning decision is paused/cancelled, hold the execution.
    if (decision) {
      if (decision.status === 'paused') {
        if (execStatus !== 'paused') {
          await this.setExecutionStatus(execution, 'paused', 'execution.paused');
        }
        return;
      }
      if (decision.status === 'cancelled') {
        if (execStatus !== 'cancelled') {
          await this.cancelExecutionTasks(execution);
          await this.setExecutionStatus(execution, 'cancelled', 'execution.cancelled');
        }
        return;
      }
    }

    const tasks = await Task.find({ executionId: execution._id });
    const { executableTasks, blockedTasks } = schedule(execStatus, tasks);

    // Mark ready pending tasks before running (so UI can see readiness).
    for (const e of executableTasks) {
      if (e.task.status !== 'pending' && e.task.status !== 'retrying') continue;
      await Task.updateOne({ _id: e.task._id }, { $set: { status: 'ready' } });
    }

    // Compute progress and update execution.
    const progress = this.computeProgress(tasks);
    await Execution.updateOne(
      { _id: execution._id },
      {
        $set: {
          progress: progress.progress,
          currentPhase: this.inferPhase(tasks),
          totalTasks: progress.totalTasks,
          completedTasks: progress.completedTasks,
          failedTasks: progress.failedTasks,
          runningTasks: progress.runningTasks,
          pendingTasks: progress.pendingTasks,
        },
      }
    );

    // If nothing is executable and there are no running tasks, the execution
    // is terminal (completed or failed).
    if (executableTasks.length === 0) {
      await this.maybeFinalize(execution);
      return;
    }

    // Execute up to the concurrency ceiling.
    for (const e of executableTasks) {
      if (this.stopping || this.inFlight >= this.maxConcurrentTasks) break;

      const claimed = await this.executor.claim(e.task._id.toString());
      if (!claimed) continue;

      this.inFlight++;
      void this.runTask(decision, execution, claimed)
        .catch(async (err) => {
          console.error(`[Worker] task ${claimed._id} crashed`, err?.message);
          await Task.updateOne(
            { _id: claimed._id },
            { $set: { status: 'failed', error: { kind: 'retryable', message: err?.message, createdAt: new Date() } } }
          );
        })
        .finally(() => {
          this.inFlight--;
        });
    }
  }

  private async runTask(decision: IDecision | null, execution: IExecution, task: ITask): Promise<void> {
    const userId = decision ? String(decision.userId) : '';
    await this.executor.execute(userId, execution, task);
    // After a task settles, re-evaluate whether the whole execution is now
    // terminal. Without this, an execution whose last task completes in the
    // background would never be finalized.
    await this.maybeFinalize(execution);
  }

  private async maybeFinalize(execution: IExecution, tries = 2): Promise<void> {
    const tasks = await Task.find({ executionId: execution._id });
    const inProgress = tasks.some((t) =>
      ['pending', 'ready', 'running', 'retrying'].includes(t.status)
    );
    if (inProgress) {
      // Two tasks may settle near-simultaneously; give a concurrently
      // finishing sibling a moment to commit its status before giving up.
      if (tries > 1) {
        await new Promise((r) => setTimeout(r, 30));
        return this.maybeFinalize(execution, tries - 1);
      }
      return;
    }

    // Transitions to a terminal state are validated so a re-entry is a no-op.
    const status = tasks.some((t) => t.status === 'failed')
      ? 'failed'
      : 'completed';
    if (!StateMachine.canTransitionExecution(execution.status as any, status).valid) return;

    if (status === 'failed') {
      await this.failExecution(execution, tasks);
    } else {
      await this.completeExecution(execution, tasks);
    }
  }

  private async completeExecution(execution: IExecution, tasks: ITask[]): Promise<void> {
    const current = execution.status as any;
    if (!StateMachine.canTransitionExecution(current, 'completed').valid) return;
    const p = this.computeProgress(tasks);
    await Execution.updateOne(
      { _id: execution._id },
      {
        $set: {
          status: 'completed',
          progress: 100,
          completedTasks: p.completedTasks,
          failedTasks: p.failedTasks,
          runningTasks: 0,
          pendingTasks: 0,
          completedAt: new Date(),
        },
      }
    );
    executionEventBus.emit({
      type: 'execution.completed',
      executionId: String(execution._id),
      decisionId: String(execution.decisionId),
    });
    if (execution.decisionId) {
      const decision = await Decision.findById(execution.decisionId);
      if (decision && !['cancelled', 'failed'].includes(decision.status as any)) {
        if (StateMachine.canTransitionDecision(decision.status as any, 'completed').valid) {
          decision.status = 'completed';
          decision.currentPhase = 'completed';
          decision.confidence = this.extractConfidence(tasks);
          decision.completedAt = new Date();
          await decision.save();
          await this.recordDecisionMemory(String(decision._id), String(decision.userId), 'completion');
        }
      }
    }
  }

  /**
   * Phase 8 — a completed decision becomes eligible for historical retrieval by
   * persisting its structured memory index. Best-effort: memory must never
   * break the completion flow.
   */
  private async recordDecisionMemory(
    decisionId: string,
    userId: string,
    via: 'completion' | 'cancellation'
  ): Promise<void> {
    try {
      const { decisionMemoryService } = await import('../memory/decisionMemoryService');
      await decisionMemoryService.createForDecision(decisionId, userId, { via });
    } catch (err: any) {
      console.error('[Worker] failed to record decision memory', decisionId, err?.message);
    }
  }

  private async failExecution(execution: IExecution, tasks: ITask[]): Promise<void> {
    const firstError = tasks.find((t) => t.status === 'failed')?.error;
    const p = this.computeProgress(tasks);
    await Execution.updateOne(
      { _id: execution._id },
      {
        $set: {
          status: 'failed',
          progress: p.progress,
          completedTasks: p.completedTasks,
          failedTasks: p.failedTasks,
          runningTasks: 0,
          pendingTasks: 0,
          completedAt: new Date(),
          error: {
            code: firstError?.code,
            message: firstError?.message || 'One or more tasks failed.',
            retryable: firstError?.kind === 'retryable',
            createdAt: new Date(),
          },
        },
      }
    );
    executionEventBus.emit({
      type: 'execution.failed',
      executionId: String(execution._id),
      decisionId: String(execution.decisionId),
      data: { message: firstError?.message },
    });

    if (execution.decisionId) {
      const decision = await Decision.findById(execution.decisionId);
      if (decision) {
        decision.status = 'failed';
        decision.currentPhase = 'failed';
        await decision.save();
      }
    }
  }

  private async cancelExecutionTasks(execution: IExecution): Promise<void> {
    await Task.updateMany(
      { executionId: execution._id, status: { $in: ['pending', 'ready', 'retrying'] } },
      { $set: { status: 'cancelled', completedAt: new Date(), workerId: undefined, leasedAt: undefined } }
    );
  }

  private async setExecutionStatus(execution: IExecution, status: any, eventType: any): Promise<void> {
    const current = execution.status as any;
    if (!StateMachine.canTransitionExecution(current, status).valid) return;
    await Execution.updateOne(
      { _id: execution._id },
      {
        $set: {
          status,
          completedAt: status === 'completed' || status === 'failed' || status === 'cancelled'
            ? new Date()
            : execution.completedAt,
        },
      }
    );
    executionEventBus.emit({
      type: eventType,
      executionId: String(execution._id),
      decisionId: String(execution.decisionId),
    });
  }

  private async recoverStaleTasks(): Promise<void> {
    const stale = await Task.find({
      status: 'running',
      leasedAt: { $lt: new Date(Date.now() - this.staleTaskTimeoutMs) },
    });
    if (stale.length === 0) return;

    for (const task of stale) {
      // Only recover tasks leased to a worker id that may not be alive. Since
      // this is a single-process worker, any stale lease is treated as dead.
      await Task.updateOne(
        { _id: task._id },
        {
          $set: {
            status: 'retrying',
            error: { kind: 'retryable', message: 'Stale task recovered after restart.', createdAt: new Date() },
            retryCount: (task.retryCount || 0) + 1,
            nextRetryAt: new Date(Date.now() + this.recoveryBackoffFn(task.retryCount || 0)),
            workerId: undefined,
            leasedAt: undefined,
          },
        }
      );
      executionEventBus.emit({
        type: 'task.retrying',
        taskId: String(task._id),
        executionId: String(task.executionId),
        retryCount: task.retryCount || 0,
        data: { reason: 'stale-recovered' },
      });
    }
  }

  private computeProgress(tasks: ITask[]): {
    progress: number;
    totalTasks: number;
    completedTasks: number;
    failedTasks: number;
    runningTasks: number;
    pendingTasks: number;
  } {
    const totalTasks = tasks.length || 0;
    if (totalTasks === 0) return { progress: 0, totalTasks: 0, completedTasks: 0, failedTasks: 0, runningTasks: 0, pendingTasks: 0 };
    const completedTasks = tasks.filter((t) => t.status === 'completed').length;
    const failedTasks = tasks.filter((t) => t.status === 'failed' || t.status === 'cancelled' || t.status === 'skipped').length;
    const runningTasks = tasks.filter((t) => t.status === 'running').length;
    const pendingTasks = tasks.filter((t) => ['pending', 'ready', 'retrying'].includes(t.status)).length;
    const done = completedTasks + failedTasks;
    const progress = Math.round((done / totalTasks) * 100);
    return { progress, totalTasks, completedTasks, failedTasks, runningTasks, pendingTasks };
  }

  private inferPhase(tasks: ITask[]): string {
    for (const t of tasks) {
      if (t.status === 'running' || t.status === 'ready' || t.status === 'pending' || t.status === 'retrying') {
        if (t.type === 'debate') return 'debating';
        if (t.type === 'verify_claim' || t.type === 'red_team' || t.type === 'reconciliation') return 'verifying';
        return t.type;
      }
    }
    return 'completed';
  }

  private extractConfidence(tasks: ITask[]): number | undefined {
    const debate = tasks.find((t) => t.type === 'debate' && t.result);
    const verdict = debate?.result as any;
    if (verdict && typeof verdict.verdict?.confidenceScore === 'number') {
      return verdict.verdict.confidenceScore;
    }
    // Reconciliation may carry a final confidence.
    const recon = tasks.find((t) => t.type === 'reconciliation' && t.result);
    const reconVerdict = recon?.result as any;
    if (reconVerdict && typeof reconVerdict.confidence === 'number') {
      return reconVerdict.confidence;
    }
    return undefined;
  }
}

export const worker = new Worker();
