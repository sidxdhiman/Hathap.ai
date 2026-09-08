import {
  TaskHandler,
  TaskHandlerContext,
  TaskHandlerResult,
} from '../../decision/types';
import { verificationService } from '../../decision/verificationService';
import Claim from '../../models/Claim';
import { evidenceGraphService } from '../../decision/evidenceGraphService';

/**
 * Verify claim handler — the task boundary for evidence-based claim verification.
 *
 * This handler receives a structured claim + evidence and runs the
 * deterministic verification pipeline. It does NOT ask an LLM "is this true?"
 * — it evaluates the existing evidence relationships and produces an auditable
 * verification result.
 *
 * Lifecycle: pending → ready → running → completed (or failed)
 * Retryable: provider outages, network failures (via error classifier)
 * Non-retryable: missing claim, invalid input
 *
 * Idempotency: retrying a verify_claim task updates the existing
 * VerificationResult record (findOneAndUpdate with upsert on claimId+taskId).
 */
export const verifyClaimHandler: TaskHandler = {
  type: 'verify_claim',
  canHandle(type) {
    return type === 'verify_claim';
  },

  async execute(task, context: TaskHandlerContext): Promise<TaskHandlerResult> {
    // Validate input
    const claimId = task.input?.claimId as string;
    const claimStatement = task.input?.claimStatement as string;
    const evidenceIds = Array.isArray(task.input?.evidenceIds)
      ? (task.input.evidenceIds as string[])
      : [];

    if (!claimId || typeof claimId !== 'string') {
      throw new Error('verify_claim task input requires a valid claimId.');
    }

    if (!claimStatement || typeof claimStatement !== 'string') {
      throw new Error('verify_claim task input requires a claimStatement.');
    }

    // Load the claim to verify it exists and belongs to this decision
    const claim = await Claim.findOne({ _id: claimId, decisionId: context.decisionId });
    if (!claim) {
      throw new Error(
        `Claim ${claimId} not found for decision ${context.decisionId}.`
      );
    }

    // Validate that all provided evidenceIds actually exist in this decision
    if (evidenceIds.length > 0) {
      const Evidence = (await import('../../models/Evidence')).default;
      const validDocs = await Evidence.find({
        _id: { $in: evidenceIds },
        decisionId: context.decisionId,
      }).select('_id');
      const validIds = new Set(validDocs.map((d) => d._id.toString()));
      if (validIds.size === 0) {
        throw new Error(
          `No valid evidence found for verification of claim ${claimId}.`
        );
      }
    }

    // Seed the evidence graph from existing coarse attribution if needed
    const existingRels = await evidenceGraphService.getRelationshipsForClaim(claimId);
    const hasExplicitRels =
      existingRels.supports.length > 0 ||
      existingRels.contradicts.length > 0 ||
      existingRels.related.length > 0;

    if (!hasExplicitRels && claim.evidenceIds && claim.evidenceIds.length > 0) {
      await evidenceGraphService.seedFromExistingClaims(
        context.decisionId,
        context.executionId
      );
    }

    // Run the deterministic verification
    const result = await verificationService.verifyClaim({
      claimId,
      claimStatement: claimStatement || claim.text,
      evidenceIds: evidenceIds.length > 0 ? evidenceIds : (claim.evidenceIds || []),
      decisionId: context.decisionId,
      executionId: context.executionId,
      taskId: context.taskId,
      verificationMode: (task.input?.verificationMode as any) || 'evidence',
    });

    return {
      output: {
        claimId,
        status: result.status,
        supportingEvidenceIds: result.supportingEvidenceIds,
        contradictingEvidenceIds: result.contradictingEvidenceIds,
        relatedEvidenceIds: result.relatedEvidenceIds,
        rationale: result.rationale,
        confidence: result.confidence,
        mode: result.mode,
        verificationResultId: result._id.toString(),
      },
    };
  },
};
