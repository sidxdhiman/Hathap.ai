import { EventEmitter } from 'events';
import ExecutionEvent, { IExecutionEvent } from '../models/ExecutionEvent';
import { ExecutionEventRecord } from './types';

export type EventType =
  | 'execution.created'
  | 'execution.queued'
  | 'execution.started'
  | 'execution.paused'
  | 'execution.resumed'
  | 'execution.completed'
  | 'execution.failed'
  | 'execution.cancelled'
  | 'task.created'
  | 'task.started'
  | 'task.completed'
  | 'task.failed'
  | 'task.retrying'
  | 'task.cancelled'
  | 'task.paused'
  | 'agent.started'
  | 'agent.completed'
  | 'agent.failed'
  | 'research.completed'
  | 'evidence.created'
  | 'claim.created'
  | 'planning.started'
  | 'planning.completed'
  | 'planning.failed'
  | 'plan.validated'
  | 'plan.rejected'
  | 'plan.compiled'
  | 'routing.started'
  | 'routing.completed'
  | 'routing.failed'
  | 'routing.fallback'
  // ---- Phase 8: decision memory & outcomes ----
  | 'memory.created'
  | 'memory.retrieved'
  | 'outcome.created'
  | 'outcome.updated'
  | 'feedback.created'
  | 'feedback.updated'
  | 'lesson.created'
  | 'lesson.updated'
  // ---- Phase 9: evaluation & benchmarking ----
  | 'evaluation.benchmark.created'
  | 'evaluation.benchmark.updated'
  | 'evaluation.benchmark.deleted'
  | 'evaluation.benchmark.case_created'
  | 'evaluation.benchmark.case_updated'
  | 'evaluation.benchmark.case_deleted'
  | 'evaluation.rubric.created'
  | 'evaluation.rubric.updated'
  | 'evaluation.baseline.created'
  | 'evaluation.baseline.deleted'
  | 'evaluation.comparison.created'
  | 'evaluation.run.created'
  | 'evaluation.run.started'
  | 'evaluation.run.case_completed'
  | 'evaluation.run.case_error'
  | 'evaluation.run.partial'
  | 'evaluation.run.completed'
  | 'evaluation.run.failed'
  | 'evaluation.run.cancelled'
  | 'evaluation.run.deleted';

/**
 * Central event system for the execution engine.
 *
 * Two concerns are combined intentionally:
 *   1. A durable event log persisted to the `ExecutionEvent` collection
 *      (built on top of the persistence layer, which is the source of truth).
 *   2. An in-process EventEmitter that future SSE/WebSocket layers can
 *      subscribe to for live updates.
 *
 * Events describe state changes but never *replace* persistence — the
 * underlying Decision/Execution/Task documents remain the source of truth.
 *
 * Generation of events is decoupled from any frontend concern.
 */
export class ExecutionEventBus {
  private emitter = new EventEmitter();

  emit(record: ExecutionEventRecord): void {
    const stamped: ExecutionEventRecord = { ...record, timestamp: record.timestamp || new Date() };

    // Always fan out to in-process listeners synchronously first so observers
    // (SSE/WebSocket adapters) never miss an update. Wildcard listeners
    // (registered via onAny) receive every event, including ones whose type is
    // not known to this module yet.
    this.emitter.emit(stamped.type, stamped);
    this.emitter.emit('*', stamped);

    // Persist asynchronously (fire-and-forget; persistence failures must not
    // break the execution flow, which is governed by document state).
    ExecutionEvent.create({
      type: stamped.type,
      decisionId: stamped.decisionId,
      executionId: stamped.executionId,
      taskId: stamped.taskId,
      agentId: stamped.agentId,
      retryCount: stamped.retryCount,
      data: stamped.data,
    }).catch((err) => {
      console.error('[EventBus] failed to persist event', stamped.type, err?.message);
    });
  }

  on(type: EventType | string, listener: (record: ExecutionEventRecord) => void): void {
    this.emitter.on(type, listener);
  }

  off(type: EventType | string, listener: (record: ExecutionEventRecord) => void): void {
    this.emitter.off(type, listener);
  }

  /** Subscribe to every event regardless of type (used by SSE streams). */
  onAny(listener: (record: ExecutionEventRecord) => void): void {
    this.emitter.on('*', listener);
  }

  offAny(listener: (record: ExecutionEventRecord) => void): void {
    this.emitter.off('*', listener);
  }

  async listByExecution(executionId: string): Promise<IExecutionEvent[]> {
    return ExecutionEvent.find({ executionId }).sort({ createdAt: 1 });
  }

  async listByDecision(decisionId: string): Promise<IExecutionEvent[]> {
    return ExecutionEvent.find({ decisionId }).sort({ createdAt: 1 });
  }
}

export const executionEventBus = new ExecutionEventBus();
