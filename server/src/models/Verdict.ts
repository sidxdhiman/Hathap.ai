import mongoose, { Schema, Document } from 'mongoose';

export interface IVerdict extends Document {
  courtroomId: string;
  summary: string;
  recommendation: string;
  pros: string[];
  cons: string[];
  risks: string[];
  nextActions: string[];
  confidenceScore: number;
  rawData?: any;
  createdAt?: Date;
}

const VerdictSchema: Schema = new Schema({
  courtroomId: { type: Schema.Types.ObjectId, ref: 'Courtroom', required: true, unique: true },
  summary: { type: String, required: true },
  recommendation: { type: String, required: true },
  pros: [{ type: String }],
  cons: [{ type: String }],
  risks: [{ type: String }],
  nextActions: [{ type: String }],
  confidenceScore: { type: Number, required: true, min: 0, max: 100 },
  rawData: { type: Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model<IVerdict>('Verdict', VerdictSchema);
