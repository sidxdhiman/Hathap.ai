import { ResearchError } from './researchError';

/**
 * Research provider configuration — server-side only, never exposed to the
 * client.
 *
 * Resolution rules (documented in docs/PHASE11_ENGINEERING_REPORT.md):
 *   1. A per-call override wins (used by tests and the factory seam).
 *   2. `HATHAP_RESEARCH_PROVIDER` env var (brave | mock | duckduckgo | auto).
 *   3. Default `auto`:
 *        - if `BRAVE_SEARCH_API_KEY` is set  -> the Brave Search provider
 *          (real web research),
 *        - otherwise -> the deterministic mock provider, EXPLICITLY surfaced
 *          (logged warning + `mock: true` status endpoint + synthetic evidence
 *           metadata). The mock is never presented as real research.
 *   4. In `production`, an unset/invalid provider is a hard configuration error
 *      (INVALID_CONFIGURATION) — it never silently falls back to synthetic data.
 *
 * Display/metadata naming: 'brave' = Brave Search, 'mock' = Mock (synthetic),
 * 'duckduckgo' = DuckDuckGo (legacy key-less provider).
 */

export type ResearchProviderName = 'brave' | 'mock' | 'duckduckgo';

export interface ResearchEnv {
  nodeEnv: string;
  provider: string | undefined;
  braveApiKey: string | undefined;
}

export interface ResolvedResearchConfig {
  provider: ResearchProviderName;
  /** True when the provider performs real web research (Brave / DuckDuckGo). */
  real: boolean;
  /** True when the provider is the deterministic synthetic mock. */
  mock: boolean;
  /** Human-readable reason for the resolution (used by status + logs). */
  reason: string;
}

/** Safe, non-secret description of the current research provider status. */
export interface ResearchStatusInfo {
  /** Null when configuration is invalid/not-ready (never contains a secret). */
  provider: ResearchProviderName | null;
  real: boolean;
  mock: boolean;
  configured: boolean;
  mode: 'auto' | 'explicit';
  /** The env var that supplies the key for this provider (name only). */
  envHint: string | null;
  rationale: string;
}

export const BRAVE_API_KEY_ENV = 'BRAVE_SEARCH_API_KEY';

export function readResearchEnv(env: NodeJS.ProcessEnv = process.env): ResearchEnv {
  return {
    nodeEnv: (env.NODE_ENV || 'development').trim().toLowerCase(),
    provider: (env.HATHAP_RESEARCH_PROVIDER || '').trim().toLowerCase() || undefined,
    braveApiKey: (env[BRAVE_API_KEY_ENV] || '').trim() || undefined,
  };
}

function configError(provider: string, message: string): ResearchError {
  return new ResearchError(
    'INVALID_CONFIGURATION',
    `Research provider "${provider}" configuration failed: ${message}`
  );
}

/**
 * Resolve which research provider should serve tasks. Throws
 * ResearchError(INVALID_CONFIGURATION) when resolution is invalid — in
 * production that is an explicit misconfiguration, never a silent mock.
 */
export function resolveResearchProvider(
  override?: string,
  env: ResearchEnv = readResearchEnv()
): ResolvedResearchConfig {
  const requested = (override || env.provider || 'auto').trim().toLowerCase();

  switch (requested) {
    case 'brave':
      if (!env.braveApiKey) {
        throw configError(
          'brave',
          `the ${BRAVE_API_KEY_ENV} environment variable is not set. ` +
            'Add it (and HATHAP_RESEARCH_PROVIDER=brave) to server/.env to enable real web research.'
        );
      }
      return { provider: 'brave', real: true, mock: false, reason: 'explicit provider: brave' };
    case 'duckduckgo':
      return { provider: 'duckduckgo', real: true, mock: false, reason: 'explicit provider: duckduckgo (legacy key-less)' };
    case 'mock':
      return {
        provider: 'mock',
        real: false,
        mock: true,
        reason: 'explicit provider: mock — synthetic data for development/tests only',
      };
    case 'auto':
      if (env.braveApiKey) {
        return {
          provider: 'brave',
          real: true,
          mock: false,
          reason: `auto mode: ${BRAVE_API_KEY_ENV} is present`,
        };
      }
      if (env.nodeEnv === 'production') {
        throw configError(
          'auto',
          `no real web-search provider is configured. Set ${BRAVE_API_KEY_ENV} (optionally ` +
            'HATHAP_RESEARCH_PROVIDER=brave) in server/.env. The mock provider is never used in production.'
        );
      }
      return {
        provider: 'mock',
        real: false,
        mock: true,
        reason:
          `auto mode (dev/test): no ${BRAVE_API_KEY_ENV} configured, using the explicit synthetic mock. ` +
          `Set ${BRAVE_API_KEY_ENV} to enable real web research.`,
      };
    default:
      throw configError(
        requested,
        `unsupported provider "${requested}". Supported: brave, mock, duckduckgo, auto.`
      );
  }
}

/**
 * Non-throwing view of the provider status used by /api/research/status and the
 * demo endpoint. Never includes the API key — only env-var names.
 */
export function describeResearchStatus(env: ResearchEnv = readResearchEnv()): ResearchStatusInfo {
  let resolved: ResolvedResearchConfig;
  let configured = true;
  let rationale: string;
  try {
    resolved = resolveResearchProvider(undefined, env);
    rationale = resolved.reason;
  } catch (err: any) {
    configured = false;
    rationale = err?.message || 'Research provider is not configured.';
    return {
      provider: null,
      real: false,
      mock: false,
      configured,
      mode: env.provider ? 'explicit' : 'auto',
      envHint: env.provider === 'brave' ? BRAVE_API_KEY_ENV : BRAVE_API_KEY_ENV,
      rationale,
    };
  }
  return {
    provider: resolved.provider,
    real: resolved.real,
    mock: resolved.mock,
    configured,
    mode: env.provider ? 'explicit' : 'auto',
    envHint: resolved.provider === 'brave' ? BRAVE_API_KEY_ENV : null,
    rationale,
  };
}

/** Message describing exactly what to configure for real web research. */
export function researchSetupInstructions(): string {
  return (
    `Real web research requires an API key. Add these to server/.env and restart the server:\n` +
    `  HATHAP_RESEARCH_PROVIDER=brave\n` +
    `  ${BRAVE_API_KEY_ENV}=<your-key>\n` +
    `Get a key at https://brave.com/search/api/ (free tier available). ` +
    `Until then the engine runs with the deterministic synthetic mock provider, ` +
    `which is clearly labeled "mock" in the UI — it is NOT real web research.`
  );
}