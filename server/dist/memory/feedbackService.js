"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.feedbackService = exports.FeedbackService = exports.FeedbackValidationError = void 0;
exports.cleanFeedbackInput = cleanFeedbackInput;
const DecisionFeedback_1 = __importDefault(require("../models/DecisionFeedback"));
const eventBus_1 = require("../decision/eventBus");
const FEEDBACK_STATUSES = ['accepted', 'rejected', 'modified', 'unknown'];
class FeedbackValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'FeedbackValidationError';
    }
}
exports.FeedbackValidationError = FeedbackValidationError;
function cleanFeedbackInput(body) {
    if (!body || typeof body !== 'object') {
        throw new FeedbackValidationError('Invalid feedback payload.');
    }
    const recommendationStatus = body.recommendationStatus;
    if (!recommendationStatus || !FEEDBACK_STATUSES.includes(recommendationStatus)) {
        throw new FeedbackValidationError(`Invalid recommendationStatus "${recommendationStatus}". Expected one of: ${FEEDBACK_STATUSES.join(', ')}.`);
    }
    return {
        recommendationStatus,
        reason: typeof body.reason === 'string' ? body.reason : undefined,
        comment: typeof body.comment === 'string' ? body.comment : undefined,
        submittedAt: body.submittedAt ? new Date(body.submittedAt) : new Date(),
    };
}
/**
 * Phase 8 — FeedbackService.
 *
 * Structured human feedback on the final recommendation. One feedback record
 * per decision (POST upserts on subsequent submissions).
 *
 * Important semantics: `rejected` is a statement about what happened, not an
 * accusation against the model. A recommendation can be rejected because
 * priorities changed, costs rose, another option appeared, or human judgment
 * overruled it. Feedback is never converted to "model failure" here.
 */
class FeedbackService {
    async get(userId, decisionId) {
        return DecisionFeedback_1.default.findOne({ decisionId, userId });
    }
    async upsert(userId, decisionId, input) {
        const existing = await DecisionFeedback_1.default.findOne({ decisionId, userId });
        if (existing) {
            existing.set({
                recommendationStatus: input.recommendationStatus,
                reason: input.reason,
                comment: input.comment,
                submittedAt: input.submittedAt,
            });
            const saved = await existing.save();
            eventBus_1.executionEventBus.emit({
                type: 'feedback.updated',
                decisionId,
                data: { recommendationStatus: saved.recommendationStatus },
            });
            return saved;
        }
        const created = await DecisionFeedback_1.default.create({
            userId,
            decisionId,
            recommendationStatus: input.recommendationStatus,
            reason: input.reason,
            comment: input.comment,
            submittedAt: input.submittedAt,
        });
        eventBus_1.executionEventBus.emit({
            type: 'feedback.created',
            decisionId,
            data: { recommendationStatus: created.recommendationStatus },
        });
        return created;
    }
}
exports.FeedbackService = FeedbackService;
exports.feedbackService = new FeedbackService();
