"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.classifyError = classifyError;
exports.isRetryableError = isRetryableError;
exports.buildTaskError = buildTaskError;
exports.buildExecutionError = buildExecutionError;
exports.isDependencyFailureKind = isDependencyFailureKind;
/**
 * Classifies an error thrown during task execution into a structured code
 * and a retryability decision. This is a pure, side-effect-free module so it
 * can be used by both the scheduler and any task handler.
 */
function classifyError(error) {
    const message = error?.message || '';
    const status = error?.status || error?.response?.status;
    // Research providers throw ResearchError with a structured researchCode —
    // map it to the shared ExecutionError codes so the retry system needs no
    // research-specific knowledge.
    const researchCode = error?.researchCode;
    if (researchCode) {
        switch (researchCode) {
            case 'TIMEOUT':
            case 'PROVIDER_UNAVAILABLE':
            case 'CONTENT_FETCH_FAILURE':
                return 'PROVIDER_OUTAGE';
            case 'AUTHENTICATION_FAILURE':
            case 'INVALID_CONFIGURATION':
                return 'INVALID_API_KEY';
            case 'RATE_LIMITED':
                return 'RATE_LIMIT';
            case 'INVALID_QUERY':
                return 'INVALID_REQUEST';
            default:
                break;
        }
    }
    if (status === 429 || /rate limit|429/i.test(message))
        return 'RATE_LIMIT';
    if (status === 402 || /credit|402/i.test(message))
        return 'INSUFFICIENT_CREDITS';
    if (status === 401 || status === 403 || /api key|invalid key|unauthorized/i.test(message))
        return 'INVALID_API_KEY';
    if (/timeout|etimedout|timeout/i.test(message))
        return 'TIMEOUT';
    if (/malformed|parse|failed to parse/i.test(message))
        return 'MALFORMED_OUTPUT';
    if (/model.*unavailable|not found|model_not_found/i.test(message))
        return 'MODEL_UNAVAILABLE';
    if (/network|fetch failed|econnreset|socket hang up|premature close/i.test(message))
        return 'NETWORK_FAILURE';
    if (/provider outage|service unavailable|503/i.test(message))
        return 'PROVIDER_OUTAGE';
    // Research validation errors: bad input/task configuration. Non-retryable.
    if (researchCode === 'INVALID_QUERY' || /invalid request/i.test(message))
        return 'INVALID_REQUEST';
    return 'AGENT_FAILURE';
}
/**
 * Decides whether a given error is safe to retry (transient) vs a permanent
 * failure (configuration/validation bad). Used to drive the retry/exhaustion
 * semantics of the task system.
 */
function isRetryableError(error) {
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
        case 'INVALID_REQUEST':
        case 'MALFORMED_OUTPUT':
        case 'AGENT_FAILURE':
        default:
            return false;
    }
}
function buildTaskError(error, opts = {}) {
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
function buildExecutionError(error, opts = {}) {
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
function isDependencyFailureKind(kind) {
    return kind === 'dependency_failure';
}
