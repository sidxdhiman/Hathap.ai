import mongoose, { Schema, Document } from 'mongoose';
import { TaskStatus, TaskType } from '../decision/types';

export interface ITask extends Document {
  executionId: string;
  type: TaskType;
  status: TaskStatus;
  priority: number;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  assignedAgent?: string;
  assignedModel?: string;
  dependencies: string[];
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  metadata?: Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
}

const TaskSchema: Schema = new Schema(
  {
    executionId: { type: Schema.Types.ObjectId, ref: 'Execution', required: true, index: true },
    type: {
      type: String,
      enum: ['research', 'analysis', 'debate', 'challenge', 'verification', 'synthesis', 'human_review'],
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['pending', 'ready', 'running', 'completed', 'failed', 'skipped'],
      default: 'pending',
      index: true,
    },
    priority: { type: Number, default: 0 },
    input: { type: Schema.Types.Mixed },
    output: { type: Schema.Types.Mixed },
    assignedAgent: { type: String },
    assignedModel: { type: String },
    dependencies: [{ type: String }],
    startedAt: { type: Date },
    completedAt: { type: Date },
    error: { type: String },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

export default mongoose.model<ITask>('Task', TaskSchema);
