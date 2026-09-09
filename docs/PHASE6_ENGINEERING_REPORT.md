# Phase 6 Engineering Report — Intelligent Model & Agent Routing

**Status:** Implemented, tested, building clean
**Server tests:** 157 pass / 0 fail (139 baseline + 18 new routing tests)
**Server:** `npx tsc --noEmit` clean, `npm run build` clean
**Client:** `npx tsc --noEmit` clean, `npm run build` clean
**Policy version:** `routing-v1`

## Problem

When multiple models and agents are configured, every task ran on whatever
agent was assigned (one per agent, one assigned model per agent). There was no
way to:
- choose the best available model for a task at runtime,
- express that a task *requires* certain capabilities,
- keep executions within a per-task cost budget,
- recover a task onto a different model after a retryable provider failure,
- preview what will run *before* starting an execution.

Phase 6 adds a deterministic, transparent router that selects
model × agent per task at runtime, with an explicit `auto`/`manual`/`none`
mode and a dry-run preview endpoint.

## Design goals (and how they were met)

### 1. Deterministic and transparent
- Multi-factor weighted scoring (`quality .25, capability .25, specialization
  .15, reliability .15, cost .10, latency .10`, normalized to 1, env-overridable)
  with neutral priors for unknown quality/latency/cost.
- Candidates ordered by `createdAt` then `_id`; exact-score ties broken by a
  `1e-9 * ordinal` epsilon from that stable order. **Same inputs → same
  selection, always** (policy `routing-v1`).
- Every decision returns `favoredBy[]` (per-factor value/weight/contribution)
  and `reasons[]` (human notes) and emits `routing.*` events — auditable "what
  ran on which model and why". Cost *notes* are intentionally absent from
  `reasons[]` because cost is normalized within the routable set, not absolute.

### 2. Owned, safe candidates
- Model candidates require: same user, `enabled`, not `error`, and an encrypted
  API key present (`hasApiKey`). Agent candidates require same user and the
  pocket's task region. No cross-user routing is possible.
- Hard capability gates come from planner-declared
  `task.metadata.requirements`; soft requirements only affect scoring
  (`TASK_TYPE_SOFT_REQUIREMENTS`). Empty hard-gated result relaxes to
  best-overlap (`capabilityGateRelaxed:true`) by default; a true "nobody can
  cover it" yields `NO_AGENT_COVERS_REQUIREMENTS`.

### 3. Budget + fallback with bounded retries
- Per-task estimated-cost budget (`maxEstimatedCostPerTask`) excludes
  over-budget candidates when pricing is known; manual pins cannot silently
  exceed it either (`NO_CANDIDATE_WITHIN_BUDGET`).
- Fallback reselection happens **only** in `auto` mode, **only** on retryable
  errors, **at most once**, excludes the failed model, and emits
  `routing.fallback`. No alternative → normal retry with the original
  assignment (skipped, never an error).
- Routing failures (`NO_AVAILABLE_MODEL`, `NO_AVAILABLE_AGENT`,
  `MANUAL_MODEL_UNAVAILABLE`, `NO_CANDIDATE_WITHIN_BUDGET`,
  `NO_AGENT_COVERS_REQUIREMENTS`) are mapped to a permanent, non-retryable
  `ROUTING_FAILURE` — reselecting cannot fix "no candidates".

### 4. Backward compatible
- `ensureRouting` runs only when `execution.metadata.routing` exists. Courtroom
  and other legacy executions (no `metadata.routing`) skip routing entirely —
  byte-identical behavior.
- Zero routable models/agents → soft skip with reason
  (`"no routable models for this user — routing skipped (best-effort)"`), never
  an error. A decision with no API keys behaves exactly like before.
- Manual pin persists as `{mode:'manual', modelId}` and routes the pinned model;
  `none` keeps legacy assignment.

### 5. Preview before you pay
`GET /api/decisions/:id/plans/:planId/routing-preview` estimates the selection
for every plan task (agent, model, score, `favoredBy`, reasons, estimated cost)
**without persisting anything**.

## Trust-boundary notes

- The router is deterministic code (no LLM involved). The only runtime decision
  is *which available, owned candidate to rank first*.
- `Task.assignedAgent/assignedModel` remain authoritative on the Task; routing
  writes to them plus `Task.metadata.routing`, and the execution snapshot
  surfaces `metadata.routing` to the client.
