"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResearchError = void 0;
/**
 * Error thrown by research providers. `researchCode` is read by the shared
 * error classifier to decide retryability and the persisted error code.
 */
class ResearchError extends Error {
    constructor(researchCode, message, retryAfterMs) {
        super(message);
        this.name = 'ResearchError';
        this.researchCode = researchCode;
        this.retryAfterMs = retryAfterMs;
    }
}
exports.ResearchError = ResearchError;
