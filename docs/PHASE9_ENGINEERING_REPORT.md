# Phase 9 Engineering Report — Evaluation, Benchmarks & Regression Detection

**Status:** Implemented, tested, building clean
**Server tests:** 220 pass / 0 fail (194 baseline + 26 new evaluation tests)
**Server:** `npx tsc --noEmit` clean, `npm run build` clean
**Scope note:** Server-only. No client code is affected by Phase 9.

## Problem

Phases 4–7 made the orchestrator intelligent: a planner, research, verification,
red-team, routing, memory and outcomes. Every change to those systems shipped
without any way to measure whether the next version produced *better or worse*
decisions. "Improvements" were asserted, never demonstrated.

Phase 9 adds a deterministic evaluation layer — benchmarks, cases, rubrics,
scored runs and baseline regression detection — so that every planner/orchestrator
change can be measured against a fixed reference before it reaches users.

## Design goals (and how they were met)

### 1. Deterministic scoring — no LLM-as-judge (Cost/D terminology)

The scoring pipeline is 100% deterministic and offline, so a test run costs
nothing and is byte-reproducible. No provider is called during evaluation of an
artifact. Why it is *offline*: an LLM judge would (a) cost money per case per run,
(b) be non-deterministic, breaking baseline reproducibility, and (c) be
gameable. Score comes from three evaluators:

- **Structural** (`structuralEvaluator.ts`): checks the output shape against the
  rubric — a recommendation exists, supported claims are present, contradicted
  claims are marked (not asserted), conflicting evidence is surfaced, and the
  budget-relevant metadata (`budget.contextBudgetTokens`) did not get wedged into
  output fields.
- **Quality** (`qualityEvaluator.ts`): rule-based checks on reasoning depth,
  outcome/surprise accounting, evidence coverage and internal consistency. Empty
  artifact ids short-circuit to "applicable: false" with zeroed signals rather
  than throwing ObjectId cast errors.
- **Efficiency** (`evaluationService.ts`): time-tokens spent vs. the run's
  per-case budget (`ctx.limits`). Efficiency warns but never rejects — it is
  weighted 0.2 in the composite and surfaces as a metric, because an expensive
  path is a signal, not a disqualifier.

Composite = `0.4·structural + 0.4·quality + 0.2·efficiency`, clamped to [0,1].

### 2. Benchmarks, cases, rubrics, baselines as first-class documents

Six persistent models: `Benchmark`, `BenchmarkCase`, `Rubric`, `Baseline`,
`EvaluationRun`, `EvaluationCaseResult`, `EvaluationComparison`. Rubrics are
versioned — any snapshot pins the rubric version it was scored against, so
re-running an old baseline never re-interprets old output with new criteria.

### 3. Seeded default benchmark

