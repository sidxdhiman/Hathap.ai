"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DuckDuckGoResearchSource = void 0;
const researchError_1 = require("./researchError");
const limits_1 = require("./limits");
/**
 * Real, key-less research provider — DuckDuckGo Instant Answer API.
 *
 * Security considerations:
 *   - This provider talks to ONE fixed, HTTPS host (`api.duckduckgo.com`). It
 *     never fetches arbitrary URLs returned by search results, so it does not
 *     introduce a server-side URL fetcher / SSRF surface.
 *   - `no_redirect=1` asks DDG not to send redirect targets; retrieved content
 *     is treated as untrusted data downstream (never as instructions).
 *   - No API key is required; server-side only, never exposed to the client.
 *
 * Failures are thrown as ResearchError with a code the shared error classifier
 * maps onto the existing task retry semantics:
 *   - 401/403 -> AUTHENTICATION_FAILURE (non-retryable)
 *   - 429    -> RATE_LIMITED (retryable, respects Retry-After)
 *   - 5xx    -> PROVIDER_UNAVAILABLE (retryable)
 *   - timeouts / network -> TIMEOUT / PROVIDER_UNAVAILABLE (retryable)
 */
const DDG_ENDPOINT = 'https://api.duckduckgo.com/';
const MAX_TEXT = 2000;
class DuckDuckGoResearchSource {
    constructor(options = {}) {
        this.options = options;
        this.name = 'duckduckgo';
    }
    async search(query, options) {
        const q = (query || '').trim();
        if (!q)
            throw new researchError_1.ResearchError('INVALID_QUERY', 'Research query must not be empty.');
        const timeoutMs = options?.timeoutMs || this.options.timeoutMs || 10000;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        const startedAt = Date.now();
        const fetchFn = this.options.fetchFn || fetch;
        const url = new URL(DDG_ENDPOINT);
        url.searchParams.set('q', q);
        url.searchParams.set('format', 'json');
        url.searchParams.set('no_html', '1');
        url.searchParams.set('no_redirect', '1');
        url.searchParams.set('skip_disambig', '1');
        let response;
        try {
            response = await fetchFn(url.toString(), {
                headers: { Accept: 'application/json', 'User-Agent': 'Hathap.AI/0.1' },
                signal: controller.signal,
            });
        }
        catch (err) {
            const aborted = controller.signal.aborted || /abort/i.test(err?.name || '');
            if (aborted) {
                throw new researchError_1.ResearchError('TIMEOUT', `Research provider timed out after ${timeoutMs}ms.`);
            }
            throw new researchError_1.ResearchError('PROVIDER_UNAVAILABLE', `Research provider unreachable: ${err?.message || 'network failure'}.`);
        }
        finally {
            clearTimeout(timer);
        }
        if (response.status === 429) {
            const retryAfter = response.headers.get('Retry-After');
            const seconds = retryAfter ? parseInt(retryAfter, 10) : NaN;
            throw new researchError_1.ResearchError('RATE_LIMITED', 'Research provider rate limited the request.', seconds > 0 ? seconds * 1000 : undefined);
        }
        if (response.status === 401 || response.status === 403) {
            throw new researchError_1.ResearchError('AUTHENTICATION_FAILURE', 'Research provider rejected authentication.');
        }
        if (response.status === 400) {
            throw new researchError_1.ResearchError('INVALID_QUERY', `Research provider rejected the query (HTTP 400).`);
        }
        if (!response.ok) {
            throw new researchError_1.ResearchError('PROVIDER_UNAVAILABLE', `Research provider failed (HTTP ${response.status}).`);
        }
        let payload;
        try {
            payload = await response.json();
        }
        catch {
            throw new researchError_1.ResearchError('CONTENT_FETCH_FAILURE', 'Research provider returned unreadable content.');
        }
        const now = this.options.now ? this.options.now() : new Date();
        const results = [];
        // Abstract (Instant Answer) — highest-value single result.
        const abstractText = `${payload.AbstractText || ''}`.trim();
        if (abstractText) {
            results.push({
                title: (0, limits_1.clampContent)(payload.Heading || q, 200),
                url: payload.AbstractURL ? `${payload.AbstractURL}` : undefined,
                sourceName: payload.AbstractSource || 'DuckDuckGo Instant Answer',
                snippet: (0, limits_1.clampContent)(abstractText, 500),
                content: (0, limits_1.clampContent)(abstractText, MAX_TEXT),
                publishedAt: undefined,
                retrievedAt: now,
                metadata: { provider: this.name, kind: 'instant-answer' },
            });
        }
        // RelatedTopics — bounded, only entries with both text and URL survive.
        const related = Array.isArray(payload.RelatedTopics) ? payload.RelatedTopics : [];
        let relatedCount = 0;
        const maxRelated = Math.max((options?.maxResults || 5) - results.length, 0);
        const walk = (node) => {
            if (relatedCount >= maxRelated)
                return;
            if (node.Text) {
                const entry = { text: node.Text, url: node.FirstURL, sourceName: node.Source };
                relatedCount += 1;
                results.push({
                    title: (0, limits_1.clampContent)(String(node.Text).split(' - ')?.[0] || q, 200),
                    url: entry.url ? `${entry.url}` : undefined,
                    sourceName: entry.sourceName || 'DuckDuckGo Related Topics',
                    snippet: (0, limits_1.clampContent)(String(node.Text), 500),
                    content: (0, limits_1.clampContent)(String(node.Text), MAX_TEXT),
                    publishedAt: undefined,
                    retrievedAt: now,
                    metadata: { provider: this.name, kind: 'related-topic' },
                });
            }
            if (Array.isArray(node.Topics)) {
                for (const sub of node.Topics)
                    walk(sub);
            }
        };
        for (const topic of related)
            walk(topic);
        if (results.length === 0) {
            // Not an error — the query simply had no retrievable results.
            console.log(`[Research] duckduckgo returned 0 results for "${q}" in ${Date.now() - startedAt}ms`);
            return [];
        }
        return results.slice(0, options?.maxResults || 5);
    }
}
exports.DuckDuckGoResearchSource = DuckDuckGoResearchSource;
