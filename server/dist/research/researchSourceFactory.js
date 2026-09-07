"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createResearchSource = createResearchSource;
exports.getResearchSource = getResearchSource;
exports.resetResearchSource = resetResearchSource;
const researchError_1 = require("./researchError");
const mockResearchSource_1 = require("./mockResearchSource");
const duckDuckGoResearchSource_1 = require("./duckDuckGoResearchSource");
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
let cached = null;
function configuredProvider(override) {
    return (override || process.env.HATHAP_RESEARCH_PROVIDER || 'mock').toLowerCase().trim();
}
function warnOnceMock() {
    if (warnedMock)
        return;
    warnedMock = true;
    console.warn('[Research] WARNING: using the deterministic mock research provider (synthetic data). ' +
        'This is NOT real web research. Configure HATHAP_RESEARCH_PROVIDER=duckduckgo (or a future provider) for production research.');
}
function createResearchSource(overrides = {}) {
    const provider = configuredProvider(overrides.provider);
    switch (provider) {
        case 'duckduckgo':
            return new duckDuckGoResearchSource_1.DuckDuckGoResearchSource({ timeoutMs: overrides.timeoutMs, fetchFn: overrides.fetchFn });
        case 'mock':
            warnOnceMock();
            return new mockResearchSource_1.MockResearchSource();
        default:
            throw new researchError_1.ResearchError('INVALID_CONFIGURATION', `Unsupported research provider "${provider}". Supported: mock, duckduckgo.`);
    }
}
/** Registry-style memoized instance used by the research service. */
function getResearchSource(provider) {
    if (cached && configuredProvider(provider) === cached.name)
        return cached;
    cached = createResearchSource({ provider });
    return cached;
}
/** Test-only: clear the memoized provider so tests can swap providers. */
function resetResearchSource() {
    cached = null;
    warnedMock = false;
}
