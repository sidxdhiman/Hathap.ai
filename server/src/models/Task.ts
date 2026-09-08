import mongoose, { Schema, Document } from 'mongoose';
import { TaskStatus, TaskType, TaskError } from '../decision/types';

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
  error?: TaskError;
  maxRetries: number;
  retryCount: number;
  nextRetryAt?: Date;
  workerId?: string;
  leasedAt?: Date;
  attempts: number;
  result?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
}

const TaskErrorSchema: Schema = new Schema(
  {
    code: String,
    message: { type: String, required: true },
    taskId: String,
    kind: {
      type: String,
      enum: ['retryable', 'non_retryable', 'dependency_failure', 'cancelled'],
      default: 'retryable',
    },
    attempt: Number,
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const TaskSchema: Schema = new Schema(
  {
    executionId: { type: Schema.Types.ObjectId, ref: 'Execution', required: true, index: true },
    type: {
      type: String,
      enum: ['research', 'analysis', 'debate', 'challenge', 'verification', 'verify_claim', 'red_team', 'reconciliation', 'synthesis', 'human_review'],
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['pending', 'ready', 'running', 'completed', 'failed', 'retrying', 'paused', 'cancelled', 'skipped'],
      default: 'pending',
      index: true,
    },
    priority: { type: Number, default: 0 },
    input: { type: Schema.Types.Mixed },
    output: { type: Schema.Types.Mixed },
    result: { type: Schema.Types.Mixed },
    assignedAgent: { type: String },
    assignedModel: { type: String },
    dependencies: [{ type: String }],
    startedAt: { type: Date },
    completedAt: { type: Date },
    error: { type: TaskErrorSchema },
    maxRetries: { type: Number, default: 2 },
    retryCount: { type: Number, default: 0 },
    nextRetryAt: { type: Date },
    attempts: { type: Number, default: 0 },
    workerId: { type: String },
    leasedAt: { type: Date },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

export default mongoose.model<ITask>('Task', TaskSchema);
