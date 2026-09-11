/**
 * Phase 8 — Decision Memory & Outcomes.
 *
 * Shared types for the memory/outcome layer. The layer is an index and a
 * structured historical interpretation over existing Decision / Execution /
 * Claim / Evidence / Verification / Reconciliation documents — never a second
 * copy of the whole execution graph.
 *
 * Honesty rules encoded here:
 *   - unknown ≠ failure, partial ≠ success, missing measurement ≠ negative.
 *   - LLM-suggested lessons are `unconfirmed` until a human confirms them.
 *   - Retrieval returns structured signals only; no hidden chain-of-thought.
 */

// ---- Lifecycle ----

export type MemoryLifecycleStatus = 'active' | 'completed' | 'cancelled' | 'failed' | 'archived';

export type MemoryRecommendationSource = 'reconciliation' | 'debate' | 'courtroom' | 'none';

export type MemoryCreatedVia = 'completion' | 'cancellation' | 'on-demand';

// ---- Outcomes ----

export type OutcomeKind = 'expected' | 'actual';
export type OutcomeStatus = 'pending' | 'partial' | 'success' | 'failure' | 'unknown' | 'cancelled';
export type MetricDirection = 'increase' | 'decrease' | 'neutral' | 'unknown';
export type OutcomeSource = 'human' | 'system_observed';

export interface OutcomeMetric {
  name: string;
  unit?: string;
  baseline?: number;
  target?: number;
  actual?: number;
  direction: MetricDirection;
  source?: string;
  observedAt?: Date;
}

/** A metric pair comparison (expected target vs observed actual). */
export interface MetricComparison {
  metricName: string;
  unit?: string;
  baseline?: number;
  target?: number;
  actual?: number;
  direction: MetricDirection;
  /** Raw actual - target (kept even when meaningless). */
  variance?: number;
  /** Percentage-point variance (undefined when target is zero/absent). */
  variancePct?: number;
  /** Whether reality met the direction-aware expectation. */
  achieved?: boolean;
  /** False when either side of the comparison is missing. */
  meaningful: boolean;
  observedAt?: Date;
}

export interface ExpectedVsActualSummary {
  expected?: {
    outcomeId: string;
    status: OutcomeStatus;
    description?: string;
    observedAt?: Date;
  };
  actual?: {
    outcomeId: string;
    status: OutcomeStatus;
    description?: string;
    observedAt?: Date;
  };
  metricComparisons: MetricComparison[];
  /** True only when at least one metric comparison is meaningful. */
  qualityComputed: boolean;
}

export const OUTCOME_STATUS_ORDER: Record<OutcomeStatus, number> = {
  success: 0,
  partial: 1,
  pending: 2,
  unknown: 3,
  cancelled: 4,
  failure: 5,
};

// ---- Feedback ----

export type FeedbackStatus = 'accepted' | 'rejected' | 'modified' | 'unknown';

// ---- Lessons ----

export type LessonSource = 'human' | 'llm_suggestion';
export type LessonStatus = 'confirmed' | 'unconfirmed';

// ---- Retrieval ----

export interface MemoryRetrievalQuery {
  userId: string;
  /** The decision being planned/looked-up; excluded from results. */
  excludeDecisionId?: string;
  title?: string;
  objective?: string;
  description?: string;
  category?: string;
  domain?: string;
  problemType?: string;
  tags?: string[];
  entities?: string[];
  outputType?: OutcomeStatus;
  /** Filter to a specific lifecycle state (not implemented — reserved). */
  statuses?: MemoryLifecycleStatus[];
  timeRange?: { from?: Date; to?: Date };
}

export interface RetrievedMemory {
  memoryId: string;
  decisionId: string;
  title: string;
  objective: string;
  status: MemoryLifecycleStatus;
  category?: string;
  domain?: string;
  problemType?: string;
  tags: string[];
  entities: string[];
  finalRecommendation?: string;
  recommendationSource: MemoryRecommendationSource;
  /** 0..1 structured relevance. */
  relevance: number;
  /** Human-legible, structured reasons (no chain-of-thought). */
  relatedBecause: string[];
  outcome?: {
    status?: OutcomeStatus;
    humanConfirmed: boolean;
    source?: OutcomeSource;
    observedAt?: Date;
  };
  lessonCount: number;
  feedbackPresent: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const DEFAULT_RETRIEVABLE_STATUSES: MemoryLifecycleStatus[] = ['completed', 'cancelled', 'failed'];

export interface MemoryRetrievalResult {
  memories: RetrievedMemory[];
  totalMatches: number;
  truncated: boolean;
  policyVersion: string;
  provider: SimilarityProviderKind;
}

export const MEMORY_POLICY_VERSION = 'memory-policy-v1';

export interface MemoryPolicy {
  enabled: boolean;
  maxMemories: number;
  maxContextSize: number;
  minRelevance: number;
  defaultRetrievableStatuses: MemoryLifecycleStatus[];
}

export type SimilarityProviderKind = 'structured' | 'embedding';

export interface SimilarityProvider {
  readonly kind: SimilarityProviderKind;
  /** Structured/deterministic relevance in [0, 1]. */
  score(memory: RetrievedMemory, query: MemoryRetrievalQuery): number;
  /** Structured, human-readable reasons for a match. */
  explain(memory: RetrievedMemory, query: MemoryRetrievalQuery): string[];
}

// ---- Planner context ----

export interface MemoryContextEntry {
  sourceDecisionId: string;
  sourceMemoryId?: string;
  title: string;
  status: MemoryLifecycleStatus;
  outcomeStatus?: OutcomeStatus;
  humanConfirmed: boolean;
  finalRecommendation?: string;
  category?: string;
  domain?: string;
  problemType?: string;
  tags: string[];
  relevance: number;
  relatedBecause: string[];
  updatedAt?: Date;
}

export interface MemoryContext {
  enabled: boolean;
  memories: MemoryContextEntry[];
  /** Delimited, untrusted reference text for the planner. */
  contextText: string;
  contextSize: number;
  truncated: boolean;
  retrieval: {
    provider: SimilarityProviderKind;
    maxMemories: number;
    maxContextSize: number;
    minimumRelevance: number;
    totalMatches: number;
    policyVersion: string;
  };
}

// ---- Decision quality signals (data foundation for Phase 9) ----

export interface DecisionQualitySignals {
  recommendationAccepted?: boolean;
  outcomeAchieved?: boolean;
  expectedVsActualComputed: boolean;
  outcomeConfirmed: boolean;
  hasHumanFeedback: boolean;
  evidenceCompleteness: {
    hasEvidence: boolean;
    hasClaims: boolean;
    hasVerifications: boolean;
    hasReconciliation: boolean;
    verificationStatusPresent: boolean;
  };
  recommendationKnown: boolean;
}