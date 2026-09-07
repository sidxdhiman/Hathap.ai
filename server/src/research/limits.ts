/**
 * Content limits for research. External web content is untrusted and unbounded;
 * these constants prevent a single source from consuming the model context or
 * generating unbounded evidence documents. An external page can never drive a
 * request larger than these ceilings.
 */
export const RESEARCH_LIMITS = {
  /** Maximum results kept per research query. */
  maxResultsPerQuery: 8 as number,
  /** Default max results when a task does not specify one. */
  defaultMaxResults: 5 as number,
  /** Maximum characters of content stored per evidence document. */
  maxContentPerResult: 2000 as number,
  /** Maximum characters of snippet stored per evidence document. */
  maxSnippetLength: 500 as number,
  /** Maximum total evidence content retained per research query. */
  maxTotalContentPerQuery: 12000 as number,
  /** Maximum evidence documents handed to agents for one debate task. */
  maxEvidenceForAgents: 8 as number,
  /** Maximum characters of evidence excerpt passed to an agent. */
  maxExcerptForAgents: 1500 as number,
  /** Provider request timeout in milliseconds. */
  providerTimeoutMs: 10000 as number,
  /** Default retrieval trust heuristic for research evidence. */
  heuristicSourceReliability: 'medium' as const,
} as const;

export function clampContent(value: string | undefined | null, max: number): string {
  if (!value) return '';
  const trimmed = value.trim();
  return trimmed.length > max ? `${trimmed.slice(0, Math.max(0, max - 1))}…` : trimmed;
}

export function excerpt(value: string | undefined | null, max = 280): string {
  return clampContent(value, max);
}