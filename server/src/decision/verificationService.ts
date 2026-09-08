import VerificationResult, { IVerificationResult } from '../models/VerificationResult';
import Evidence, { IEvidence } from '../models/Evidence';
import { evidenceGraphService } from './evidenceGraphService';
import { VerificationMode } from './types';

/**
 * VerificationService — structured verification pipeline for claims.
 *
 * The verifier does NOT ask "Is this claim true?" (that would be another
 * LLM opinion). Instead it evaluates the existing evidence relationships
 * and produces a deterministic, auditable verification.
 *
 * Steps:
 *   1. Load the claim and its evidence relationships.
 *   2. Separate evidence into: supports / contradicts / related.
 *   3. Evaluate whether the available evidence is sufficient.
 *   4. Determine the verification status.
 *   5. Persist and return the VerificationResult.
 */
export class VerificationService {
  /**
   * Verify a single claim against its evidence graph.
   *
   * This is the deterministic pipeline. An LLM may be used later for
   * semantic comparison — currently that is deferred to the `llm` mode.
   */
  async verifyClaim(params: {
    claimId: string;
    claimStatement: string;
    evidenceIds: string[];
    decisionId?: string;
    executionId?: string;
    taskId?: string;
    verificationMode?: VerificationMode;
  }): Promise<IVerificationResult> {
    const { claimId, claimStatement, evidenceIds, decisionId, executionId, taskId } = params;

    // Step 1: Load evidence relationships for this claim
    const relationships = await evidenceGraphService.getRelationshipsForClaim(claimId);

    // Also gather evidence not yet linked but provided
    const allLinkedEvidenceIds = new Set([
      ...relationships.supports.map((r) => r.evidenceId),
      ...relationships.contradicts.map((r) => r.evidenceId),
      ...relationships.related.map((r) => r.evidenceId),
    ]);

    const additionalEvidenceIds = evidenceIds.filter((id) => !allLinkedEvidenceIds.has(id));

    // Step 2: Load actual evidence documents
    const allEvidenceIds = [...allLinkedEvidenceIds, ...additionalEvidenceIds];
    const evidenceDocs = allEvidenceIds.length > 0
      ? await Evidence.find({ _id: { $in: allEvidenceIds } })
      : [];

    const evidenceDocMap = new Map<string, IEvidence>();
    for (const doc of evidenceDocs) {
      evidenceDocMap.set(doc._id.toString(), doc);
    }

    // Separate evidence by relationship type
    const supportingEvidenceIds: string[] = [];
    const contradictingEvidenceIds: string[] = [];
    const relatedEvidenceIds: string[] = [];

    // Evidence with explicit relationships
    for (const r of relationships.supports) {
      if (evidenceDocMap.has(r.evidenceId)) {
        supportingEvidenceIds.push(r.evidenceId);
      }
    }
    for (const r of relationships.contradicts) {
      if (evidenceDocMap.has(r.evidenceId)) {
        contradictingEvidenceIds.push(r.evidenceId);
      }
    }
    for (const r of relationships.related) {
      if (evidenceDocMap.has(r.evidenceId)) {
        relatedEvidenceIds.push(r.evidenceId);
      }
    }

    // Evidence without explicit relationships but provided as input
    for (const id of additionalEvidenceIds) {
      if (!relatedEvidenceIds.includes(id) && evidenceDocMap.has(id)) {
        relatedEvidenceIds.push(id);
      }
    }

    // Step 3: Evaluate evidence sufficiency
    const status = this.evaluateVerificationStatus({
      supporting: supportingEvidenceIds.length,
      contradicting: contradictingEvidenceIds.length,
      related: relatedEvidenceIds.length,
    });

    // Step 4: Build rationale
    const rationale = this.buildRationale({
      claimStatement,
      status,
      supportingCount: supportingEvidenceIds.length,
      contradictingCount: contradictingEvidenceIds.length,
      relatedCount: relatedEvidenceIds.length,
      totalEvidence: allEvidenceIds.length,
    });

    // Step 5: Persist the verification result
    const result = await VerificationResult.findOneAndUpdate(
      { claimId, taskId },
      {
        claimId,
        claimStatement,
        status,
        supportingEvidenceIds,
        contradictingEvidenceIds,
        relatedEvidenceIds,
        rationale,
        mode: params.verificationMode || 'evidence',
        decisionId,
        executionId,
        taskId,
        confidence: this.estimateConfidence({
          supporting: supportingEvidenceIds.length,
          contradicting: contradictingEvidenceIds.length,
        }),
      },
      { upsert: true, new: true }
    );

    return result;
  }

  /**
   * Load all verification results for a decision.
   */
  async getVerificationsForDecision(decisionId: string): Promise<IVerificationResult[]> {
    return VerificationResult.find({ decisionId }).sort({ createdAt: 1 });
  }

  /**
   * Load verification result for a specific claim.
   */
  async getVerificationForClaim(claimId: string): Promise<IVerificationResult | null> {
    return VerificationResult.findOne({ claimId });
  }

  /**
   * Delete all verification results for a decision.
   */
  async deleteVerificationsForDecision(decisionId: string): Promise<void> {
    await VerificationResult.deleteMany({ decisionId });
  }

  /**
   * Deterministic verification status evaluation.
   *
   * Rules:
   *   - contradicted: Any contradicting evidence
   *   - supported: Only supporting evidence (no contradictions), with at least 1
   *   - unsupported: No evidence at all (no supporting, no contradicting, no related)
   *   - inconclusive: Mixed or only related evidence
   *
   * This is deliberately simple. No LLM call. No complex reasoning.
   * The evidence relationships are the source of truth.
   */
  private evaluateVerificationStatus(params: {
    supporting: number;
    contradicting: number;
    related: number;
  }): IVerificationResult['status'] {
    const { supporting, contradicting, related } = params;

    // Any contradicting evidence makes the status contradicted
    if (contradicting > 0) {
      return 'contradicted';
    }

    // Only supporting evidence (no contradictions)
    if (supporting > 0) {
      return 'supported';
    }

    // No evidence at all
    if (related === 0) {
      return 'unsupported';
    }

    // Only related evidence (no clear support or contradiction)
    return 'inconclusive';
  }

  /**
   * Build an auditable rationale string.
   */
  private buildRationale(params: {
    claimStatement: string;
    status: IVerificationResult['status'];
    supportingCount: number;
    contradictingCount: number;
    relatedCount: number;
    totalEvidence: number;
  }): string {
    const { status, supportingCount, contradictingCount, relatedCount, totalEvidence } = params;

    switch (status) {
      case 'supported':
        return `${supportingCount} supporting evidence item(s) found with no contradictory evidence. The claim appears to be supported by available evidence.`;
      case 'contradicted':
        return `${contradictingCount} contradicting evidence item(s) found. The claim is contradicted by available evidence despite ${supportingCount} supporting item(s).`;
      case 'unsupported':
        return 'No evidence found to support or contradict this claim. The claim lacks evidential grounding.';
      case 'inconclusive':
        return `${relatedCount} related evidence item(s) found, but none clearly supports or contradicts the claim. The claim remains inconclusive.`;
    }
  }

  /**
   * Estimate a confidence heuristic. NOT statistically meaningful.
   * Documented as a heuristic for future confidence calculation.
   */
  private estimateConfidence(params: {
    supporting: number;
    contradicting: number;
  }): number {
    const { supporting, contradicting } = params;
    const total = supporting + contradicting;
    if (total === 0) return 0;
    return supporting / total;
  }
}

export const verificationService = new VerificationService();
