import mongoose, { Schema, Document } from 'mongoose';
import { BaselineThresholds } from '../evaluation/types';

export interface IBaseline extends Document {
  userId: Schema.Types.ObjectId | string;
  name: string;
  description?: string;
  /** Source run the baseline was captured from (priorRun/hybrid strategies). */
  runId?: Schema.Types.ObjectId | string;
  strategy: 'priorRun' | 'thresholds' | 'hybrid';
  thresholds: BaselineThresholds;
  status: 'active' | 'archived';
  createdAt: Date;
  updatedAt: Date;
}

const BaselineSchema: Schema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true },
    description: { type: String },
    runId: { type: Schema.Types.ObjectId, ref: 'EvaluationRun' },
    strategy: {
      type: String,
      enum: ['priorRun', 'thresholds', 'hybrid'],
      required: true,
      default: 'thresholds',
    },
    thresholds: {
      composite: { type: Number },
      byCriterion: { type: Schema.Types.Mixed },
    },
    status: { type: String, enum: ['active', 'archived'], default: 'active' },
  },
  { timestamps: true }
);

BaselineSchema.index({ userId: 1, status: 1, createdAt: -1 });

export default mongoose.model<IBaseline>('Baseline', BaselineSchema);