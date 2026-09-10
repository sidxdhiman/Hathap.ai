# Phase 7 Engineering Report — Decision Intelligence UI & Observability

**Status:** Implemented, tested, building clean
**Server tests:** 161 pass / 0 fail (157 baseline + 4 new decision-intelligence tests)
**Server:** `npx tsc --noEmit` clean, `npm run build` clean
**Client:** `npx tsc --noEmit` clean, `npm run build` clean

## Problem

The Decision run inflicted powerful *backend* intelligence on users (research,
claims, evidence, verification, red-team, reconciliation, routing, costs,
execution telemetry) but the Decision Detail page did not surface most of it —
research output, claims/evidence relationships, verification verdicts,
red-team findings, reconciliation, planned-vs-actual routing, token/cost
figures, and a live execution event stream were effectively invisible.

Phase 7 turns the Decision Detail page into a decision-intelligence console
that is **honest about what it knows and what it doesn't**:
no fabricated confidence, no invented costs, no invented routing, no
placeholder evidence.

## Design goals (and how they were met)

### 1. Show real, persisted decision intelligence only
- The page is a composition of 15 components (`client/src/components/decision/`)
  that render only the data the backend actually returns. Empty states
  ("No events recorded yet", "No plan generated for this decision",
  "Confidence unavailable", "Actual cost unavailable") are first-class UI, not
  failure artifacts.
- Semantic distinctions preserved: supported≠verified, unsupported≠contradicted,
  inconclusive≠failed, planned≠actual routing, estimated≠actual cost.
- The overall confidence bar comes from the reconciliation result; the factor
  bars beneath it are **explicitly labeled as derived from observed data**
  (evidence count, verification ratio, contradiction ratio, research query
  count, red-team findings) with the raw counts shown inline next to each bar —
  they are never presented as a backend-computed confidence.

### 2. Every intelligence artifact is a first-class, linked object
- **EvidenceExplorer**: evidence cards with label, source, provenance, and
  classification (supporting / contradicting / neutral).
- **ClaimExplorer**: claims with assertion type (fact/assumption/inference) and
  their evidence relationships (supports / contradicts / related); claims link
  to their backing evidence.
- **VerificationPanel**: preserves supported/contradicted/inconclusive verdicts,
  provides per-claim coverage and calls out unverified claims.
- **RedTeamPanel**: findings with severity, loss type, and recovery suggestions.
- **ReconciliationPanel**: final verdict recommendation distinct from the
  intermediate claims.

### 3. Execution is observable
- **ExecutionTimeline**: ordered vertical timeline of persisted events
  (execution/task/agent/research/planning/routing), with task/execution ids and
  payload metadata (`data.type` chips for task events).
- **EventStream**: filterable live stream (All / Tasks / Research / Routing /
  Verification / Red Team / Errors). Filters are keyed to the *real* event-bus
  vocabulary — task events carry `data.type`, so Verification isolates
  `verify_claim` tasks and Red Team isolates `red_team` tasks (initial version
  referenced event types that do not exist; fixed).
- **TaskGraph**: dependency structure from the persisted plan/tasks, statuses on
  nodes; no hardcoded pipeline shape.
- **TaskList**: status, priority, agent/model assignment, phase; failed/retrying
  tasks render their human-readable error.
- Updates via 3s polling (`POLL_INTERVAL_MS`); `ACTIVE_STATUSES`
  (`investigating`, `reasoning`, `debating`, `verifying`, `awaiting_review`)
  drive the live-progress section. Reloading reconstructs everything from
  backend state.

### 4. Routing & cost honesty
- **RoutingPanel** surfaces the persisted `metadata.routing` per task:
  capability model, token-budget estimate, selection state (status/agent/model),
  fallback notice, policy version, `capabilityGateRelaxed`, and selection
  rationale — the "what ran on which model, and why" observable.
- **PlanPanel** shows the *planned* model/estimate and always labels it
  "estimated" (source `intelligent`/`fallback`/`baseline` shown too) — never
  confused with persisted routing.
- **CostPanel** shows total/input/output tokens, LLM call count, execution
  duration, average LLM latency, estimated cost, and **actual cost only when the
  provider reported it** — otherwise "Actual cost unavailable".

### 5. Minimal backend surface, no new trust boundaries
- Only addition: `GET /api/decisions/:id/events` (auth + ownership-scoped; 401
  unauthenticated, 404 for any other user / nonexistent decision).
- Event bus, snapshot, research, plans, and routing-preview endpoints reused.
- No new state-management library; no WebSockets.

## Security / trust-boundary notes

- Event ordering is deterministic (server `createdAt` asc, client re-sort with
  `_id` tiebreaker).
- A backend test asserts event payloads never carry `apiKey`/`api_key`;
  the UI never renders raw prompts, chain-of-thought, or credentials.
