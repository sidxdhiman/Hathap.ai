/**
 * Research-specific failure codes.
 *
 * Research failures are mapped onto the shared ExecutionError classification in
 * errorClassifier.ts so the existing Phase 2 retry system (TaskExecutor) decides
 * retry vs permanent fail — there is no research-specific retry loop.
 */
export type ResearchErrorCode =
  | 'PROVIDER_UNAVAILABLE'
  | 'AUTHENTICATION_FAILURE'
  | 'RATE_LIMITED'
  | 'TIMEOUT'
  | 'INVALID_QUERY'
  | 'EMPTY_RESULTS'
  | 'CONTENT_FETCH_FAILURE'
  | 'INVALID_CONFIGURATION';

/**
 * Error thrown by research providers. `researchCode` is read by the shared
 * error classifier to decide retryability and the persisted error code.
 */
export class ResearchError extends Error {
  readonly researchCode: ResearchErrorCode;
  /** Respect provider Backoff/Retry-After hints where available. */
  retryAfterMs?: number;

  constructor(researchCode: ResearchErrorCode, message: string, retryAfterMs?: number) {
    super(message);
    this.name = 'ResearchError';
    this.researchCode = researchCode;
    this.retryAfterMs = retryAfterMs;
  }
}