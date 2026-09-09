import Task from '../models/Task';
import { resolveCandidates } from './candidateResolver';
import { loadRoutingPolicy, makeRoutingPolicy, RoutingPolicyOverrides } from './routingPolicy';
import {
  scoreCandidates,
  pickBestCandidate,
  buildRoutingReasons,
  softRequirementsForTaskType,
} from './scoring';
import { executionEventBus } from '../decision/eventBus';
import {
  RouteTaskResult,
  RoutingCandidate,
  RoutingPolicy,
  RoutingScore,
  TaskRoutingInput,
  TaskRoutingSelection,
  TaskRoutingFailure,
  TaskRoutingSkipped,
  RoutedAgent,
  RoutedModel,
} from './routingTypes';

/**
 * Phase 6 — RouteTaskRouter.
 *
 * Answers WHO performs a planned task: a specific agent paired with a specific
 * model. The router is deterministic, ownership-scoped, and never reads or
 * writes credentials. Its output is persisted on the Task document by the
 * executor and exposed to the UI via the existing snapshot/task APIs.
 *
 * Decision flow (all filters run BEFORE scoring):
 *   1. Load the user's agents + routable models (hard availability filter).
 *   2. Manual mode pins the model; an invalid selection is a hard failure.
 *   3. Budget overruns are excluded (enforced only when pricing is known).
 *   4. Planner-declared requirements form a capability gate on agents.
 *      If no agent passes, the policy may relax the gate to best-overlap
 *      (logged and flagged) so existing agents keep working.
 *   5. Score the surviving candidates and pick the deterministic best.
 */
export class RouteTaskRouter {
  private policy: RoutingPolicy;

  constructor(policy?: RoutingPolicy) {
    this.policy = policy || loadRoutingPolicy();
  }

  static buildForTest(overrides?: RoutingPolicyOverrides): RouteTaskRouter {
    return new RouteTaskRouter(makeRoutingPolicy(overrides));
  }

  policyVersion(): string {
    return this.policy.version;
  }

  async routeTask(input: TaskRoutingInput): Promise<RouteTaskResult> {
    const emit = input.emitEvents !== false;
    const requirements = (input.requirements || []).filter(Boolean);
    const taskType = input.taskType;

    if (emit) {
      executionEventBus.emit({
        type: 'routing.started',
        decisionId: input.decisionId,
        executionId: input.executionId,
        taskId: input.taskId,
        data: {
          taskType,
          mode: input.routingMode || 'auto',
          requirements,
        },
      });
    }

    const { candidates, modelCount, agentCount } = await resolveCandidates({
      userId: input.userId,
      taskType,
      requirements,
      policy: this.policy,
      excludeModelIds: input.excludeModelIds,
    });

    const fail = (code: TaskRoutingFailure['code'], message: string, extra: string[] = []) => {
      const failure: TaskRoutingFailure = {
        status: 'failed',
        code,
        message,
        policyVersion: this.policy.version,
        candidateCount: candidates.length,
        reasons: extra,
      };
      if (emit) {
        executionEventBus.emit({
          type: 'routing.failed',
          decisionId: input.decisionId,
          executionId: input.executionId,
          taskId: input.taskId,
          data: { taskType, code, message, policyVersion: this.policy.version },
        });
      }
      return failure;
    };

    // Escalation safety: never fail an execution because routing has nothing to
    // work with. When there are no agents or no routable models, routing is
    // skipped (best-effort) and the task runs exactly as it did before Phase 6.
    if (modelCount === 0 || agentCount === 0) {
      const reason = modelCount === 0
        ? 'no routable models for this user — routing skipped (best-effort)'
        : 'no agents for this user — routing skipped (best-effort)';
      const skipped: TaskRoutingSkipped = {
        status: 'skipped',
        reason,
        policyVersion: this.policy.version,
      };
      if (emit) {
        executionEventBus.emit({
          type: 'routing.completed',
          decisionId: input.decisionId,
          executionId: input.executionId,
          taskId: input.taskId,
          data: { taskType, status: 'skipped', reason },
        });
      }
      return skipped;
    }

    let pool = candidates;

    // Manual mode: the caller pinned a specific model.
    if (input.routingMode === 'manual') {
      const manualId = input.manualModelId;
      if (!manualId) {
        return fail('MANUAL_MODEL_UNAVAILABLE', 'Manual routing selected but no model was provided.');
      }
      const manualCandidates = pool.filter((c) => String(c.model._id) === String(manualId));
      if (manualCandidates.length === 0) {
        return fail(
          'MANUAL_MODEL_UNAVAILABLE',
          'The manually selected model is not available (disabled, failed its connectivity test, or missing an API key).'
        );
      }
      pool = manualCandidates;
    }

    // Budget gate: exclude candidates that exceed the per-task estimated-cost
    // budget. Only enforced when pricing is known, so unknown stays eligible.
    if (this.policy.maxEstimatedCostPerTask > 0) {
      const withinBudget = pool.filter((c) => !c.budgetExceeded);
      if (withinBudget.length === 0) {
        const maxCost = this.policy.maxEstimatedCostPerTask.toFixed(4);
        return fail(
          'NO_CANDIDATE_WITHIN_BUDGET',
          `No candidate is within the estimated-cost budget ($${maxCost} per task).`
        );
      }
      pool = withinBudget;
    }

    // Capability gate (hard requirements from the plan).
    let gateRelaxed = false;
    let eligible = pool.filter((c) => c.hardRequirementFails.length === 0);
    if (eligible.length === 0) {
      if (this.policy.allowCapabilityGateRelaxation) {
        gateRelaxed = true;
        eligible = pool;
      } else {
        return fail(
          'NO_AGENT_COVERS_REQUIREMENTS',
          `No agent covers the required capabilities: ${requirements.join(', ')}.`,
          [requirements.join(', ')]
        );
      }
    }

    const soft = softRequirementsForTaskType(taskType);
    const scored = scoreCandidates(
      eligible,
      {
        taskType,
        hard: requirements,
        soft,
        primaryProvider: input.primaryProvider,
      },
      this.policy
    );

    const best = pickBestCandidate(scored);
    if (!best) {
      return fail('NO_AVAILABLE_MODEL', 'No compatible candidate could be scored.');
    }
    if (!best.score) {
      return fail('NO_AVAILABLE_MODEL', 'No compatible candidate could be scored.');
    }

    const selection = this.toSelection(best, best.score, {
      mode: input.routingMode || 'auto',
      gateRelaxed,
      candidateCount: candidates.length,
      fallbackUsed: false,
      fallbackFrom: undefined,
      primaryProvider: input.primaryProvider,
    });

    if (emit) {
      executionEventBus.emit({
        type: 'routing.completed',
        decisionId: input.decisionId,
        executionId: input.executionId,
        taskId: input.taskId,
        agentId: selection.agent?.id,
        data: {
          taskType,
          status: 'selected',
          modelId: selection.model.id,
          modelName: selection.model.modelName,
          provider: selection.model.provider,
          score: selection.score.total,
          candidateCount: selection.candidateCount,
          gateRelaxed: selection.capabilityGateRelaxed,
          policyVersion: this.policy.version,
        },
      });
    }

    return selection;
  }

