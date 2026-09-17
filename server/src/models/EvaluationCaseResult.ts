import mongoose, { Schema, Document } from 'mongoose';
import {
  CompositeMetrics,
  EfficiencyEvaluation,
  EvaluationArtifact,
  EvaluationCaseError,
  EvaluationCaseStatus,
  EvidenceEvaluation,
  OutcomeEvaluation,
  QualityEvaluation,
  ReasoningEvaluation,
  StructuralEvaluation,
} from '../evaluation/types';

export interface IEvaluationCaseResult extends Document {
  runId: Schema.Types.ObjectId | string;
  userId: Schema.Types.ObjectId | string;
  benchmarkId?: Schema.Types.ObjectId | string;
  caseId: Schema.Types.ObjectId | string;
  caseTitle?: string;
  caseVersion?: number;
  status: EvaluationCaseStatus;
  artifact?: EvaluationArtifact;
  structural?: StructuralEvaluation;
  quality?: QualityEvaluation;
  evidence?: EvidenceEvaluation;
  reasoning?: ReasoningEvaluation;
  efficiency?: EfficiencyEvaluation;
  outcome?: OutcomeEvaluation;
  metrics?: CompositeMetrics;
  error?: EvaluationCaseError;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const EvaluationCaseResultSchema: Schema = new Schema(
  {
    runId: { type: Schema.Types.ObjectId, ref: 'EvaluationRun', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    benchmarkId: { type: Schema.Types.ObjectId, ref: 'Benchmark', index: true },
    caseId: { type: Schema.Types.ObjectId, ref: 'BenchmarkCase', required: true, index: true },
    caseTitle: { type: String },
    caseVersion: { type: Number },
    status: {
      type: String,
      enum: ['passed', 'failed', 'error', 'skipped'],
      required: true,
      index: true,
    },
    artifact: { type: Schema.Types.Mixed },
    structural: { type: Schema.Types.Mixed },
    quality: { type: Schema.Types.Mixed },
    evidence: { type: Schema.Types.Mixed },
    reasoning: { type: Schema.Types.Mixed },
    efficiency: { type: Schema.Types.Mixed },
    outcome: { type: Schema.Types.Mixed },
    metrics: { type: Schema.Types.Mixed },
    error: {
      message: { type: String },
      phase: { type: String },
    },
    startedAt: { type: Date },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

EvaluationCaseResultSchema.index({ runId: 1, caseId: 1 }, { unique: true });
EvaluationCaseResultSchema.index({ userId: 1, status: 1 });

export default mongoose.model<IEvaluationCaseResult>('EvaluationCaseResult', EvaluationCaseResultSchema);