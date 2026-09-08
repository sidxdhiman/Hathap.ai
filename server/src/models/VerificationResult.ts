import mongoose, { Schema, Document } from 'mongoose';
import { VerificationStatus, VerificationMode } from '../decision/types';

export interface IVerificationResult extends Document {
  claimId: string;
  claimStatement: string;
  status: VerificationStatus;
  supportingEvidenceIds: string[];
  contradictingEvidenceIds: string[];
  relatedEvidenceIds: string[];
  rationale: string;
  confidence?: number;
  mode: VerificationMode;
  decisionId?: string;
  executionId?: string;
  taskId?: string;
  modelUsed?: string;
  createdAt?: Date;
}

const VerificationResultSchema: Schema = new Schema(
  {
    claimId: { type: String, required: true, index: true },
    claimStatement: { type: String, required: true },
    status: {
      type: String,
      enum: ['supported', 'contradicted', 'unsupported', 'inconclusive'],
      required: true,
    },
    supportingEvidenceIds: [{ type: String }],
    contradictingEvidenceIds: [{ type: String }],
    relatedEvidenceIds: [{ type: String }],
    rationale: { type: String, required: true },
    confidence: { type: Number, min: 0, max: 1 },
    mode: {
      type: String,
      enum: ['evidence', 'llm', 'hybrid'],
      default: 'evidence',
    },
    decisionId: { type: Schema.Types.ObjectId, ref: 'Decision', index: true },
    executionId: { type: Schema.Types.ObjectId, ref: 'Execution' },
    taskId: { type: Schema.Types.ObjectId, ref: 'Task' },
    modelUsed: { type: String },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

VerificationResultSchema.index({ claimId: 1, taskId: 1 }, { unique: true });

export default mongoose.model<IVerificationResult>('VerificationResult', VerificationResultSchema);
