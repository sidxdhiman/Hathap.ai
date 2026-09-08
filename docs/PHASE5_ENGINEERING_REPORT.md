# Phase 5 Engineering Report — Intelligent Decision Planner

**Status:** Implemented, tested, building clean
**Server tests:** 139 pass / 0 fail
**Modes:** `fixed` (legacy, unchanged) and `intelligent` (planner-driven)

## Problem

Phase 3/4 executes the same task graph for every decision: research → debate →
verify ×K ∥ red_team → reconciliation. A "should we order pizza?" decision is
treated exactly like "should we migrate our data center to Kubernetes?" — the
graph is not decision-specific, and there is no knob to control it. Phase 5
adds a **controlled intelligent planner** that analyzes a decision and produces
a validated, decision-appropriate task graph.

## Design goals (and how they were met)

### 1. Never LLM → DB / LLM → tool
The planner receives a **bounded context** and returns **strict JSON**. Nothing
it says is ever executed directly.

| Step | Component | Trust |
|---|---|---|
| Reason over the decision | `DecisionPlanner` → LLM | Output = proposal only |
| Approve / reject the proposal | `PlanValidator` | Deterministic, untrusted-input-safe |
| Persist real tasks + deps | `PlanCompiler` | Deterministic; tempId → real `_id` |
| Execute | existing `scheduler`/`executor`/`worker` | Unchanged |

### 2. Guaranteed progress
- Every intelligent attempt is timeout-capped (`planningTimeoutMs`).
- Malformed JSON, provider failure and rejected proposals all converge on the
  deterministic fallback (or baseline when no model is configured).
- A plan that cannot be validated at all fails the execution with a structured
  `PlanningError` (`PLAN_NOT_POSSIBLE`) instead of hanging or partially running.

### 3. Explanatory, auditable plans
`DecisionPlan` persists `rationale` (summary + per-stage notes) — a concise,
human-leggible "why this plan" for users and auditors. No chain-of-thought is
requested or stored.

### 4. Safe deploys
- `fixed` is byte-for-byte the old behavior (`startDecisionFixed`).
- New planning fields on `Execution` are additive.
- New Mongo model `DecisionPlan` is independent of existing collections.

## Trust-boundary details

**The validator is the gate.** It rejects:

- unknown task types; non-object proposals; unversioned/invalid plans
- planner-proposed `verify_claim` / `red_team` / `reconciliation` tasks — these
  are system-generated from the plan's termination flags because their inputs
  (claim/candidate IDs) don't exist until debate runs
- dependency errors: unknown `tempId`, self-dependency, cycles, over-depth
- policy overflow: task count, research count, results budget, depth
- dangerous payload keys — `url`, `baseUrl`, `tool`, `exec`, `shell`, `sql`,
  `collection`, `db`, credentials (`apiKey`, `token`, `secret`, `password`, …),
  callbacks/webhooks — at any nesting depth
- values that look like URLs, shell/exec code, `process.*`, or imports
- unknown capability requirements; research tasks without a non-empty `query`

The **compiler** maps only the validated tempId DAG to real Task `_id`s. The
planner never sees Mongo IDs and never controls dependency wiring beyond the
tempId references it proposes.

## Context minimisation

The prompt only contains:

```
decisionId, objective, description?, constraints[]?,
existingEvidence[{id, title, sourceReliability?}] (≤20 most recent),
existingClaimCount?, availableCapabilities[], researchQueries[]
```

No `userId`, no api keys, no collection names, no model/role/permission data.
This is asserted by an automated test that inspects the captured context.

## Fallback chain

```
attempt (timeout-capped) ── valid? ──▶ compile & run
      │  invalid JSON / rejected / provider failure
      ▼
fallback = buildFallbackPlan()   (source 'fallback')
   no model available? ──────▶ buildFallbackPlan(source 'baseline')
   fallback invalid? ────────▶ fail execution (PLAN_NOT_POSSIBLE)
```

`buildFallbackPlan` mirrors the old conservative workflow (research when
needed + debate, termination all-on), while `buildSimplifiedPlan` is a
debate-only plan for trivial decisions.

## Idempotency & recovery

- Unique index `decisionId + executionId` on `DecisionPlan` → one plan per
  execution.
- Resume path: re-entering `planExecution` on a `planned` execution reuses the
  persisted plan (`reusedExisting: true`) instead of generating a second graph.
- Compiler recovery: a crash between plan-persist and task-persist recreates
  missing tasks without duplicating the plan document or the graph.

## Termination flags → Phase 4 graph

The plan's `termination` `{ requiresVerification, requiresRedTeam,
requiresReconciliation }` gates `schedulePhase4DownstreamTasks`. A simplified
plan can skip verification and red team entirely and go straight to
reconciliation (or stop at the debate). Fixed-mode executions (no plan) default
to all-stages-on.

## Cost observability

`DecisionPlanner` records planner LLM usage into the existing `Execution`
token ledger (`tokenUsage`, `estimatedCost`, `actualCost`) and stores
`plannerModel`, `plannerVersion`, `planVersion` on the plan. `estimates`
(`estimatedTasks`, `estimatedResearchTasks`, `estimatedLLMTasks`) are captured
at plan time. No separate ledger; no dollar-cost optimizer (documented scope
limit).

## Notable bug fixed while testing

`EvidenceRelationship.upsertRelationship` used check-then-insert, so two
parallel `verify_claim` tasks seeding the same claim/evidence pair could both
pass the check and collide on the unique compound index (E11000), permanently
blocking the downstream reconciliation task. Now a single atomic
`findOneAndUpdate(..., { upsert: true })`.

## Test coverage (42 Phase 5 assertions across 3 files)

| File | Covers |
|---|---|
| `planningValidator.test.ts` | structure, disallowed system-generated types, deps/cycles/depth, limits, SSRF/exec/credential payloads, nested-value scanning, unit dependency checks |
| `planningPlanner.test.ts` | LLM accept path w/ real compiled `_id`s, idempotent replanning, bounded-context (no secrets), malformed-JSON/provider/rejection fallback, no-model baseline, impossible-plan failure, compiler recovery |
| `planningExecution.test.ts` | full persisted E2E (Decision → Planner → Validate → Compile → Scheduler → Research → Debate → Verify/RedTeam → Reconciliation → completed), simplified plan (no verify/red team), malformed-JSON fallback E2E |

The E2E executes the **real** `schedulePhase4DownstreamTasks` with fake
research/debate handlers and the real worker, so the plan → task → execution →
decision pipeline is exercised end-to-end with persisted documents.

## Verification commands

```bash
cd server
npx tsc --noEmit   # clean
npm test           # 139 pass / 0 fail
npm run build      # clean
```

Client: `npx tsc --noEmit` clean apart from two **pre-existing** unrelated
errors (`DashboardPage.tsx` unknown `Users`; `OnboardingPage.tsx` `Participant`
shape) that predate Phase 5.

## Scope limits (explicitly out)

- No full model routing/cost optimizer — records `plannerModel` only.
- No visual workflow editor and no plan-editing UI — plans are read-only.
- No chain-of-thought storage — only the auditable rationale.
- No planner-initiated research/verification with fabricated IDs.