import mongoose, { Schema, Document } from 'mongoose';
import { ClaimStatus, ClaimType } from '../decision/types';
import { EvidenceProvenanceKind } from '../research/types';

export interface IClaim extends Document {
  decisionId: string;
  agentId?: string;
  text: string;
  type: ClaimType;
  confidence?: number;
  status: ClaimStatus;
  evidenceIds: string[];
  sourceAgentId?: string;
  executionId?: string;
  taskId?: string;
  supportingEvidenceIds?: string[];
  contradictingEvidenceIds?: string[];
  provenanceKind?: EvidenceProvenanceKind;
  attribution?: {
    sourceName?: string;
    sourceUrl?: string;
    sourceReliability?: 'low' | 'medium' | 'high';
  };
  metadata?: Record<string, unknown>;
  createdAt?: Date;
}

const ClaimSchema: Schema = new Schema(
  {
    decisionId: { type: Schema.Types.ObjectId, ref: 'Decision', required: true, index: true },
    agentId: { type: String },
    text: { type: String, required: true },
    type: {
      type: String,
      enum: ['fact', 'assumption', 'opinion', 'inference', 'recommendation', 'risk'],
      required: true,
    },
    confidence: { type: Number, min: 0, max: 1 },
    status: {
      type: String,
      enum: ['proposed', 'accepted', 'rejected', 'disputed', 'verified', 'unverified'],
      default: 'proposed',
      index: true,
    },
    evidenceIds: [{ type: String }],
    sourceAgentId: { type: String },
    executionId: { type: Schema.Types.ObjectId, ref: 'Execution' },
    taskId: { type: Schema.Types.ObjectId, ref: 'Task' },
    supportingEvidenceIds: [{ type: String }],
    contradictingEvidenceIds: [{ type: String }],
    provenanceKind: {
      type: String,
      enum: ['observed', 'retrieved', 'inferred'],
      default: 'retrieved',
    },
    attribution: { type: Schema.Types.Mixed },
    metadata: { type: Schema.Types.Mixed },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export default mongoose.model<IClaim>('Claim', ClaimSchema);
