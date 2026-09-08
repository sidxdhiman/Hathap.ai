import mongoose, { Schema, Document } from 'mongoose';

export interface IReconciliationResult extends Document {
  decisionId: string;
  executionId?: string;
  taskId?: string;
  recommendation: string;
  survivingClaimIds: string[];
  rejectedClaimIds: string[];
  uncertainClaimIds: string[];
  unresolvedConflictIds: string[];
  redTeamFindingIds: string[];
  needsMoreResearch: boolean;
  researchQuestions?: string[];
  rationale: string;
  createdAt?: Date;
}

const ReconciliationResultSchema: Schema = new Schema(
  {
    decisionId: { type: Schema.Types.ObjectId, ref: 'Decision', required: true, index: true },
    executionId: { type: Schema.Types.ObjectId, ref: 'Execution' },
    taskId: { type: Schema.Types.ObjectId, ref: 'Task' },
    recommendation: { type: String, required: true },
    survivingClaimIds: [{ type: String }],
    rejectedClaimIds: [{ type: String }],
    uncertainClaimIds: [{ type: String }],
    unresolvedConflictIds: [{ type: String }],
    redTeamFindingIds: [{ type: String }],
    needsMoreResearch: { type: Boolean, default: false },
    researchQuestions: [{ type: String }],
    rationale: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export default mongoose.model<IReconciliationResult>('ReconciliationResult', ReconciliationResultSchema);
