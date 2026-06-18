import mongoose, { Schema, Document } from 'mongoose';

export interface IMessage extends Document {
  courtroomId: string;
  agentId?: string;
  agentName: string;
  role: string;
  content: string;
  roundNumber: number;
  parsedResponse?: any;
  createdAt?: Date;
}

const MessageSchema: Schema = new Schema({
  courtroomId: { type: Schema.Types.ObjectId, ref: 'Courtroom', required: true },
  agentId: { type: Schema.Types.ObjectId, ref: 'Agent' },
  agentName: { type: String, required: true },
  role: { type: String, required: true },
  content: { type: String, required: true },
  roundNumber: { type: Number, required: true, default: 1 },
  parsedResponse: { type: Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model<IMessage>('Message', MessageSchema);
