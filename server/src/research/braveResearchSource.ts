import { ResearchOptions, ResearchResult, ResearchSource } from './types';
import { ResearchError } from './researchError';
import { clampContent, RESEARCH_LIMITS } from './limits';

const BRAVE_HOST = 'api.search.brave.com';
const BRAVE_PATH = '/res/v1/web/search';
const BRAVE_PROVIDER_TIMEOUT = RESEARCH_LIMITS.providerTimeoutMs;

/**
 * Real web-search provider — Brave Search API.
 *
 * Security:
 *   - Talks to ONE fixed, HTTPS host (api.search.brave.com). Never fetches
 *     arbitrary URLs returned in search results — no server-side URL fetcher /
 *     SSRF surface.
 *   - API key is server-side only (env BRAVE_SEARCH_API_KEY or injected for
 *     tests). Never sent to the client.
 *   - Result content is treated as untrusted downstream (never as
 *     instructions), and is clamped to the existing limits.
 *   - Result count is bounded by RESEARCH_LIMITS.
 *
 * Failures map to ResearchError codes for the existing retry system:
 *   401/403 -> AUTHENTICATION_FAILURE | 429 -> RATE_LIMITED (Retry-After)
 *   400/422 -> INVALID_QUERY | 5xx -> PROVIDER_UNAVAILABLE | abort -> TIMEOUT
 */
export class BraveResearchSource implements ResearchSource {
  readonly name = 'brave';
  readonly startedAt: string;

  constructor(
    private options: {
      apiKey?: string;
      timeoutMs?: number;
      fetchFn?: typeof fetch;
      now?: () => Date;
    } = {}
  ) {
    this.startedAt = (this.options.now ? this.options.now() : new Date()).toISOString();
  }

  async search(query: string, options?: ResearchOptions): Promise<ResearchResult[]> {
    const q = (query || '').trim();
    if (!q) throw new ResearchError('INVALID_QUERY', 'Research query must not be empty.');

    const apiKey = this.options.apiKey || process.env.BRAVE_SEARCH_API_KEY;
    if (!apiKey) {
      throw new ResearchError(
        'INVALID_CONFIGURATION',
        'Brave provider requires a BRAVE_SEARCH_API_KEY. Set it in server/.env.'
      );
    }

    const timeoutMs = options?.timeoutMs || this.options.timeoutMs || RESEARCH_LIMITS.providerTimeoutMs;
    const now = this.options.now ? this.options.now() : new Date();
    const startedAt = now.getTime();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const fetchFn = this.options.fetchFn || fetch;

    const maxResults = Math.max(
      1,
      Math.min(
        Math.floor(options?.maxResults || RESEARCH_LIMITS.defaultMaxResults),
        RESEARCH_LIMITS.maxResultsPerQuery
      )
    );

    const url = new URL(`https://${BRAVE_HOST}${BRAVE_PATH}`);
    url.searchParams.set('q', q);
    url.searchParams.set('count', String(maxResults));
    url.searchParams.set('search_lang', 'en');
    url.searchParams.set('safe_search', 'moderate');
    url.searchParams.set('text_decorations', 'false');
    url.searchParams.set('extra_snippets', 'true');

    let response: Response;
    try {
      response = await fetchFn(url.toString(), {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          'X-Subscription-Token': apiKey,
          'Set-Cookie': 'fbn=1; SameSite=None; Secure',
        },
      });
    } catch (err: any) {
      const aborted = controller.signal.aborted || /abort/i.test(err?.name || '');
      clearTimeout(timer);
      if (aborted) {
        throw new ResearchError('TIMEOUT', `Research provider timed out after ${timeoutMs}ms.`);
      }
      throw new ResearchError(
        'PROVIDER_UNAVAILABLE',
        `Research provider unreachable: ${err?.message || 'network failure'}.`
      );
    }
    clearTimeout(timer);

    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      const seconds = retryAfter ? parseInt(retryAfter, 10) : NaN;
      throw new ResearchError(
        'RATE_LIMITED',
        'Research provider rate limited the request.',
        seconds > 0 ? seconds * 1000 : undefined
      );
    }
    if (response.status === 401 || response.status === 403) {
      throw new ResearchError(
        'AUTHENTICATION_FAILURE',
        'Brave rejected the API key. Check BRAVE_SEARCH_API_KEY in server/.env.'
      );
    }
    if (response.status === 400 || response.status === 422) {
      throw new ResearchError('INVALID_QUERY', `Brave rejected the query (HTTP ${response.status}).`);
    }
    if (!response.ok) {
      throw new ResearchError(
        'PROVIDER_UNAVAILABLE',
        `Brave returned an unexpected status (HTTP ${response.status}).`
      );
    }

    let payload: any;
    try {
      payload = await response.json();
    } catch {
      throw new ResearchError('CONTENT_FETCH_FAILURE', 'Brave returned unreadable content.');
    }

    const webResults: any[] = Array.isArray(payload?.web?.results) ? payload.web.results : [];

    if (webResults.length === 0) {
      console.log(`[Research] brave returned 0 results for "${q}" in ${Date.now() - startedAt}ms`);
      return [];
    }

    const results: ResearchResult[] = [];
    for (const r of webResults) {
      const title = clampContent(String(r.title || '').trim(), 300);
      if (!title) continue;

      const rawUrl = typeof r.url === 'string' ? r.url.trim() : '';
      if (!rawUrl || !/^https?:\/\//i.test(rawUrl)) continue;

      const description = String(r.description || '').trim();
      const snippets: string[] = Array.isArray(r.extra_snippets) ? r.extra_snippets : [];
      const contentBody = [description, ...snippets]
        .filter((s) => typeof s === 'string' && s.trim())
        .join('\n\n');

      const sourceName = typeof r.profile?.name === 'string'
        ? r.profile.name.trim()
        : this.hostname(rawUrl);

      const publishedAt = this.parseDate(r.page_age || r.age);

      const rawScheme = /^https?:\/\//i.test(rawUrl) ? new URL(rawUrl) : null;
      if (!rawScheme) continue;

      results.push({
        title,
        url: rawUrl,
        sourceName: sourceName || 'Brave Search',
        snippet: clampContent(description, RESEARCH_LIMITS.maxSnippetLength),
        content: clampContent(contentBody, RESEARCH_LIMITS.maxContentPerResult),
        publishedAt,
        retrievedAt: now,
        metadata: {
          provider: 'brave',
          kind: 'web',
          extraSnippets: snippets.length,
          sourceEngine: 'brave-api',
          mock: false,
        },
      });
    }

    return results.slice(0, maxResults);
  }

  private hostname(u: string): string {
    try { return new URL(u).hostname; } catch { return ''; }
  }

  private parseDate(value: string | undefined): Date | undefined {
    if (!value) return undefined;
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d : undefined;
  }
}
