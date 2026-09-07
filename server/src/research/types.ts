/**
 * Research engine types.
 *
 * Layering (matches DECISION_ARCHITECTURE.md Phase 3):
 *   ResearchSource        — provider abstraction (WHAT to query)
 *   ResearchService       — orchestration: run, dedup, persist Evidence/Claims
 *   ResearchTaskHandler   — thin task boundary used by TaskExecutor
 *   TaskExecutor/Scheduler — existing Phase 2 machinery
 */

export type ResearchPurpose =
  | 'background'
  | 'fact_check'
  | 'market_research'
  | 'technical_research'
  | 'competitive_research'
  | 'custom';

/** How the evidence relates to reality. NOT a confidence score. */
export type EvidenceProvenanceKind = 'observed' | 'retrieved' | 'inferred';

/** Coarse, explicitly-heuristic source quality label. Never implies "verified". */
export type SourceReliability = 'low' | 'medium' | 'high';

export interface ResearchOptions {
  maxResults?: number;
  timeoutMs?: number;
  /** Provider override, e.g. per-task research with an alternate provider. */
  provider?: string;
}

/** A single structured search result returned by a ResearchSource. */
export interface ResearchResult {
  title: string;
  url?: string;
  snippet?: string;
  content?: string;
  sourceName?: string;
  publishedAt?: Date;
  retrievedAt: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Research source abstraction. A provider implements this interface; the task
 * engine only ever depends on this interface, so new providers can be added
 * without touching the scheduler/executor.
 */
export interface ResearchSource {
  readonly name: string;
  search(query: string, options?: ResearchOptions): Promise<ResearchResult[]>;
}

export interface ResearchQuery {
  query: string;
  purpose?: ResearchPurpose;
  maxResults?: number;
}

/** Bounded view of evidence handed to agents (untrusted source material). */
export interface EvidenceView {
  id: string;
  title: string;
  sourceName?: string;
  sourceUrl?: string;
  snippet?: string;
  content?: string;
  publishedAt?: Date | string;
  retrievedAt: Date | string;
  relevanceScore?: number;
  sourceReliability?: SourceReliability;
  provenanceKind?: EvidenceProvenanceKind;
  query?: string;
}

export interface ProviderUsageRecord {
  provider: string;
  calls: number;
  durationMs?: number;
  metadata?: Record<string, unknown>;
}

/** Result of running one research query through the ResearchService. */
export interface ResearchOutcome {
  query: string;
  purpose: ResearchPurpose;
  provider: string;
  resultCount: number;
  empty: boolean;
  durationMs: number;
  evidenceIds: string[];
  claimIds: string[];
  reusedEvidenceIds: string[];
  providerUsage: ProviderUsageRecord;
}

/** Identity + provenance for a persisted evidence document. */
export interface ResearchEvidenceInput {
  decisionId: string;
  executionId?: string;
  taskId?: string;
  result: ResearchResult;
  provider: string;
  query: string;
  relevanceScore?: number;
  sourceReliability?: SourceReliability;
  freshnessInDays?: number;
  dedupKey: string;
  contentKey: string;
}