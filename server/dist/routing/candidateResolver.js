"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isModelRoutable = isModelRoutable;
exports.estimateCostForCandidate = estimateCostForCandidate;
exports.resolveCandidates = resolveCandidates;
const Agent_1 = __importDefault(require("../models/Agent"));
const Model_1 = __importDefault(require("../models/Model"));
const usage_1 = require("../decision/usage");
const encryption_1 = require("../utils/encryption");
/**
 * Phase 6 — candidate resolution.
 *
 * Builds the bounded, ownership-scoped candidate set (agent x model pairs) for
 * a task. Ownership is strictly enforced: only the requester's models and
 * agents are loaded, and credentials are never read or logged — availability is
 * derived from the presence of a stored API key, not its value.
 */
function hasUsableApiKey(model) {
    if (!model.apiKey)
        return false;
    if ((0, encryption_1.isMaskedApiKeyValue)(model.apiKey))
        return false;
    return (0, encryption_1.isEncrypted)(model.apiKey);
}
/** A model is routable when it is enabled, not in a failed state, and has a key. */
function isModelRoutable(model) {
    if (model.enabled === false)
        return false;
    if (model.status === 'error')
        return false;
    return hasUsableApiKey(model);
}
function estimateCostForCandidate(modelName, taskType, policy) {
    const budget = policy.estimatedTokenBudgetByTask[taskType] || {
        input: 2000,
        output: 1000,
    };
    const pricing = (0, usage_1.getPricingForModel)(modelName);
    const estimatedInputTokens = budget.input;
    const estimatedOutputTokens = budget.output;
    const pricingKnown = pricing !== undefined;
    const estimatedCost = pricing
        ? (0, usage_1.estimateCostForModel)(modelName, estimatedInputTokens, estimatedOutputTokens)
        : 0;
    return { estimatedInputTokens, estimatedOutputTokens, estimatedCost, pricingKnown };
}
/**
 * Load the user's enabled/instrumented models and agents and produce the full
 * agent x model candidate cross-product with hard-filter flags precomputed.
 * Model-level availability is a hard filter; agent capability gaps and budget
 * overruns are computed here and enforced downstream by the router. Candidates
 * are ordered by model (createdAt, _id) then agent (createdAt, _id) so all
 * downstream selection is deterministic.
 */
async function resolveCandidates(input) {
    const { userId, taskType, requirements, policy } = input;
    const exclude = new Set((input.excludeModelIds || []).map((id) => String(id)));
    const [agents, models] = await Promise.all([
        Agent_1.default.find({ userId }).sort({ createdAt: 1, _id: 1 }),
        Model_1.default.find({ userId }).sort({ createdAt: 1, _id: 1 }),
    ]);
    if (agents.length === 0) {
        return { candidates: [], modelCount: models.length, agentCount: 0 };
    }
    const routableModels = models.filter((m) => isModelRoutable(m));
    const availableModels = routableModels.filter((m) => !exclude.has(String(m._id)));
    const candidates = [];
    for (const model of availableModels) {
        const estimate = estimateCostForCandidate(model.modelName || model.displayName || '', taskType, policy);
        const budgetExceeded = policy.maxEstimatedCostPerTask > 0 &&
            estimate.pricingKnown &&
            estimate.estimatedCost > policy.maxEstimatedCostPerTask;
        for (const agent of agents) {
            const agentCaps = agent.capabilities || [];
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
