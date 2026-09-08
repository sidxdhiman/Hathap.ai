"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.redTeamHandler = void 0;
const redTeamService_1 = require("../../decision/redTeamService");
const Claim_1 = __importDefault(require("../../models/Claim"));
const Evidence_1 = __importDefault(require("../../models/Evidence"));
/**
 * Red Team handler — the task boundary for adversarial decision analysis.
 *
 * The Red Team is explicitly adversarial: its purpose is to attack the
 * candidate decision. This handler runs the deterministic red-team
 * analysis (Phase 4). A full LLM-based red team is deferred to a
 * future phase.
 *
 * Input: candidate recommendation + claimIds + evidenceIds + assumptions
 * Output: structured findings (persisted as RedTeamFinding documents)
 *
 * Lifecycle: pending → ready → running → completed (or failed)
 * Retryable: transient failures only.
 * Non-retryable: missing/invalid input.
 * Idempotency: findings are created fresh for each task run;
 *   the task executor's idempotency guard (completed + result = skip)
 *   prevents re-running completed tasks.
 */
exports.redTeamHandler = {
    type: 'red_team',
    canHandle(type) {
        return type === 'red_team';
    },
    async execute(task, context) {
        const candidateRecommendation = task.input?.candidateRecommendation;
        const claimIds = Array.isArray(task.input?.claimIds)
            ? task.input.claimIds
            : [];
        const evidenceIds = Array.isArray(task.input?.evidenceIds)
            ? task.input.evidenceIds
            : [];
        if (!candidateRecommendation || typeof candidateRecommendation !== 'string') {
            throw new Error('red_team task input requires a candidateRecommendation string.');
        }
        // Validate claimIds belong to this decision
        if (claimIds.length > 0) {
            const validClaimCount = await Claim_1.default.countDocuments({
                _id: { $in: claimIds },
                decisionId: context.decisionId,
            });
            if (validClaimCount === 0) {
                throw new Error(`No valid claims found for red team analysis of decision ${context.decisionId}.`);
            }
        }
        // Validate evidenceIds belong to this decision
        if (evidenceIds.length > 0) {
            const validEvidenceCount = await Evidence_1.default.countDocuments({
                _id: { $in: evidenceIds },
                decisionId: context.decisionId,
            });
            if (validEvidenceCount === 0) {
                throw new Error(`No valid evidence found for red team analysis of decision ${context.decisionId}.`);
            }
        }
        // Run the structured red team analysis
        const findings = await redTeamService_1.redTeamService.runRedTeamAnalysis({
            decisionId: context.decisionId,
            executionId: context.executionId,
            taskId: context.taskId,
            candidateRecommendation,
            claimIds,
            evidenceIds,
        });
        const findingSummaries = findings.map((f) => ({
            id: f._id.toString(),
            severity: f.severity,
            type: f.type,
            description: f.description,
            relatedClaimIds: f.relatedClaimIds,
            relatedEvidenceIds: f.relatedEvidenceIds,
            suggestedAction: f.suggestedAction,
        }));
        const criticalCount = findings.filter((f) => f.severity === 'critical').length;
        const highCount = findings.filter((f) => f.severity === 'high').length;
        const mediumCount = findings.filter((f) => f.severity === 'medium').length;
        const lowCount = findings.filter((f) => f.severity === 'low').length;
        return {
            output: {
                decisionId: context.decisionId,
                totalFindings: findings.length,
                criticalCount,
                highCount,
                mediumCount,
                lowCount,
                findings: findingSummaries,
                findingIds: findings.map((f) => f._id.toString()),
            },
        };
    },
};
