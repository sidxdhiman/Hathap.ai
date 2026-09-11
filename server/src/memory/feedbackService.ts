import DecisionFeedback, { IDecisionFeedback } from '../models/DecisionFeedback';
import { executionEventBus } from '../decision/eventBus';
import { FeedbackStatus } from './types';

const FEEDBACK_STATUSES: FeedbackStatus[] = ['accepted', 'rejected', 'modified', 'unknown'];

export class FeedbackValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FeedbackValidationError';
  }
}

export type FeedbackInput = {
  recommendationStatus: FeedbackStatus;
  reason?: string;
  comment?: string;
  submittedAt?: Date;
};

export function cleanFeedbackInput(body: any): FeedbackInput {
  if (!body || typeof body !== 'object') {
    throw new FeedbackValidationError('Invalid feedback payload.');
  }
  const recommendationStatus = body.recommendationStatus;
  if (!recommendationStatus || !(FEEDBACK_STATUSES as string[]).includes(recommendationStatus)) {
    throw new FeedbackValidationError(
      `Invalid recommendationStatus "${recommendationStatus}". Expected one of: ${FEEDBACK_STATUSES.join(', ')}.`
    );
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
export class FeedbackService {
  async get(userId: string, decisionId: string): Promise<IDecisionFeedback | null> {
    return DecisionFeedback.findOne({ decisionId, userId });
  }

  async upsert(userId: string, decisionId: string, input: FeedbackInput): Promise<IDecisionFeedback> {
    const existing = await DecisionFeedback.findOne({ decisionId, userId });
    if (existing) {
      existing.set({
        recommendationStatus: input.recommendationStatus,
        reason: input.reason,
        comment: input.comment,
        submittedAt: input.submittedAt,
      });
      const saved = await existing.save();
      executionEventBus.emit({
        type: 'feedback.updated',
        decisionId,
        data: { recommendationStatus: saved.recommendationStatus },
      });
      return saved;
    }

    const created = await DecisionFeedback.create({
      userId,
      decisionId,
      recommendationStatus: input.recommendationStatus,
      reason: input.reason,
      comment: input.comment,
      submittedAt: input.submittedAt,
    });
    executionEventBus.emit({
      type: 'feedback.created',
      decisionId,
      data: { recommendationStatus: created.recommendationStatus },
    });
    return created;
  }
}

export const feedbackService = new FeedbackService();