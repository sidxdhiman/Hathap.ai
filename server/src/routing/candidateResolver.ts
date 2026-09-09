import Agent from '../models/Agent';
import Model from '../models/Model';
import { getPricingForModel, estimateCostForModel } from '../decision/usage';
import { isEncrypted, isMaskedApiKeyValue } from '../utils/encryption';
import { TaskType } from '../decision/types';
import {
  RoutingCandidate,
  RoutingPolicy,
  CostEstimate,
} from './routingTypes';

/**
 * Phase 6 — candidate resolution.
 *
 * Builds the bounded, ownership-scoped candidate set (agent x model pairs) for
 * a task. Ownership is strictly enforced: only the requester's models and
 * agents are loaded, and credentials are never read or logged — availability is
 * derived from the presence of a stored API key, not its value.
 */

function hasUsableApiKey(model: { apiKey?: string }): boolean {
  if (!model.apiKey) return false;
  if (isMaskedApiKeyValue(model.apiKey)) return false;
  return isEncrypted(model.apiKey);
}

/** A model is routable when it is enabled, not in a failed state, and has a key. */
export function isModelRoutable(model: {
  enabled?: boolean;
  status?: string;
  apiKey?: string;
}): boolean {
  if (model.enabled === false) return false;
  if (model.status === 'error') return false;
  return hasUsableApiKey(model);
}

export function estimateCostForCandidate(
  modelName: string,
  taskType: TaskType,
  policy: RoutingPolicy
): CostEstimate {
  const budget = policy.estimatedTokenBudgetByTask[taskType] || {
    input: 2000,
    output: 1000,
  };
  const pricing = getPricingForModel(modelName);
  const estimatedInputTokens = budget.input;
  const estimatedOutputTokens = budget.output;
  const pricingKnown = pricing !== undefined;
  const estimatedCost = pricing
    ? estimateCostForModel(modelName, estimatedInputTokens, estimatedOutputTokens)
    : 0;
  return { estimatedInputTokens, estimatedOutputTokens, estimatedCost, pricingKnown };
}

export interface ResolvedCandidates {
  candidates: RoutingCandidate[];
  modelCount: number;
  agentCount: number;
}

/**
 * Load the user's enabled/instrumented models and agents and produce the full
 * agent x model candidate cross-product with hard-filter flags precomputed.
 * Model-level availability is a hard filter; agent capability gaps and budget
 * overruns are computed here and enforced downstream by the router. Candidates
 * are ordered by model (createdAt, _id) then agent (createdAt, _id) so all
 * downstream selection is deterministic.
 */
export async function resolveCandidates(input: {
  userId: string;
  taskType: TaskType;
  requirements: string[];
  policy: RoutingPolicy;
  excludeModelIds?: string[];
}): Promise<ResolvedCandidates> {
  const { userId, taskType, requirements, policy } = input;
  const exclude = new Set<string>((input.excludeModelIds || []).map((id) => String(id)));

  const [agents, models] = await Promise.all([
    Agent.find({ userId }).sort({ createdAt: 1, _id: 1 }),
    Model.find({ userId }).sort({ createdAt: 1, _id: 1 }),
  ]);

  if (agents.length === 0) {
    return { candidates: [], modelCount: models.length, agentCount: 0 };
  }

  const routableModels = models.filter((m) => isModelRoutable(m));
  const availableModels = routableModels.filter((m) => !exclude.has(String(m._id)));

  const candidates: RoutingCandidate[] = [];
  for (const model of availableModels) {
    const estimate = estimateCostForCandidate(
      model.modelName || model.displayName || '',
      taskType,
      policy
    );
    const budgetExceeded =
      policy.maxEstimatedCostPerTask > 0 &&
      estimate.pricingKnown &&
      estimate.estimatedCost > policy.maxEstimatedCostPerTask;

    for (const agent of agents) {
      const agentCaps = (agent.capabilities as string[]) || [];
      const hardRequirementFails = requirements.filter((req) => !agentCaps.includes(req));
      candidates.push({
        agent,
        model,
        hardRequirementFails,
        modelUnavailable: false,
        budgetExceeded,
        estimate,
      });
    }
  }

  return { candidates, modelCount: availableModels.length, agentCount: agents.length };
}