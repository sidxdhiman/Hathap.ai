import mongoose, { Schema, Document } from 'mongoose';
import {
  MemoryLifecycleStatus,
  MemoryRecommendationSource,
  MemoryCreatedVia,
} from '../memory/types';

export interface IDecisionMemory extends Document {
  userId: Schema.Types.ObjectId | string;
  decisionId: Schema.Types.ObjectId | string;
  /** Lifecycle state of this historical record (not the decision's own status). */
  status: MemoryLifecycleStatus;
  title: string;
  objective: string;
  category?: string;
  domain?: string;
  problemType?: string;
  tags: string[];
  entities: string[];
  /** Final recommendation, surfaced from the reconciliation/verdict when known. */
  finalRecommendation?: string;
  recommendationSource: MemoryRecommendationSource;
  selectedPlanId?: Schema.Types.ObjectId | string;
  importantClaimIds: string[];
  importantEvidenceIds: string[];
  agentsUsed: string[];
  modelsUsed: string[];
  executionIds: string[];
  outcomeIds: string[];
  feedbackId?: Schema.Types.ObjectId | string;
  lessonIds: string[];
  completedAt?: Date;
  createdVia?: MemoryCreatedVia;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const DecisionMemorySchema: Schema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    decisionId: { type: Schema.Types.ObjectId, ref: 'Decision', required: true, unique: true, index: true },
    status: {
      type: String,
      enum: ['active', 'completed', 'cancelled', 'failed', 'archived'],
      default: 'active',
      index: true,
    },
    title: { type: String, required: true },
    objective: { type: String, required: true },
    category: { type: String, index: true },
    domain: { type: String, index: true },
    problemType: { type: String, index: true },
    tags: [{ type: String }],
    entities: [{ type: String }],
    finalRecommendation: { type: String },
    recommendationSource: {
      type: String,
      enum: ['reconciliation', 'debate', 'courtroom', 'none'],
      default: 'none',
    },
    selectedPlanId: { type: Schema.Types.ObjectId, ref: 'DecisionPlan' },
    importantClaimIds: [{ type: String }],
    importantEvidenceIds: [{ type: String }],
    agentsUsed: [{ type: String }],
    modelsUsed: [{ type: String }],
    executionIds: [{ type: String }],
    outcomeIds: [{ type: String }],
    feedbackId: { type: Schema.Types.ObjectId, ref: 'DecisionFeedback' },
    lessonIds: [{ type: String }],
    completedAt: { type: Date },
    createdVia: { type: String, enum: ['completion', 'cancellation', 'on-demand'] },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

// Retrieval-oriented indexes. The unique decisionId index above already covers
// decision lookups; these cover ownership-scoped scans for related decisions.
DecisionMemorySchema.index({ userId: 1, status: 1, createdAt: -1 });
DecisionMemorySchema.index({ userId: 1, category: 1 });
DecisionMemorySchema.index({ userId: 1, domain: 1 });
DecisionMemorySchema.index({ userId: 1, problemType: 1 });
DecisionMemorySchema.index({ userId: 1, tags: 1 });

export default mongoose.model<IDecisionMemory>('DecisionMemory', DecisionMemorySchema);