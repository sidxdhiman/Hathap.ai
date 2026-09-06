import mongoose, { Schema, Document } from 'mongoose';
import { ClaimStatus, ClaimType } from '../decision/types';

export interface IClaim extends Document {
  decisionId: string;
  agentId?: string;
  text: string;
  type: ClaimType;
  confidence?: number;
  status: ClaimStatus;
  evidenceIds: string[];
  sourceAgentId?: string;
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
    metadata: { type: Schema.Types.Mixed },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export default mongoose.model<IClaim>('Claim', ClaimSchema);
