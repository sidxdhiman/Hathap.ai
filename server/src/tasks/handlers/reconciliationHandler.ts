import {
  TaskHandler,
  TaskHandlerContext,
  TaskHandlerResult,
} from '../../decision/types';
import { reconciliationService } from '../../decision/reconciliationService';
import Claim from '../../models/Claim';

/**
 * Reconciliation handler — the task boundary for merging verification and
 * red-team results into a final decision.
 *
 * The reconciliation stage determines:
 *   - which claims survived verification
 *   - which claims failed
 *   - which claims remain uncertain
 *   - which evidence conflicts
 *   - whether the recommendation should change
 *   - whether additional research is required
 *
 * Input: candidate recommendation + claimIds + verification task IDs
 * Output: structured reconciliation (persisted as ReconciliationResult)
 */
export const reconciliationHandler: TaskHandler = {
  type: 'reconciliation',
  canHandle(type) {
    return type === 'reconciliation';
  },

  async execute(task, context: TaskHandlerContext): Promise<TaskHandlerResult> {
    const candidateRecommendation = task.input?.candidateRecommendation as string;
    const claimIds = Array.isArray(task.input?.claimIds)
      ? (task.input.claimIds as string[])
      : [];
    const verifyClaimTaskIds = Array.isArray(task.input?.verifyClaimTaskIds)
      ? (task.input.verifyClaimTaskIds as string[])
      : [];
    const redTeamTaskId = task.input?.redTeamTaskId as string | undefined;

    if (!candidateRecommendation || typeof candidateRecommendation !== 'string') {
      throw new Error('reconciliation task input requires a candidateRecommendation string.');
    }

    // Validate claimIds belong to this decision
    if (claimIds.length > 0) {
      const validClaimCount = await Claim.countDocuments({
        _id: { $in: claimIds },
        decisionId: context.decisionId,
      });
      if (validClaimCount === 0) {
        throw new Error(
          `No valid claims found for reconciliation of decision ${context.decisionId}.`
        );
      }
    }

    // Run the reconciliation
    const result = await reconciliationService.runReconciliation({
      decisionId: context.decisionId,
      executionId: context.executionId,
      taskId: context.taskId,
      candidateRecommendation,
      claimIds,
      verifyClaimTaskIds,
      redTeamTaskId,
    });

    return {
      output: {
        decisionId: context.decisionId,
        recommendation: result.recommendation,
        survivingClaimIds: result.survivingClaimIds,
        rejectedClaimIds: result.rejectedClaimIds,
        uncertainClaimIds: result.uncertainClaimIds,
        unresolvedConflictIds: result.unresolvedConflictIds,
        redTeamFindingIds: result.redTeamFindingIds,
        needsMoreResearch: result.needsMoreResearch,
        researchQuestions: result.researchQuestions,
        rationale: result.rationale,
        reconciliationResultId: result._id.toString(),
      },
    };
  },
};
