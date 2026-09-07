import Evidence, { IEvidence } from '../models/Evidence';
import Claim from '../models/Claim';
import { executionEventBus } from '../decision/eventBus';
import {
  ProviderUsageRecord,
  ResearchOutcome,
  ResearchQuery,
  ResearchResult,
  ResearchSource,
  SourceReliability,
  EvidenceView,
} from './types';
import { getResearchSource } from './researchSourceFactory';
import { ResearchError } from './researchError';
import { RESEARCH_LIMITS, clampContent, excerpt } from './limits';
import {
  contentKeyForResult,
  evidenceDedupKey,
  normalizeQueryForDedup,
  sourceKeyForResult,
} from './dedup';

export interface ResearchRunContext {
  decisionId: string;
  executionId?: string;
  taskId?: string;
  userId?: string;
}

/**
 * Deterministic, honest relevance heuristic. Not a model — a documented heuristic:
 *   0.90 all query tokens appear in the title
 *   0.75 the first query token appears in the title
 *   0.60 any query token appears in title/snippet/content
 *   0.50 otherwise
 */
export function heuristicRelevance(query: string, result: ResearchResult): number {
  const tokens = normalizeQueryForDedup(query)
    .split(' ')
    .map((t) => t.replace(/[^a-z0-9]/g, ''))
    .filter((t) => t.length > 2);
  if (tokens.length === 0) return 0.6;

  const title = (result.title || '').toLowerCase();
  const body = `${title} ${result.snippet || ''} ${result.content || ''}`.toLowerCase();

  if (tokens.every((t) => title.includes(t))) return 0.9;
  if (title.includes(tokens[0])) return 0.75;
  if (tokens.some((t) => body.includes(t))) return 0.6;
  return 0.5;
}

/**
 * ResearchService — the orchestrator between a ResearchSource and the evidence
 * layer. It runs ONE query end-to-end:
 *
 *   provider.search(query)
 *     -> normalize + clamp (content limits)
 *     -> dedup against existing Evidence (decision-scoped, deterministic)
 *     -> persist Evidence with provenance + quality metadata
 *     -> deterministic attribution claims linked to each new evidence
 *     -> structured observability log + events
 *
 * It contains NO task logic (TaskExecutor/handlers own that) and NO provider
 * logic (ResearchSource owns that).
 */
export class ResearchService {
  private sourceFactory: () => ResearchSource;

  constructor(sourceFactory: () => ResearchSource = () => getResearchSource()) {
    this.sourceFactory = sourceFactory;
  }

  async runResearch(ctx: ResearchRunContext, q: ResearchQuery): Promise<ResearchOutcome> {
    const query = (q.query || '').trim();
    if (!query) {
      throw new ResearchError('INVALID_QUERY', 'Research task input requires a non-empty query.');
    }
    const purpose = q.purpose || 'background';
    const maxResults = clampMaxResults(q.maxResults);
    const startedAt = Date.now();
    const providerUsage: ProviderUsageRecord = { provider: '', calls: 0 };

    let source: ResearchSource;
    try {
      source = this.sourceFactory();
    } catch (err: any) {
      throw new ResearchError('INVALID_CONFIGURATION', `Research provider unavailable: ${err?.message || err}`);
    }
    providerUsage.provider = source.name;
    providerUsage.calls = 1;

    let results: ResearchResult[];
    try {
      results = await source.search(query, {
        maxResults,
        timeoutMs: RESEARCH_LIMITS.providerTimeoutMs,
      });
    } catch (err: any) {
      const durationMs = Date.now() - startedAt;
      this.log({ ctx, query, provider: source.name, resultCount: 0, durationMs, status: 'failed', failureCode: err?.researchCode || err?.code });
      throw err;
    }

    const durationMs = Date.now() - startedAt;
    providerUsage.durationMs = durationMs;

    if (results.length === 0) {
      this.log({ ctx, query, provider: source.name, resultCount: 0, durationMs, status: 'empty' });
      executionEventBus.emit({
        type: 'research.completed',
        decisionId: ctx.decisionId,
        executionId: ctx.executionId,
        taskId: ctx.taskId,
        data: { query, provider: source.name, resultCount: 0, empty: true, durationMs },
      });
      return {
        query,
        purpose,
        provider: source.name,
        resultCount: 0,
        empty: true,
        durationMs,
        evidenceIds: [],
        claimIds: [],
        reusedEvidenceIds: [],
        providerUsage,
      };
    }

    // Clamp per-result content and cap total retained content for this query.
    let totalContent = 0;
    const kept: ResearchResult[] = [];
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const content = clampContent(r.content, RESEARCH_LIMITS.maxContentPerResult);
      if (i >= maxResults) break;
      totalContent += content.length;
      if (totalContent > RESEARCH_LIMITS.maxTotalContentPerQuery) break;
      kept.push({ ...r, content });
    }

