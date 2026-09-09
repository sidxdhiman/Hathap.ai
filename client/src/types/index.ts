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
  | 'paused'
  | 'cancelled';

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

export type TaskType =
  | 'research'
  | 'analysis'
  | 'debate'
  | 'challenge'
  | 'verification'
  | 'verify_claim'
  | 'red_team'
  | 'reconciliation'
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
  totalTasks?: number;
  completedTasks?: number;
  failedTasks?: number;
  runningTasks?: number;
  pendingTasks?: number;
  error?: ExecutionError;
  retryCount: number;
  maxRetries: number;
  tokenUsage: TokenUsage;
  estimatedCost: number;
  actualCost: number;
  planningStatus?: 'pending' | 'planning' | 'planned' | 'failed';
  planId?: string;
  planningMode?: PlanningMode;
  planningStartedAt?: Date;
  planningCompletedAt?: Date;
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
  executionId?: string;
  taskId?: string;
  supportingEvidenceIds?: string[];
  contradictingEvidenceIds?: string[];
  provenanceKind?: 'observed' | 'retrieved' | 'inferred';
  attribution?: {
    sourceName?: string;
    sourceUrl?: string;
    sourceReliability?: 'low' | 'medium' | 'high';
  };
  createdAt: Date;
  metadata?: Record<string, unknown>;
}

export type EvidenceProvenanceKind = 'observed' | 'retrieved' | 'inferred';
export type SourceReliability = 'low' | 'medium' | 'high';

// ---- Phase 4: Evidence graph, verification, red team, reconciliation ----

export type EvidenceRelationshipType = 'supports' | 'contradicts' | 'related';
export type EvidenceRelationshipSource = 'research' | 'agent' | 'verification';

export interface EvidenceRelationship {
  id: string;
  claimId: string;
  evidenceId: string;
  relationship: EvidenceRelationshipType;
  strength?: number;
  rationale?: string;
  source: EvidenceRelationshipSource;
  decisionId?: string;
  executionId?: string;
  taskId?: string;
  createdAt: Date;
}

export type VerificationStatus = 'supported' | 'contradicted' | 'unsupported' | 'inconclusive';
export type VerificationMode = 'evidence' | 'llm' | 'hybrid';

export interface VerificationResult {
  id: string;
  claimId: string;
  claimStatement: string;
  status: VerificationStatus;
  supportingEvidenceIds: string[];
  contradictingEvidenceIds: string[];
  relatedEvidenceIds: string[];
  rationale: string;
  confidence: number;
  mode: VerificationMode;
  decisionId?: string;
  executionId?: string;
  taskId?: string;
  createdAt: Date;
}

export type RedTeamSeverity = 'critical' | 'high' | 'medium' | 'low';
export type RedTeamFindingType =
  | 'invalid_assumption'
  | 'contradictory_evidence'
  | 'missing_evidence'
  | 'logic_gap'
  | 'risk'
  | 'other';

export interface RedTeamFinding {
  id: string;
  decisionId: string;
  executionId?: string;
  taskId?: string;
  severity: RedTeamSeverity;
  type: RedTeamFindingType;
  description: string;
  relatedClaimIds: string[];
  relatedEvidenceIds: string[];
  suggestedAction?: string;
  createdAt: Date;
}

export interface ReconciliationResult {
  id: string;
  decisionId: string;
  executionId?: string;
  taskId?: string;
  recommendation: string;
  survivingClaimIds: string[];
  rejectedClaimIds: string[];
  uncertainClaimIds: string[];
  unresolvedConflictIds: string[];
  redTeamFindingIds: string[];
  needsMoreResearch: boolean;
  researchQuestions?: string[];
  rationale: string;
  createdAt: Date;
}

export interface Phase4DownstreamRefs {
  verificationTaskIds: string[];
  redTeamTaskId: string;
  reconciliationTaskId: string;
  selectedClaimCount: number;
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
  executionId?: string;
  taskId?: string;
  snippet?: string;
  publishedAt?: Date;
  sourceName?: string;
  sourceReliability?: SourceReliability;
  relevanceScore?: number;
  freshnessInDays?: number;
  provenanceKind?: EvidenceProvenanceKind;
  provider?: string;
  query?: string;
  metadata?: Record<string, unknown>;
}

