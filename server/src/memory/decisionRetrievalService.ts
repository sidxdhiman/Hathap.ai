import DecisionMemory, { IDecisionMemory } from '../models/DecisionMemory';
import Outcome from '../models/Outcome';
import DecisionLesson from '../models/DecisionLesson';
import DecisionFeedback from '../models/DecisionFeedback';
import { FilterQuery } from 'mongoose';
import mongoose from 'mongoose';
import { executionEventBus } from '../decision/eventBus';
import {
  DEFAULT_RETRIEVABLE_STATUSES,
  MemoryPolicy,
  MemoryRetrievalQuery,
  MemoryRetrievalResult,
  OutcomeSource,
  OutcomeStatus,
  RetrievedMemory,
} from './types';
import { makeMemoryPolicy, MEMORY_POLICY_VERSION } from '../memory/memoryPolicy';
import { structuredSimilarityProvider } from '../memory/similarityService';

const CANDIDATE_SCAN_LIMIT = 300;

export interface MemoryRetrievalOptions {
  policy?: MemoryPolicy;
  emitEvent?: boolean;
}

/**
 * Phase 8 — DecisionRetrievalService.
 *
 * Bounded, ownership-scoped retrieval of historical decisions:
 *   - never returns another user's data (every query filters by userId);
 *   - capped by policy (max results, min relevance);
 *   - deterministic ordering + tie-breaking;
 *   - explainable (structured signals, no chain-of-thought);
 *   - outcome/confirmation metadata surfaced so consumers can judge reliability.
 */
export class DecisionRetrievalService {
  async retrieve(
    query: MemoryRetrievalQuery,
    options: MemoryRetrievalOptions = {}
  ): Promise<MemoryRetrievalResult> {
    const policy = makeMemoryPolicy(options.policy);
    if (!policy.enabled) {
      return {
        memories: [],
        totalMatches: 0,
        truncated: false,
        policyVersion: MEMORY_POLICY_VERSION,
        provider: structuredSimilarityProvider.kind,
      };
    }

    const statuses = query.statuses?.length
      ? query.statuses
      : DEFAULT_RETRIEVABLE_STATUSES;

    const base: FilterQuery<IDecisionMemory> = {
      userId: query.userId,
      status: { $in: statuses },
    };
    if (query.excludeDecisionId) base.decisionId = { $ne: query.excludeDecisionId as any };

    const structuredClauses: FilterQuery<IDecisionMemory>[] = [];
    if (query.category) structuredClauses.push({ category: query.category });
    if (query.domain) structuredClauses.push({ domain: query.domain });
    if (query.problemType) structuredClauses.push({ problemType: query.problemType });
    if (query.tags?.length) structuredClauses.push({ tags: { $in: query.tags } });
    if (query.entities?.length) structuredClauses.push({ entities: { $in: query.entities } });
    if (structuredClauses.length) base.$or = structuredClauses;

    const candidates = await DecisionMemory.find(base)
      .sort({ createdAt: -1 })
      .limit(CANDIDATE_SCAN_LIMIT);

    if (candidates.length === 0) {
      return {
        memories: [],
        totalMatches: 0,
        truncated: false,
        policyVersion: MEMORY_POLICY_VERSION,
        provider: structuredSimilarityProvider.kind,
      };
    }

    const enriched = await this.enrich(candidates, query);

    let scored = enriched.map((memory) => ({
      memory,
      relevance: structuredSimilarityProvider.score(memory, query),
    }));

    scored = scored.filter((s) => s.relevance >= policy.minRelevance);

    if (query.outputType) {
      scored = scored.filter(
        (s) => s.memory.outcome?.status === query.outputType
      );
    }

    scored.sort((a, b) => {
      if (b.relevance !== a.relevance) return b.relevance - a.relevance;
      const aTime = new Date(a.memory.updatedAt || a.memory.createdAt).getTime();
      const bTime = new Date(b.memory.updatedAt || b.memory.createdAt).getTime();
      if (bTime !== aTime) return bTime - aTime;
      return String(a.memory.decisionId).localeCompare(String(b.memory.decisionId));
    });

    const totalMatches = scored.length;
    const memories = scored.slice(0, policy.maxMemories).map((s) => {
      const result = { ...s.memory, relevance: s.relevance };
      result.relatedBecause = structuredSimilarityProvider.explain(s.memory, query);
      return result;
    });

    if (options.emitEvent !== false) {
      executionEventBus.emit({
        type: 'memory.retrieved',
        decisionId: query.excludeDecisionId,
        data: {
          count: memories.length,
          totalMatches,
          provider: structuredSimilarityProvider.kind,
          memoryIds: memories.map((m) => m.memoryId),
        },
      });
    }

    return {
      memories,
      totalMatches,
      truncated: totalMatches > policy.maxMemories,
      policyVersion: MEMORY_POLICY_VERSION,
      provider: structuredSimilarityProvider.kind,
    };
  }

  private async enrich(
    candidates: IDecisionMemory[],
    query: MemoryRetrievalQuery
  ): Promise<RetrievedMemory[]> {
    const decisionIds = candidates.map((c) => String(c.decisionId));
    const objectIds = decisionIds.map((id) => new mongoose.Types.ObjectId(id));

    const [outcomes, lessonRows, feedbackRows] = await Promise.all([
      Outcome.find({
        userId: query.userId,
        decisionId: { $in: decisionIds },
        kind: 'actual',
      }).sort({ createdAt: 1 }),
      DecisionLesson.aggregate([
        { $match: { userId: new mongoose.Types.ObjectId(query.userId), decisionId: { $in: objectIds } } },
        { $group: { _id: '$decisionId', count: { $sum: 1 } } },
      ]),
      DecisionFeedback.find({ userId: query.userId, decisionId: { $in: decisionIds } }),
    ]);

    const latestActual = new Map<string, { status?: OutcomeStatus; source?: OutcomeSource; observedAt?: Date }>();
    for (const o of outcomes) {
      latestActual.set(String(o.decisionId), {
        status: o.status,
        source: o.source,
        observedAt: o.observedAt,
      });
    }
    const lessonCounts = new Map<string, number>();
    for (const row of lessonRows) lessonCounts.set(String(row._id), row.count);
    const hasFeedback = new Set(feedbackRows.map((f) => String(f.decisionId)));

    return candidates.map((c): RetrievedMemory => {
      const decisionId = String(c.decisionId);
      const outcome = latestActual.get(decisionId);
      return {
        memoryId: c._id.toString(),
        decisionId,
        title: c.title,
        objective: c.objective,
        status: c.status,
        category: c.category,
        domain: c.domain,
        problemType: c.problemType,
        tags: c.tags || [],
        entities: c.entities || [],
        finalRecommendation: c.finalRecommendation,
        recommendationSource: c.recommendationSource,
        relevance: 0,
        relatedBecause: [],
        outcome: {
          status: outcome?.status,
          humanConfirmed: outcome?.source === 'human',
          source: outcome?.source,
          observedAt: outcome?.observedAt,
        },
        lessonCount: lessonCounts.get(decisionId) || 0,
        feedbackPresent: hasFeedback.has(decisionId),
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      };
    });
  }
}

export const decisionRetrievalService = new DecisionRetrievalService();

export type { OutcomeStatus, MemoryRetrievalQuery, RetrievedMemory };