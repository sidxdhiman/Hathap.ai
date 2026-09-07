import {
  TaskHandler,
  TaskHandlerContext,
  TaskHandlerResult,
} from '../../decision/types';
import { researchService } from '../../research/researchService';
import { persistClaimsFromMessages } from '../../decision/claimPersistence';

/**
 * Debate handler — executes a debate through the existing (proven) DebateEngine
 * and the configured strategy (Consensus / Majority Vote / Devil's Advocate /
 * Judge / Open Debate). It does NOT rewrite the debate logic; it establishes the
 * execution boundary so a Debate task can be scheduled and recovered like any
 * other task. The strategy may internally perform multiple agent calls for now;
 * that is intentional and acceptable.
 *
 * Phase 3: when the decision has research evidence, a bounded, provenance-tagged
 * evidence bundle is passed to the engine (injected as untrusted data in agent
 * prompts) and claims produced by the debate are persisted with that bundle's
 * evidence IDs (coarse attribution, always `proposed`).
 */
export const debateHandler: TaskHandler = {
  type: 'debate',
  canHandle(type) {
    return type === 'debate';
  },
  async execute(task, context: TaskHandlerContext): Promise<TaskHandlerResult> {
    const { debateEngine } = await import('../../engine/debateEngine');
    const Decision = (await import('../../models/Decision')).default;

    const decision = await Decision.findById(context.decisionId);
    if (!decision) {
      throw new Error('Decision not found for debate task.');
    }

    const strategy =
      (task.input?.strategy as string) || decision.configuration?.strategy || 'consensus';

    const evidence = await researchService.getEvidenceViews(context.decisionId);

    const result = await debateEngine.executeForDecision({
      decisionId: context.decisionId,
      userId: context.userId,
      strategy,
      participants: decision.participants,
      objective: decision.objective,
      onUsage: context.onUsage,
      evidence,
    });

    const claimIds = await persistClaimsFromMessages({
      decisionId: context.decisionId,
      messages: result.messages,
      executionId: context.executionId,
      taskId: context.taskId,
      evidenceIds: evidence.map((e) => e.id),
    });

    return {
      output: {
        strategy,
        messages: result.messages,
        verdict: result.verdict,
        evidenceCount: evidence.length,
        claimIds: claimIds.map((c) => c._id.toString()),
      },
    };
  },
};