- Cross-user event reads return 404 (no existence leak) — covered by tests.
- Routing/planner trust boundaries unchanged from Phase 5/6; UI is display-only.

## Verified in a live smoke run (isolated `hathap_smoke` DB)

Real built server (`dist`), real Mongo (localhost:27017), real worker, real
handlers, `PORT=4100`, fresh scratch DB dropped after:

- `GET /api/health` → `{"ok":true}`.
- Signup/login issued JWTs; default agents created.
- `POST /api/decisions` → decision persisted (`status: draft`).
- `GET /api/decisions/:id/snapshot` → real draft state (`status:draft`, 1
  evidence item from the draft seed).
- **New endpoint `GET /api/decisions/:id/events`** → `200 []` for the owner;
  `404` for a second user; `401` unauthenticated; `404` for a nonexistent
  decision id.
- `POST /api/decisions/:id/start` → `accepted`; worker picked up the execution.
- Event timeline after failure: `execution.queued`, `execution.started`,
  `routing.started`, `routing.completed`, `task.failed`, `execution.failed`
  — **timestamp-ordered**, including real Phase-6 routing events.
- Snapshot showed the debate task `failed` with the readable error
  "No valid agent participants could be resolved for this decision."
  (expected: no provider API keys configured in this environment), 1 evidence
  item persisted by the mock research provider, 0 claims, no confidence.
- Leak scan across the snapshot/event payloads: no `chain-of-thought`,
  `internal reasoning`, `api_key`, or `apiKey` tokens.

**Not verified in this environment:** an execution running *to completion*
(verification → red team → reconciliation with populated claims, routed LLM
agents, actual costs, and the full event timeline into `execution.completed`).
That path requires real provider API keys + routable models, which are not
available here. The failure path, routing lifecycle, research persistence,
event ordering, and all ownership/security behavior **were** verified live.

## Test coverage (4 new tests in `src/tests/decisionIntelligence.test.ts`)

| Test | Covers |
|---|---|
| ordered, structured events | HTTP route returns events in timestamp order with correct `type`/`decisionId`/`executionId`, and no credential fields leak through event data |
| cross-user access | second user reading the first user's decision events → 404 |
| nonexistent decision | random ObjectId → 404 |
| reverse-ownership | user A reading user B's decision events → 404 |

HTTP tests follow the repo's existing `makeServer`/fetch pattern (no supertest
dependency). Full suite: **161 pass / 0 fail** (157 baseline + 4).

## Notable bugs found & fixed during the build

1. **`formatTime` type mismatch.** `EventStream`/`ExecutionTimeline` invoked
   `formatTime(event.createdAt)` on a `string`; it expects a `Date`. Fixed by
   wrapping with `new Date(...)` (caught by client tsc).
2. **Wrong lucide icon export.** `MessageSquareQuote` does not exist; replaced
   with `MessageSquare` (caught by client tsc).
3. **Nullable `Task.error`.** `TaskList` risks `error.length` on a possibly-null
   field; added a `renderError()` helper (caught by client tsc).
4. **Event filters referenced non-existent event types.** Verification/Red-Team
   filters matched `verify_claim.completed`/`red_team.*`, which the event bus
   never emits; task events carry `data.type`, so filters now match on that.
5. **Confidence-bar transparency.** Factor bars were derived without showing
   their basis; raw counts are now displayed inline and the card states the
   bars are derived from observed data, not backend-computed confidence.

## Verification commands

```bash
cd server
npx tsc --noEmit   # clean
npm test           # 161 pass / 0 fail (was 157)
npm run build      # clean

cd ../client
npx tsc --noEmit   # clean
npm run build      # clean (tsc && vite build)
```

## Scope limits (explicitly out)

- **Frontend lint gate.** `client/.eslintrc.cjs` is pre-existing broken (a
  `.cjs` containing a bare JSON object), `eslint-plugin-react-hooks` /
  `eslint-plugin-react-refresh` were never in `package.json`, and after
  installing and fixing the config, lint reports 104 pre-existing violations
  across untouched files plus a "no rules export" failure from
  `eslint-plugin-react-refresh@0.5.6`. Lint is not part of the Phase 7 DoD;
  the Phase 7 changes were reverted to keep the diff focused. Formal gates used
  here: `tsc --noEmit`, `npm run build`, `npm test`.
- **No client-side test runner.** The client has no jest/vitest harness; the
  spec's frontend test sections are therefore covered by `tsc + vite build`
  and the backend HTTP tests that exercise the same data contract the UI reads.
- **Full happy-path smoke** (execution to completion with real routed LLM
  agents, claims, verification, red-team, reconciliation, costs) requires
  provider API keys not present in this environment — documented above as
  unverified rather than silently claimed.
- **No WebSockets/SSE** — live updates are 3s polling by design; the event-bus
  emitter leaves room for a future push layer without UI changes.