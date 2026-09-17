import mongoose, { Schema, Document } from 'mongoose';
import {
  BaselineThresholds,
  EvaluationLimits,
  EvaluationRunKind,
  EvaluationRunStatus,
  SystemUnderTest,
} from '../evaluation/types';

export interface IEvaluationRun extends Document {
  userId: Schema.Types.ObjectId | string;
  benchmarkId: Schema.Types.ObjectId | string;
  rubricId?: Schema.Types.ObjectId | string;
  /** Rubric version this run was scored against (pinned at creation). */
  rubricVersion?: number;
  name: string;
  description?: string;
  kind: EvaluationRunKind;
  status: EvaluationRunStatus;
  systemUnderTest: SystemUnderTest;
  baseline?: { baselineId?: string; thresholds: BaselineThresholds };
  ablation?: { parentRunId?: string; variantLabel?: string; configPatch?: Record<string, unknown> };
  selectedCaseIds: string[];
  limits: EvaluationLimits;
  /** Minimum composite score for a case to count as "passed". */
  passThreshold?: number;
  progress: { total: number; completed: number; failed: number; error: number };
  error?: { message: string };
  lockedAt?: Date;
  lockedBy?: string;
  startedAt?: Date;
  completedAt?: Date;
  cancelledAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const BaselineRefSchema: Schema = new Schema(
  {
    baselineId: { type: String },
    thresholds: {
      composite: { type: Number },
      byCriterion: { type: Schema.Types.Mixed },
    },
  },
  { _id: false }
);

const AblationSchema: Schema = new Schema(
  {
    parentRunId: { type: String },
    variantLabel: { type: String },
    configPatch: { type: Schema.Types.Mixed },
  },
  { _id: false }
);

const LimitsSchema: Schema = new Schema(
  {
    maxCasesPerRun: { type: Number, required: true },
    maxDurationMs: { type: Number, required: true },
    maxSliceMs: { type: Number, required: true },
    maxDecisionWaitMs: { type: Number, required: true },
    maxLlmCallsPerCase: { type: Number, required: true },
    maxTokenBudgetPerCase: { type: Number, required: true },
    maxResultBytes: { type: Number, required: true },
  },
  { _id: false }
);

const EvaluationRunSchema: Schema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    benchmarkId: { type: Schema.Types.ObjectId, ref: 'Benchmark', required: true, index: true },
    rubricId: { type: Schema.Types.ObjectId, ref: 'Rubric' },
    rubricVersion: { type: Number },
    name: { type: String, required: true },
    description: { type: String },
    kind: {
      type: String,
      enum: ['standard', 'baseline', 'ablation'],
      default: 'standard',
      index: true,
    },
    status: {
      type: String,
      enum: ['draft', 'queued', 'running', 'completed', 'failed', 'partial', 'cancelled'],
      default: 'draft',
      index: true,
    },
    systemUnderTest: {
      kind: { type: String, enum: ['static', 'decision-engine', 'external'], required: true },
      label: { type: String, required: true },
      description: { type: String },
      decisionSettings: { type: Schema.Types.Mixed },
    },
    baseline: { type: BaselineRefSchema },
    ablation: { type: AblationSchema },
    selectedCaseIds: [{ type: String }],
    limits: { type: LimitsSchema, required: true },
    passThreshold: { type: Number },
    progress: {
      total: { type: Number, default: 0 },
      completed: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
      error: { type: Number, default: 0 },
    },
    error: {
      message: { type: String },
    },
    lockedAt: { type: Date },
    lockedBy: { type: String },
    startedAt: { type: Date },
    completedAt: { type: Date },
    cancelledAt: { type: Date },
  },
  { timestamps: true }
);

EvaluationRunSchema.index({ userId: 1, status: 1, createdAt: -1 });

export default mongoose.model<IEvaluationRun>('EvaluationRun', EvaluationRunSchema);