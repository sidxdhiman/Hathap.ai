import DecisionLesson, { IDecisionLesson } from '../models/DecisionLesson';
import { executionEventBus } from '../decision/eventBus';
import { LessonSource, LessonStatus } from './types';

const LESSON_SOURCES: LessonSource[] = ['human', 'llm_suggestion'];
const LESSON_STATUSES: LessonStatus[] = ['confirmed', 'unconfirmed'];

export class LessonValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LessonValidationError';
  }
}

export type LessonInput = {
  text: string;
  source: LessonSource;
  status: LessonStatus;
  outcomeId?: string;
  metricName?: string;
  feedbackId?: string;
  evidenceIds: string[];
};

export function cleanLessonInput(body: any): LessonInput {
  if (!body || typeof body !== 'object') {
    throw new LessonValidationError('Invalid lesson payload.');
  }
  const text = body.text;
  if (typeof text !== 'string' || !text.trim()) {
    throw new LessonValidationError('Lesson "text" is required.');
  }
  const source: LessonSource =
    body.source === 'llm_suggestion' ? 'llm_suggestion' : 'human';

  let status: LessonStatus;
  if (body.status === undefined) {
    // A generated suggestion is unconfirmed by default; a human-entered
    // lesson is confirmed by the act of the human writing it.
    status = source === 'llm_suggestion' ? 'unconfirmed' : 'confirmed';
  } else if ((LESSON_STATUSES as string[]).includes(body.status)) {
    status = body.status;
  } else {
    throw new LessonValidationError(
      `Invalid lesson status "${body.status}". Expected one of: ${LESSON_STATUSES.join(', ')}.`
    );
  }

  // No automatic truth conversion: an LLM suggestion can never be created as a
  // confirmed fact. Only a later explicit human-led update can confirm it.
  if (source === 'llm_suggestion' && status === 'confirmed') {
    throw new LessonValidationError(
      'An LLM-suggested lesson cannot be created as confirmed. It must start unconfirmed and be confirmed by a human.'
    );
  }

  return {
    text: text.trim(),
    source,
    status,
    outcomeId: typeof body.outcomeId === 'string' ? body.outcomeId : undefined,
    metricName: typeof body.metricName === 'string' ? body.metricName : undefined,
    feedbackId: typeof body.feedbackId === 'string' ? body.feedbackId : undefined,
    evidenceIds: Array.isArray(body.evidenceIds)
      ? body.evidenceIds.filter((e: unknown): e is string => typeof e === 'string').slice(0, 20)
      : [],
  };
}

/**
 * Phase 8 — LessonsService.
 *
 * Lessons are associated with a decision (and ideally an outcome/metric/
 * evidence/feedback). Unconfirmed generated suggestions and confirmed human
 * lessons are always distinguishable via source + status.
 */
export class LessonsService {
  async list(userId: string, decisionId: string): Promise<IDecisionLesson[]> {
    return DecisionLesson.find({ decisionId, userId }).sort({ createdAt: 1 });
  }

  async create(userId: string, decisionId: string, input: LessonInput): Promise<IDecisionLesson> {
    const created = await DecisionLesson.create({
      userId,
      decisionId,
      text: input.text,
      source: input.source,
      status: input.status,
      outcomeId: input.outcomeId,
      metricName: input.metricName,
      feedbackId: input.feedbackId,
      evidenceIds: input.evidenceIds,
    });
    executionEventBus.emit({
      type: 'lesson.created',
      decisionId,
      data: {
        lessonId: created._id.toString(),
        source: created.source,
        status: created.status,
      },
    });
    return created;
  }

  async update(
    userId: string,
    decisionId: string,
    lessonId: string,
    patch: Partial<LessonInput>
  ): Promise<IDecisionLesson | null> {
    const lesson = await DecisionLesson.findOne({ _id: lessonId, decisionId, userId });
    if (!lesson) return null;

    if (patch.text !== undefined) lesson.text = patch.text;
    if (patch.status !== undefined) {
      // Human confirmation via update is allowed — that is the documented
      // path to confirming a generated suggestion.
      lesson.status = patch.status;
    }
    if (patch.outcomeId !== undefined) lesson.outcomeId = patch.outcomeId as any;
    if (patch.metricName !== undefined) lesson.metricName = patch.metricName;
    if (patch.feedbackId !== undefined) lesson.feedbackId = patch.feedbackId as any;
    if (patch.evidenceIds !== undefined) lesson.evidenceIds = patch.evidenceIds;

    const saved = await lesson.save();
    executionEventBus.emit({
      type: 'lesson.updated',
      decisionId,
      data: {
        lessonId: saved._id.toString(),
        source: saved.source,
        status: saved.status,
      },
    });
    return saved;
  }
}

export const lessonsService = new LessonsService();