    const evidenceIds: string[] = [];
    const reusedEvidenceIds: string[] = [];
    const claimIds: string[] = [];

    for (const r of kept) {
      const sourceKey = sourceKeyForResult(r);
      const dedupKey = evidenceDedupKey({
        decisionId: ctx.decisionId,
        provider: source.name,
        query,
        sourceKey,
      });
      const contentKey = contentKeyForResult(r);

      // Dedup: same decision + same (query+source) identity, or same content
      // hash (discovered via another query). Never merge unrelated content.
      const existing =
        (await Evidence.findOne({ decisionId: ctx.decisionId, contentKey }).select('_id')) ||
        (await Evidence.findOne({ decisionId: ctx.decisionId, dedupKey }).select('_id'));
      if (existing) {
        reusedEvidenceIds.push(existing._id.toString());
        continue;
      }

      const relevanceScore = heuristicRelevance(query, r);
      const sourceReliability = this.reliabilityFor(r);
      const freshnessInDays = r.publishedAt
        ? Math.max(0, Math.round((Date.now() - r.publishedAt.getTime()) / 86400000))
        : undefined;

      const evidence = await Evidence.create({
        decisionId: ctx.decisionId,
        executionId: ctx.executionId,
        taskId: ctx.taskId,
        type: 'research',
        title: clampContent(r.title, 300),
        content: clampContent(r.content || r.snippet || '', RESEARCH_LIMITS.maxContentPerResult),
        snippet: clampContent(r.snippet || '', RESEARCH_LIMITS.maxSnippetLength),
        source: r.sourceName,
        sourceName: r.sourceName,
        sourceUrl: r.url,
        sourceType: 'web',
        sourceReliability,
        relevanceScore,
        freshnessInDays,
        provenanceKind: 'retrieved',
        provider: source.name,
        query,
        publishedAt: r.publishedAt,
        retrievedAt: r.retrievedAt,
        dedupKey,
        contentKey,
        metadata: { ...(r.metadata || {}), research: { provider: source.name, query, purpose } },
      });
      evidenceIds.push(evidence._id.toString());

      executionEventBus.emit({
        type: 'evidence.created',
        decisionId: ctx.decisionId,
        executionId: ctx.executionId,
        taskId: ctx.taskId,
        data: { evidenceId: evidence._id.toString(), query, provider: source.name },
      });

      const claim = await this.createAttributionClaim(ctx, evidence, { query, purpose, provider: source.name, relevanceScore });
      if (claim) claimIds.push(claim._id.toString());
    }

    this.log({ ctx, query, provider: source.name, resultCount: kept.length, durationMs, status: 'success', evidenceCount: evidenceIds.length, reusedCount: reusedEvidenceIds.length });

    executionEventBus.emit({
      type: 'research.completed',
      decisionId: ctx.decisionId,
      executionId: ctx.executionId,
      taskId: ctx.taskId,
      data: { query, provider: source.name, resultCount: kept.length, empty: false, durationMs, evidenceIds },
    });

