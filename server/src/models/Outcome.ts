import mongoose, { Schema, Document } from 'mongoose';
import {
  OutcomeKind,
  OutcomeStatus,
  OutcomeSource,
  MetricDirection,
} from '../memory/types';

export interface IOutcomeMetric {
  name: string;
  unit?: string;
  baseline?: number;
  target?: number;
  actual?: number;
  direction: MetricDirection;
  source?: string;
  observedAt?: Date;
}

export interface IOutcome extends Document {
  userId: Schema.Types.ObjectId | string;
  decisionId: Schema.Types.ObjectId | string;
  /** Explicitly distinguishes expected (forecast) from actual (observed). */
  kind: OutcomeKind;
  status: OutcomeStatus;
  description: string;
  /** When the event/measurement actually happened. */
  observedAt?: Date;
  observedMetric?: number;
  metrics: IOutcomeMetric[];
  /** Phase 8 relies on human-entered outcomes; system-observed is reserved. */
  source: OutcomeSource;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export const OUTCOME_KINDS: OutcomeKind[] = ['expected', 'actual'];
export const OUTCOME_STATUSES: OutcomeStatus[] = [
  'pending',
  'partial',
  'success',
  'failure',
  'unknown',
  'cancelled',
];
export const METRIC_DIRECTIONS: MetricDirection[] = ['increase', 'decrease', 'neutral', 'unknown'];

const OutcomeMetricSchema: Schema = new Schema(
  {
    name: { type: String, required: true },
    unit: { type: String },
    baseline: { type: Number },
    target: { type: Number },
    actual: { type: Number },
    direction: { type: String, enum: METRIC_DIRECTIONS, default: 'unknown' },
    source: { type: String },
    observedAt: { type: Date },
  },
  { _id: false }
);

const OutcomeSchema: Schema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    decisionId: { type: Schema.Types.ObjectId, ref: 'Decision', required: true, index: true },
    kind: { type: String, enum: OUTCOME_KINDS, required: true, index: true },
    status: {
      type: String,
      enum: OUTCOME_STATUSES,
      default: 'pending',
      required: true,
      index: true,
    },
    description: { type: String, required: true },
    observedAt: { type: Date },
    observedMetric: { type: Number },
    metrics: { type: [OutcomeMetricSchema], default: [] },
    source: { type: String, enum: ['human', 'system_observed'], default: 'human' },
    notes: { type: String },
  },
  { timestamps: true }
);

OutcomeSchema.index({ userId: 1, decisionId: 1, kind: 1, createdAt: -1 });
OutcomeSchema.index({ userId: 1, status: 1 });

export default mongoose.model<IOutcome>('Outcome', OutcomeSchema);