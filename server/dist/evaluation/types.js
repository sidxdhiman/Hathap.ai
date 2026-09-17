"use strict";
/**
 * Phase 9 — Evaluation System.
 *
 * Shared types for the evaluation layer:
 *
 *   Benchmark → Cases → System/Baseline → Evaluation Run
 *     → Decision/Execution → Evaluation → Criteria/Metrics → Comparison → Regression
 *
 * Honesty rules encoded here (mirrors the Phase 8 memory layer rules):
 *   - No fabricated ground truth: cases declare *structural criteria* and
 *     evaluation rubrics declare *scoring criteria* — never a "correct answer".
 *   - No chain-of-thought storage: results reference external artifacts
 *     (decision/execution ids) and store bounded signals, not internal reasoning.
 *   - No secrets: stored strings are sanitized (see evaluationPolicy).
 *   - Unknown ≠ bad: a criterion that is disabled or not applicable is excluded
 *     from the composite and reported as such — never scored as zero.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_CRITERIA = exports.CRITERION_KEYS = void 0;
exports.CRITERION_KEYS = [
    'structural',
    'quality',
    'evidence',
    'reasoning',
    'efficiency',
    'outcome',
];
exports.DEFAULT_CRITERIA = [
    { key: 'structural', label: 'Structural completeness', weight: 0.25, enabled: true },
    { key: 'quality', label: 'Answer quality', weight: 0.25, enabled: true },
    { key: 'evidence', label: 'Evidence quality', weight: 0.15, enabled: true },
    { key: 'reasoning', label: 'Reasoning / process quality', weight: 0.15, enabled: true },
    { key: 'efficiency', label: 'Cost / latency efficiency', weight: 0.1, enabled: true },
    { key: 'outcome', label: 'Real-world outcome', weight: 0.1, enabled: true },
];
