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
  | 'paused';

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
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'partial';

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