  /**
   * Retry fallback: re-route excluding the model that just failed. At most one
   * reselection is allowed per task (enforced by the executor), and it only
   * happens for retryable failures, keeping runtime fallback bounded.
   */
  async routeFallbackForRetry(input: TaskRoutingInput): Promise<RouteTaskResult> {
    const result = await this.routeTask({
      ...input,
      excludeModelIds: input.excludeModelIds,
      emitEvents: false,
    });

    if (result.status === 'selected') {
      const failedModelIds = input.excludeModelIds || [];
      const fallbackFrom = { modelId: failedModelIds[failedModelIds.length - 1] };
      const fallbackSelection: TaskRoutingSelection = {
        ...result,
        fallbackUsed: true,
        fallbackFrom,
      };
      executionEventBus.emit({
        type: 'routing.fallback',
        decisionId: input.decisionId,
        executionId: input.executionId,
        taskId: input.taskId,
        agentId: fallbackSelection.agent?.id,
        data: {
          taskType: input.taskType,
          fromModelId: fallbackFrom.modelId,
          toModelId: fallbackSelection.model.id,
          toModelName: fallbackSelection.model.modelName,
          provider: fallbackSelection.model.provider,
          score: fallbackSelection.score.total,
          policyVersion: this.policy.version,
        },
      });
      return fallbackSelection;
    }

    return result;
  }

  /** Preferred provider routed for the execution's debate task (diversity input). */
  async resolvePrimaryProvider(executionId: string): Promise<string | undefined> {
    const debateTask = await Task.findOne({ executionId, type: 'debate' }).select('metadata').lean();
    const routing = debateTask?.metadata?.routing as
      | { selection?: { model?: { provider?: string } } }
      | undefined;
    return routing?.selection?.model?.provider;
  }

  private toSelection(
    candidate: RoutingCandidate,
    score: RoutingScore,
    opts: {
      mode: 'auto' | 'manual';
      gateRelaxed: boolean;
      candidateCount: number;
      fallbackUsed: boolean;
      fallbackFrom?: { modelId: string; provider?: string };
      primaryProvider?: string;
    }
  ): TaskRoutingSelection {
    const agent: RoutedAgent | null = candidate.agent
      ? {
          id: String(candidate.agent._id),
          name: candidate.agent.name || 'Unnamed agent',
          capabilities: (candidate.agent.capabilities as string[]) || [],
        }
      : null;
    const model: RoutedModel = {
      id: String(candidate.model._id),
      modelName: candidate.model.modelName || candidate.model.displayName || '',
      provider: candidate.model.provider || '',
      displayName: candidate.model.displayName || candidate.model.modelName || '',
      status: candidate.model.status || 'untested',
    };
    const missingHard = candidate.hardRequirementFails || [];
    const reasons = buildRoutingReasons(candidate, opts.gateRelaxed, opts.primaryProvider);
    if (missingHard.length > 0) {
      reasons.push(`gate relaxed: agent does not cover required capability ${missingHard.join(', ')}`);
    }
    if (!candidate.estimate.pricingKnown) {
      reasons.push('no known per-token price for this model — cost not enforced');
    }

    return {
      status: 'selected',
      policyVersion: this.policy.version,
      mode: opts.mode,
      agent,
      model,
      score,
      reasons,
      candidateCount: opts.candidateCount,
      capabilityGateRelaxed: opts.gateRelaxed,
      fallbackUsed: opts.fallbackUsed,
      fallbackFrom: opts.fallbackFrom,
      estimate: candidate.estimate,
      routedAt: new Date(),
    };
  }
}

export const routeTaskRouter = new RouteTaskRouter();