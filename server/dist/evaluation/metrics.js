"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.clamp01 = clamp01;
exports.mean = mean;
exports.computeComposite = computeComposite;
exports.buildComposite = buildComposite;
exports.efficiencyMetrics = efficiencyMetrics;
exports.tokenOverlap = tokenOverlap;
exports.tokenize = tokenize;
const evaluationPolicy_1 = require("./evaluationPolicy");
/**
 * Phase 9 — Metrics.
 *
 * Pure, deterministic scoring helpers. All score functions return a value in
 * [0, 1] or `undefined` when the input is missing (a missing measurement is
 * never scored as a zero — it is simply not included).
 */
function clamp01(v) {
    if (!Number.isFinite(v))
        return 0;
    return Math.min(1, Math.max(0, v));
}
function mean(values) {
    if (values.length === 0)
        return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
}
/**
 * Weighted composite over the categories that are enabled, applicable and
 * actually scored. Disabled or not-applicable categories are excluded and the
 * remaining weights are renormalized — a benchmark that has no outcome data is
 * not punished for it.
 */
function computeComposite(categories, epsilon = 0.000001) {
    const included = categories.filter((c) => c.included);
    const excludedCategories = [];
    for (const c of categories) {
        if (!c.enabled) {
            excludedCategories.push({ key: c.key, reason: 'disabled' });
        }
        else if (!c.applicable) {
            excludedCategories.push({ key: c.key, reason: 'not-applicable' });
        }
        else if (c.score === undefined) {
            excludedCategories.push({ key: c.key, reason: 'not-applicable' });
        }
    }
    const totalWeight = included.reduce((sum, c) => sum + c.weight, 0);
    const coefficients = {};
    if (totalWeight > epsilon) {
        for (const c of included) {
            coefficients[c.key] = c.weight / totalWeight;
        }
    }
    const score = totalWeight > epsilon
        ? included.reduce((sum, c) => sum + c.weight * c.score, 0) / totalWeight
        : undefined;
    return {
        categories,
        score,
        includedCategories: included.map((c) => c.key),
        excludedCategories,
        coefficients,
    };
}
/** Build composite metrics from per-category scores with criteria config. */
function buildComposite(entries) {
    const categories = entries.map((e) => ({
        key: e.key,
        weight: e.weight,
        enabled: e.enabled,
        applicable: e.applicable,
        score: e.score ?? 0,
        included: e.enabled && e.applicable && e.score !== undefined,
    }));
    return computeComposite(categories);
}
/**
 * Efficiency score from cost / latency / token usage. Each individual signal is
 * a "distance from the budget" in [0, 1]; absent signals are skipped. A free and
 * instant answer with zero tokens scores 1.0; unknown usage keeps `applicable`
 * false so callers can exclude the criterion.
 */
function efficiencyMetrics(stats, limits, policy) {
    const budgets = policy?.efficiencyBudgets || (0, evaluationPolicy_1.makeEvaluationPolicy)().efficiencyBudgets;
    const subScores = {};
    if (typeof stats.estimatedCost === 'number' && stats.estimatedCost > 0) {
        subScores.cost = clamp01(1 - stats.estimatedCost / budgets.maxCostUsd);
    }
    if (typeof stats.latencyMs === 'number' && stats.latencyMs > 0) {
        subScores.latency = clamp01(1 - stats.latencyMs / budgets.maxLatencyMs);
    }
    if (typeof stats.totalTokens === 'number' && stats.totalTokens > 0) {
        const budget = limits.maxTokenBudgetPerCase || budgets.maxTokens;
        subScores.tokens = clamp01(1 - stats.totalTokens / budget);
    }
    const scores = Object.values(subScores);
    const applicable = scores.length > 0;
    return { applicable, score: applicable ? mean(scores) : undefined, subScores };
}
/** Deterministic word-boundary overlap used by several evaluators. */
function tokenOverlap(a, b) {
    const tokensA = tokenize(a);
    const tokensB = tokenize(b);
    if (tokensA.size === 0 || tokensB.size === 0)
        return 0;
    let overlap = 0;
    for (const t of tokensA)
        if (tokensB.has(t))
            overlap++;
    const union = new Set([...tokensA, ...tokensB]).size;
    return overlap / union;
}
function tokenize(text) {
    const stop = new Set([
        'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with',
        'is', 'are', 'was', 'were', 'be', 'been', 'it', 'this', 'that', 'should',
        'we', 'our', 'they', 'their', 'do', 'does', 'did', 'would', 'will', 'can',
        'could', 'may', 'might', 'must', 'not', 'but', 'as', 'at', 'by', 'from', 'i',
    ]);
    const out = new Set();
    for (const raw of text.toLowerCase().split(/[^a-z0-9]+/i)) {
        const t = raw.trim();
        if (t.length >= 3 && !stop.has(t))
            out.add(t);
    }
    return out;
}
