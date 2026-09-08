"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.reconciliationService = exports.ReconciliationService = void 0;
const ReconciliationResult_1 = __importDefault(require("../models/ReconciliationResult"));
const VerificationResult_1 = __importDefault(require("../models/VerificationResult"));
const RedTeamFinding_1 = __importDefault(require("../models/RedTeamFinding"));
/**
 * ReconciliationService — determines the final state of a decision after
 * verification and red-team analysis.
 *
 * After verification:
 *   - surviving claims are those that are supported or inconclusive
 *   - rejected claims are those that are contradicted
 *   - uncertain claims have no verification result
 *
 * After red team:
 *   - high/critical findings may affect the recommendation
 *   - findings are recorded as part of the reconciliation
 *
 * The reconciliation produces a final recommendation that may be:
 *   - unchanged from the candidate
 *   - modified based on verification/red-team results
 *   - marked as needing more research
 */
class ReconciliationService {
    /**
     * Run reconciliation: merge verification results and red-team findings
     * into a final recommendation.
     */
    async runReconciliation(params) {
        const { decisionId, executionId, taskId, candidateRecommendation, claimIds, verifyClaimTaskIds, redTeamTaskId, } = params;
        // Load verification results
        const verificationResults = await VerificationResult_1.default.find({
            claimId: { $in: claimIds },
            decisionId,
        });
        const claimVerificationMap = new Map();
        for (const vr of verificationResults) {
            claimVerificationMap.set(vr.claimId, vr.status);
        }
        // Load red-team findings
        const redTeamFindings = redTeamTaskId
            ? await RedTeamFinding_1.default.find({ decisionId, taskId: redTeamTaskId })
            : [];
        const highCriticalFindings = redTeamFindings.filter((f) => f.severity === 'high' || f.severity === 'critical');
        // Categorize claims
        const survivingClaimIds = [];
        const rejectedClaimIds = [];
        const uncertainClaimIds = [];
        const unresolvedConflictIds = [];
        for (const claimId of claimIds) {
            const status = claimVerificationMap.get(claimId);
            if (status === 'supported' || status === 'inconclusive') {
                survivingClaimIds.push(claimId);
            }
            else if (status === 'contradicted') {
                rejectedClaimIds.push(claimId);
            }
            else if (status === 'unsupported') {
                uncertainClaimIds.push(claimId);
            }
            else {
                // No verification result found
                uncertainClaimIds.push(claimId);
            }
        }
        // Check for unresolved conflicts (claims that are both supported AND contradicted
        // by different evidence — this is technically impossible in our current model
        // since a single verification per claim, but good to handle)
        for (const vr of verificationResults) {
            if (vr.supportingEvidenceIds.length > 0 &&
                vr.contradictingEvidenceIds.length > 0) {
                unresolvedConflictIds.push(vr.claimId);
            }
        }
        // Determine final recommendation
        let recommendation = candidateRecommendation;
        let needsMoreResearch = false;
        const researchQuestions = [];
        if (rejectedClaimIds.length > 0) {
            // Claims were contradicted — flag that the recommendation should be reviewed
            needsMoreResearch = true;
            researchQuestions.push(`Re-evaluate the recommendation in light of ${rejectedClaimIds.length} contradicted claim(s).`);
        }
        if (highCriticalFindings.length > 0) {
            // High/critical red team findings
            needsMoreResearch = true;
            for (const finding of highCriticalFindings) {
                if (finding.suggestedAction) {
                    researchQuestions.push(finding.suggestedAction);
                }
            }
        }
        // Build rationale
        const rationale = this.buildReconciliationRationale({
            survivingCount: survivingClaimIds.length,
            rejectedCount: rejectedClaimIds.length,
            uncertainCount: uncertainClaimIds.length,
            unresolvedConflictCount: unresolvedConflictIds.length,
            redTeamFindingCount: redTeamFindings.length,
            highCriticalFindingCount: highCriticalFindings.length,
        });
        // Persist
        const result = await ReconciliationResult_1.default.findOneAndUpdate({ decisionId, taskId }, {
            decisionId,
            executionId,
            taskId,
            recommendation,
            survivingClaimIds,
            rejectedClaimIds,
            uncertainClaimIds,
            unresolvedConflictIds,
            redTeamFindingIds: redTeamFindings.map((f) => f._id.toString()),
            needsMoreResearch,
            researchQuestions: researchQuestions.length > 0 ? researchQuestions : undefined,
            rationale,
        }, { upsert: true, new: true });
        return result;
    }
    /**
     * Load reconciliation result for a decision.
     */
    async getReconciliationForDecision(decisionId) {
        return ReconciliationResult_1.default.findOne({ decisionId });
    }
    /**
     * Delete reconciliation results for a decision.
     */
    async deleteReconciliationForDecision(decisionId) {
        await ReconciliationResult_1.default.deleteMany({ decisionId });
    }
    buildReconciliationRationale(params) {
        const parts = [];
        parts.push(`${params.survivingCount} claim(s) survived verification.`);
        if (params.rejectedCount > 0) {
            parts.push(`${params.rejectedCount} claim(s) were contradicted by evidence.`);
        }
        if (params.uncertainCount > 0) {
            parts.push(`${params.uncertainCount} claim(s) remain uncertain.`);
        }
        if (params.unresolvedConflictCount > 0) {
            parts.push(`${params.unresolvedConflictCount} claim(s) have unresolved conflicts.`);
        }
        if (params.redTeamFindingCount > 0) {
            parts.push(`Red team produced ${params.redTeamFindingCount} finding(s) (${params.highCriticalFindingCount} high/critical).`);
        }
        return parts.join(' ');
    }
}
exports.ReconciliationService = ReconciliationService;
exports.reconciliationService = new ReconciliationService();
