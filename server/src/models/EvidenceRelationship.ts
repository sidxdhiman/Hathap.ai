import mongoose, { Schema, Document } from 'mongoose';
import { EvidenceRelationshipType, EvidenceRelationshipSource } from '../decision/types';

export interface IEvidenceRelationship extends Document {
  claimId: string;
  evidenceId: string;
  relationship: EvidenceRelationshipType;
  strength?: number;
  rationale?: string;
  source: EvidenceRelationshipSource;
  decisionId?: string;
  executionId?: string;
  taskId?: string;
  createdAt: Date;
}

const EvidenceRelationshipSchema: Schema = new Schema(
  {
    claimId: { type: String, required: true, index: true },
    evidenceId: { type: String, required: true, index: true },
    relationship: {
      type: String,
      enum: ['supports', 'contradicts', 'related'],
      required: true,
    },
    strength: { type: Number, min: 0, max: 1 },
    rationale: { type: String },
    source: {
      type: String,
      enum: ['research', 'agent', 'verification'],
      default: 'agent',
    },
    decisionId: { type: Schema.Types.ObjectId, ref: 'Decision', index: true },
    executionId: { type: Schema.Types.ObjectId, ref: 'Execution' },
    taskId: { type: Schema.Types.ObjectId, ref: 'Task' },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

EvidenceRelationshipSchema.index({ decisionId: 1, claimId: 1, evidenceId: 1 }, { unique: true });

export default mongoose.model<IEvidenceRelationship>('EvidenceRelationship', EvidenceRelationshipSchema);