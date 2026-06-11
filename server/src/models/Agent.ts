import mongoose, { Schema, Document } from 'mongoose';

export interface IAgent extends Document {
  name: string;
  description?: string;
  systemPrompt?: string;
  assignedModelId?: string;
  avatar?: string;
  colorTag?: string;
  userId?: string;
}

const AgentSchema: Schema = new Schema({
  name: String,
  description: String,
  systemPrompt: String,
  assignedModelId: { type: Schema.Types.ObjectId, ref: 'Model' },
  avatar: String,
  colorTag: String,
  userId: { type: Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model<IAgent>('Agent', AgentSchema);
