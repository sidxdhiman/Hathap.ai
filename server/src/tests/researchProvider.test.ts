import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import type { AddressInfo } from 'net';
import researchRouter from '../routes/research';
import { BraveResearchSource } from '../research/braveResearchSource';
import { resolveResearchProvider, describeResearchStatus, researchSetupInstructions } from '../research/researchConfig';
import { ResearchError } from '../research/researchError';
import { RESEARCH_LIMITS } from '../research/limits';

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

function tokenFor(id: string): string {
  return jwt.sign({ id }, JWT_SECRET);
}

export interface AuthRequestUser {
  userId?: string;
}

function makeResearchFetch(payload: any, init: { status?: number; headers?: Record<string, string> } = {}): typeof fetch {
  return (async () => {
    return new Response(JSON.stringify(payload), {
      status: init.status || 200,
      headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
    });
  }) as typeof fetch;
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

test('Brave provider maps successful payload into clamped results with brave metadata', async () => {
  const source = new BraveResearchSource({ apiKey: 'test-key', fetchFn: makeResearchFetch(sampleBravePayload()) });
  const results = await source.search('graphql vs rest');
  assert.equal(results.length, 1, 'only well-formed http(s) results with a title survive');
  const first = results[0];
  assert.equal(first.title, 'GraphQL vs REST trade-offs');
  assert.equal(first.url, 'https://graphql.org/compare');
  assert.ok(first.metadata, 'metadata is stamped');
  assert.equal(first.metadata.provider, 'brave');
  assert.equal(first.metadata.mock, false);
  assert.ok(first.retrievedAt instanceof Date, 'retrievedAt carries a Date');
  assert.ok(first.snippet, 'snippet is populated from the description');
  assert.ok(first.snippet.includes('field-level comparison'), 'description feeds the snippet');
  assert.ok(first.content, 'content is populated from extra_snippets');
  assert.ok(first.content.includes('exactly the data they need'), 'extra_snippets feed content');
});

test('Brave results never exceed per-result or per-query content limits', async () => {
  const huge = 'x'.repeat(RESEARCH_LIMITS.maxContentPerResult * 2);
  const source = new BraveResearchSource({
    apiKey: 'test-key',
    fetchFn: makeResearchFetch({ web: { results: [{ title: 'Huge', url: 'https://huge.example/', description: huge }] } }),
  });
  const [result] = await source.search('huge');
  assert.ok((result.snippet || '').length <= RESEARCH_LIMITS.maxContentPerResult, 'snippet is clamped');
  assert.ok((result.content || '').length <= RESEARCH_LIMITS.maxContentPerResult, 'content is clamped');
});

test('HTTP 429 maps to RATE_LIMITED and surfaces Retry-After as retryAfterMs', async () => {
  const source = new BraveResearchSource({
    apiKey: 'test-key',
    fetchFn: makeResearchFetch({}, { status: 429, headers: { 'Retry-After': '7' } }),
  });
  await assert.rejects(
    () => source.search('rate'),
    (err: ResearchError) => err.researchCode === 'RATE_LIMITED' && err.retryAfterMs === 7000
  );
});

test('HTTP 401/403 maps to AUTHENTICATION_FAILURE', async () => {
  const source = new BraveResearchSource({ apiKey: 'bad', fetchFn: makeResearchFetch({}, { status: 401 }) });
  await assert.rejects(
    () => source.search('auth'),
    (err: ResearchError) => err.researchCode === 'AUTHENTICATION_FAILURE'
  );
});

test('HTTP 5xx maps to PROVIDER_UNAVAILABLE', async () => {
  const source = new BraveResearchSource({ apiKey: 'bad', fetchFn: makeResearchFetch({}, { status: 500 }) });
  await assert.rejects(
    () => source.search('boom'),
    (err: ResearchError) => err.researchCode === 'PROVIDER_UNAVAILABLE'
  );
});

test('empty results are a legitimate outcome (not an error)', async () => {
  const source = new BraveResearchSource({ apiKey: 'k', fetchFn: makeResearchFetch({ web: { results: [] } }) });
  assert.deepEqual(await source.search('none'), []);
});

test('missing api key is a hard configuration error (never a silent mock)', async () => {
  const source = new BraveResearchSource({ fetchFn: makeResearchFetch(sampleBravePayload()) });
  await assert.rejects(
    () => source.search('no key'),
    (err: ResearchError) => err.researchCode === 'INVALID_CONFIGURATION'
  );
});

test('explicit mock resolves to the synthetic provider and is clearly labeled', () => {
  const resolved = resolveResearchProvider('mock', { provider: 'mock', nodeEnv: 'test', braveApiKey: undefined });
  assert.equal(resolved.provider, 'mock');
  assert.equal(resolved.mock, true);
  assert.equal(resolved.real, false);
});

test('brave resolves when a key is present', () => {
  const resolved = resolveResearchProvider('brave', { provider: 'brave', nodeEnv: 'test', braveApiKey: 'live-key' });
  assert.equal(resolved.provider, 'brave');
  assert.equal(resolved.real, true);
  assert.equal(resolved.mock, false);
});

test('brave without a key is a configuration error — production never mocks silently', () => {
  assert.throws(
    () => resolveResearchProvider('brave', { provider: 'brave', nodeEnv: 'production', braveApiKey: undefined }),
    (err: ResearchError) => err.researchCode === 'INVALID_CONFIGURATION'
  );
});

test('status description never leaks the API key', () => {
  const status = describeResearchStatus({
    nodeEnv: 'test',
    provider: 'brave',
    braveApiKey: 'super-secret-key',
  });
  assert.ok(!JSON.stringify(status).includes('super-secret-key'), 'status never serializes the raw key');
  assert.equal(status.provider, 'brave');
});

test('setup instructions reference the exact Brave env var (server-side hint only)', () => {
  assert.ok(/BRAVE_SEARCH_API_KEY/.test(researchSetupInstructions()), 'instructions name the env var');
});

// ---- Route-level: demo + status gating over a real HTTP server (no supertest) ----
async function makeResearchServer() {
  const app = express();
  app.use(express.json());
  app.use('/api/research', researchRouter);
  const server = await new Promise<http.Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const port = (server.address() as AddressInfo).port;
  return {
    server,
    port,
    request: async (path: string, opts: { method?: string; token?: string; body?: any } = {}) => {
      const headers: Record<string, string> = {};
      if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
      if (opts.body) headers['Content-Type'] = 'application/json';
      const res = await fetch(`http://127.0.0.1:${port}${path}`, {
        method: opts.method || 'GET',
        headers,
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      });
      const text = await res.text();
      let json: any = {};
      try {
        json = text ? JSON.parse(text) : {};
      } catch {
        json = { raw: text };
      }
      return { status: res.status, body: json };
    },
  };
}

let server: Awaited<ReturnType<typeof makeResearchServer>>;
let uid: string;

before(async () => {
  server = await makeResearchServer();
  uid = new (await import('mongoose')).Types.ObjectId().toString();
});

after(async () => {
  server.server.close();
});

test('GET /api/research/status requires auth and does not require a live key', async () => {
  const unauth = await server.request('/api/research/status');
  assert.equal(unauth.status, 401, 'unauthenticated status is rejected');

  const authed = await server.request('/api/research/status', { token: tokenFor(uid) });
  assert.equal(authed.status, 200, 'authenticated status resolves even without a live provider');
  assert.ok(typeof authed.body.provider === 'string' || authed.body.provider === null, 'status exposes a provider name');
  assert.ok(!authed.body.braveApiKey && !authed.body.apiKey, 'status never serializes a key');
});

test('POST /api/research/demo requires auth', async () => {
  const res = await server.request('/api/research/demo', { method: 'POST', body: { confirm: true } });
  assert.equal(res.status, 401, 'unauthenticated demo is rejected');
});

test('POST /api/research/demo refuses to run mock-as-real with setup guidance (no silent mock)', async () => {
  const res = await server.request('/api/research/demo', {
    method: 'POST',
    token: tokenFor(uid),
    body: { confirm: true },
  });
  assert.equal(res.status, 400, 'no real provider => demo is refused, never silently mocked');
  assert.ok(res.body.error && /configured|config/i.test(res.body.error), 'error explains the configuration');
  assert.ok(res.body.setup, 'response carries concrete setup instructions');
  assert.ok(!res.body.decisionId, 'no decision is created when the demo cannot run for real');
});