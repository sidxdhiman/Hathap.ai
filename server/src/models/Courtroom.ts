import mongoose, { Schema, Document } from 'mongoose';

export interface ICourtroom extends Document {
  name: string;
  description?: string;
  objective?: string;
  mode?: string;
  participants?: any[];
  status?: string;
  userId?: string;
}

const CourtroomSchema: Schema = new Schema({
  name: String,
  description: String,
  objective: String,
  mode: String,
  participants: [{ type: Schema.Types.Mixed }],
  status: { type: String, default: 'draft' },
  userId: { type: Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model<ICourtroom>('Courtroom', CourtroomSchema);
