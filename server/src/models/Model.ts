import mongoose, { Schema, Document } from 'mongoose';

export interface IModel extends Document {
  provider: string;
  displayName: string;
  modelName: string;
  apiKey?: string;
  baseUrl?: string;
  status?: string;
  enabled?: boolean;
  userId?: string;
}

const ModelSchema: Schema = new Schema({
  provider: String,
  displayName: String,
  modelName: String,
  apiKey: String,
  baseUrl: String,
  status: { type: String, default: 'untested' },
  enabled: { type: Boolean, default: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model<IModel>('Model', ModelSchema);
