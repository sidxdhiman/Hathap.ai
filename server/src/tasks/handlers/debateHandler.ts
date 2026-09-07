import {
  TaskHandler,
  TaskHandlerContext,
  TaskHandlerResult,
} from '../../decision/types';

/**
 * Debate handler — executes a debate through the existing (proven) DebateEngine
 * and the configured strategy (Consensus / Majority Vote / Devil's Advocate /
 * Judge / Open Debate). It does NOT rewrite the debate logic; it establishes the
 * execution boundary so a Debate task can be scheduled and recovered like any
 * other task. The strategy may internally perform multiple agent calls for now;
 * that is intentional and acceptable.
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
        messages: result.messages,
        verdict: result.verdict,
      },
    };
  },
};
