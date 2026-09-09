import { TaskType } from '../decision/types';
import { IAgent } from '../models/Agent';
import { IModel } from '../models/Model';

/**
 * Phase 6 — Intelligent Model & Agent Routing types.
 *
 * The router answers WHO performs a task (agent + model). It sits between the
 * planner (WHAT) and the executor (HOW). Every decision the router makes is a
 * deterministic score over a bounded, ownership-scoped candidate set; the
 * result is persisted on the Task document alongside the task it applied to.
 */

/** Routing happens at execution time. 'auto' uses scoring; 'manual' pins a model. */
export type RoutingMode = 'auto' | 'manual';

export const ROUTING_POLICY_VERSION = 'routing-v1';

/** Estimated per-task payload sizes (tokens) for cost observability. */
export interface EstimatedTokenBudget {
  input: number;
  output: number;
}

export interface RoutingRequirements {
  /** Hard requirements declared by the planner -> agent must cover ALL of them. */
  hard: string[];
  /** Soft requirements derived from task type -> scoring preference only. */
  soft: string[];
}

export type RoutingFactorName =
  | 'quality'
  | 'capability'
  | 'specialization'
  | 'reliability'
  | 'cost'
  | 'latency';

export interface RoutingFactor {
  name: RoutingFactorName;
  /** Factor value in [0,1], higher is better. */
  value: number;
  weight: number;
  contribution: number;
  /** Human-legible reason including the source (override map / table / neutral). */
  note?: string;
}

export interface RoutingScore {
  total: number;
  factors: RoutingFactor[];
  /** Soft diversity bonus (0 when not applicable). */
  diversityBonus: number;
  /** 1e-9-scale deterministic tie break. */
  tieBreakApplied: number;
}

export interface CostEstimate {
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedCost: number;
  /** False when the candidate model has no entry in the per-token pricing table. */
  pricingKnown: boolean;
}

/** One agent x model pair under consideration. */
export interface RoutingCandidate {
  agent: IAgent;
  model: IModel;
  /** Hard requirements the agent does NOT satisfy (empty = passes the gate). */
  hardRequirementFails: string[];
  modelUnavailable: boolean;
  budgetExceeded: boolean;
  estimate: CostEstimate;
  score?: RoutingScore;
}

export interface RoutedModel {
  id: string;
  modelName: string;
  provider: string;
  displayName: string;
  status: string;
}

export interface RoutedAgent {
  id: string;
  name: string;
  capabilities: string[];
}

export interface TaskRoutingSelection {
  status: 'selected';
  policyVersion: string;
  mode: RoutingMode;
  agent: RoutedAgent | null;
  model: RoutedModel;
  score: RoutingScore;
  reasons: string[];
  candidateCount: number;
  /** True when no agent satisfied the hard gate and policy allowed relaxation. */
  capabilityGateRelaxed: boolean;
  fallbackUsed: boolean;
  /** Set when this selection was produced by retry-fallback (the failed model). */
  fallbackFrom?: { modelId: string; provider?: string };
  estimate: CostEstimate;
  routedAt: Date;
}

export interface TaskRoutingFailure {
  status: 'failed';
  code:
    | 'NO_AVAILABLE_MODEL'
    | 'NO_AVAILABLE_AGENT'
    | 'MANUAL_MODEL_UNAVAILABLE'
    | 'NO_CANDIDATE_WITHIN_BUDGET'
    | 'NO_AGENT_COVERS_REQUIREMENTS';
  message: string;
  policyVersion: string;
  candidateCount: number;
  reasons: string[];
}

/** Emitted when there is nothing sensible to route to (best-effort mode). */
export interface TaskRoutingSkipped {
  status: 'skipped';
  reason: string;
  policyVersion: string;
}

export type RouteTaskResult = TaskRoutingSelection | TaskRoutingFailure | TaskRoutingSkipped;

export interface TaskRoutingInput {
  userId: string;
  decisionId: string;
  executionId: string;
  taskId?: string;
  taskType: TaskType;
  /** Hard capability requirements (planner-declared `task.requirements`). */
  requirements?: string[];
  routingMode?: RoutingMode;
  manualModelId?: string;
  /** Models to exclude (retry fallback excludes the model that just failed). */
  excludeModelIds?: string[];
  /** Provider of the debate task so downstream tasks can prefer diversity (soft). */
  primaryProvider?: string;
  /** When false the router records no events (used by dry-run previews). */
  emitEvents?: boolean;
}

export interface RoutingPolicy {
  version: string;
  weights: Record<RoutingFactorName, number>;
  /** Max estimated USD per task; 0 = unlimited. */
  maxEstimatedCostPerTask: number;
  /** Stable per-model quality priors, keyed by modelName (admin-configured). */
  qualityOverrides: Record<string, number>;
  /** Stable per-model latency priors, keyed by modelName (admin-configured). */
  latencyOverrides: Record<string, number>;
  /** Reliability prior per model.status. */
  reliabilityByStatus: Record<string, number>;
  neutralQuality: number;
  neutralLatency: number;
  /** 1e-9-scale deterministic tie break. */
  tieBreakEpsilon: number;
  /** Whether an empty hard-gate result set may fall back to best-overlap agents. */
  allowCapabilityGateRelaxation: boolean;
  /** Task types that get a soft bonus for provider differing from the debate's. */
  diversityPreferenceTasks: TaskType[];
  /** Soft, capped bonus for provider diversity. */
  diversityBonus: number;
  /** Token budget estimator per task type for cost observability. */
  estimatedTokenBudgetByTask: Record<string, EstimatedTokenBudget>;
}