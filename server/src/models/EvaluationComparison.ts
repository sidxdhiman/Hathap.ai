import mongoose, { Schema, Document } from 'mongoose';
import { ComparisonCaseRow, ComparisonSummary } from '../evaluation/types';

export interface IEvaluationComparison extends Document {
  userId: Schema.Types.ObjectId | string;
  name?: string;
  runAId: Schema.Types.ObjectId | string;
  runBId?: Schema.Types.ObjectId | string;
  baselineId?: Schema.Types.ObjectId | string;
  type: 'run_vs_run' | 'run_vs_baseline';
  summary: ComparisonSummary;
  perCase: ComparisonCaseRow[];
  createdAt: Date;
  updatedAt: Date;
}

const ComparisonCaseRowSchema: Schema = new Schema(
  {
    caseId: { type: String, required: true },
    caseTitle: { type: String },
    scoreA: { type: Number },
    scoreB: { type: Number },
    delta: { type: Number },
    direction: { type: String, enum: ['improvement', 'regression', 'unchanged', 'missing'] },
  },
  { _id: false }
);

const SummarySchema: Schema = new Schema(
  {
    compared: { type: Number, default: 0 },
    missingA: { type: Number, default: 0 },
    missingB: { type: Number, default: 0 },
    regressions: { type: Number, default: 0 },
    improvements: { type: Number, default: 0 },
    unchanged: { type: Number, default: 0 },
    aggregateA: { type: Number },
    aggregateB: { type: Number },
    aggregateDelta: { type: Number },
    regressionDetected: { type: Boolean, default: false },
    note: { type: String },
  },
  { _id: false }
);

const EvaluationComparisonSchema: Schema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String },
    runAId: { type: Schema.Types.ObjectId, ref: 'EvaluationRun', required: true },
    runBId: { type: Schema.Types.ObjectId, ref: 'EvaluationRun' },
    baselineId: { type: Schema.Types.ObjectId, ref: 'Baseline' },
    type: { type: String, enum: ['run_vs_run', 'run_vs_baseline'], required: true },
    summary: { type: SummarySchema, default: () => ({}) },
    perCase: { type: [ComparisonCaseRowSchema], default: [] },
  },
  { timestamps: true }
);

EvaluationComparisonSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model<IEvaluationComparison>('EvaluationComparison', EvaluationComparisonSchema);