import mongoose, { Schema, Document } from 'mongoose';
import { Evidence } from '../decision/types';

type EvidenceSourceType = Evidence['sourceType'];

export interface IEvidence extends Document {
  decisionId: string;
  type: string;
  title: string;
  content: string;
  source?: string;
  sourceUrl?: string;
  sourceType: EvidenceSourceType;
  reliability?: number;
  retrievedAt: Date;
  metadata?: Record<string, unknown>;
  createdAt?: Date;
}

const EvidenceSchema: Schema = new Schema(
  {
    decisionId: { type: Schema.Types.ObjectId, ref: 'Decision', required: true, index: true },
    type: { type: String, default: 'text' },
    title: { type: String, required: true },
    content: { type: String, required: true },
    source: { type: String },
    sourceUrl: { type: String },
    sourceType: {
      type: String,
      enum: [
        'web',
        'document',
        'database',
        'user_input',
        'agent_generated',
        'api',
        'github',
        'notion',
      ],
      default: 'user_input',
    },
    reliability: { type: Number, min: 0, max: 1 },
    retrievedAt: { type: Date, default: Date.now },
    metadata: { type: Schema.Types.Mixed },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export default mongoose.model<IEvidence>('Evidence', EvidenceSchema);