    return {
      query,
      purpose,
      provider: source.name,
      resultCount: kept.length,
      empty: false,
      durationMs,
      evidenceIds,
      claimIds,
      reusedEvidenceIds,
      providerUsage,
    };
  }

  /**
   * Deterministic attribution claim: "this source asserts X". The claim states
   * what a retrieved source SAYS, attributed to that source — it never asserts
   * world-truth, and it is stored as `proposed` (unverified). Contradiction
   * detection is left to later phases (LLM review / red-team).
   */
  private async createAttributionClaim(
    ctx: ResearchRunContext,
    evidence: IEvidence,
    meta: { query: string; purpose: string; provider: string; relevanceScore: number }
  ): Promise<{ _id: { toString(): string } } | null> {
    const sourceLabel = evidence.sourceName || evidence.title || 'source';
    const urlLabel = evidence.sourceUrl ? ` (${evidence.sourceUrl})` : '';
    const quote = excerpt(evidence.snippet || evidence.content, 280);
    const text = `Source "${sourceLabel}"${urlLabel} asserts: "${quote}"`;

    const doc = await Claim.create({
      decisionId: ctx.decisionId,
      executionId: ctx.executionId,
      taskId: ctx.taskId,
      text,
      type: 'fact',
      status: 'proposed',
      evidenceIds: [evidence._id.toString()],
      supportingEvidenceIds: [evidence._id.toString()],
      contradictingEvidenceIds: [],
      provenanceKind: 'retrieved',
      attribution: {
        sourceName: evidence.sourceName,
        sourceUrl: evidence.sourceUrl,
        sourceReliability: evidence.sourceReliability,
      },
      metadata: {
        extraction: 'research-attribution',
        attribution: 'unverified source material',
        query: meta.query,
        purpose: meta.purpose,
        provider: meta.provider,
        relevanceScore: meta.relevanceScore,
      },
    });
    executionEventBus.emit({
      type: 'claim.created',
      decisionId: ctx.decisionId,
      executionId: ctx.executionId,
      taskId: ctx.taskId,
      data: { claimId: doc._id.toString(), evidenceId: evidence._id.toString() },
    });
    return { _id: doc._id };
  }

  /**
   * Load bounded, provenance-tagged evidence for a decision to hand to agents.
   * Research evidence is sorted by the documented relevance heuristic first
   * (never by raw content size). Order is deterministic.
   */
  async getEvidenceViews(
    decisionId: string,
    opts: { maxResults?: number } = {}
  ): Promise<EvidenceView[]> {
    const max = Math.max(1, Math.min(opts.maxResults || RESEARCH_LIMITS.maxEvidenceForAgents, 20));
    const docs = await Evidence.find({ decisionId })
      .sort({ relevanceScore: -1, retrievedAt: -1 })
      .limit(max);
    return docs.map(
      (d): EvidenceView => ({
        id: d._id.toString(),
        title: d.title,
        sourceName: d.sourceName || d.source,
        sourceUrl: d.sourceUrl,
        snippet: d.snippet || excerpt(d.content, 500),
        publishedAt: d.publishedAt || d.retrievedAt,
        retrievedAt: d.retrievedAt,
        relevanceScore: d.relevanceScore,
        sourceReliability: d.sourceReliability,
        provenanceKind: d.provenanceKind,
        query: d.query,
      })
    );
  }

  private reliabilityFor(result: ResearchResult): SourceReliability {
    // Only the provider (our code, not the fetched page) may influence this
    // label. Phase 3 providers do not set one, so research evidence gets the
    // documented coarse heuristic label — never "verified".
    const provided = result.metadata?.sourceReliability;
    if (provided === 'high' || provided === 'low') return provided;
    return RESEARCH_LIMITS.heuristicSourceReliability;
  }

  private log(params: {
    ctx: ResearchRunContext;
    query: string;
    provider: string;
    resultCount: number;
    durationMs: number;
    status: 'success' | 'empty' | 'failed';
    failureCode?: string;
    evidenceCount?: number;
    reusedCount?: number;
  }): void {
    console.log(
      `[Research] status=${params.status} provider=${params.provider} decisionId=${params.ctx.decisionId}` +
        ` executionId=${params.ctx.executionId || '-'} taskId=${params.ctx.taskId || '-'}` +
        ` results=${params.resultCount} evidence=${params.evidenceCount || 0} reused=${params.reusedCount || 0}` +
        ` durationMs=${params.durationMs} failure=${params.failureCode || '-'} query="${params.query.slice(0, 120)}"`
    );
  }
}

function clampMaxResults(value: number | undefined): number {
  if (!value) return RESEARCH_LIMITS.defaultMaxResults;
  return Math.max(1, Math.min(Math.floor(value), RESEARCH_LIMITS.maxResultsPerQuery));
}

export const researchService = new ResearchService();