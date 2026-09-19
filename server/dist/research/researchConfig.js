"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BRAVE_API_KEY_ENV = void 0;
exports.readResearchEnv = readResearchEnv;
exports.resolveResearchProvider = resolveResearchProvider;
exports.describeResearchStatus = describeResearchStatus;
exports.researchSetupInstructions = researchSetupInstructions;
const researchError_1 = require("./researchError");
exports.BRAVE_API_KEY_ENV = 'BRAVE_SEARCH_API_KEY';
function readResearchEnv(env = process.env) {
    return {
        nodeEnv: (env.NODE_ENV || 'development').trim().toLowerCase(),
        provider: (env.HATHAP_RESEARCH_PROVIDER || '').trim().toLowerCase() || undefined,
        braveApiKey: (env[exports.BRAVE_API_KEY_ENV] || '').trim() || undefined,
    };
}
function configError(provider, message) {
    return new researchError_1.ResearchError('INVALID_CONFIGURATION', `Research provider "${provider}" configuration failed: ${message}`);
}
/**
 * Resolve which research provider should serve tasks. Throws
 * ResearchError(INVALID_CONFIGURATION) when resolution is invalid — in
 * production that is an explicit misconfiguration, never a silent mock.
 */
function resolveResearchProvider(override, env = readResearchEnv()) {
    const requested = (override || env.provider || 'auto').trim().toLowerCase();
    switch (requested) {
        case 'brave':
            if (!env.braveApiKey) {
                throw configError('brave', `the ${exports.BRAVE_API_KEY_ENV} environment variable is not set. ` +
                    'Add it (and HATHAP_RESEARCH_PROVIDER=brave) to server/.env to enable real web research.');
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
                    reason: `auto mode: ${exports.BRAVE_API_KEY_ENV} is present`,
                };
            }
            if (env.nodeEnv === 'production') {
                throw configError('auto', `no real web-search provider is configured. Set ${exports.BRAVE_API_KEY_ENV} (optionally ` +
                    'HATHAP_RESEARCH_PROVIDER=brave) in server/.env. The mock provider is never used in production.');
            }
            return {
                provider: 'mock',
                real: false,
                mock: true,
                reason: `auto mode (dev/test): no ${exports.BRAVE_API_KEY_ENV} configured, using the explicit synthetic mock. ` +
                    `Set ${exports.BRAVE_API_KEY_ENV} to enable real web research.`,
            };
        default:
            throw configError(requested, `unsupported provider "${requested}". Supported: brave, mock, duckduckgo, auto.`);
    }
}
/**
 * Non-throwing view of the provider status used by /api/research/status and the
 * demo endpoint. Never includes the API key — only env-var names.
 */
function describeResearchStatus(env = readResearchEnv()) {
    let resolved;
    let configured = true;
    let rationale;
    try {
        resolved = resolveResearchProvider(undefined, env);
        rationale = resolved.reason;
    }
    catch (err) {
        configured = false;
        rationale = err?.message || 'Research provider is not configured.';
        return {
            provider: null,
            real: false,
            mock: false,
            configured,
            mode: env.provider ? 'explicit' : 'auto',
            envHint: env.provider === 'brave' ? exports.BRAVE_API_KEY_ENV : exports.BRAVE_API_KEY_ENV,
            rationale,
        };
    }
    return {
        provider: resolved.provider,
        real: resolved.real,
        mock: resolved.mock,
        configured,
        mode: env.provider ? 'explicit' : 'auto',
        envHint: resolved.provider === 'brave' ? exports.BRAVE_API_KEY_ENV : null,
        rationale,
    };
}
/** Message describing exactly what to configure for real web research. */
function researchSetupInstructions() {
    return (`Real web research requires an API key. Add these to server/.env and restart the server:\n` +
        `  HATHAP_RESEARCH_PROVIDER=brave\n` +
        `  ${exports.BRAVE_API_KEY_ENV}=<your-key>\n` +
        `Get a key at https://brave.com/search/api/ (free tier available). ` +
        `Until then the engine runs with the deterministic synthetic mock provider, ` +
        `which is clearly labeled "mock" in the UI — it is NOT real web research.`);
}
