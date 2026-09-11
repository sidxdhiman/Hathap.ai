"use strict";
/**
 * Phase 8 — Decision Memory & Outcomes.
 *
 * Shared types for the memory/outcome layer. The layer is an index and a
 * structured historical interpretation over existing Decision / Execution /
 * Claim / Evidence / Verification / Reconciliation documents — never a second
 * copy of the whole execution graph.
 *
 * Honesty rules encoded here:
 *   - unknown ≠ failure, partial ≠ success, missing measurement ≠ negative.
 *   - LLM-suggested lessons are `unconfirmed` until a human confirms them.
 *   - Retrieval returns structured signals only; no hidden chain-of-thought.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MEMORY_POLICY_VERSION = exports.DEFAULT_RETRIEVABLE_STATUSES = exports.OUTCOME_STATUS_ORDER = void 0;
exports.OUTCOME_STATUS_ORDER = {
    success: 0,
    partial: 1,
    pending: 2,
    unknown: 3,
    cancelled: 4,
    failure: 5,
};
exports.DEFAULT_RETRIEVABLE_STATUSES = ['completed', 'cancelled', 'failed'];
exports.MEMORY_POLICY_VERSION = 'memory-policy-v1';
