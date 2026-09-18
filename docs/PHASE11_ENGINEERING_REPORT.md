# Phase 11 Engineering Report — Real Web-Grounded Research

**Status:** Implemented, tested, building clean
**Server tests:** 231 pass / 0 fail (existing full suite incl. `researchSecurity.test.ts`)
**Server:** `tsc --noEmit` clean, `npm run build` clean
**Client:** `tsc` clean, `npm run build` clean (vite production build OK)
**Scope:** Server (Brave provider) + client (status badge + web-grounded demo affordance). No new dependencies.

## Problem

Phases 3–10 built a research engine whose evidence was **mock with a real-shaped
shape**: the two allowed providers (`mock`, `duckduckgo`) either produced
deterministic filler or silently fell back with no label. That violated the
project's core research corollary: research content is untrusted data, and the UI
must never present generated placeholder work as real web-grounded evidence.

Phase 11 introduces exactly **one real web source (Brave Search)**, resolves the
research provider *explicitly* instead of by defaulting, refuses to silently mock,
and surfaces the real-vs-mock mode in the API, database, and dashboard UI.

## What changed

### Server — Brave provider (`server/src/research/braveResearchSource.ts`)

Real HTTPS provider hitting the fixed Brave Search API endpoint. Strict about
credentials:

- **Missing/blank key → hard error.** Instantiating Brave without `BRAVE_SEARCH_API_KEY`
  throws `INVALID_CONFIGURATION` (never an unlabeled fallback).
- Fixed host `api.search.brave.com` + fixed path — SSRF-safe, no URL interpolation
  from research content.
- Maps Brave HTTP errors to the existing execution taxonomy: 401/403 →
  `AUTHENTICATION_FAILURE`, 429 → `RATE_LIMITED` (with `Retry-After` → `retryAfterMs`),
  400/4xx → `INVALID_QUERY`, 5xx → `PROVIDER_UNAVAILABLE`.
- Clamps result sizes via `RESEARCH_LIMITS` (maxResultsPerQuery, content clamping)
  so oversized provider payloads can't blow the evidence store.

### Server — provider resolution (`server/src/research/researchConfig.ts`)

`resolveResearchProvider()` decides between `auto | brave | mock | duckduckgo`:

- `auto` (default): uses **Brave when an API key exists**, otherwise the explicit
  `mock` provider — never a silent duck-duckgo swap.
- Explicit `mock` → real-labeled mock only; the demo route knows it's not web-grounded.
- `describeResearchStatus(provider)` returns `{ provider, real, mock, configured,
  mode, ... }` — **never** leaks the key; `configured:false` is the honest answer
  when no key is set.

### Server — one-click demo route (`server/src/routes/research.ts`)

`POST /api/research/demo` + `GET /api/research/status`:

- `POST /demo` with a real provider attached *runs an actual web-grounded research
  demo* and stamps a demo decision there. Without a real provider it returns a
  structured **400** (with setup instructions) instead of fabricating results.
- `GET /status` reports the current provider/mode without serializing the key.

### Server — evidence provenance

- Research evidence now carries `provider` + `retrievedAt` (stamped server-side),
  so the database and API answers "which real engine fetched this, and when."

### Client

- Types: `ResearchStatus`, `WebGroundedDemoRequest/Result`, `provider`/`retrievedAt`
  on research evidence summaries.
- `AppContext` exposes `getResearchStatus()` and `runWebGroundedDemo()`.
- Dashboard shows a web-grounded status banner (real provider name, mock clickable
  affordance, and a clear "web-grounded demo" card when a real provider is live).
- DecisionDetail research evidence badges render provider + fetched-time.

## Security notes

- Keys are env-only (`BRAVE_SEARCH_API_KEY` in `.env`); status/setup responses never
  echo the key.
- Mock is always explicit and never silently swapped for a real provider.
- The Brave host is fixed — research content cannot influence the fetch target.
- Coverage: `researchSecurity.test.ts` (Brave error mapping, provider resolution,
  demo route gating, no-key status, injection guardrail in place in the same suite).

## Verification

```
server/  npx tsc --noEmit      ✓ clean
server/  npm run build         ✓ clean
server/  npm test              ✓ 231 pass / 0 fail
client/  npx tsc --noEmit      ✓ clean
client/  npm run build         ✓ clean (vite production build)
```
