import mongoose, { Schema, Document } from 'mongoose';
import { ExpectedStructure, StaticProvidedAnswer } from '../evaluation/types';

export interface IBenchmarkCase extends Document {
  userId: Schema.Types.ObjectId | string;
  benchmarkId: Schema.Types.ObjectId | string;
  title: string;
  prompt: string;
  context?: string;
  category?: string;
  tags: string[];
  difficulty?: 'easy' | 'medium' | 'hard';
  version: number;
  expectedStructure: ExpectedStructure;
  /** Optional static artifact evaluated by `static` runs. This is the response
   *  under test — it is never an idealized "correct answer". */
  providedAnswer?: StaticProvidedAnswer;
  status: 'active' | 'archived';
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const ExpectedStructureSchema: Schema = new Schema(
  {
    requiresRecommendation: { type: Boolean, default: false },
    requiresEvidence: { type: Boolean, default: false },
    requiresAssumptions: { type: Boolean, default: false },
    requiresConfidence: { type: Boolean, default: false },
    minAnswerLength: { type: Number, default: 0 },
    maxAnswerLength: { type: Number },
    mustMention: [{ type: String }],
  },
  { _id: false }
);

const ProvidedAnswerSchema: Schema = new Schema(
  {
    answerText: { type: String },
    recommendation: { type: String },
    rationale: { type: String },
    assumptions: [{ type: String }],
    confidence: { type: Number },
    evidenceRefs: [{ type: String }],
  },
  { _id: false }
);

const BenchmarkCaseSchema: Schema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    benchmarkId: { type: Schema.Types.ObjectId, ref: 'Benchmark', required: true, index: true },
    title: { type: String, required: true },
    prompt: { type: String, required: true },
    context: { type: String },
    category: { type: String, index: true },
    tags: [{ type: String }],
    difficulty: { type: String, enum: ['easy', 'medium', 'hard'] },
    version: { type: Number, default: 1 },
    expectedStructure: { type: ExpectedStructureSchema, default: () => ({}) },
    providedAnswer: { type: ProvidedAnswerSchema },
    status: { type: String, enum: ['active', 'archived'], default: 'active', index: true },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

BenchmarkCaseSchema.index({ benchmarkId: 1, status: 1, createdAt: 1 });

export default mongoose.model<IBenchmarkCase>('BenchmarkCase', BenchmarkCaseSchema);