- No credentials are read during routing — only `hasApiKey` (presence), and the
  API key is never logged or returned.

## Verified in a live smoke run (isolated `hathap_smoke` DB)

Real server (`dist`), real Mongo, real worker, real handlers:
- Signup seeded the 10 default agents with the new capabilities
  (`reasoning`, `fact_checking`, `research`, …).
- `POST /decisions/:id/start` with `{routeMode:'auto'}` persisted
  `metadata.routing = {mode:'auto'}`; the planning fell back to a baseline plan
  (no real LLM key configured — expected).
- `routing-preview` for the debate task returned `Scrum Master → gpt-4o`,
  score `0.750000001`, est. `$0.066`, reasons
  `capability … | specialization … | reliability "untested"`, `favoredBy`
  per-factor breakdown, `pricingKnown:true`.
- The live debate task then persisted `assignedAgent = Scrum Master`,
  `assignedModel = gpt-4o`, `metadata.routing = {mode:'auto', selection…}` —
  matching the preview exactly (determinism). The handler failed only because
  the API key is a fake smoke key; routing happened before the handler, as
  designed.
- A second decision started with `{routeMode:'manual', routingModelId}` routed
  its debate task to the pinned model with `selection.mode:'manual'`.
- Smoke DB dropped afterwards; dev DB untouched.

## Test coverage (18 new tests in `src/tests/routing.test.ts`)

| Suite | Covers |
|---|---|
| availability / ownership | routability (owned, enabled, not-error, key present); zero-model/zero-agent → skipped; manual unavailable/missing → `MANUAL_MODEL_UNAVAILABLE`; `NO_CANDIDATE_WITHIN_BUDGET`; manual-pin cannot bypass budget |
| deterministic scoring | cheapest model wins (cost factor = 1); quality override dominates cost; reliability-only weighting prefers connected; capability soft preference; hard-requirement gate + relaxation; `red_team`/`verify_claim` diversity bonus (provider differs both directions); deterministic repeated invocations with policy `routing-v1` |
| fallback | excludes the failed model, `fallbackUsed` + `fallbackFrom` (records most-recently-failed); every routable model excluded → skip; never re-picks an excluded model |
| executor integration (3) | auto-routed execution persists chosen agent/model **and hands `context.routing` to the handler** (modelId/agentId/modelName/provider asserted); re-execution reuses the persisted selection (idempotent, no reselection); legacy executions without `metadata.routing` skip routing and still complete |

## Notable bugs found & fixed during testing

1. **Missing `decisionId` in the fallback path.** `routeFallbackForRetry` was
   called without the execution's decision id; retry-reselection events could not
   be attributed. Fixed the call site.
2. **Type-only import drift.** `candidateResolver.ts`/`scoring.ts` imported
   `TaskType` from the wrong module after task types moved to `decision/types`.
   Fixed imports; caught by the server tsc gate.
3. **Nullable score in `toSelection`.** The router could invoke `toSelection`
   with a nil score; now takes an explicit `score: RoutingScore` guarded before
   the call.
4. **Non-deterministic candidate order.** Candidates were picked in Mongo
   default order; wired `candidateResolver` to sort `{createdAt:1, _id:1}` so
   tie-breaking is stable, and tests assert identical selections across
   repeated runs.
5. **Test-side tie expectations.** Several early test assertions baked in the
   assumption that the *earliest* agent/model wins; with `1e-9 * ordinal`
   epsilon the **later** candidate wins exact ties (e.g. Fact Checker beats
   Researcher on debate when both fully match). Tests were corrected to assert
   the actual contract, not a guess.

## Verification commands

```bash
cd server
npx tsc --noEmit   # clean
npm test           # 157 pass / 0 fail (was 139)
npm run build      # clean

cd ../client
npx tsc --noEmit   # clean
npm run build      # clean
```

## Scope limits (explicitly out)

- No dollar-cost optimizer — cost is rank-normalized within the routable set
  only; per-token absolute cost is not minimized.
- Manual mode pins a model, not a specific agent; the agent is auto-selected
  from that model's agents.
- No cross-provider API-key rotation / proxy; a user must have a stored
  encrypted key per model to make it routable.
- `routing-preview` is a dry run only — it does not allocate or validate
  downstream LLM connectivity.