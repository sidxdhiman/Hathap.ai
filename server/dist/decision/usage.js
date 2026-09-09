"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPricingForModel = getPricingForModel;
exports.estimateCostForModel = estimateCostForModel;
exports.recordUsage = recordUsage;
exports.aggregateUsage = aggregateUsage;
exports.usageSummary = usageSummary;
const ESTIMATED_COST_PER_TOKEN = {
    'gpt-4o': { input: 0.000005, output: 0.000015 },
    'gpt-4o-mini': { input: 0.00000015, output: 0.0000006 },
    'gpt-4-turbo': { input: 0.00001, output: 0.00003 },
    'gpt-3.5-turbo': { input: 0.0000005, output: 0.0000015 },
    'claude-3-5-sonnet': { input: 0.000003, output: 0.000015 },
    'claude-3-5-sonnet-20241022': { input: 0.000003, output: 0.000015 },
    'claude-3-opus': { input: 0.000015, output: 0.000075 },
    'claude-3-haiku': { input: 0.00000025, output: 0.00000125 },
    'gemini-pro': { input: 0.00000075, output: 0.000002 },
    'gemini-1.5-pro': { input: 0.00000075, output: 0.000002 },
    'gemini-1.5-flash': { input: 0.000000075, output: 0.0000003 },
    'deepseek-chat': { input: 0.00000014, output: 0.00000028 },
    'deepseek-reasoner': { input: 0.00000055, output: 0.00000219 },
};
const MODEL_NAME_MATCH = [
    /gpt-4o-mini/i,
    /gpt-4o/i,
    /gpt-4-turbo/i,
    /gpt-3\.5/i,
    /claude-3-5-sonnet/i,
    /claude-3-opus/i,
    /claude-3-haiku/i,
    /gemini-1\.5-pro/i,
    /gemini-1\.5-flash/i,
    /gemini-pro/i,
    /deepseek-chat/i,
    /deepseek-reasoner/i,
];
function findPricingForModel(modelName) {
    const lower = modelName.toLowerCase();
    for (const key of Object.keys(ESTIMATED_COST_PER_TOKEN)) {
        if (lower.includes(key.toLowerCase())) {
            return ESTIMATED_COST_PER_TOKEN[key];
        }
    }
    return undefined;
}
/**
 * Public pricing lookup so the routing layer can reason about cost without
 * maintaining a second table. The single estimated-cost-per-token table above
 * is the source of truth; unknown models stay unknown (undefined) rather than
 * being silently assumed cheap.
 */
function getPricingForModel(modelName) {
    return findPricingForModel(modelName);
}
function estimateCostForModel(modelName, inputTokens, outputTokens) {
    return estimateCost(modelName, inputTokens, outputTokens);
}
function estimateCost(modelName, inputTokens, outputTokens) {
    const pricing = findPricingForModel(modelName);
    if (!pricing || !inputTokens || !outputTokens) {
        return 0;
    }
    return (inputTokens * pricing.input + outputTokens * pricing.output);
}
function recordUsage(params) {
    const inputTokens = params.inputTokens || 0;
    const outputTokens = params.outputTokens || 0;
    const totalTokens = inputTokens + outputTokens;
    const estimatedCost = estimateCost(params.model, inputTokens, outputTokens);
    return {
        inputTokens,
        outputTokens,
        totalTokens,
        estimatedCost,
        model: params.model,
        provider: params.provider,
        latencyMs: params.latencyMs,
    };
}
function aggregateUsage(records) {
    const total = {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        estimatedCost: 0,
        model: '',
        provider: '',
    };
    for (const record of records) {
        total.inputTokens += record.inputTokens;
        total.outputTokens += record.outputTokens;
        total.totalTokens += record.totalTokens;
        total.estimatedCost += record.estimatedCost;
        if (!total.model && record.model)
            total.model = record.model;
        if (!total.provider && record.provider)
            total.provider = record.provider;
    }
    return total;
}
function usageSummary(records) {
    const byModel = {};
    let totalCalls = 0;
    for (const record of records) {
        totalCalls += 1;
        const key = record.model || 'unknown';
        if (!byModel[key]) {
            byModel[key] = { ...record };
        }
        else {
            byModel[key].inputTokens += record.inputTokens;
            byModel[key].outputTokens += record.outputTokens;
            byModel[key].totalTokens += record.totalTokens;
            byModel[key].estimatedCost += record.estimatedCost;
        }
    }
    return {
        totalUsage: aggregateUsage(records),
        byModel,
        totalCalls,
    };
}
