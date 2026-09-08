import mongoose, { Schema, Document } from 'mongoose';
import { PlanSource, PlanningMode, PlanTermination } from '../planning/planTypes';

export interface IPlanValidationRef {
  valid: boolean;
  errors: string[];
}

export interface IPlanningFailureRef {
  code: string;
  message: string;
  reason: string;
  createdAt: Date;
}

export interface IDecisionPlan extends Document {
  decisionId: string;
  executionId: string;
  version: string;
  source: PlanSource;
  planningMode: PlanningMode;
  plannerModel?: string;
  plannerVersion: string;
  planVersion: number;
  status: 'proposed' | 'validated' | 'rejected' | 'compiled' | 'failed';
  tasks: Array<Record<string, unknown>>;
  termination: PlanTermination;
  rationale?: Record<string, unknown>;
  estimates: Record<string, unknown>;
  validation: IPlanValidationRef;
  failure?: IPlanningFailureRef;
  createdAt: Date;
  compiledAt?: Date;
}

const TerminationSchema: Schema = new Schema(
  {
    requiresVerification: { type: Boolean, default: false },
    requiresRedTeam: { type: Boolean, default: false },
    requiresReconciliation: { type: Boolean, default: true },
  },
  { _id: false }
);

const PlanValidationSchema: Schema = new Schema(
  {
    valid: { type: Boolean, default: false },
    errors: [{ type: String }],
  },
  { _id: false }
);

const PlanFailureSchema: Schema = new Schema(
  {
    code: String,
    message: String,
    reason: String,
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const DecisionPlanSchema: Schema = new Schema(
  {
    decisionId: { type: Schema.Types.ObjectId, ref: 'Decision', required: true, index: true },
    executionId: { type: Schema.Types.ObjectId, ref: 'Execution', required: true, unique: true, index: true },
    version: { type: String, default: '1.0' },
    source: { type: String, enum: ['intelligent', 'fallback', 'baseline'], required: true },
    planningMode: { type: String, enum: ['fixed', 'intelligent'], required: true },
    plannerModel: { type: String },
    plannerVersion: { type: String, default: 'planner-v1' },
    planVersion: { type: Number, default: 1 },
    status: {
      type: String,
      enum: ['proposed', 'validated', 'rejected', 'compiled', 'failed'],
      default: 'proposed',
      index: true,
    },
    tasks: { type: [Schema.Types.Mixed], default: [] },
    termination: { type: TerminationSchema, default: () => ({ requiresReconciliation: true }) },
    rationale: { type: Schema.Types.Mixed },
    estimates: { type: Schema.Types.Mixed, default: () => ({}) },
    validation: { type: PlanValidationSchema, default: () => ({ valid: false, errors: [] }) },
    failure: { type: PlanFailureSchema },
    compiledAt: { type: Date },
  },
  { timestamps: true }
);

export default mongoose.model<IDecisionPlan>('DecisionPlan', DecisionPlanSchema);