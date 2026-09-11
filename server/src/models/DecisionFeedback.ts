import mongoose, { Schema, Document } from 'mongoose';
import { FeedbackStatus } from '../memory/types';

export interface IDecisionFeedback extends Document {
  userId: Schema.Types.ObjectId | string;
  decisionId: Schema.Types.ObjectId | string;
  recommendationStatus: FeedbackStatus;
  reason?: string;
  comment?: string;
  submittedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export const FEEDBACK_STATUSES: FeedbackStatus[] = ['accepted', 'rejected', 'modified', 'unknown'];

const DecisionFeedbackSchema: Schema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    decisionId: {
      type: Schema.Types.ObjectId,
      ref: 'Decision',
      required: true,
      unique: true,
      index: true,
    },
    recommendationStatus: {
      type: String,
      enum: FEEDBACK_STATUSES,
      required: true,
      default: 'unknown',
      index: true,
    },
    reason: { type: String },
    comment: { type: String },
    submittedAt: { type: Date },
  },
  { timestamps: true }
);

export default mongoose.model<IDecisionFeedback>('DecisionFeedback', DecisionFeedbackSchema);