export interface ResearchTaskSummary {
  taskId: string;
  status: TaskStatus;
  priority: number;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: any;
  createdAt?: Date;
  evidence: Array<{
    id: string;
    title: string;
    snippet?: string;
    sourceName?: string;
    sourceUrl?: string;
    provenanceKind?: EvidenceProvenanceKind;
    sourceReliability?: SourceReliability;
    relevanceScore?: number;
    retrievedAt: Date;
  }>;
}

export interface ResearchQueryInput {
  query: string;
  purpose?: string;
  maxResults?: number;
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

export interface DecisionSnapshot {
  id: string;
  status: DecisionStatus;
  currentPhase: DecisionPhase;
  confidence?: number;
  executions: Execution[];
  tasks: Task[];
  claims: Claim[];
  evidence: Evidence[];
  progress?: ProgressSummary;
  evidenceRelationships?: EvidenceRelationship[];
  verifications?: VerificationResult[];
  redTeamFindings?: RedTeamFinding[];
  reconciliation?: ReconciliationResult | null;
}

// ---- Phase 5: Intelligent decision planning ----

export type PlanningMode = 'fixed' | 'intelligent';
export type PlanSource = 'intelligent' | 'fallback' | 'baseline';
export type PlanStatus = 'proposed' | 'validated' | 'rejected' | 'compiled' | 'failed';
export type PlannedTaskType =
  | 'research'
  | 'debate'
  | 'verify_claim'
  | 'red_team'
  | 'reconciliation';

export interface PlannedTask {
  tempId: string;
  type: PlannedTaskType;
  purpose: string;
  input?: Record<string, unknown>;
  dependsOn: string[];
  priority?: number;
  requirements?: string[];
}

export interface PlanTermination {
  requiresVerification: boolean;
  requiresRedTeam: boolean;
  requiresReconciliation: boolean;
}

export interface PlanRationale {
  summary: string;
  research: string;
  debate: string;
  verification: string;
  redTeam: string;
}

export interface PlanEstimates {
  estimatedTasks: number;
  estimatedResearchTasks: number;
  estimatedLLMTasks: number;
}

export interface DecisionPlan {
  id: string;
  decisionId: string;
  executionId: string;
  version: string;
  source: PlanSource;
  planningMode: PlanningMode;
  plannerModel?: string;
  plannerVersion: string;
  planVersion: number;
  status: PlanStatus;
  tasks: PlannedTask[];
  termination: PlanTermination;
  rationale?: PlanRationale;
  estimates?: PlanEstimates;
  validation?: { valid: boolean; errors: string[] };
  failure?: { code: string; message: string; reason: string; createdAt: Date };
  createdAt: Date;
  compiledAt?: Date;
}

// ---- Phase 6: Intelligent Model & Agent Routing ----

export type RoutingMode = 'auto' | 'manual';

export interface RoutingFactor {
  name: string;
  value: number;
  weight: number;
  contribution: number;
  note?: string;
}

export interface RoutingSelection {
  status: 'selected';
  policyVersion: string;
  mode: RoutingMode;
  agent: { id: string; name: string; capabilities: string[] } | null;
  model: {
    id: string;
    modelName: string;
    provider: string;
    displayName: string;
    status: string;
  };
  score: { total: number; factors: RoutingFactor[]; diversityBonus: number };
  reasons: string[];
  candidateCount: number;
  capabilityGateRelaxed: boolean;
  fallbackUsed: boolean;
  fallbackFrom?: { modelId: string; provider?: string };
  estimate: { estimatedInputTokens: number; estimatedOutputTokens: number; estimatedCost: number; pricingKnown: boolean };
  routedAt: Date;
}

/** The routing block persisted on a Task (task.metadata.routing). */
export interface TaskRouting {
  mode: RoutingMode;
  selection: RoutingSelection;
}

export type RoutingPreviewStatus = 'selected' | 'skipped' | 'failed';

export interface RoutingPreviewTask {
  type: PlannedTaskType | TaskType;
  tempId?: string;
  purpose?: string;
  requirements?: string[];
  status: RoutingPreviewStatus;
  agent?: { id: string; name: string } | null;
  model?: { id: string; modelName: string; provider: string; displayName: string };
  score?: number;
  estimatedCost?: number;
  pricingKnown?: boolean;
  reasons?: string[];
  favoredBy?: RoutingFactor[];
  reason?: string;
}

export interface RoutingPreview {
  planningMode: PlanningMode;
  policyVersion: string;
  estimated: boolean;
  tasks: RoutingPreviewTask[];
}
