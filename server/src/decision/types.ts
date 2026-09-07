import { ModelResponse, VerdictResult } from '../engine/types';

export type DecisionStatus =
  | 'draft'
  | 'investigating'
  | 'reasoning'
  | 'debating'
  | 'verifying'
  | 'awaiting_review'
  | 'completed'
  | 'failed'
  | 'paused'
  | 'cancelled';

export type TaskFailureKind =
  | 'retryable'
  | 'non_retryable'
  | 'dependency_failure'
  | 'cancelled';

export type TaskError = {
  code?: ExecutionError['code'];
  message: string;
  taskId?: string;
  kind: TaskFailureKind;
  attempt?: number;
  createdAt: Date;
};

export type DecisionPhase =
  | 'draft'
  | 'investigating'
  | 'reasoning'
  | 'debating'
  | 'verifying'
  | 'synthesizing'
  | 'awaiting_review'
  | 'completed'
  | 'failed'
  | 'paused';

export type ExecutionStatus =
  | 'pending'
  | 'queued'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'partial'
  | 'cancelled';

export type TaskType =
  | 'research'
  | 'analysis'
  | 'debate'
  | 'challenge'
  | 'verification'
  | 'synthesis'
  | 'human_review';

export type TaskStatus =
  | 'pending'
  | 'ready'
  | 'running'
  | 'completed'
  | 'failed'
  | 'retrying'
  | 'paused'
  | 'cancelled'
  | 'skipped';

export type ClaimType =
  | 'fact'
  | 'assumption'
  | 'opinion'
  | 'inference'
  | 'recommendation'
  | 'risk';

export type ClaimStatus =
  | 'proposed'
  | 'accepted'
  | 'rejected'
  | 'disputed'
  | 'verified'
  | 'unverified';

export type Capability =
  | 'financial_analysis'
  | 'technical_analysis'
  | 'research'
  | 'security_review'
  | 'legal_analysis'
  | 'product_strategy'
  | 'risk_analysis'
  | 'fact_checking';

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCost: number;
  model: string;
  provider: string;
  latencyMs?: number;
}

export interface ExecutionError {
  code?:
    | 'TIMEOUT'
    | 'RATE_LIMIT'
    | 'INSUFFICIENT_CREDITS'
    | 'INVALID_API_KEY'
    | 'INVALID_REQUEST'
    | 'MALFORMED_OUTPUT'
    | 'PROVIDER_OUTAGE'
    | 'MODEL_UNAVAILABLE'
    | 'NETWORK_FAILURE'
    | 'AGENT_FAILURE'
    | 'UNKNOWN';
  message: string;
  taskId?: string;
  agentId?: string;
  retryable: boolean;
  retryCount?: number;
  createdAt: Date;
}

export interface AgentRunResult {
  agentId: string;
  taskId?: string;
  modelId?: string;
  response: string;
  claims: Claim[];
  recommendations: string[];
  risks: string[];
  assumptions: string[];
  tokenUsage?: TokenUsage;
  latency?: number;
  status: 'completed' | 'failed';
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface Claim {
  id: string;
  decisionId: string;
  agentId?: string;
  text: string;
  type: ClaimType;
  confidence?: number;
  status: ClaimStatus;
  evidenceIds: string[];
  sourceAgentId?: string;
  executionId?: string;
  taskId?: string;
  supportingEvidenceIds?: string[];
  contradictingEvidenceIds?: string[];
  provenanceKind?: 'observed' | 'retrieved' | 'inferred';
  createdAt: Date;
  metadata?: Record<string, unknown>;
}

export interface Evidence {
  id: string;
  decisionId: string;
  type: string;
  title: string;
  content: string;
  source?: string;
  sourceUrl?: string;
  sourceType: 'web' | 'document' | 'database' | 'user_input' | 'agent_generated' | 'api' | 'github' | 'notion';
  reliability?: number;
  retrievedAt: Date;
  executionId?: string;
  taskId?: string;
  snippet?: string;
  publishedAt?: Date;
  sourceName?: string;
  sourceReliability?: 'low' | 'medium' | 'high';
  relevanceScore?: number;
  freshnessInDays?: number;
  provenanceKind?: 'observed' | 'retrieved' | 'inferred';
  provider?: string;
  query?: string;
  dedupKey?: string;
  contentKey?: string;
  metadata?: Record<string, unknown>;
}

export interface Capabilities {
  identity: string;
  role: string;
  systemPrompt: string;
  capabilities: Capability[];
  tools: string[];
  model: string;
  constraints: string[];
}

export interface DecisionConfiguration {
  strategy: string;
  maxRounds: number;
  maxAgents?: number;
  pauseOnAgreement?: boolean;
  verificationEnabled?: boolean;
}

export interface DecisionMetadata {
  [key: string]: unknown;
}

export interface ExecutionMetadata {
  [key: string]: unknown;
}

export interface TaskDefinition {
  type: TaskType;
  input?: Record<string, unknown>;
  assignedAgent?: string;
  assignedModel?: string;
  dependencies?: string[];
  priority?: number;
  metadata?: Record<string, unknown>;
}

export interface ModelResponseWithClaims extends ModelResponse {
  claims?: Claim[];
}

export interface VerdictResultWithDecision extends VerdictResult {
  confidence?: number;
}

// ---- Phase 2: task scheduling / execution abstractions ----

export interface TaskHandlerContext {
  userId: string;
  decisionId: string;
  executionId: string;
  taskId: string;
  onUsage: (usage: TokenUsage) => void;
}

export interface TaskHandlerResult {
  output: Record<string, unknown>;
  events?: Array<{ type: string; [key: string]: unknown }>;
}

export interface TaskHandler {
  type: TaskType;
  canHandle(type: TaskType): boolean;
  execute(task: TaskDefinition, context: TaskHandlerContext): Promise<TaskHandlerResult>;
}

export interface TaskHandlerRegistry {
  handlers: TaskHandler[];
  register(handler: TaskHandler): void;
  getHandler(type: TaskType): TaskHandler | undefined;
  canHandle(type: TaskType): boolean;
}

export interface ProgressSummary {
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  runningTasks: number;
  pendingTasks: number;
  readyTasks: number;
  progress: number;
  currentPhase?: string;
}

export interface ExecutionEventRecord {
  type: string;
  timestamp?: Date;
  decisionId?: string;
  executionId?: string;
  taskId?: string;
  agentId?: string;
  retryCount?: number;
  data?: Record<string, unknown>;
}
