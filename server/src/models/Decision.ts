import mongoose, { Schema, Document } from 'mongoose';
import { DecisionStatus, DecisionConfiguration, DecisionMetadata } from '../decision/types';

export interface IDecision extends Document {
  userId: string;
  courtroomId?: string;
  title: string;
  objective: string;
  context?: string;
  status: DecisionStatus;
  currentPhase: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  configuration?: DecisionConfiguration;
  participants?: any[];
  assumptions?: string[];
  evidenceRefs?: string[];
  confidence?: number;
  metadata?: DecisionMetadata;
}

const DecisionSchema: Schema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    courtroomId: { type: Schema.Types.ObjectId, ref: 'Courtroom', index: true },
    title: { type: String, required: true },
    objective: { type: String, required: true },
    context: { type: String },
    status: { type: String, enum: ['draft','investigating','reasoning','debating','verifying','awaiting_review','completed','failed','paused','cancelled'], default: 'draft', index: true },
    currentPhase: { type: String, default: 'draft' },
    completedAt: { type: Date },
    configuration: { type: Schema.Types.Mixed },
    participants: [{ type: Schema.Types.Mixed }],
    assumptions: [{ type: String }],
    evidenceRefs: [{ type: String }],
    confidence: { type: Number, min: 0, max: 100 },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

export default mongoose.model<IDecision>('Decision', DecisionSchema);
