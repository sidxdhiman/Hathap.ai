import mongoose, { Schema, Document } from 'mongoose';

export interface IExecutionEvent extends Document {
  type: string;
  decisionId?: string;
  executionId?: string;
  taskId?: string;
  agentId?: string;
  retryCount?: number;
  data?: Record<string, unknown>;
  createdAt: Date;
}

const ExecutionEventSchema: Schema = new Schema(
  {
    type: { type: String, required: true, index: true },
    decisionId: { type: Schema.Types.ObjectId, ref: 'Decision', index: true },
    executionId: { type: Schema.Types.ObjectId, ref: 'Execution', index: true },
    taskId: { type: String },
    agentId: { type: String },
    retryCount: { type: Number },
    data: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

export default mongoose.model<IExecutionEvent>('ExecutionEvent', ExecutionEventSchema);
