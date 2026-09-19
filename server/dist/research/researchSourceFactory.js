"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createResearchSource = createResearchSource;
exports.getResearchSource = getResearchSource;
exports.resetResearchSource = resetResearchSource;
exports.resetMockWarning = resetMockWarning;
const mockResearchSource_1 = require("./mockResearchSource");
const duckDuckGoResearchSource_1 = require("./duckDuckGoResearchSource");
const braveResearchSource_1 = require("./braveResearchSource");
const researchConfig_1 = require("./researchConfig");
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
let cached = null;
let cachedProvider = null;
function createResearchSource(overrides = {}) {
    const resolved = (0, researchConfig_1.resolveResearchProvider)(overrides.provider);
    const provider = resolved.provider;
    switch (provider) {
        case 'mock':
            warnMockOnce(resolved.reason);
            return new mockResearchSource_1.MockResearchSource();
        case 'duckduckgo':
            return new duckDuckGoResearchSource_1.DuckDuckGoResearchSource({
                timeoutMs: overrides.timeoutMs,
                fetchFn: overrides.fetchFn,
            });
        case 'brave':
            return new braveResearchSource_1.BraveResearchSource({
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
function getResearchSource(provider) {
    const resolved = (0, researchConfig_1.resolveResearchProvider)(provider);
    const name = resolved.provider;
    if (cached && cachedProvider === name)
        return cached;
    cached = createResearchSource({ provider: provider || undefined });
    cachedProvider = name;
    return cached;
}
/** Test-only: clear the memoized provider so tests can swap providers. */
function resetResearchSource() {
    cached = null;
    cachedProvider = null;
}
let warnedMock = false;
function warnMockOnce(reason) {
    if (warnedMock)
        return;
    warnedMock = true;
    console.warn(`[Research] ${reason}. The mock is NOT real web research. ` +
        'Add BRAVE_SEARCH_API_KEY to server/.env for real web research.');
}
/** Re-export for tests that need to reset warning state. */
function resetMockWarning() {
    warnedMock = false;
}
