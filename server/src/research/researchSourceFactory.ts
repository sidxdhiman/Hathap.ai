import { ResearchSource } from './types';
import { ResearchError } from './researchError';
import { MockResearchSource } from './mockResearchSource';
import { DuckDuckGoResearchSource } from './duckDuckGoResearchSource';

/**
 * Research source factory — resolves the configured provider.
 *
 * Configuration is server-side only (environment variables), never exposed to
 * the client:
 *   HATHAP_RESEARCH_PROVIDER=mock|duckduckgo   (default: mock)
 *
 * The default is the deterministic mock provider. It is NOT real web research;
 * the single warning below makes that explicit whenever the mock is resolved.
 * Production research requires configuring a real provider (e.g. duckduckgo).
 *
 * The factory is a small seam so future providers (Brave, SerpAPI, Tavily, …)
 * can be added without touching the research service or task engine.
 */

let warnedMock = false;
let cached: ResearchSource | null = null;

function configuredProvider(override?: string): string {
  return (override || process.env.HATHAP_RESEARCH_PROVIDER || 'mock').toLowerCase().trim();
}

function warnOnceMock(): void {
  if (warnedMock) return;
  warnedMock = true;
  console.warn(
    '[Research] WARNING: using the deterministic mock research provider (synthetic data). ' +
      'This is NOT real web research. Configure HATHAP_RESEARCH_PROVIDER=duckduckgo (or a future provider) for production research.'
  );
}

export function createResearchSource(overrides: {
  provider?: string;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
} = {}): ResearchSource {
  const provider = configuredProvider(overrides.provider);

  switch (provider) {
    case 'duckduckgo':
      return new DuckDuckGoResearchSource({ timeoutMs: overrides.timeoutMs, fetchFn: overrides.fetchFn });
    case 'mock':
      warnOnceMock();
      return new MockResearchSource();
    default:
      throw new ResearchError(
        'INVALID_CONFIGURATION',
        `Unsupported research provider "${provider}". Supported: mock, duckduckgo.`
      );
  }
}

/** Registry-style memoized instance used by the research service. */
export function getResearchSource(provider?: string): ResearchSource {
  if (cached && configuredProvider(provider) === cached.name) return cached;
  cached = createResearchSource({ provider });
  return cached;
}

/** Test-only: clear the memoized provider so tests can swap providers. */
export function resetResearchSource(): void {
  cached = null;
  warnedMock = false;
}