import EvidenceRelationship, { IEvidenceRelationship } from '../models/EvidenceRelationship';
import { EvidenceRelationshipType, EvidenceRelationshipSource } from '../decision/types';
import { ClaimType } from '../decision/types';
import Claim from '../models/Claim';

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
export class EvidenceGraphService {
  /**
   * Create or update an evidence relationship. Idempotent: updating the same
   * claimId+evidenceId combination updates the existing record rather than
   * creating duplicates.
   */
  async upsertRelationship(params: {
    claimId: string;
    evidenceId: string;
    relationship: EvidenceRelationshipType;
    source: EvidenceRelationshipSource;
    strength?: number;
    rationale?: string;
    decisionId?: string;
    executionId?: string;
    taskId?: string;
  }): Promise<IEvidenceRelationship> {
    const {
      claimId,
      evidenceId,
      relationship,
      source,
      strength,
      rationale,
      decisionId,
      executionId,
      taskId,
    } = params;

    // Atomic upsert so concurrent seeders (e.g. parallel verify_claim tasks)
    // can never both pass the check-then-insert gap and collide on the unique
    // compound index { decisionId, claimId, evidenceId }.
    const update: Record<string, unknown> = {
      relationship,
      source,
    };
    if (strength !== undefined) update.strength = strength;
    if (rationale !== undefined) update.rationale = rationale;
    if (decisionId !== undefined) update.decisionId = decisionId;
    if (executionId !== undefined) update.executionId = executionId;
    if (taskId !== undefined) update.taskId = taskId;

    return EvidenceRelationship.findOneAndUpdate(
      { claimId, evidenceId },
      { $set: update },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ) as unknown as Promise<IEvidenceRelationship>;
  }

  /**
   * Get all relationships for a given claim, categorized by type.
   */
  async getRelationshipsForClaim(
    claimId: string
  ): Promise<{
    supports: IEvidenceRelationship[];
    contradicts: IEvidenceRelationship[];
    related: IEvidenceRelationship[];
  }> {
    const relationships = await EvidenceRelationship.find({ claimId });
    return {
      supports: relationships.filter((r) => r.relationship === 'supports'),
      contradicts: relationships.filter((r) => r.relationship === 'contradicts'),
      related: relationships.filter((r) => r.relationship === 'related'),
    };
  }

  /**
   * Get all relationships for a given evidence, categorized by type.
   */
  async getRelationshipsForEvidence(
    evidenceId: string
  ): Promise<{
    supports: IEvidenceRelationship[];
    contradicts: IEvidenceRelationship[];
    related: IEvidenceRelationship[];
  }> {
    const relationships = await EvidenceRelationship.find({ evidenceId });
    return {
      supports: relationships.filter((r) => r.relationship === 'supports'),
      contradicts: relationships.filter((r) => r.relationship === 'contradicts'),
      related: relationships.filter((r) => r.relationship === 'related'),
    };
  }

  /**
   * Get all relationships for a decision.
   */
  async getRelationshipsForDecision(
    decisionId: string
  ): Promise<IEvidenceRelationship[]> {
    return EvidenceRelationship.find({ decisionId }).sort({ createdAt: 1 });
  }

  /**
   * Delete all relationships for a given decision.
   */
  async deleteRelationshipsForDecision(decisionId: string): Promise<void> {
    await EvidenceRelationship.deleteMany({ decisionId });
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
  async seedFromExistingClaims(
    decisionId: string,
    executionId?: string
  ): Promise<{ created: number; skipped: number }> {
    const claims = await Claim.find({ decisionId });
    let created = 0;
    let skipped = 0;

    for (const claim of claims) {
      const supporting = claim.supportingEvidenceIds || [];
      const contradicting = claim.contradictingEvidenceIds || [];
      const allEvidence = claim.evidenceIds || [];

      const relatedIds = allEvidence.filter(
        (id) => !supporting.includes(id) && !contradicting.includes(id)
      );

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

export const evidenceGraphService = new EvidenceGraphService();
