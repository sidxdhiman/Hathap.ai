import { RoutingFactorName, RoutingPolicy, ROUTING_POLICY_VERSION } from './routingTypes';
import { TaskType } from '../decision/types';

/**
 * Phase 6 — routing policy. Deterministic, configurable per deployment via
 * environment variables, and versioned so a persisted routing decision can be
 * audited against the policy that produced it.
 *
 * No machine learning is used anywhere: every factor is a documented,
 * explainable prior; anything not known stays at a neutral prior instead of
 * being invented.
 */

/**
 * Soft capability preferences derived from task type. Soft requirements shape
 * scoring only — they never exclude a candidate (unlike planner-declared hard
 * requirements). Research is provider-driven and uses no LLM, so it is a soft
 * preference for agents able to synthesize evidence rather than a gate.
 */
export const TASK_TYPE_SOFT_REQUIREMENTS: Record<string, string[]> = {
  research: ['research'],
  debate: ['reasoning'],
  analysis: ['reasoning'],
  synthesis: ['reasoning'],
  challenge: ['reasoning'],
  verify_claim: ['fact_checking', 'reasoning'],
  red_team: ['reasoning'],
  reconciliation: ['reasoning'],
  verification: ['fact_checking', 'reasoning'],
  human_review: ['fact_checking'],
};

export const DEFAULT_ROUTING_WEIGHTS: Record<RoutingFactorName, number> = {
  quality: 0.25,
  capability: 0.25,
  specialization: 0.15,
  reliability: 0.15,
  cost: 0.1,
  latency: 0.1,
};

const DEFAULT_ESTIMATED_TOKEN_BUDGET: Record<string, { input: number; output: number }> = {
  research: { input: 2000, output: 800 },
  debate: { input: 6000, output: 2400 },
  analysis: { input: 3000, output: 1200 },
  synthesis: { input: 3000, output: 1200 },
  challenge: { input: 2500, output: 1000 },
  verification: { input: 2500, output: 1000 },
  verify_claim: { input: 2000, output: 600 },
  red_team: { input: 4000, output: 1600 },
  reconciliation: { input: 3000, output: 1200 },
  human_review: { input: 2500, output: 1000 },
};

export interface RoutingPolicyOverrides {
  weights?: Partial<Record<RoutingFactorName, number>>;
  maxEstimatedCostPerTask?: number;
  qualityOverrides?: Record<string, number>;
  latencyOverrides?: Record<string, number>;
  reliabilityByStatus?: Record<string, number>;
  neutralQuality?: number;
  neutralLatency?: number;
  tieBreakEpsilon?: number;
  allowCapabilityGateRelaxation?: boolean;
  diversityPreferenceTasks?: TaskType[];
  diversityBonus?: number;
  estimatedTokenBudgetByTask?: Record<string, { input: number; output: number }>;
}

export function makeRoutingPolicy(overrides?: RoutingPolicyOverrides): RoutingPolicy {
  const weights = { ...DEFAULT_ROUTING_WEIGHTS, ...(overrides?.weights || {}) };
  const weightSum = Object.values(weights).reduce((a, b) => a + b, 0);
  if (weightSum > 0 && Math.abs(weightSum - 1) > 1e-6) {
    // Normalize so the weighted sum remains a convex combination.
    for (const key of Object.keys(weights) as RoutingFactorName[]) {
      weights[key] = weights[key] / weightSum;
    }
  }

  return {
    version: ROUTING_POLICY_VERSION,
    weights,
    maxEstimatedCostPerTask: overrides?.maxEstimatedCostPerTask ?? 0,
    qualityOverrides: overrides?.qualityOverrides || {},
    latencyOverrides: overrides?.latencyOverrides || {},
    reliabilityByStatus: {
      connected: 0.8,
      untested: 0.5,
      ...(overrides?.reliabilityByStatus || {}),
    },
    neutralQuality: overrides?.neutralQuality ?? 0.5,
    neutralLatency: overrides?.neutralLatency ?? 0.5,
    tieBreakEpsilon: overrides?.tieBreakEpsilon ?? 1e-9,
    allowCapabilityGateRelaxation: overrides?.allowCapabilityGateRelaxation ?? true,
    diversityPreferenceTasks: overrides?.diversityPreferenceTasks ?? ['red_team', 'verify_claim'],
    diversityBonus: overrides?.diversityBonus ?? 0.04,
    estimatedTokenBudgetByTask: {
      ...DEFAULT_ESTIMATED_TOKEN_BUDGET,
      ...(overrides?.estimatedTokenBudgetByTask || {}),
    },
  };
}

function parseNumberEnv(name: string): number | undefined {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

function parseFloatMapEnv(name: string): Record<string, number> | undefined {
  const raw = process.env[name];
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as Record<string, number>;
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {
    console.warn(`[RoutingPolicy] ignoring malformed ${name}; expected a JSON object.`);
  }
  return undefined;
}

/**
 * Load the deployment policy once per process from environment variables.
 * The real system always uses this cached policy so behavior is stable; tests
 * build isolated policies with `makeRoutingPolicy`.
 */
let cachedPolicy: RoutingPolicy | undefined;

export function loadRoutingPolicy(): RoutingPolicy {
  if (cachedPolicy) return cachedPolicy;

  const weightNames: RoutingFactorName[] = [
    'quality',
    'capability',
    'specialization',
    'reliability',
    'cost',
    'latency',
  ];
  const weights: Partial<Record<RoutingFactorName, number>> = {};
  for (const name of weightNames) {
    const override = parseNumberEnv(`HATHAP_ROUTING_WEIGHT_${name.toUpperCase()}`);
    if (override !== undefined) weights[name] = override;
  }

  const diversityRaw = process.env.HATHAP_ROUTING_DIVERSITY_TASKS;
  const diversityPreferenceTasks = diversityRaw
    ? diversityRaw.split(',').map((s) => s.trim()).filter(Boolean) as TaskType[]
    : undefined;

  cachedPolicy = makeRoutingPolicy({
    weights,
    maxEstimatedCostPerTask: parseNumberEnv('HATHAP_ROUTING_MAX_ESTIMATED_COST_PER_TASK') ?? 0,
    qualityOverrides: parseFloatMapEnv('HATHAP_ROUTING_QUALITY_OVERRIDES'),
    latencyOverrides: parseFloatMapEnv('HATHAP_ROUTING_LATENCY_OVERRIDES'),
    allowCapabilityGateRelaxation: process.env.HATHAP_ROUTING_ALLOW_GATE_RELAXATION
      ? process.env.HATHAP_ROUTING_ALLOW_GATE_RELAXATION === 'true'
      : undefined,
    diversityPreferenceTasks,
  });
  return cachedPolicy;
}