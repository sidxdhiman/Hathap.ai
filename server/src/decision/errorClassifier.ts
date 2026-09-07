import { ExecutionError, TaskFailureKind, TaskError } from './types';

/**
 * Classifies an error thrown during task execution into a structured code
 * and a retryability decision. This is a pure, side-effect-free module so it
 * can be used by both the scheduler and any task handler.
 */
export function classifyError(error: any): ExecutionError['code'] {
  const message = error?.message || '';
  const status = error?.status || error?.response?.status;

  if (status === 429 || /rate limit|429/i.test(message)) return 'RATE_LIMIT';
  if (status === 402 || /credit|402/i.test(message)) return 'INSUFFICIENT_CREDITS';
  if (status === 401 || status === 403 || /api key|invalid key|unauthorized/i.test(message)) return 'INVALID_API_KEY';
  if (/timeout|etimedout|timeout/i.test(message)) return 'TIMEOUT';
  if (/malformed|parse|failed to parse/i.test(message)) return 'MALFORMED_OUTPUT';
  if (/model.*unavailable|not found|model_not_found/i.test(message)) return 'MODEL_UNAVAILABLE';
  if (/network|fetch failed|econnreset|socket hang up|premature close/i.test(message)) return 'NETWORK_FAILURE';
  if (/provider outage|service unavailable|503/i.test(message)) return 'PROVIDER_OUTAGE';
  return 'AGENT_FAILURE';
}

/**
 * Decides whether a given error is safe to retry (transient) vs a permanent
 * failure (configuration/validation bad). Used to drive the retry/exhaustion
 * semantics of the task system.
 */
export function isRetryableError(error: any): boolean {
  const code = classifyError(error);
  switch (code) {
    case 'RATE_LIMIT':
    case 'TIMEOUT':
    case 'NETWORK_FAILURE':
    case 'PROVIDER_OUTAGE':
    case 'MODEL_UNAVAILABLE':
      return true;
    case 'INVALID_API_KEY':
    case 'INSUFFICIENT_CREDITS':
    case 'MALFORMED_OUTPUT':
    case 'AGENT_FAILURE':
    default:
      return false;
  }
}

export function buildTaskError(error: any, opts: { taskId?: string; attempt?: number } = {}): TaskError {
  const retryable = isRetryableError(error);
  return {
    code: classifyError(error),
    message: error?.message || 'Task failed.',
    taskId: opts.taskId,
    kind: retryable ? 'retryable' : 'non_retryable',
    attempt: opts.attempt,
    createdAt: new Date(),
  };
}

export function buildExecutionError(error: any, opts: { taskId?: string; attempt?: number } = {}): ExecutionError {
  const retryable = isRetryableError(error);
  return {
    code: classifyError(error),
    message: error?.message || 'Execution failed.',
    taskId: opts.taskId,
    retryable,
    retryCount: opts.attempt,
    createdAt: new Date(),
  };
}

export function isDependencyFailureKind(kind: string): boolean {
  return kind === 'dependency_failure';
}

export type { TaskFailureKind };
