import { ALLOWED_PLANNED_TASK_TYPES } from './planTypes';

/**
 * Phase 5 — deterministic planning policy.
 *
 * Every limit here is enforced by the plan validator on the PROPOSED plan
 * (LLM output), then re-checked by the compiler as defense-in-depth. The
 * values are deterministic and configurable per deployment.
 */

export interface PlanningPolicy {
  maxTasksPerExecution: number;
  maxResearchTasks: number;
  maxVerificationTasks: number;
  maxPlanDepth: number;
  /** Sum of `maxResults` across all research tasks in one plan. */
  maxTotalResearchResults: number;
  /** Bounded attempts at calling the intelligent planner. */
  maxPlanningRetries: number;
  /** Hard ceiling for the planning phase (ms) so starting never hangs. */
  planningTimeoutMs: number;
  /** Cap on `maxResults` any single research task may request. */
  maxResultsPerResearchTask: number;
  maxRationaleTokens: number;
}

export const DEFAULT_PLANNING_POLICY: PlanningPolicy = {
  maxTasksPerExecution: 12,
  maxResearchTasks: 5,
  maxVerificationTasks: 8,
  maxPlanDepth: 3,
  maxTotalResearchResults: 60,
  maxPlanningRetries: 2,
  planningTimeoutMs: 30_000,
  maxResultsPerResearchTask: 12,
  maxRationaleTokens: 400,
};

export function makePlanningPolicy(overrides?: Partial<PlanningPolicy>): PlanningPolicy {
  return { ...DEFAULT_PLANNING_POLICY, ...(overrides || {}) };
}

/**
 * Capability registry. Given a planner-proposed task, the validator checks its
 * `requirements` against the known capability set and its type is checked
 * against the allowlist. This is a MINIMAL resolution step — it never grants
 * permissions or routes models; it only validates that declared requirements
 * are recognizable capabilities the system understands.
 */
export const KNOWN_CAPABILITIES: string[] = [
  'financial_analysis',
  'technical_analysis',
  'research',
  'security_review',
  'legal_analysis',
  'product_strategy',
  'risk_analysis',
  'fact_checking',
  'reasoning',
];

/** Declared purpose per allowlisted task type (shown in the UI). */
export const TASK_TYPE_PURPOSES: Record<string, string> = {
  research: 'Gather external evidence for the decision.',
  debate: 'Multi-agent reasoning over evidence that produces a candidate decision.',
  verify_claim: 'Evaluate each selected claim against its evidence.',
  red_team: 'Adversarially challenge the candidate decision.',
  reconciliation: 'Merge verification + red-team results into a final decision.',
};

export function isAllowedTaskType(type: string): boolean {
  return (ALLOWED_PLANNED_TASK_TYPES as string[]).includes(type);
}

export function isKnownCapability(cap: string): boolean {
  return KNOWN_CAPABILITIES.includes(cap);
}

/** Rough plan-size estimate for cost observability (no dollar figures). */
export function estimatePlanSize(
  plan: { tasks: Array<{ type: string }> },
  estimates?: { maxResultsOffsets?: number[] }
): {
  estimatedTasks: number;
  estimatedResearchTasks: number;
  estimatedLLMTasks: number;
} {
  const tasks = plan.tasks || [];
  const researchTasks = tasks.filter((t) => t.type === 'research').length;
  const llmTasks = tasks.filter(
    (t) => ['debate', 'red_team', 'verification'].includes(t.type)
  ).length;
  return {
    estimatedTasks: tasks.length,
    estimatedResearchTasks: researchTasks,
    estimatedLLMTasks: llmTasks,
  };
}