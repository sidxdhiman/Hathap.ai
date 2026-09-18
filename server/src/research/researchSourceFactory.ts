import { ResearchSource } from './types';
import { MockResearchSource } from './mockResearchSource';
import { DuckDuckGoResearchSource } from './duckDuckGoResearchSource';
import { BraveResearchSource } from './braveResearchSource';
import { resolveResearchProvider, ResearchProviderName } from './researchConfig';

/**
 * Research source factory — resolves the configured provider and caches the
 * singleton for the research service seam.
 *
 * Resolution (via researchConfig.resolveResearchProvider):
 *   HATHAP_RESEARCH_PROVIDER=brave   -> Brave Research Provider (real web search)
 *   HATHAP_RESEARCH_PROVIDER=mock    -> Deterministic mock (dev/test only)
 *   HATHAP_RESEARCH_PROVIDER=duckduckgo -> Legacy key-less DDG provider
 *   (unset)                          -> auto: Brave if key present, else mock
 *
 * The default is auto. Mock is NEVER presented as real research — it is
 * clearly surfaced via /api/research/status and evidence metadata.
 *
 * The factory is a small seam so new providers can be added without touching
 * the research service or task engine.
 */

let cached: ResearchSource | null = null;
let cachedProvider: string | null = null;

export function createResearchSource(overrides: {
  provider?: string;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
  apiKey?: string;
} = {}): ResearchSource {
  const resolved = resolveResearchProvider(overrides.provider);
  const provider = resolved.provider;

  switch (provider) {
    case 'mock':
      warnMockOnce(resolved.reason);
      return new MockResearchSource();
    case 'duckduckgo':
      return new DuckDuckGoResearchSource({
        timeoutMs: overrides.timeoutMs,
        fetchFn: overrides.fetchFn,
      });
    case 'brave':
      return new BraveResearchSource({
        apiKey: overrides.apiKey,
        timeoutMs: overrides.timeoutMs,
        fetchFn: overrides.fetchFn,
      });
  }
}

/**
 * Registry-style memoized instance used by the research service. When no
 * provider override is given, caches the auto-resolved provider until
 * resetResearchSource() is called (tests or explicit env swap).
 */
export function getResearchSource(provider?: string): ResearchSource {
  const resolved = resolveResearchProvider(provider);
  const name: string = resolved.provider;
  if (cached && cachedProvider === name) return cached;
  cached = createResearchSource({ provider: provider || undefined });
  cachedProvider = name;
  return cached;
}

/** Test-only: clear the memoized provider so tests can swap providers. */
export function resetResearchSource(): void {
  cached = null;
  cachedProvider = null;
}

let warnedMock = false;
function warnMockOnce(reason: string): void {
  if (warnedMock) return;
  warnedMock = true;
  console.warn(
    `[Research] ${reason}. The mock is NOT real web research. ` +
      'Add BRAVE_SEARCH_API_KEY to server/.env for real web research.'
  );
}

/** Re-export for tests that need to reset warning state. */
export function resetMockWarning(): void {
  warnedMock = false;
}
