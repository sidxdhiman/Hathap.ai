import mongoose, { Schema, Document } from 'mongoose';
import { ExecutionStatus, ExecutionError, TokenUsage, ExecutionMetadata } from '../decision/types';

export interface IExecution extends Document {
  decisionId: string;
  status: ExecutionStatus;
  startedAt?: Date;
  completedAt?: Date;
  cancelledAt?: Date;
  currentPhase?: string;
  currentTask?: string;
  progress: number;
  totalTasks?: number;
  completedTasks?: number;
  failedTasks?: number;
  runningTasks?: number;
  pendingTasks?: number;
  readyTasks?: number;
  error?: ExecutionError;
  retryCount: number;
  maxRetries: number;
  tokenUsage: TokenUsage;
  estimatedCost: number;
  actualCost: number;
  planningStatus?: string;
  planId?: string;
  planningMode?: string;
  planningStartedAt?: Date;
  planningCompletedAt?: Date;
  metadata?: ExecutionMetadata;
  createdAt?: Date;
  updatedAt?: Date;
}

const ExecutionErrorSchema: Schema = new Schema(
  {
    code: String,
    message: { type: String, required: true },
    taskId: String,
    agentId: String,
    retryable: { type: Boolean, default: false },
    retryCount: Number,
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const TokenUsageSchema: Schema = new Schema(
  {
    inputTokens: { type: Number, default: 0 },
    outputTokens: { type: Number, default: 0 },
    totalTokens: { type: Number, default: 0 },
    estimatedCost: { type: Number, default: 0 },
    model: String,
    provider: String,
    latencyMs: Number,
  },
  { _id: false }
);

const ExecutionSchema: Schema = new Schema(
  {
    decisionId: { type: Schema.Types.ObjectId, ref: 'Decision', required: true, index: true },
    status: {
      type: String,
      enum: ['pending', 'queued', 'running', 'paused', 'completed', 'failed', 'partial', 'cancelled'],
      default: 'pending',
      index: true,
    },
    startedAt: { type: Date },
    completedAt: { type: Date },
    cancelledAt: { type: Date },
    currentPhase: { type: String },
    currentTask: { type: String },
    progress: { type: Number, default: 0, min: 0, max: 100 },
    totalTasks: { type: Number, default: 0 },
    completedTasks: { type: Number, default: 0 },
    failedTasks: { type: Number, default: 0 },
    runningTasks: { type: Number, default: 0 },
    pendingTasks: { type: Number, default: 0 },
    readyTasks: { type: Number, default: 0 },
    error: { type: ExecutionErrorSchema },
    retryCount: { type: Number, default: 0 },
    maxRetries: { type: Number, default: 0 },
    tokenUsage: { type: TokenUsageSchema, default: () => ({}) },
    estimatedCost: { type: Number, default: 0 },
    actualCost: { type: Number, default: 0 },
    planningStatus: { type: String, enum: ['pending', 'planning', 'planned', 'failed'], index: true },
    planId: { type: Schema.Types.ObjectId, ref: 'DecisionPlan' },
    planningMode: { type: String, enum: ['fixed', 'intelligent'] },
    planningStartedAt: { type: Date },
    planningCompletedAt: { type: Date },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

export default mongoose.model<IExecution>('Execution', ExecutionSchema);
