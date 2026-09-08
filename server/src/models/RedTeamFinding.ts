import mongoose, { Schema, Document } from 'mongoose';
import { RedTeamSeverity, RedTeamFindingType } from '../decision/types';

export interface IRedTeamFinding extends Document {
  decisionId: string;
  executionId?: string;
  taskId?: string;
  severity: RedTeamSeverity;
  type: RedTeamFindingType;
  description: string;
  relatedClaimIds: string[];
  relatedEvidenceIds: string[];
  suggestedAction?: string;
  createdAt?: Date;
}

const RedTeamFindingSchema: Schema = new Schema(
  {
    decisionId: { type: Schema.Types.ObjectId, ref: 'Decision', required: true, index: true },
    executionId: { type: Schema.Types.ObjectId, ref: 'Execution' },
    taskId: { type: Schema.Types.ObjectId, ref: 'Task' },
    severity: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      required: true,
    },
    type: {
      type: String,
      enum: [
        'unsupported_claim',
        'contradictory_evidence',
        'missing_evidence',
        'invalid_assumption',
        'logic_gap',
        'edge_case',
        'risk',
      ],
      required: true,
    },
    description: { type: String, required: true },
    relatedClaimIds: [{ type: String }],
    relatedEvidenceIds: [{ type: String }],
    suggestedAction: { type: String },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export default mongoose.model<IRedTeamFinding>('RedTeamFinding', RedTeamFindingSchema);
