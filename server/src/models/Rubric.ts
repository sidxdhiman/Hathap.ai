import mongoose, { Schema, Document } from 'mongoose';
import { CRITERION_KEYS, EvalCriterionConfig } from '../evaluation/types';

export interface IRubricVersion {
  version: number;
  criteria: EvalCriterionConfig[];
  notes?: string;
  createdAt: Date;
}

export interface IRubric extends Document {
  userId: Schema.Types.ObjectId | string;
  name: string;
  description?: string;
  version: number;
  status: 'draft' | 'active' | 'archived';
  criteria: EvalCriterionConfig[];
  /** Bounded version history so runs pin the rubric they were scored with. */
  versions: IRubricVersion[];
  createdAt: Date;
  updatedAt: Date;
}

const CriterionSchema: Schema = new Schema(
  {
    key: { type: String, enum: CRITERION_KEYS, required: true },
    label: { type: String, required: true },
    description: { type: String },
    weight: { type: Number, default: 0.1 },
    enabled: { type: Boolean, default: true },
  },
  { _id: false }
);

const RubricVersionSchema: Schema = new Schema(
  {
    version: { type: Number, required: true },
    criteria: { type: [CriterionSchema], required: true },
    notes: { type: String },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const RubricSchema: Schema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true },
    description: { type: String },
    version: { type: Number, default: 1 },
    status: { type: String, enum: ['draft', 'active', 'archived'], default: 'draft' },
    criteria: { type: [CriterionSchema], default: [] },
    versions: { type: [RubricVersionSchema], default: [] },
  },
  { timestamps: true }
);

RubricSchema.index({ userId: 1, status: 1, updatedAt: -1 });

export default mongoose.model<IRubric>('Rubric', RubricSchema);