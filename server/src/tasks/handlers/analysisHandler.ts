import {
  TaskHandler,
  TaskHandlerContext,
  TaskHandlerResult,
} from '../../decision/types';

/**
 * Analysis handler — establishes the execution boundary for an "analysis" phase.
 *
 * For Phase 2 this intentionally reuses the existing DebateEngine to produce an
 * initial round of agent analyses. It exists so that a later phase can replace
 * the coarse single-round behaviour with finer-grained per-agent analysis tasks
 * without touching the scheduler/executor. The default Decision graph uses a
 * single `debate` task, so this handler is primarily for alternative graphs.
 */
export const analysisHandler: TaskHandler = {
  type: 'analysis',
  canHandle(type) {
    return type === 'analysis';
  },
  async execute(task, context: TaskHandlerContext): Promise<TaskHandlerResult> {
    const { debateEngine } = await import('../../engine/debateEngine');
    const Decision = (await import('../../models/Decision')).default;

    const decision = await Decision.findById(context.decisionId);
    if (!decision) {
      throw new Error('Decision not found for analysis task.');
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
      },
    };
  },
};
