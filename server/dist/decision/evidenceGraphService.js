"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.evidenceGraphService = exports.EvidenceGraphService = void 0;
const EvidenceRelationship_1 = __importDefault(require("../models/EvidenceRelationship"));
const Claim_1 = __importDefault(require("../models/Claim"));
/**
 * EvidenceGraphService — manages explicit Claim ↔ Evidence relationships.
 *
 * Phase 3 used coarse `claim.evidenceIds[]` attribution. Phase 4 introduces
 * explicit, queryable relationships with distinct semantics:
 *   - supports: Evidence materially supports the claim
 *   - contradicts: Evidence materially conflicts with the claim
 *   - related: Evidence is relevant but neither clearly supports nor contradicts
 *
 * A key invariant: NOT(supports) ≠ contradicts. Lack of support is NOT contradiction.
 *
 * All relationship writes are idempotent — duplicate relationships are
 * prevented by the unique compound index { decisionId, claimId, evidenceId }.
 */
class EvidenceGraphService {
    /**
     * Create or update an evidence relationship. Idempotent: updating the same
     * claimId+evidenceId combination updates the existing record rather than
     * creating duplicates.
     */
    async upsertRelationship(params) {
        const { claimId, evidenceId, relationship, source, strength, rationale, decisionId, executionId, taskId, } = params;
        // Atomic upsert so concurrent seeders (e.g. parallel verify_claim tasks)
        // can never both pass the check-then-insert gap and collide on the unique
        // compound index { decisionId, claimId, evidenceId }.
        const update = {
            relationship,
            source,
        };
        if (strength !== undefined)
            update.strength = strength;
        if (rationale !== undefined)
            update.rationale = rationale;
        if (decisionId !== undefined)
            update.decisionId = decisionId;
        if (executionId !== undefined)
            update.executionId = executionId;
        if (taskId !== undefined)
            update.taskId = taskId;
        return EvidenceRelationship_1.default.findOneAndUpdate({ claimId, evidenceId }, { $set: update }, { upsert: true, new: true, setDefaultsOnInsert: true });
    }
    /**
     * Get all relationships for a given claim, categorized by type.
     */
    async getRelationshipsForClaim(claimId) {
        const relationships = await EvidenceRelationship_1.default.find({ claimId });
        return {
            supports: relationships.filter((r) => r.relationship === 'supports'),
            contradicts: relationships.filter((r) => r.relationship === 'contradicts'),
            related: relationships.filter((r) => r.relationship === 'related'),
        };
    }
    /**
     * Get all relationships for a given evidence, categorized by type.
     */
    async getRelationshipsForEvidence(evidenceId) {
        const relationships = await EvidenceRelationship_1.default.find({ evidenceId });
        return {
            supports: relationships.filter((r) => r.relationship === 'supports'),
            contradicts: relationships.filter((r) => r.relationship === 'contradicts'),
            related: relationships.filter((r) => r.relationship === 'related'),
        };
    }
    /**
     * Get all relationships for a decision.
     */
    async getRelationshipsForDecision(decisionId) {
        return EvidenceRelationship_1.default.find({ decisionId }).sort({ createdAt: 1 });
    }
    /**
     * Delete all relationships for a given decision.
     */
    async deleteRelationshipsForDecision(decisionId) {
        await EvidenceRelationship_1.default.deleteMany({ decisionId });
    }
    /**
     * Seed explicit relationships from the existing coarse claim.evidenceIds.
     * This bridges Phase 3 data into the Phase 4 evidence graph.
     *
     * For each claim with evidenceIds:
     *   - The existing supportingEvidenceIds → supports relationship
     *   - The existing contradictingEvidenceIds → contradicts relationship
     *   - Any evidenceIds not in supporting or contradicting → related
     */
    async seedFromExistingClaims(decisionId, executionId) {
        const claims = await Claim_1.default.find({ decisionId });
        let created = 0;
        let skipped = 0;
        for (const claim of claims) {
            const supporting = claim.supportingEvidenceIds || [];
            const contradicting = claim.contradictingEvidenceIds || [];
            const allEvidence = claim.evidenceIds || [];
            const relatedIds = allEvidence.filter((id) => !supporting.includes(id) && !contradicting.includes(id));
            for (const evidenceId of supporting) {
                await this.upsertRelationship({
                    claimId: claim._id.toString(),
                    evidenceId,
                    relationship: 'supports',
                    source: 'research',
                    strength: 0.7,
                    rationale: 'Initial coarse attribution from research/debate.',
                    decisionId,
                    executionId,
                });
                created++;
            }
            for (const evidenceId of contradicting) {
                await this.upsertRelationship({
                    claimId: claim._id.toString(),
                    evidenceId,
                    relationship: 'contradicts',
                    source: 'research',
                    strength: 0.6,
                    rationale: 'Initial contradictory attribution from research/debate.',
                    decisionId,
                    executionId,
                });
                created++;
            }
            for (const evidenceId of relatedIds) {
                await this.upsertRelationship({
                    claimId: claim._id.toString(),
                    evidenceId,
                    relationship: 'related',
                    source: 'research',
                    rationale: 'Initial coarse attribution (unclassified).',
                    decisionId,
                    executionId,
                });
                created++;
            }
            if (!claim.evidenceIds?.length) {
                skipped++;
            }
        }
        return { created, skipped };
    }
}
exports.EvidenceGraphService = EvidenceGraphService;
exports.evidenceGraphService = new EvidenceGraphService();
