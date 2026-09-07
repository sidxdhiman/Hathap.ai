"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RESEARCH_LIMITS = void 0;
exports.clampContent = clampContent;
exports.excerpt = excerpt;
/**
 * Content limits for research. External web content is untrusted and unbounded;
 * these constants prevent a single source from consuming the model context or
 * generating unbounded evidence documents. An external page can never drive a
 * request larger than these ceilings.
 */
exports.RESEARCH_LIMITS = {
    /** Maximum results kept per research query. */
    maxResultsPerQuery: 8,
    /** Default max results when a task does not specify one. */
    defaultMaxResults: 5,
    /** Maximum characters of content stored per evidence document. */
    maxContentPerResult: 2000,
    /** Maximum characters of snippet stored per evidence document. */
    maxSnippetLength: 500,
    /** Maximum total evidence content retained per research query. */
    maxTotalContentPerQuery: 12000,
    /** Maximum evidence documents handed to agents for one debate task. */
    maxEvidenceForAgents: 8,
    /** Maximum characters of evidence excerpt passed to an agent. */
    maxExcerptForAgents: 1500,
    /** Provider request timeout in milliseconds. */
    providerTimeoutMs: 10000,
    /** Default retrieval trust heuristic for research evidence. */
    heuristicSourceReliability: 'medium',
};
function clampContent(value, max) {
    if (!value)
        return '';
    const trimmed = value.trim();
    return trimmed.length > max ? `${trimmed.slice(0, Math.max(0, max - 1))}…` : trimmed;
}
function excerpt(value, max = 280) {
    return clampContent(value, max);
}
