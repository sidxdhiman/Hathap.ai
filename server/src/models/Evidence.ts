import mongoose, { Schema, Document } from 'mongoose';
import { Evidence as EvidenceType } from '../decision/types';
import { EvidenceProvenanceKind } from '../research/types';

type EvidenceSourceType = EvidenceType['sourceType'];

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
  executionId?: string;
  taskId?: string;
  snippet?: string;
  publishedAt?: Date;
  sourceName?: string;
  sourceReliability?: 'low' | 'medium' | 'high';
  relevanceScore?: number;
  freshnessInDays?: number;
  provenanceKind?: EvidenceProvenanceKind;
  provider?: string;
  query?: string;
  dedupKey?: string;
  contentKey?: string;
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
    executionId: { type: Schema.Types.ObjectId, ref: 'Execution' },
    taskId: { type: Schema.Types.ObjectId, ref: 'Task' },
    snippet: { type: String },
    publishedAt: { type: Date },
    sourceName: { type: String },
    sourceReliability: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium',
    },
    relevanceScore: { type: Number, min: 0, max: 1 },
    freshnessInDays: { type: Number },
    provenanceKind: {
      type: String,
      enum: ['observed', 'retrieved', 'inferred'],
      default: 'retrieved',
    },
    provider: { type: String },
    query: { type: String },
    dedupKey: { type: String },
    contentKey: { type: String },
    retrievedAt: { type: Date, default: Date.now },
    metadata: { type: Schema.Types.Mixed },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

EvidenceSchema.index({ decisionId: 1, dedupKey: 1 });
EvidenceSchema.index({ decisionId: 1, contentKey: 1 });

export default mongoose.model<IEvidence>('Evidence', EvidenceSchema);
