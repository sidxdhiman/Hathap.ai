import {
  BaselineThresholds,
  DEFAULT_CRITERIA,
  EvaluationLimits,
  EvalCriterionConfig,
  ExpectedStructure,
} from './types';

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

export const EVALUATION_POLICY_VERSION = 'evaluation-policy-v1';

export interface EvaluationPolicy {
  version: string;
  limits: EvaluationLimits;
  defaultCriteria: EvalCriterionConfig[];
  defaultRubricName: string;
  defaultBaselineThresholds: BaselineThresholds;
  /** Minimum |delta| that counts as a regression/improvement. */
  regressionEpsilon: number;
  /** Efficiency scoring budgets (US dollars, ms, tokens). */
  efficiencyBudgets: { maxCostUsd: number; maxLatencyMs: number; maxTokens: number };
  /** Store at most this many signal characters per case result. */
  maxSignalLen: number;
}

const DEFAULT_LIMITS: EvaluationLimits = {
  maxCasesPerRun: 20,
  maxDurationMs: 10 * 60 * 1000,
  maxSliceMs: 90 * 1000,
  maxDecisionWaitMs: 6 * 60 * 1000,
  maxLlmCallsPerCase: 1,
  maxTokenBudgetPerCase: 200_000,
  maxResultBytes: 64 * 1024,
};

export const DEFAULT_EVALUATION_POLICY: EvaluationPolicy = {
  version: EVALUATION_POLICY_VERSION,
  limits: DEFAULT_LIMITS,
  defaultCriteria: DEFAULT_CRITERIA,
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
  efficiencyBudgets: { maxCostUsd: 0.1, maxLatencyMs: 120_000, maxTokens: 200_000 },
  maxSignalLen: 4000,
};

export function makeEvaluationPolicy(
  overrides?: Partial<EvaluationLimits>
): EvaluationPolicy {
  const limits: EvaluationLimits = { ...DEFAULT_LIMITS, ...(overrides || {}) };
  return { ...DEFAULT_EVALUATION_POLICY, limits };
}

export const DEFAULT_EXPECTED_STRUCTURE: ExpectedStructure = {
  requiresRecommendation: true,
  requiresEvidence: true,
  requiresAssumptions: false,
  requiresConfidence: true,
  minAnswerLength: 60,
  mustMention: [],
};

/** Normalize a criteria array: clamp weights to >0 and lowercase keys. */
export function normalizeCriteria(input: Array<{ key?: string; weight?: number; enabled?: boolean; label?: string; description?: string }>): EvalCriterionConfig[] {
  const seen = new Set<string>();
  const out: EvalCriterionConfig[] = [];
  for (const c of input) {
    const key = String(c.key || '').toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const weight =
      typeof c.weight === 'number' && Number.isFinite(c.weight) && c.weight > 0
        ? c.weight
        : 0.1;
    out.push({
      key: key as EvalCriterionConfig['key'],
      label: typeof c.label === 'string' && c.label.trim() ? c.label.trim() : key,
      description: typeof c.description === 'string' ? c.description : undefined,
      weight,
      enabled: c.enabled !== false,
    });
  }
  return out;
}

const SECRET_PATTERNS: RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{12,}\b/g,
  /\bBearer [A-Za-z0-9._-]{12,}\b/gi,
  /(api[_-]?key|apikey|secret|token|authorization)\s*[:=]\s*['"]?[A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=-]{8,}/gi,
  /AKIA[0-9A-Z]{16}/g,
];

/**
 * No-secrets guard: strip credential-looking substrings from any text destined
 * for evaluation data. Also collapses long spans so stored signals stay small.
 */
export function sanitizeSignal(value: string, maxLen = DEFAULT_EVALUATION_POLICY.maxSignalLen): string {
  if (!value) return '';
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