import { TokenUsage } from '../decision/types';
import { MemoryContext } from '../memory/types';

/**
 * Phase 5 — Intelligent Decision Planner types.
 *
 * The planner receives a BOUNDED decision context (never the whole database,
 * never credentials) and returns a STRICT-JSON plan proposal. Proposals are
 * treated as untrusted input: the deterministic PlanValidator decides whether
 * a plan may be compiled, and the PlanCompiler persists real Task documents.
 */

export type PlanningMode = 'fixed' | 'intelligent';

export type PlanSource = 'intelligent' | 'fallback' | 'baseline';

export type PlannedTaskType =
  | 'research'
  | 'debate'
  | 'verify_claim'
  | 'red_team'
  | 'reconciliation';

/** Allowlisted task types the planner may propose. */
export const ALLOWED_PLANNED_TASK_TYPES: PlannedTaskType[] = [
  'research',
  'debate',
  'verify_claim',
  'red_team',
  'reconciliation',
];

export interface PlannedTask {
  /** Planner-generated identifier used only to reference dependencies. */
  tempId: string;
  type: PlannedTaskType;
  /** One-line, human-legible purpose ("why this task"). */
  purpose: string;
  /** Structured input payload for the task handler. */
  input: Record<string, unknown>;
  /** tempIds this task depends on. */
  dependsOn: string[];
  priority?: number;
  /** Capability requirements (must resolve to known capabilities). */
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
  version: string;
  source: PlanSource;
  tasks: PlannedTask[];
  termination: PlanTermination;
  rationale?: PlanRationale;
  /** Estimates recorded at plan time for cost observability. */
  estimates: PlanEstimates;
}

/** Bounded input the planner may reason over. */
export interface PlanContext {
  decisionId: string;
  objective: string;
  description?: string;
  constraints?: string[];
  existingEvidence?: { id: string; title: string; sourceReliability?: string }[];
  existingClaimCount?: number;
  availableCapabilities?: string[];
  researchQueries?: string[];
  /**
   * Phase 8 — bounded historical decision memory. Present when the memory layer
   * is enabled and returned at least one relevant past decision. It is
   * UNTRUSTED reference data: it may inform planning but must never dictate it
   * nor override the planner's system/developer instructions.
   */
  historicalMemory?: MemoryContext;
}

export interface PlannerProvenance {
  plannerModel: string;
  plannerVersion: string;
  planVersion: number;
  decisionId: string;
  executionId: string;
  createdAt: Date;
}

export interface PlannerUsage {
  tokenUsage?: TokenUsage;
  durationMs: number;
}

/**
 * One planning attempt that produced text from the planner engine. Used by the
 * DecisionPlanner's fallback chain so validation failure is distinguishable
 * from provider failure.
 */
export type PlannerAttemptResult =
  | { ok: true; text: string }
  | { ok: false; error: string; retryable: boolean };

/** Abstraction over "make one planner LLM call" so tests can inject a fake. */
export type PlanCallFunction = (input: {
  context: PlanContext;
  provenance: PlannerProvenance;
}) => Promise<PlannerAttemptResult>;