`POST /api/evaluations/seed` creates a default benchmark ("Core decision
completeness and honesty") with ~10 active cases and a default rubric — but only
once per user. The endpoint returns `201` with `created: true` on first
creation and `200` with `created: false` on subsequent calls (idempotent).

### 4. Runs: draft → queued → running → completed/partial/failed/cancelled

- `POST /:runId/start` promotes a draft and fires a background worker.
- `POST /:runId/execute` runs the same loop **synchronously** (used by the test
  suite) while a stale-lock + single-flight guard prevents duplicate execution.
  Re-executing a terminal run is a no-op that returns the persisted run.
- Every case is isolated: a throwing case is recorded as `error` and the run
  finishes as `partial` (never silently incomplete, never "completed" while
  cases failed). The run emits `evaluation.run.partial` via the event bus when
  any case errors.
- `POST /:runId/cancel` only affects runs still in progress; deleting a run
  purges its case results.

### 5. Bounded decision-engine integration

For cases driven through the real orchestrator, the runner calls
`decisionOrchestrator.createDecision` then `startDecision`, then polls the
decision snapshot until terminal or `maxDecisionWaitMs` elapses, after which it
polls the orchestrator's own cancel path. The settings are capped by policy:
`maxDecisionWaitMs` and `pollIntervalMs` come from `decisionEngineSettings`
(defaults 20s / 1s) and the whole poll loop is bounded — a stuck worker cannot
hang a run forever. The test suite proves the timeout path deterministically
with a tiny `maxDecisionWaitMs`.

### 6. Regression detection

`run-vs-run` and `run-vs-baseline` comparisons persist an aggregate composite
delta. If the current run's aggregate is below the reference by more than
`epsilon` (default 0.05), the comparison is flagged `regression: true`. A
baseline can be created from a reference run's aggregate (`POST /baselines`) so
teams can freeze quality thresholds over time.

### 7. Ablations are constrained

Ablation runs must specify `parentRunId` and inherit the parent's benchmark —
you cannot silently ablate against a different benchmark and claim a fair diff.

### 8. Honesty over fabrication

A case with no decision artifact yields an `error` "no artifact to evaluate"
result — never an invented score, recommendation, or reasoning. Direct
`POST /evaluate-decision` returns `422` when the decision has no evaluable
artifact (no executionId / answerText / recommendation). Empty-decision guards
in `qualityEvaluator` make "not applicable" a first-class result instead of a
crash.

### 9. Ownership is never delegated

Every evaluation route looks up by `{ _id, userId }` and returns 404 for
non-owners (never 403) — identical to Phases 4–8. Covered by dedicated
"ownership isolation" tests for benchmarks, runs, comparisons and baselines.

### 10. Capability-agnostic limits

`evaluationPolicy.ts` defines per-case budgets (time, tokens, max artifacts)
merged from environment-configurable smalls; `makeEvaluationPolicy` produces a
deterministic merged policy so tests pin tiny limits without touching globals.

## API surface (`/api/evaluations`)

```
POST   /seed                          idempotent benchmark+rubric seed (201/200)
GET    /meta                          policy, system-under-test, limits
GET    /benchmarks                    list owned benchmarks
POST   /benchmarks                    create benchmark (cases optional)
GET    /benchmarks/:id                read with live case count
PATCH  /benchmarks/:id                rename/description
DELETE /benchmarks/:id                cascades cases + runs built on it
POST   /benchmarks/:id/cases          add a case (title + prompt required)
GET    /benchmarks/:id/cases          list active cases
PATCH  /benchmarks/:id/cases/:caseId  update a case
DELETE /benchmarks/:id/cases/:caseId  soft-delete a case
GET    /rubrics                       list owned rubrics
POST   /rubrics                       create rubric (v1)
PATCH  /rubrics/:id                   update → version bump
GET    /rubrics/:id/snapshot          pinned snapshot
POST   /baselines                     create baseline from a reference run
GET    /baselines                     list owned baselines
DELETE /baselines/:id                 remove baseline
GET    /runs                          list owned runs
POST   /runs                          draft run (selects cases deterministically)
POST   /runs/:id/start                queued → background execution
POST   /runs/:id/execute              synchronous execution (idempotent)
POST   /runs/:id/cancel               cancel in-progress run
GET    /runs/:id                      run snapshot (draft or progress)
GET    /runs/:id/aggregate            mean composite across included cases
GET    /runs/:id/results              per-case results
DELETE /runs/:id                      delete run + results
POST   /runs/:id/export-baseline      freeze run as a baseline
POST   /compare-runs                  run-vs-run regression check (persists)
POST   /compare-baseline              run-vs-baseline regression check (persists)
GET    /comparisons                   list owned comparisons
DELETE /comparisons/:id               remove a comparison
POST   /evaluate-decision             score an existing decision artifact
```

## Test coverage (26 new)

- seed & benchmarks: idempotent seed (201/200), ownership isolation, case CRUD,
  rubric versioning.
- static evaluation runs: run creation, full synchronous execution, good-vs-
  no-artifact honesty, idempotent re-execute, aggregate endpoint, ownership,
  cancel/delete.
- baselines & regression: reference run, baseline freeze, weak-answer regression
  detection (run-vs-run and run-vs-baseline), comparison listing/isolation.
- ablation: parentRunId requirement.
- bounded decision engine: no provider needed — the timeout path completes a run
  deterministically and is never a hang.
- direct decision evaluation: missing decisionId → 400, no evaluable artifact →
  422, reconciled artifact → 200.
- unit sanity: policy merge, rubric snapshot pinning, benchmark-scoped deletion.

## Recovery note

A mid-phase crash destroyed the module's working files. The module was rebuilt
from zero (see `server/RECOVERY-REPORT.md`) and re-verified end to end: the
full 220-test suite passes on a single concurrency, `tsc` and `npm run build`
are clean. The remediation is complete and supersedes the recovery report.