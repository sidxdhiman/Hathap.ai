"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const express_1 = __importDefault(require("express"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const research_1 = __importDefault(require("../routes/research"));
const braveResearchSource_1 = require("../research/braveResearchSource");
const researchConfig_1 = require("../research/researchConfig");
const limits_1 = require("../research/limits");
/**
 * Provider + configuration tests for the Brave web-search integration.
 *
 * SCOPE: real Brave wire behavior is exercised ONLY through injected fetchFn
 * fixtures — there is never a live call to api.search.brave.com and no real
 * BRAVE_SEARCH_API_KEY is required. Configuration resolution, the status
 * endpoint, and demo-route gating are tested deterministically against
 * explicit env fixtures. Web-grounded claims are therefore limited to what
 * the fixtures model.
 */
process.env.HATHAP_RESEARCH_PROVIDER = 'mock';
const JWT_SECRET = process.env.JWT_SECRET || 'secret';
const TEST_URI = process.env.MONGODB_URI_TEST_RESEARCH_PROVIDER || 'mongodb://localhost:27017/hathap_test_research_provider';
function tokenFor(id) {
    return jsonwebtoken_1.default.sign({ id }, JWT_SECRET);
}
function makeResearchFetch(payload, init = {}) {
    return (async () => {
        return new Response(JSON.stringify(payload), {
            status: init.status || 200,
            headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
        });
    });
}
function sampleBravePayload() {
    return {
        web: {
            results: [
                {
                    title: 'GraphQL vs REST trade-offs',
                    url: 'https://graphql.org/compare',
                    description: 'A field-level comparison of GraphQL and REST.',
                    extra_snippets: ['Clients fetch exactly the data they need.', 'Over-fetching is reduced.'],
                    age: '1 year',
                    profile: { name: 'GraphQL Foundation' },
                },
                { title: 'No URL', url: 'not-a-url', description: 'dropped (http(s) only)' },
                { title: '', url: 'https://empty.example/', description: 'dropped (empty title)' },
            ],
        },
    };
}
(0, node_test_1.test)('Brave provider maps successful payload into clamped results with brave metadata', async () => {
    const source = new braveResearchSource_1.BraveResearchSource({ apiKey: 'test-key', fetchFn: makeResearchFetch(sampleBravePayload()) });
    const results = await source.search('graphql vs rest');
    strict_1.default.equal(results.length, 1, 'only well-formed http(s) results with a title survive');
    const first = results[0];
    strict_1.default.equal(first.title, 'GraphQL vs REST trade-offs');
    strict_1.default.equal(first.url, 'https://graphql.org/compare');
    strict_1.default.ok(first.metadata, 'metadata is stamped');
    strict_1.default.equal(first.metadata.provider, 'brave');
    strict_1.default.equal(first.metadata.mock, false);
    strict_1.default.ok(first.retrievedAt instanceof Date, 'retrievedAt carries a Date');
    strict_1.default.ok(first.snippet, 'snippet is populated from the description');
    strict_1.default.ok(first.snippet.includes('field-level comparison'), 'description feeds the snippet');
    strict_1.default.ok(first.content, 'content is populated from extra_snippets');
    strict_1.default.ok(first.content.includes('exactly the data they need'), 'extra_snippets feed content');
});
(0, node_test_1.test)('Brave results never exceed per-result or per-query content limits', async () => {
    const huge = 'x'.repeat(limits_1.RESEARCH_LIMITS.maxContentPerResult * 2);
    const source = new braveResearchSource_1.BraveResearchSource({
        apiKey: 'test-key',
        fetchFn: makeResearchFetch({ web: { results: [{ title: 'Huge', url: 'https://huge.example/', description: huge }] } }),
    });
    const [result] = await source.search('huge');
    strict_1.default.ok((result.snippet || '').length <= limits_1.RESEARCH_LIMITS.maxContentPerResult, 'snippet is clamped');
    strict_1.default.ok((result.content || '').length <= limits_1.RESEARCH_LIMITS.maxContentPerResult, 'content is clamped');
});
(0, node_test_1.test)('HTTP 429 maps to RATE_LIMITED and surfaces Retry-After as retryAfterMs', async () => {
    const source = new braveResearchSource_1.BraveResearchSource({
        apiKey: 'test-key',
        fetchFn: makeResearchFetch({}, { status: 429, headers: { 'Retry-After': '7' } }),
    });
    await strict_1.default.rejects(() => source.search('rate'), (err) => err.researchCode === 'RATE_LIMITED' && err.retryAfterMs === 7000);
});
(0, node_test_1.test)('HTTP 401/403 maps to AUTHENTICATION_FAILURE', async () => {
    const source = new braveResearchSource_1.BraveResearchSource({ apiKey: 'bad', fetchFn: makeResearchFetch({}, { status: 401 }) });
    await strict_1.default.rejects(() => source.search('auth'), (err) => err.researchCode === 'AUTHENTICATION_FAILURE');
});
(0, node_test_1.test)('HTTP 5xx maps to PROVIDER_UNAVAILABLE', async () => {
    const source = new braveResearchSource_1.BraveResearchSource({ apiKey: 'bad', fetchFn: makeResearchFetch({}, { status: 500 }) });
    await strict_1.default.rejects(() => source.search('boom'), (err) => err.researchCode === 'PROVIDER_UNAVAILABLE');
});
(0, node_test_1.test)('empty results are a legitimate outcome (not an error)', async () => {
    const source = new braveResearchSource_1.BraveResearchSource({ apiKey: 'k', fetchFn: makeResearchFetch({ web: { results: [] } }) });
    strict_1.default.deepEqual(await source.search('none'), []);
});
(0, node_test_1.test)('missing api key is a hard configuration error (never a silent mock)', async () => {
    const source = new braveResearchSource_1.BraveResearchSource({ fetchFn: makeResearchFetch(sampleBravePayload()) });
    await strict_1.default.rejects(() => source.search('no key'), (err) => err.researchCode === 'INVALID_CONFIGURATION');
});
(0, node_test_1.test)('explicit mock resolves to the synthetic provider and is clearly labeled', () => {
    const resolved = (0, researchConfig_1.resolveResearchProvider)('mock', { provider: 'mock', nodeEnv: 'test', braveApiKey: undefined });
    strict_1.default.equal(resolved.provider, 'mock');
    strict_1.default.equal(resolved.mock, true);
    strict_1.default.equal(resolved.real, false);
});
(0, node_test_1.test)('brave resolves when a key is present', () => {
    const resolved = (0, researchConfig_1.resolveResearchProvider)('brave', { provider: 'brave', nodeEnv: 'test', braveApiKey: 'live-key' });
    strict_1.default.equal(resolved.provider, 'brave');
    strict_1.default.equal(resolved.real, true);
    strict_1.default.equal(resolved.mock, false);
});
(0, node_test_1.test)('brave without a key is a configuration error — production never mocks silently', () => {
    strict_1.default.throws(() => (0, researchConfig_1.resolveResearchProvider)('brave', { provider: 'brave', nodeEnv: 'production', braveApiKey: undefined }), (err) => err.researchCode === 'INVALID_CONFIGURATION');
});
(0, node_test_1.test)('status description never leaks the API key', () => {
    const status = (0, researchConfig_1.describeResearchStatus)({
        nodeEnv: 'test',
        provider: 'brave',
        braveApiKey: 'super-secret-key',
    });
    strict_1.default.ok(!JSON.stringify(status).includes('super-secret-key'), 'status never serializes the raw key');
    strict_1.default.equal(status.provider, 'brave');
});
(0, node_test_1.test)('setup instructions reference the exact Brave env var (server-side hint only)', () => {
    strict_1.default.ok(/BRAVE_SEARCH_API_KEY/.test((0, researchConfig_1.researchSetupInstructions)()), 'instructions name the env var');
});
// ---- Route-level: demo + status gating over a real HTTP server (no supertest) ----
async function makeResearchServer() {
    const app = (0, express_1.default)();
    app.use(express_1.default.json());
    app.use('/api/research', research_1.default);
    const server = await new Promise((resolve) => {
        const s = app.listen(0, () => resolve(s));
    });
    const port = server.address().port;
    return {
        server,
        port,
        request: async (path, opts = {}) => {
            const headers = {};
            if (opts.token)
                headers.Authorization = `Bearer ${opts.token}`;
            if (opts.body)
                headers['Content-Type'] = 'application/json';
            const res = await fetch(`http://127.0.0.1:${port}${path}`, {
                method: opts.method || 'GET',
                headers,
                body: opts.body ? JSON.stringify(opts.body) : undefined,
            });
            const text = await res.text();
            let json = {};
            try {
                json = text ? JSON.parse(text) : {};
            }
            catch {
                json = { raw: text };
            }
            return { status: res.status, body: json };
        },
    };
}
let server;
let uid;
(0, node_test_1.before)(async () => {
    server = await makeResearchServer();
    uid = new (await Promise.resolve().then(() => __importStar(require('mongoose')))).Types.ObjectId().toString();
});
(0, node_test_1.after)(async () => {
    server.server.close();
});
(0, node_test_1.test)('GET /api/research/status requires auth and does not require a live key', async () => {
    const unauth = await server.request('/api/research/status');
    strict_1.default.equal(unauth.status, 401, 'unauthenticated status is rejected');
    const authed = await server.request('/api/research/status', { token: tokenFor(uid) });
    strict_1.default.equal(authed.status, 200, 'authenticated status resolves even without a live provider');
    strict_1.default.ok(typeof authed.body.provider === 'string' || authed.body.provider === null, 'status exposes a provider name');
    strict_1.default.ok(!authed.body.braveApiKey && !authed.body.apiKey, 'status never serializes a key');
});
(0, node_test_1.test)('POST /api/research/demo requires auth', async () => {
    const res = await server.request('/api/research/demo', { method: 'POST', body: { confirm: true } });
    strict_1.default.equal(res.status, 401, 'unauthenticated demo is rejected');
});
(0, node_test_1.test)('POST /api/research/demo refuses to run mock-as-real with setup guidance (no silent mock)', async () => {
    const res = await server.request('/api/research/demo', {
        method: 'POST',
        token: tokenFor(uid),
        body: { confirm: true },
    });
    strict_1.default.equal(res.status, 400, 'no real provider => demo is refused, never silently mocked');
    strict_1.default.ok(res.body.error && /configured|config/i.test(res.body.error), 'error explains the configuration');
    strict_1.default.ok(res.body.setup, 'response carries concrete setup instructions');
    strict_1.default.ok(!res.body.decisionId, 'no decision is created when the demo cannot run for real');
});
