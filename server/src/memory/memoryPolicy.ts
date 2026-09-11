import { MemoryPolicy, MemoryLifecycleStatus, MEMORY_POLICY_VERSION } from './types';

export { MEMORY_POLICY_VERSION };

/**
 * Phase 8 — centralized memory retrieval policy.
 *
 * Bounds live here so "how much memory do we inject" is never a scattered
 * magic number. Tuning these values changes retrieval behaviour everywhere
 * without touching the services that consume the policy.
 */
export const memoryPolicyDefaults: Required<MemoryPolicy> = {
  enabled: true,
  maxMemories: 5,
  maxContextSize: 3000,
  minRelevance: 0.08,
  defaultRetrievableStatuses: ['completed', 'cancelled', 'failed'],
};

/**
 * Deterministic policy lens. Callers may override individual fields (tests,
 * alternate products) while the rest inherit production defaults.
 */
export function makeMemoryPolicy(overrides: Partial<MemoryPolicy> = {}): Required<MemoryPolicy> {
  return {
    ...memoryPolicyDefaults,
    ...overrides,
  };
}

export interface MemoryPolicyContext {
  policyVersion: string;
  enabled: boolean;
  maxMemories: number;
  maxContextSize: number;
  minimumRelevance: number;
}

export function policyView(policy: Required<MemoryPolicy>): MemoryPolicyContext {
  return {
    policyVersion: MEMORY_POLICY_VERSION,
    enabled: policy.enabled,
    maxMemories: policy.maxMemories,
    maxContextSize: policy.maxContextSize,
    minimumRelevance: policy.minRelevance,
  };
}

export const memoryPolicyInstance = makeMemoryPolicy();

export type { MemoryLifecycleStatus };