import mongoose, { Schema, Document } from 'mongoose';
import { Capability } from '../decision/types';

export interface IAgent extends Document {
  name: string;
  description?: string;
  systemPrompt?: string;
  assignedModelId?: string;
  avatar?: string;
  colorTag?: string;
  userId?: string;
  logo?: string;
  capabilities?: Capability[];
  tools?: string[];
  constraints?: string[];
}

const AgentSchema: Schema = new Schema({
  name: String,
  description: String,
  systemPrompt: String,
  assignedModelId: { type: Schema.Types.ObjectId, ref: 'Model' },
  avatar: String,
  colorTag: String,
  logo: String,
  capabilities: [{ type: String, enum: ['financial_analysis','technical_analysis','research','security_review','legal_analysis','product_strategy','risk_analysis','fact_checking'] }],
  tools: [{ type: String }],
  constraints: [{ type: String }],
  userId: { type: Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model<IAgent>('Agent', AgentSchema);
