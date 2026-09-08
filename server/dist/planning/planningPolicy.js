"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TASK_TYPE_PURPOSES = exports.KNOWN_CAPABILITIES = exports.DEFAULT_PLANNING_POLICY = void 0;
exports.makePlanningPolicy = makePlanningPolicy;
exports.isAllowedTaskType = isAllowedTaskType;
exports.isKnownCapability = isKnownCapability;
exports.estimatePlanSize = estimatePlanSize;
const planTypes_1 = require("./planTypes");
exports.DEFAULT_PLANNING_POLICY = {
    maxTasksPerExecution: 12,
    maxResearchTasks: 5,
    maxVerificationTasks: 8,
    maxPlanDepth: 3,
    maxTotalResearchResults: 60,
    maxPlanningRetries: 2,
    planningTimeoutMs: 30000,
    maxResultsPerResearchTask: 12,
    maxRationaleTokens: 400,
};
function makePlanningPolicy(overrides) {
    return { ...exports.DEFAULT_PLANNING_POLICY, ...(overrides || {}) };
}
/**
 * Capability registry. Given a planner-proposed task, the validator checks its
 * `requirements` against the known capability set and its type is checked
 * against the allowlist. This is a MINIMAL resolution step — it never grants
 * permissions or routes models; it only validates that declared requirements
 * are recognizable capabilities the system understands.
 */
exports.KNOWN_CAPABILITIES = [
    'financial_analysis',
    'technical_analysis',
    'research',
    'security_review',
    'legal_analysis',
    'product_strategy',
    'risk_analysis',
    'fact_checking',
];
/** Declared purpose per allowlisted task type (shown in the UI). */
exports.TASK_TYPE_PURPOSES = {
    research: 'Gather external evidence for the decision.',
    debate: 'Multi-agent reasoning over evidence that produces a candidate decision.',
    verify_claim: 'Evaluate each selected claim against its evidence.',
    red_team: 'Adversarially challenge the candidate decision.',
    reconciliation: 'Merge verification + red-team results into a final decision.',
};
function isAllowedTaskType(type) {
    return planTypes_1.ALLOWED_PLANNED_TASK_TYPES.includes(type);
}
function isKnownCapability(cap) {
    return exports.KNOWN_CAPABILITIES.includes(cap);
}
/** Rough plan-size estimate for cost observability (no dollar figures). */
function estimatePlanSize(plan, estimates) {
    const tasks = plan.tasks || [];
    const researchTasks = tasks.filter((t) => t.type === 'research').length;
    const llmTasks = tasks.filter((t) => ['debate', 'red_team', 'verification'].includes(t.type)).length;
    return {
        estimatedTasks: tasks.length,
        estimatedResearchTasks: researchTasks,
        estimatedLLMTasks: llmTasks,
    };
}
