import Task, { ITask } from '../models/Task';
import Execution, { IExecution } from '../models/Execution';
import {
  TaskHandlerRegistry,
  TaskHandlerContext,
  TokenUsage,
  TaskError,
} from './types';
import { StateMachine } from './stateMachine';
import { executionEventBus } from './eventBus';
import { buildTaskError } from './errorClassifier';
import { aggregateUsage } from './usage';

export interface ExecutorOptions {
  registry: TaskHandlerRegistry;
  workerId: string;
  backoff?: (attempt: number) => number;
}

/**
 * TaskExecutor — decides HOW a task runs.
 *
 * Responsibilities:
 *   - Claim a scheduled task atomically (lease) so two workers never run the
 *     same task (idempotency / claim-based, not exactly-once).
 *   - Refuse to re-execute a task that already has a successful result.
 *   - Execute the task via its registered handler.
 *   - Persist the result, aggregate usage, and drive state transitions.
 *   - Classify failures into retryable vs permanent and schedule retries with
 *     exponential backoff, or mark the task failed permanently.
 */
export class TaskExecutor {
  private backoff: (attempt: number) => number;

  constructor(private options: ExecutorOptions) {
    this.backoff = options.backoff || ((attempt: number) => Math.min(1000 * 2 ** (attempt - 1), 30_000));
  }

  /**
   * Atomically claim a task if it is still eligible to run. Returns the task
   * when claimed, or null if it can no longer run (already done / being worked).
   *
   * The lease is a `workerId` + `leasedAt` stamp. It is checked defensively to
   * satisfy the idempotency requirement: a completed task is never re-executed.
   */
  async claim(taskId: string): Promise<ITask | null> {
    const task = await Task.findById(taskId);
    if (!task) return null;

    // Idempotency guards.
    if (task.status === 'completed' && task.result) return null;
    if (task.status === 'cancelled') return null;

    if (!StateMachine.canTransitionTask(task.status as any, 'running').valid) return null;

    const updated = await Task.findOneAndUpdate(
      { _id: taskId, status: { $in: ['ready', 'pending', 'retrying'] } },
      {
        $set: {
          status: 'running',
          workerId: this.options.workerId,
          leasedAt: new Date(),
          startedAt: task.startedAt || new Date(),
        },
        $inc: { attempts: 1 },
      },
      { new: true }
    );

    if (!updated) return null;

    executionEventBus.emit({
      type: 'task.started',
      taskId: updated._id.toString(),
      executionId: updated.executionId?.toString(),
    });

    return updated;
  }

  /**
   * Execute a claimed task to completion (or retry/fail), persisting everything
   * through the document layer. `userId` is the owner of the decision the task
   * belongs to (needed to resolve agents/models in debate-style handlers).
   */
  async execute(userId: string, execution: IExecution, task: ITask): Promise<ITask> {
    const handler = this.options.registry.getHandler(task.type);
    if (!handler) {
      return this.finishFailure(execution, task, {
        code: 'AGENT_FAILURE',
        message: `No handler registered for task type "${task.type}".`,
        taskId: task._id.toString(),
        kind: 'non_retryable',
        attempt: task.attempts || 0,
        createdAt: new Date(),
      });
    }

    const taskId = task._id.toString();
    const usageCollector: TokenUsage[] = [];

    const context: TaskHandlerContext = {
      userId,
      decisionId: String(execution.decisionId),
      executionId: String(execution._id),
      taskId,
      onUsage: (usage) => usageCollector.push(usage),
    };

    try {
      const handlerTask = {
        ...(typeof task.toObject === 'function' ? task.toObject() : task),
        attempts: task.attempts || 0,
        input: task.input,
      };
      const handlerResult = await handler.execute(handlerTask as any, context);

      await this.recordUsage(execution, usageCollector);
      await Task.updateOne(
        { _id: taskId },
        {
          $set: {
            status: 'completed',
            output: handlerResult.output,
            result: handlerResult.output,
            completedAt: new Date(),
            error: undefined,
            workerId: undefined,
            leasedAt: undefined,
            nextRetryAt: undefined,
          },
        }
      );

      executionEventBus.emit({
        type: 'task.completed',
        taskId,
        executionId: String(execution._id),
        decisionId: String(execution.decisionId),
        data: { type: task.type },
      });

      return (await Task.findById(taskId)) || task;
    } catch (error: any) {
      await this.recordUsage(execution, usageCollector);
      return this.finishFailure(
        execution,
        task,
        buildTaskError(error, { taskId, attempt: task.attempts || 0 })
      );
    }
  }

  private async finishFailure(
    execution: IExecution,
    task: ITask,
    taskError: TaskError
  ): Promise<ITask> {
    const taskId = task._id.toString();
    const attempt = task.attempts || 0;

    // Cancelled tasks are never retried/failed — they stay cancelled.
    if (task.status === 'cancelled') {
      return (await Task.findById(taskId)) || task;
    }

    const canRetry = taskError.kind === 'retryable' && attempt <= (task.maxRetries ?? 2);

    if (canRetry) {
      const delay = this.backoff(attempt);
      await Task.updateOne(
        { _id: taskId },
        {
          $set: {
            status: 'retrying',
            error: taskError,
            nextRetryAt: new Date(Date.now() + delay),
            retryCount: attempt,
            workerId: undefined,
            leasedAt: undefined,
          },
        }
      );
      executionEventBus.emit({
        type: 'task.retrying',
        taskId,
        executionId: String(execution._id),
        decisionId: String(execution.decisionId),
        retryCount: attempt,
        data: { nextRetryAt: new Date(Date.now() + delay).toISOString(), kind: taskError.kind },
      });
    } else {
      await Task.updateOne(
        { _id: taskId },
        {
          $set: {
            status: 'failed',
            error: taskError,
            completedAt: new Date(),
            workerId: undefined,
            leasedAt: undefined,
            nextRetryAt: undefined,
          },
        }
      );
      executionEventBus.emit({
        type: 'task.failed',
        taskId,
        executionId: String(execution._id),
        decisionId: String(execution.decisionId),
        retryCount: attempt,
        data: { kind: taskError.kind, message: taskError.message },
      });
    }

    return (await Task.findById(taskId)) || task;
  }

  private async recordUsage(execution: IExecution, usage: TokenUsage[]): Promise<void> {
    if (!usage.length) return;
    const agg = aggregateUsage(usage);
    const current = execution.tokenUsage || ({ inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCost: 0 } as TokenUsage);
    const newCost = (current.estimatedCost || 0) + agg.estimatedCost;
    await Execution.updateOne(
      { _id: execution._id },
      {
        $set: {
          tokenUsage: {
            inputTokens: (current.inputTokens || 0) + agg.inputTokens,
            outputTokens: (current.outputTokens || 0) + agg.outputTokens,
            totalTokens: (current.totalTokens || 0) + agg.totalTokens,
            estimatedCost: newCost,
            model: agg.model || current.model,
            provider: agg.provider || current.provider,
          },
          estimatedCost: newCost,
          actualCost: newCost,
        },
      }
    );
  }
}
