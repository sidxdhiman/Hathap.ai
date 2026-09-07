import {
  TaskHandler,
  TaskHandlerContext,
  TaskHandlerResult,
} from '../../decision/types';
import { researchService } from '../../research/researchService';
import { ResearchError } from '../../research/researchError';
import { ResearchPurpose } from '../../research/types';

/**
 * Research task handler — the task boundary for the research source pipeline.
 *
 * The handler is intentionally thin: it validates the structured input, calls
 * the ResearchService (which owns provider resolution, dedup, evidence and
 * claim persistence), and returns a summary output. Task lifecycle, retries,
 * idempotency and recovery all come from the existing Phase 2 machinery
 * (TaskExecutor claims the task, decides retry vs fail via buildTaskError).
 */
export const researchHandler: TaskHandler = {
  type: 'research',
  canHandle(type) {
    return type === 'research';
  },
  async execute(task, context: TaskHandlerContext): Promise<TaskHandlerResult> {
    const query = typeof task.input?.query === 'string' ? task.input.query.trim() : '';
    if (!query) {
      throw new ResearchError('INVALID_QUERY', 'Research task input requires a non-empty "query".');
    }
    const purpose = (task.input?.purpose as ResearchPurpose) || 'background';
    const maxResults = typeof task.input?.maxResults === 'number' ? task.input.maxResults : undefined;

    const outcome = await researchService.runResearch(
      {
        decisionId: context.decisionId,
        executionId: context.executionId,
        taskId: context.taskId,
        userId: context.userId,
      },
      { query, purpose, maxResults }
    );

    // Phase 3 research is provider-based, not model-based: no LLM call happens
    // here. If query generation / relevance ranking / summarization ever use an
    // LLM, that usage MUST flow through context.onUsage so the executor records
    // it in the Execution token/cost accounting.

    return {
      output: {
        query,
        purpose,
        provider: outcome.provider,
        resultCount: outcome.resultCount,
        empty: outcome.empty,
        durationMs: outcome.durationMs,
        evidenceIds: outcome.evidenceIds,
        claimIds: outcome.claimIds,
        reusedEvidenceIds: outcome.reusedEvidenceIds,
        providerUsage: outcome.providerUsage,
      },
    };
  },
};