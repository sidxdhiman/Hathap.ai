export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
}

export interface Model {
  id: string;
  provider: string;
  displayName: string;
  modelName: string;
  apiKey: string;
  hasApiKey?: boolean;
  baseUrl: string;
  status: 'connected' | 'error' | 'untested';
  enabled: boolean;
}

export interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  assignedModelId: string;
  avatar: string;
  colorTag: string;
  logo?: string;
  capabilities?: string[];
  createdAt: Date;
}

export interface Participant {
  id: string;
  courtroomId: string;
  type: 'agent' | 'model';
  modelId?: string;
  agentId?: string;
  customPrompt?: string;
  position?: number;
}

export interface Courtroom {
  id: string;
  name: string;
  description: string;
  objective: string;
  mode: 'consensus' | 'majority' | 'devils-advocate' | 'judge' | 'open';
  participants: Participant[];
  status: 'draft' | 'active' | 'completed' | 'paused';
  createdAt: Date;
  updatedAt: Date;
}

export interface Debate {
  id: string;
  courtroomId: string;
  roundNumber: number;
  status: 'active' | 'completed';
}

export interface Message {
  id: string;
  debateId: string;
  participantId: string;
  content: string;
  timestamp: Date;
  isResponse?: boolean;
  tokens?: number;
}

export interface Consensus {
  courtroomId: string;
  agreements: string[];
  disagreements: string[];
  risks: string[];
  recommendedSolution: string;
  confidenceScore: number;
}

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

export type TaskStatus =
  | 'pending'
  | 'ready'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped';

export type TaskType =
  | 'research'
  | 'analysis'
  | 'debate'
  | 'challenge'
  | 'verification'
  | 'synthesis'
  | 'human_review';

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

export interface Decision {
  id: string;
  userId: string;
  courtroomId?: string;
  title: string;
  objective: string;
  context?: string;
  status: DecisionStatus;
  currentPhase: DecisionPhase;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  configuration?: {
    strategy: string;
    maxRounds: number;
    maxAgents?: number;
    pauseOnAgreement?: boolean;
    verificationEnabled?: boolean;
  };
  participants?: any[];
  assumptions?: string[];
  evidenceRefs?: string[];
  confidence?: number;
  metadata?: Record<string, unknown>;
}

export interface Execution {
  id: string;
  decisionId: string;
  status: ExecutionStatus;
  startedAt?: Date;
  completedAt?: Date;
  currentPhase?: string;
  currentTask?: string;
  progress: number;
  error?: ExecutionError;
  retryCount: number;
  maxRetries: number;
  tokenUsage: TokenUsage;
  estimatedCost: number;
  actualCost: number;
  metadata?: Record<string, unknown>;
}

export interface Task {
  id: string;
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
  sourceType:
    | 'web'
    | 'document'
    | 'database'
    | 'user_input'
    | 'agent_generated'
    | 'api'
    | 'github'
    | 'notion';
  reliability?: number;
  retrievedAt: Date;
  metadata?: Record<string, unknown>;
}

export interface DecisionSnapshot {
  id: string;
  status: DecisionStatus;
  currentPhase: DecisionPhase;
  confidence?: number;
  executions: Execution[];
  tasks: Task[];
  claims: Claim[];
  evidence: Evidence[];
}
