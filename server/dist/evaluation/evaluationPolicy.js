"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_EXPECTED_STRUCTURE = exports.DEFAULT_EVALUATION_POLICY = exports.EVALUATION_POLICY_VERSION = void 0;
exports.makeEvaluationPolicy = makeEvaluationPolicy;
exports.normalizeCriteria = normalizeCriteria;
exports.sanitizeSignal = sanitizeSignal;
const types_1 = require("./types");
/**
 * Phase 9 — Evaluation policy.
 *
 * Central defaults and version string for the evaluation layer. Limits exist so
 * every evaluation is deterministic and bounded:
 *   - a run executes at most `maxCasesPerRun` cases,
 *   - a run has a total wall-clock budget (`maxDurationMs`),
 *   - each case has its own budget (`maxSliceMs`),
 *   - decision-engine evaluations wait at most `maxDecisionWaitMs`,
 *   - stored results are capped (`maxResultBytes`).
 *
 * No secrets policy: `sanitizeSignal` strips common credential patterns from any
 * string that ends up in evaluation data. No chain-of-thought policy: run/case
 * results store only references and bounded signals — never model reasoning.
 */
exports.EVALUATION_POLICY_VERSION = 'evaluation-policy-v1';
const DEFAULT_LIMITS = {
    maxCasesPerRun: 20,
    maxDurationMs: 10 * 60 * 1000,
    maxSliceMs: 90 * 1000,
    maxDecisionWaitMs: 6 * 60 * 1000,
    maxLlmCallsPerCase: 1,
    maxTokenBudgetPerCase: 200000,
    maxResultBytes: 64 * 1024,
};
exports.DEFAULT_EVALUATION_POLICY = {
    version: exports.EVALUATION_POLICY_VERSION,
    limits: DEFAULT_LIMITS,
    defaultCriteria: types_1.DEFAULT_CRITERIA,
    defaultRubricName: 'Default rubric',
    defaultBaselineThresholds: {
        composite: 0.6,
        byCriterion: {
            structural: 0.5,
            quality: 0.5,
            evidence: 0.4,
            reasoning: 0.4,
            efficiency: 0.3,
            outcome: 0.3,
        },
    },
    regressionEpsilon: 0.05,
    efficiencyBudgets: { maxCostUsd: 0.1, maxLatencyMs: 120000, maxTokens: 200000 },
    maxSignalLen: 4000,
};
function makeEvaluationPolicy(overrides) {
    const limits = { ...DEFAULT_LIMITS, ...(overrides || {}) };
    return { ...exports.DEFAULT_EVALUATION_POLICY, limits };
}
exports.DEFAULT_EXPECTED_STRUCTURE = {
    requiresRecommendation: true,
    requiresEvidence: true,
    requiresAssumptions: false,
    requiresConfidence: true,
    minAnswerLength: 60,
    mustMention: [],
};
/** Normalize a criteria array: clamp weights to >0 and lowercase keys. */
function normalizeCriteria(input) {
    const seen = new Set();
    const out = [];
    for (const c of input) {
        const key = String(c.key || '').toLowerCase();
        if (!key || seen.has(key))
            continue;
        seen.add(key);
        const weight = typeof c.weight === 'number' && Number.isFinite(c.weight) && c.weight > 0
            ? c.weight
            : 0.1;
        out.push({
            key: key,
            label: typeof c.label === 'string' && c.label.trim() ? c.label.trim() : key,
            description: typeof c.description === 'string' ? c.description : undefined,
            weight,
            enabled: c.enabled !== false,
        });
    }
    return out;
}
const SECRET_PATTERNS = [
    /\bsk-[A-Za-z0-9_-]{12,}\b/g,
    /\bBearer [A-Za-z0-9._-]{12,}\b/gi,
    /(api[_-]?key|apikey|secret|token|authorization)\s*[:=]\s*['"]?[A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=-]{8,}/gi,
    /AKIA[0-9A-Z]{16}/g,
];
/**
 * No-secrets guard: strip credential-looking substrings from any text destined
 * for evaluation data. Also collapses long spans so stored signals stay small.
 */
function sanitizeSignal(value, maxLen = exports.DEFAULT_EVALUATION_POLICY.maxSignalLen) {
    if (!value)
        return '';
    let out = value;
    for (const re of SECRET_PATTERNS) {
        out = out.replace(re, '[redacted]');
    }
    out = out.replace(/[ \t]{2,}/g, ' ').trim();
    if (out.length > maxLen) {
        out = out.slice(0, maxLen) + '…';
    }
    return out;
}
