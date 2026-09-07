import { createHash } from 'crypto';

/**
 * Deterministic identity helpers for research evidence.
 *
 * Deduplication is scope = decision. Two results collapse to one Evidence
 * document when their identity keys match (same query + same normalized source)
 * or when the content hash matches (same source content discovered via a
 * different query). Unrelated content is never merged.
 */

const TRACKING_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid', 'mc_cid', 'mc_eid'];

export function sha1(value: string): string {
  return createHash('sha1').update(value).digest('hex');
}

/** Normalize a query for identity purposes (stable across retries/tasks). */
export function normalizeQueryForDedup(query: string): string {
  return query
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Deterministic URL normalization for identity purposes. Strips fragments and
 * tracking params, lowercases the host, strips trailing slashes. This is an
 * identity key, NOT a fetch target — never used to fetch.
 */
export function normalizeUrlForDedup(url: string): string {
  let u = (url || '').trim();
  if (!u) return '';
  if (!/^https?:\/\//i.test(u)) return u.toLowerCase().replace(/\s+/g, ' ').trim();
  try {
    const parsed = new URL(u);
    parsed.hash = '';
    if (parsed.protocol === 'http:') parsed.protocol = 'https:';
    for (const key of TRACKING_PARAMS) parsed.searchParams.delete(key);
    parsed.pathname = parsed.pathname.replace(/\/+$/, '');
    parsed.searchParams.sort();
    const cleaned = parsed.toString().replace(/\/+$/, '');
    return cleaned.toLowerCase();
  } catch {
    return u.toLowerCase().replace(/\s+/g, ' ').trim();
  }
}

/** Stable source key for a result: URL when present, else a title+content hash. */
export function sourceKeyForResult(result: { url?: string; title: string; content?: string; snippet?: string }): string {
  const urlKey = normalizeUrlForDedup(result.url || '');
  if (urlKey) return urlKey;
  const body = `${result.title || ''}|${result.content || result.snippet || ''}`;
  return `titlehash:${sha1(body)}`;
}

export function contentKeyForResult(result: { content?: string; snippet?: string; title?: string }): string {
  const body = `${result.title || ''}|${result.content || result.snippet || ''}`;
  return sha1(body);
}

/**
 * Deterministic evidence identity: decision scope + provider + query + source.
 * Re-running the same research task (retry/restart) regenerates the same key,
 * so evidence is persisted exactly once.
 */
export function evidenceDedupKey(params: {
  decisionId: string;
  provider: string;
  query: string;
  sourceKey: string;
}): string {
  return sha1(
    [`decision:${params.decisionId}`, `provider:${params.provider}`, `query:${normalizeQueryForDedup(params.query)}`, `source:${params.sourceKey}`].join('|')
  );
}