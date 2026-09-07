import {
  TaskHandler,
  TaskHandlerContext,
  TaskHandlerResult,
} from '../../decision/types';

/**
 * Synthesis handler — establishes the execution boundary for a "synthesis"
 * phase that consolidates prior work into a final decision/verdict.
 *
 * For Phase 2 it reuses the existing DebateEngine (which internally synthesizes
 * a verdict from the debate). The default Decision graph uses a single `debate`
 * task; this handler is available for tailored graphs that separate synthesis
 * from debate.
 */
export const synthesisHandler: TaskHandler = {
  type: 'synthesis',
  canHandle(type) {
    return type === 'synthesis';
  },
  async execute(task, context: TaskHandlerContext): Promise<TaskHandlerResult> {
    const { debateEngine } = await import('../../engine/debateEngine');
    const Decision = (await import('../../models/Decision')).default;

    const decision = await Decision.findById(context.decisionId);
    if (!decision) {
      throw new Error('Decision not found for synthesis task.');
    }

    const strategy =
      (task.input?.strategy as string) || decision.configuration?.strategy || 'consensus';

    const result = await debateEngine.executeForDecision({
      decisionId: context.decisionId,
      userId: context.userId,
      strategy,
      participants: decision.participants,
      objective: decision.objective,
      onUsage: context.onUsage,
    });

    return {
      output: {
        strategy,
        verdict: result.verdict,
        messages: result.messages,
      },
    };
  },
};
