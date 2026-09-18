# Phase 10 Engineering Report — Productization (First-decision flow, Evaluation UI, Live Updates, Report Export)

**Status:** Implemented, tested, building clean
**Server tests:** 231 pass / 0 fail (220 baseline + 11 new Phase 10 tests)
**Server:** `tsc --noEmit` clean, `npm run build` clean
**Client:** `tsc` clean, `npm run build` clean (vite production build OK)
**Scope:** Server + client. No new dependencies.

## Problem

Phases 4–9 built a powerful engine — research, debate, verification, red team,
reconciliation, memory, outcomes, and a full evaluation/benchmarking suite — but
the product surface was thin:

1. A new user could not complete *"create a decision → watch it run"* without
   navigating through a few screens and pressing "start"; the decision detail page
   only polled every 3s.
2. The Phase 9 evaluation APIs existed with a test suite but had **no UI** — the
   flagship benchmarking feature was only reachable via `curl`.
3. Results and decision reports were not exportable, so a completed decision was
   stuck inside the app.

Phase 10 productizes the engine: a guided first-decision flow, an Evaluation UI,
real-time progress over SSE (with graceful polling fallback), and downloadable
Markdown decision reports.

## Design goals (and how they were met)

### 1. First-decision flow (create → start → watch)

- **CreateDecisionPage** (`/decisions/new`, `client/src/pages/CreateDecisionPage.tsx`):
  title, objective, optional context, research queries, planning mode (fixed /
  intelligent), routing (auto / manual model), verification toggle. Live
  validation, starter prompts ("Adopt or pass on a new tool", "Evaluate a
  strategic decision", "Prioritize a fix") and a no-model guidance banner that
  links to `/models`.
- When the user creates, their execution settings are handed to the detail page
  via `sessionStorage` (`hathap_pending_start`) and it navigates with
  `?autostart=1`. **DecisionDetailPage** reads the flag, restores the settings,
  and starts the decision once the draft is confirmed — the user lands on a page
  that is already streaming progress. Clear trades/fallbacks:
  - draft decisions never auto-start (only the explicit create flow passes the
    flag); the URL flag is stripped via `history.replaceState` and the pending
    start is removed from `sessionStorage`, so a reload does not double-start.
  - starting stays an explicit user action on the detail page for anything that
    wasn't launched from the create flow.
- Empty states everywhere CTA to the flow: Decisions page gains a "Create your
  first decision" card + persistent `New Decision` button; Dashboard gains
  "Create Decision" quick action and "Total/Active Decisions" stat cards plus an
  "Active Decisions" list.

### 2. Real-time updates over SSE, with polling fallback

The old detail page polled `GET /api/decisions/:id/events` every 3 seconds. Phase
10 adds a first-class stream:

- **Server** — `GET /api/decisions/:id/events/stream` (`server/src/routes/decisions.ts`):
  - Auth + ownership enforced exactly like the REST endpoints (404 for
    non-owners, 401 unauthenticated).
  - Sends a `stream.connected` handshake, then every persisted execution event for
    the decision (bounded replay of the last 500, same ownership filter).
  - Honors `Last-Event-ID` for reconnect resume — `id:` is the event `_id`, and a
    client that reconnects with the last seen id receives only newer events.
  - Heartbeat comment (`: keepalive`) every 15s to defeat idle-proxy timeouts.
  - Deterministic cleanup: listeners are removed and the response is ended on
    `close`/`error`, so abandoned streams never leak memory. Tested: the server
    still services requests after a stream is closed.
  - The existing `GET /events` REST endpoint is preserved (used by older clients
    and replayed history on connect).
- **Client** — `client/src/hooks/useDecisionEventStream.ts`:
  - fetch-based SSE reader with a Bearer `Authorization` header — the token never
    appears in a URL/query string (no token leakage into proxy/server logs).
  - Reconnect with capped backoff (5 attempts) and `Last-Event-ID` resume.
  - Silence watchdog (~25s > 15s heartbeat): if no bytes arrive, it degrades to
    the existing 3s polling fallback and reports `mode: 'polling'`.
  - `onEvent` merges streamed events into the timeline by `_id` (dedupe +
    replace); `onUpdate` debounces a snapshot refresh (700ms) so the page reflects
    the updated status/task counts as soon as events settle.
  - DecisionDetailPage uses the stream for `isActive` statuses and shows a
    live indicator chip ("Live updates" / "Connecting…" / "Polling fallback").
  - Phase 10 stream events are persisted by the in-memory event bus
    ([ `ExecutionEvent` ]), so stream + poll agree on a single source of truth. The
    stream serializer reads each event's `createdAt` (persisted events) or
    `timestamp` (in-memory before persistence) — no fake events are ever
    generated.

### 3. Markdown decision report (export + copy)

- **Server** — `server/src/decision/reportService.ts` + `GET /api/decisions/:id/report`:
  - Renders a structured 12-section Markdown report from the persisted decision
    snapshot: story, problem, recommendation, executive summary, evidence,
    claims, verification, red-team findings, reconciliation, models & routing
    (token/cost accounting), evaluation/memory summary and provenance.
  - **Honesty boundary:** an unreconciled (draft/in-flight) decision yields
    "no recommendation" — the report never invents one. Sections render from what
    is actually persisted.
  - **Secret sanitization:** a key-name regex and a value-pattern regex
    (`sk-...`, `Bearer ...`, long hex/base64 blobs, `key:` values) redact
    anything that looks like a secret in evidence/source content, plus a final
    markdown pass. Verified by a test that injects a fake `sk-...` API key and a
    bearer token into sources and asserts they never appear in the output.
  - Long content is truncated to bounded lengths so a report is always a
    reasonable size.
  - `?download=1` returns `Content-Disposition: attachment;
    filename="decision-report-<id>.md"`. Ownership-scoped (404 for non-owners).
- **Client** — DecisionDetailPage gains `Export Report` (downloads the `.md`
  file) and `Copy Report` (clipboard). `getDecisionReport` added to AppContext.

### 4. Evaluation UI covering the Phase 9 APIs

New `client/src/pages/EvaluationPage.tsx` + `client/src/context/EvaluationContext.tsx`,
with a nav item (`/evaluation`) and route wired in `App.tsx` (behind
`ProtectedRoute`, inside a new `EvaluationProvider`).

Four tabs, one per Phase 9 concern:

- **Benchmarks** — seed the built-in benchmark set (idempotent, `201`/`200`),
  create/delete benchmarks, expand a benchmark to view its cases, add/delete
  cases, and **Run benchmark** which creates a `decision-engine` evaluation run
  and starts it. Run configuration uses the same bounded policy caps as Phase 9.
- **Runs** — list runs with status + progress, expand completed/partial runs to
  see per-case results (status + composite/structure/quality/evidence/reasoning/
  outcome/efficiency scores), fetch the aggregate, cancel in-progress runs, save
  a completed run as a baseline, delete runs. The context auto-polls while any
  run is queued/running (5s) so progress updates without a manual refresh.
  Nothing is fabricated: empty results render an honest "no results" message and
  the `/runs/:id/results` + `/aggregate` endpoints are the only data source.
- **Baselines** — list baselines, compare a completed run against a baseline
  (surfaces regression/no-regression + aggregate delta), delete.
- **Comparisons** — compare two completed runs side-by-side with
  improvement/regression counts and aggregate delta.

Client reflects server truth: the only place run/case scores appear is the
persisted Phase 9 result documents — the UI renders, it does not compute or
invent scores.

### 5. Boundaries respected

- **No new intelligence.** No debate/research/planner behavior changed. The only
  server changes are the event-bus wildcard listener, the SSE endpoint, and the
  report service.
- **No fabricated results.** Autostart uses persisted settings; SSE replays
  persisted events; reports render persisted sections; the Evaluation UI renders
  persisted scores.
- **Auth/ownership unchanged.** Every new endpoint (stream, report) reuses the
  `{ _id, userId }` lookup pattern → 404 for non-owners, tested.

## API surface added

```
GET  /api/decisions/:id/events/stream   SSE: connected handshake → persisted
                                        events (replay ≤500), Last-Event-ID
                                        resume, 15s keepalive, cleanup on close
GET  /api/decisions/:id/report          Markdown decision report (text/markdown);
                                        ?download=1 → attachment
```

## Test coverage (11 new, `server/src/tests/phase10.test.ts`)

Report generation:
- report renders the expected sections for an owned, reconciled decision;
- report is ownership-scoped (other user → 404);
- report never leaks secrets injected into source documents (redaction);
- a draft decision's report is honest — no recommendation is invented;
- `?download=1` sets the attachment content-disposition header.

SSE execution-event stream:
- rejects unauthenticated connections;
- rejects connections to another user's decision (404);
- streams the connected handshake then live execution events to the owner;
- reconnect with `Last-Event-ID` resumes without duplicating already-seen events;
- keeps the stream alive with heartbeats (~15s);
- the server keeps working after a stream is closed (listener cleanup).

## Recovery / stability notes

- The full 231-test suite is green on a single concurrency (`--test-concurrency=1`),
  including a ~15s heartbeat test; one Phase 5 timing-sensitive test is flaky
  only under full-suite load and passes in isolation (524ms) — not a Phase 10
  regression.
- The client typecheck and production vite build are clean.

## Verification

```
server/  npx tsc --noEmit      → clean
server/  npm run build          → clean
server/  npm test               → 231 pass / 0 fail
server/  node --test-concurrency=1 -r ts-node/register --test src/tests/phase10.test.ts → 11/11
client/  npx tsc --noEmit       → clean
client/  npm run build          → clean (vite production build)
```