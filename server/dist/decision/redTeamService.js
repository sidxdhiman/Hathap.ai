"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.redTeamService = exports.RedTeamService = void 0;
const RedTeamFinding_1 = __importDefault(require("../models/RedTeamFinding"));
const Claim_1 = __importDefault(require("../models/Claim"));
const Evidence_1 = __importDefault(require("../models/Evidence"));
/**
 * RedTeamService — structured, adversarial analysis of a candidate decision.
 *
 * The Red Team must be explicitly adversarial. Its purpose:
 *   > Try to prove the emerging decision wrong.
 *
 * This is NOT another debate participant. It is a separate stage that
 * systematically attacks the conclusion.
 *
 * Phase 4 implements the deterministic evidence-based red team.
 * A full LLM-based red team is deferred to a future phase.
 * This service:
 *   1. Analyzes claims for weaknesses
 *   2. Identifies missing evidence
 *   3. Detects contradictions
 *   4. Produces structured findings
 */
class RedTeamService {
    /**
     * Run a structured red-team analysis on a candidate decision.
     *
     * This is the deterministic Phase 4 implementation. It analyzes:
     * - Claims with type "assumption" that lack evidence
     * - Claims with type "inference" that lack supporting evidence
   * - Claims that have contradicting evidence
     * - Evidence items not linked to any claim (missing evidence)
     * - Claims without any evidence
     */
    async runRedTeamAnalysis(params) {
        const { decisionId, executionId, taskId, candidateRecommendation, claimIds, evidenceIds } = params;
        // Load claims and evidence
        const claims = claimIds.length > 0
            ? await Claim_1.default.find({ _id: { $in: claimIds }, decisionId })
            : [];
        const evidenceDocs = evidenceIds.length > 0
            ? await Evidence_1.default.find({ _id: { $in: evidenceIds }, decisionId })
            : [];
        const findings = [];
        // Analysis 1: Assumptions without evidence
        for (const claim of claims) {
            if (claim.type === 'assumption' && (!claim.evidenceIds || claim.evidenceIds.length === 0)) {
                const finding = await this.createFinding({
                    decisionId,
                    executionId,
                    taskId,
                    severity: 'high',
                    type: 'invalid_assumption',
                    description: `Claim "${claim.text}" is an assumption with no supporting evidence. This assumption may be incorrect and could undermine the recommendation.`,
                    relatedClaimIds: [claim._id.toString()],
                    relatedEvidenceIds: [],
                    suggestedAction: 'Provide evidence to support this assumption or reconsider the assumption.',
                });
                findings.push(finding);
            }
        }
        // Analysis 2: Claims with contradicting evidence
        for (const claim of claims) {
            if (claim.contradictingEvidenceIds && claim.contradictingEvidenceIds.length > 0) {
                const finding = await this.createFinding({
                    decisionId,
                    executionId,
                    taskId,
                    severity: 'high',
                    type: 'contradictory_evidence',
                    description: `Claim "${claim.text}" has ${claim.contradictingEvidenceIds.length} contradicting evidence item(s). The recommendation may be built on disputed facts.`,
                    relatedClaimIds: [claim._id.toString()],
                    relatedEvidenceIds: claim.contradictingEvidenceIds,
                    suggestedAction: 'Re-evaluate this claim and the recommendation in light of the contradictory evidence.',
                });
                findings.push(finding);
            }
        }
        // Analysis 3: Claims without any evidence
        for (const claim of claims) {
            if ((!claim.evidenceIds || claim.evidenceIds.length === 0) &&
                claim.type !== 'assumption' && // already handled
                claim.type !== 'opinion' // opinions don't need evidence
            ) {
                const finding = await this.createFinding({
                    decisionId,
                    executionId,
                    taskId,
                    severity: 'medium',
                    type: 'missing_evidence',
                    description: `Claim "${claim.text}" (${claim.type}) has no linked evidence. This claim may not be adequately supported.`,
                    relatedClaimIds: [claim._id.toString()],
                    relatedEvidenceIds: [],
                    suggestedAction: 'Link evidence to this claim or verify it with external sources.',
                });
                findings.push(finding);
            }
        }
        // Analysis 4: Evidence not linked to any claim (information loss)
        const allClaimEvidenceIds = new Set();
        for (const claim of claims) {
            for (const eid of claim.evidenceIds || []) {
                allClaimEvidenceIds.add(eid);
            }
        }
        const orphanedEvidence = evidenceDocs.filter((e) => !allClaimEvidenceIds.has(e._id.toString()));
        if (orphanedEvidence.length > 0) {
            const finding = await this.createFinding({
                decisionId,
                executionId,
                taskId,
                severity: 'medium',
                type: 'logic_gap',
                description: `${orphanedEvidence.length} evidence item(s) are not linked to any claim. Relevant information may be missing from the analysis.`,
                relatedClaimIds: [],
                relatedEvidenceIds: orphanedEvidence.map((e) => e._id.toString()),
                suggestedAction: 'Link the orphaned evidence to relevant claims to ensure completeness.',
            });
            findings.push(finding);
        }
        // Analysis 5: Inference claims without evidence
        for (const claim of claims) {
            if (claim.type === 'inference' && (!claim.evidenceIds || claim.evidenceIds.length === 0)) {
                const finding = await this.createFinding({
                    decisionId,
                    executionId,
                    taskId,
                    severity: 'low',
                    type: 'missing_evidence',
                    description: `Inference claim "${claim.text}" has no linked evidence. The reasoning may be based on unstated premises.`,
                    relatedClaimIds: [claim._id.toString()],
                    relatedEvidenceIds: [],
                    suggestedAction: 'Document the evidence or reasoning chain for this inference.',
                });
                findings.push(finding);
            }
        }
        return findings;
    }
    /**
     * Load all red-team findings for a decision.
     */
    async getFindingsForDecision(decisionId) {
        return RedTeamFinding_1.default.find({ decisionId }).sort({ createdAt: 1 });
    }
    /**
     * Load red-team findings for a specific task.
     */
    async getFindingsForTask(taskId) {
        return RedTeamFinding_1.default.find({ taskId }).sort({ createdAt: 1 });
    }
    /**
     * Delete all red-team findings for a decision.
     */
    async deleteFindingsForDecision(decisionId) {
        await RedTeamFinding_1.default.deleteMany({ decisionId });
    }
    /**
     * Create a single finding, returning the persisted document.
     */
    async createFinding(params) {
        const doc = new RedTeamFinding_1.default({
            decisionId: params.decisionId,
            executionId: params.executionId,
            taskId: params.taskId,
            severity: params.severity,
            type: params.type,
            description: params.description,
            relatedClaimIds: params.relatedClaimIds,
            relatedEvidenceIds: params.relatedEvidenceIds,
            suggestedAction: params.suggestedAction,
        });
        await doc.save();
        return doc;
    }
}
exports.RedTeamService = RedTeamService;
exports.redTeamService = new RedTeamService();
