import mongoose, { Schema, Document } from 'mongoose';
import { LessonSource, LessonStatus } from '../memory/types';

export interface IDecisionLesson extends Document {
  userId: Schema.Types.ObjectId | string;
  decisionId: Schema.Types.ObjectId | string;
  text: string;
  /** Who generated the lesson: a human, or an LLM suggestion. */
  source: LessonSource;
  /** A lesson is "confirmed" only when a human confirmed/endorsed it. */
  status: LessonStatus;
  outcomeId?: Schema.Types.ObjectId | string;
  metricName?: string;
  feedbackId?: Schema.Types.ObjectId | string;
  evidenceIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

export const LESSON_SOURCES: LessonSource[] = ['human', 'llm_suggestion'];
export const LESSON_STATUSES: LessonStatus[] = ['confirmed', 'unconfirmed'];

const DecisionLessonSchema: Schema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    decisionId: { type: Schema.Types.ObjectId, ref: 'Decision', required: true, index: true },
    text: { type: String, required: true },
    source: { type: String, enum: LESSON_SOURCES, required: true, default: 'human' },
    status: { type: String, enum: LESSON_STATUSES, required: true, default: 'confirmed', index: true },
    outcomeId: { type: Schema.Types.ObjectId, ref: 'Outcome' },
    metricName: { type: String },
    feedbackId: { type: Schema.Types.ObjectId, ref: 'DecisionFeedback' },
    evidenceIds: [{ type: String }],
  },
  { timestamps: true }
);

DecisionLessonSchema.index({ userId: 1, decisionId: 1 });
DecisionLessonSchema.index({ userId: 1, status: 1 });

export default mongoose.model<IDecisionLesson>('DecisionLesson', DecisionLessonSchema);