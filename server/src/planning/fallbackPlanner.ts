import {
  DecisionPlan,
  PlanContext,
  PlannedTask,
  PlanTermination,
  PlanSource,
} from './planTypes';
import { PlanningPolicy, makePlanningPolicy } from './planningPolicy';

/**
 * Phase 5 — deterministic fallback / baseline planner.
 *
 * This is the DEFAULT plan that is always guaranteed to be valid. It is used:
 *   1. As the deterministic baseline when the intelligent planner is not
 *      available (no enabled model, provider failure, timeout, malformed JSON).
 *   2. As the final safe plan when the intelligent planner's proposal is
 *      REJECTED by the validator after bounded retries.
 *
 * The plan is conservative and mirrors the Phase 3/4 fixed workflow: research
 * (when evidence is missing / queries are supplied) followed by a debate, with
 * verification + red team + reconciliation enabled so the resulting decision
 * is still stress-tested. All limits are respected deterministically.
 */

export interface BaselinePlannerOptions {
  planSource?: PlanSource;
  /** When research queries are provided upfront, use them deterministically. */
  researchQueries?: string[];
  /** Decide whether to enable verification/red team/reconciliation. Default true. */
  verification?: boolean;
  policy?: PlanningPolicy;
}

export function buildFallbackPlan(
  context: PlanContext,
  options: BaselinePlannerOptions = {}
): DecisionPlan {
  const policy = makePlanningPolicy(options.policy);
  const taskList: PlannedTask[] = [];
  const queries = (options.researchQueries || []).filter((q) => q && q.trim());

  const needsResearch =
    queries.length > 0 ||
    (context.existingEvidence === undefined
      ? options.verification !== false
      : (context.existingEvidence || []).length === 0 && options.verification !== false);

  let researchBudget = policy.maxTotalResearchResults;
  const researchTasks: PlannedTask[] = [];

  if (needsResearch) {
    const count = Math.min(
      Math.max(queries.length, 1),
      policy.maxResearchTasks,
      policy.maxTasksPerExecution - 1
    );
    const purposes = ['background', 'market_research', 'technical_research', 'competitive_research'];
    for (let i = 0; i < count; i++) {
      const query = queries[i]?.trim() || context.objective;
      if (!query) continue;
      const maxResults = Math.min(
        policy.maxResultsPerResearchTask,
        Math.max(1, Math.floor(researchBudget / count))
      );
      researchBudget -= maxResults;
      researchTasks.push({
        tempId: `research-${i + 1}`,
        type: 'research',
        purpose: `Gather external evidence for the decision.`,
        input: {
          query,
          purpose: queries.length > 0 ? 'background' : purposes[i % purposes.length],
          maxResults,
        },
        dependsOn: [],
        priority: 10,
        requirements: ['research'],
      });
    }
  }

  const debate: PlannedTask = {
    tempId: 'debate',
    type: 'debate',
    purpose: 'Run the multi-agent debate and produce a candidate decision.',
    input: {
      strategy: 'consensus',
      description: 'Evaluate the available evidence and produce a candidate decision.',
    },
    dependsOn: researchTasks.map((t) => t.tempId),
    priority: 1,
  };

  taskList.push(...researchTasks, debate);

  const verify = options.verification !== false;
  const termination: PlanTermination = {
    requiresVerification: verify,
    requiresRedTeam: verify,
    requiresReconciliation: verify,
  };

  return {
    version: '1.0',
    source: options.planSource || 'fallback',
    tasks: taskList,
    termination,
    rationale: {
      summary: verify
        ? 'Conservative baseline plan: research the objective, debate the evidence, then verify, attack and reconcile a final decision.'
        : 'Simplified baseline plan: research the objective when needed, then debate a final decision without a verification stage.',
      research:
        researchTasks.length > 0
          ? `${researchTasks.length} research task(s) because the decision needs external evidence.`
          : 'No research tasks: the decision has sufficient available evidence or verification is disabled.',
      debate: 'One multi-agent debate to synthesize a candidate decision from the evidence.',
      verification: verify
        ? 'Verification is enabled so factual claims are checked against evidence before a final decision.'
        : 'Verification is disabled for this plan.',
      redTeam: verify
        ? 'Red team is enabled so the candidate decision is adversarially challenged.'
        : 'Red team is disabled for this plan.',
    },
    estimates: {
      estimatedTasks: taskList.length,
      estimatedResearchTasks: researchTasks.length,
      estimatedLLMTasks: verify ? taskList.length : researchTasks.length + 1,
    },
  };
}

/** Debate-only plan for trivially simple decisions (no research, no stage 4). */
export function buildSimplifiedPlan(
  context: PlanContext,
  options: BaselinePlannerOptions = {}
): DecisionPlan {
  return buildFallbackPlan(context, { ...options, researchQueries: [], verification: false });
}