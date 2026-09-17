import { executionEventBus } from '../decision/eventBus';
import { EVALUATION_POLICY_VERSION } from './evaluationPolicy';

/**
 * Phase 9 — Evaluation events.
 *
 * Evaluation progress is surfaced through the same durable event log the
 * execution engine uses. Event payloads carry identifiers and counts only —
 * never artifacts, never internal reasoning, never credentials.
 */

export type EvaluationEventType =
  | 'evaluation.run.created'
  | 'evaluation.run.started'
  | 'evaluation.run.case_completed'
  | 'evaluation.run.case_error'
  | 'evaluation.run.partial'
  | 'evaluation.run.completed'
  | 'evaluation.run.failed'
  | 'evaluation.run.cancelled';

export const EVALUATION_EVENT_TYPES: EvaluationEventType[] = [
  'evaluation.run.created',
  'evaluation.run.started',
  'evaluation.run.case_completed',
  'evaluation.run.case_error',
  'evaluation.run.partial',
  'evaluation.run.completed',
  'evaluation.run.failed',
  'evaluation.run.cancelled',
];

export interface EvaluationEventPayload {
  type: EvaluationEventType;
  runId: string;
  userId?: string;
  decisionId?: string;
  caseId?: string;
  data?: Record<string, unknown>;
}

export function emitEvaluationEvent(payload: EvaluationEventPayload): void {
  executionEventBus.emit({
    type: payload.type,
    decisionId: payload.decisionId,
    data: {
      runId: payload.runId,
      policyVersion: EVALUATION_POLICY_VERSION,
      ...(payload.userId ? { userId: payload.userId } : {}),
      ...(payload.caseId ? { caseId: payload.caseId } : {}),
      ...(payload.data || {}),
    },
  });
}