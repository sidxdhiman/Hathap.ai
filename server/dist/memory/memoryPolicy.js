"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.memoryPolicyInstance = exports.memoryPolicyDefaults = exports.MEMORY_POLICY_VERSION = void 0;
exports.makeMemoryPolicy = makeMemoryPolicy;
exports.policyView = policyView;
const types_1 = require("./types");
Object.defineProperty(exports, "MEMORY_POLICY_VERSION", { enumerable: true, get: function () { return types_1.MEMORY_POLICY_VERSION; } });
/**
 * Phase 8 — centralized memory retrieval policy.
 *
 * Bounds live here so "how much memory do we inject" is never a scattered
 * magic number. Tuning these values changes retrieval behaviour everywhere
 * without touching the services that consume the policy.
 */
exports.memoryPolicyDefaults = {
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
function makeMemoryPolicy(overrides = {}) {
    return {
        ...exports.memoryPolicyDefaults,
        ...overrides,
    };
}
function policyView(policy) {
    return {
        policyVersion: types_1.MEMORY_POLICY_VERSION,
        enabled: policy.enabled,
        maxMemories: policy.maxMemories,
        maxContextSize: policy.maxContextSize,
        minimumRelevance: policy.minRelevance,
    };
}
exports.memoryPolicyInstance = makeMemoryPolicy();
