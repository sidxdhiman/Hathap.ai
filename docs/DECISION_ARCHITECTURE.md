# Hathap.AI — Decision Intelligence Architecture (Phase 1)

This document describes the Phase 1 foundation that evolves Hathap.AI from a
multi-agent debate application toward an AI **Decision Intelligence platform**.

## Overview

### Current (legacy) architecture

```
User
 ↓
Courtroom
 ↓
DebateEngine
 ↓
Strategy (Consensus / Majority / Judge / Devil's Advocate / Open)
 ↓
AgentRunner
 ↓
LLM client
```

### New architecture (this phase)

```
User
 ↓
Decision
 ↓
Execution
 ↓
DecisionOrchestrator
 ↓
Tasks
 ↓
DebateEngine / Agents / Evidence
 ↓
Reasoning (strategies)
 ↓
Verdict / Decision
 ↓
Claims / Evidence
```

The two architectures coexist. Existing Courtrooms, debate strategies, A2A, and
the UI continue to function unchanged. Where a Courtroom debate runs, a linked
Decision + Execution is now also persisted so the debate is observable through
the new abstractions.

---

## New core entities

### Decision
A Decision is a persistent, first-class representation of a decision problem.
It conceptually contains: `userId`, `title`, `objective`, `context`, `status`,
`currentPhase`, `configuration`, `participants`, `assumptions`, `confidence`,
and `completedAt`. A Decision created from a Courtroom links back via
`courtroomId`.

**Statuses:** `draft`, `investigating`, `reasoning`, `debating`, `verifying`,
`awaiting_review`, `completed`, `failed`, `paused`, `cancelled`.

### Execution
A persistent run of a Decision. Tracks: `decisionId`, `status`, `startedAt`,
`completedAt`, `currentPhase`, `currentTask`, `progress`, `error`, `retryCount`,
`maxRetries`, `tokenUsage`, `estimatedCost`, `actualCost`, and `metadata`.
Executions persist even if the server process dies.

**Statuses:** `queued`, `running`, `paused`, `completed`, `failed`, `cancelled`.

### Task
An executable unit of work within an Execution. Tracks: `executionId`, `type`,
`status`, `priority`, `input`, `output`, `assignedAgent`, `assignedModel`,
`dependencies`, `startedAt`, `completedAt`, `error`, and `metadata`.

**Task types (extensible):** `research`, `analysis`, `debate`, `challenge`,
`verification`, `synthesis`, `human_review`.

**Statuses:** `queued`, `pending`, `ready`, `running`, `retrying`, `paused`,
`completed`, `failed`, `cancelled`, `skipped`.

### Claim
A structured statement extracted from agent output. Tracks: `decisionId`,
`agentId`, `text`, `type`, `confidence`, `status`, `evidenceIds`,
`sourceAgentId`, and `metadata`.

**Claim types:** `fact`, `assumption`, `opinion`, `inference`,
`recommendation`, `risk`.

**Claim statuses:** `proposed`, `accepted`, `rejected`, `disputed`,
`verified`, `unverified`.

### Evidence
A first-class reference to information supporting a Decision. Tracks:
`decisionId`, `type`, `title`, `content`, `source`, `sourceUrl`, `sourceType`,
`reliability`, and `retrievedAt`.

**Source types:** `web`, `document`, `database`, `user_input`,
`agent_generated`, `api`, `github`, `notion`. Phase 1 supports `user_input`
and `agent_generated`.

### Capabilities (Agent extension)
Agents now carry an optional `capabilities[]` array. Documented capability
values: `financial_analysis`, `technical_analysis`, `research`,
`security_review`, `legal_analysis`, `product_strategy`, `risk_analysis`,
`fact_checking`.

---

## State machine

All state transitions are centralized in `server/src/decision/stateMachine.ts`
via the `StateMachine` class. Route handlers, orchestrator, and strategies
must route transitions through this class rather than hard-coding state
changes. This makes the state machine extensible later.

The class exposes:
- `canTransitionDecision / transitionDecision`
- `canTransitionExecution / transitionExecution`
- `canTransitionTask / transitionTask`
- `phaseFromStatus`
- Introspection helpers (`getDecisionStates`, `allDecisionTransitions`, etc.)

---

## Execution lifecycle

1. `DecisionOrchestrator.startDecision(decisionId, userId)`:
   - Transition Decision `draft → debating`
   - Create a persistent `Execution` (status `running`)
   - Create an initial `Task` (analysis)
   - Run the debate through `DebateEngine.executeForDecision` (same strategies)
   - Persist `Claims` from the debate messages
   - Aggregate token usage/cost into the Execution
   - Transition Decision `debating → completed`
2. On failure the Execution is marked `failed` with a classified error and the
   Decision is marked `failed` — partial results remain inspectable.

## Task lifecycle

Tasks move `pending → ready → running → completed` (or `failed`/`skipped`).
Each transition is validated against the state machine. Dependencies are
declared per-task, ready to be resolved by a future scheduler.

---

## Usage / cost accounting

Centralized in `server/src/decision/usage.ts`:
- `recordUsage(...)` — builds a `TokenUsage` record from input/output tokens,
  model, provider, and latency, estimating cost from a pricing table.
- `aggregateUsage(...)` — sums multiple records.
- `usageSummary(...)` — groups by model and total call counts.

The LLM client (`engine/llmClient.ts`) now accepts an optional `onUsage`
callback and invokes it on each successful completion. `AgentRunner` and
`verdictGenerator` thread `context.onUsage` through, so every agent turn and
synthesis call is captured. This answers "how much did this Decision cost"
and "which part consumed the most".

---

## Error handling & recovery

Errors are classified via `DecisionOrchestrator.classifyError` into:
`TIMEOUT`, `RATE_LIMIT`, `INSUFFICIENT_CREDITS`, `INVALID_API_KEY`,
`MALFORMED_OUTPUT`, `PROVIDER_OUTAGE`, `MODEL_UNAVAILABLE`,
`NETWORK_FAILURE`, `AGENT_FAILURE`.

There is a clear distinction between:
- **Task failure** — a unit of work failed (retryable).
- **Agent failure** — an individual agent call failed.
- **Execution failure** — the whole run failed (Execution `status = failed`).
- **Decision failure** — the Decision is marked `failed`.

A single agent failure does not corrupt the whole Decision — partial results
and usage remain recorded in the Execution.

---

## Agent → Model decoupling

`Task.assignedModel`, `Agent.assignedModelId`, and `Execution` records separate
the concerns of **Agent** (who/what), **Model** (which LLM), **Execution**
(which run), and **Task** (what work). This structure makes automatic model
routing possible later, while defaulting to the existing assigned-model
behavior today.

---

## API

New routes under `/api/decisions` (all require auth):
- `GET /api/decisions` — list
- `POST /api/decisions` — create
- `GET /api/decisions/:id` — get
- `PUT /api/decisions/:id` — update
- `DELETE /api/decisions/:id` — delete
- `POST /api/decisions/:id/start` — start (202, returns `executionId`)
- `POST /api/decisions/:id/pause` — pause
- `POST /api/decisions/:id/resume` — resume
- `POST /api/decisions/:id/cancel` — cancel
- `GET /api/executions/:executionId` — execution detail (ownership-checked)
- `GET /api/tasks/:taskId` — task detail (ownership-checked)
- `GET /api/decisions/:id/executions` — executions
- `GET /api/decisions/:id/tasks` — tasks
- `GET /api/decisions/:id/claims` — claims
- `GET /api/decisions/:id/evidence` — evidence
- `GET /api/decisions/:id/snapshot` — combined snapshot
- `GET /api/decisions/states` — state machine definition

The existing Courtroom API (`/api/courtrooms/*`) is **unchanged** and remains
the primary backward-compatible surface. When a Courtroom debate completes,
the start route also creates a linked Decision + Execution (best effort).

---

## Migration & backward compatibility

- No existing Courtroom endpoints, strategies, models, or UI flows were
  removed or renamed.
- New entities are **additive** Mongoose collections (`Decision`, `Execution`,
  `Task`, `Claim`, `Evidence`).
- The Courtroom model is unchanged. Agents gained optional `capabilities`,
  `tools`, `constraints`, and `logo` fields (additive, non-breaking).
- `DebateEngine.runDebate` is preserved verbatim for the Courtroom path.
  A new `DebateEngine.executeForDecision` method powers the Decision path
  through the same strategy objects.
- `DebateContext` gained an optional `onUsage` field (additive).
- `generateVerdict` gained an optional `onUsage` parameter (additive).

---

## File map

### New files
- `server/src/decision/types.ts` — all new TypeScript interfaces
- `server/src/decision/stateMachine.ts` — centralized state machine
- `server/src/decision/usage.ts` — token/cost accounting
- `server/src/decision/orchestrator.ts` — DecisionOrchestrator
- `server/src/models/Decision.ts`
- `server/src/models/Execution.ts`
- `server/src/models/Task.ts`
- `server/src/models/Claim.ts`
- `server/src/models/Evidence.ts`
- `server/src/routes/decisions.ts`
- `server/src/tests/decisionCore.test.ts`
- `server/src/tests/orchestratorLifecycle.test.ts`

### Modified files
- `server/src/engine/types.ts` — added `onUsage` to `DebateContext`
- `server/src/engine/llmClient.ts` — `onUsage` callback + usage recording
- `server/src/engine/agentRunner.ts` — threads `onUsage`
- `server/src/engine/verdictGenerator.ts` — `onUsage` parameter
- `server/src/engine/strategies/*.ts` — pass `ctx.onUsage` to verdict
- `server/src/engine/debateEngine.ts` — added `executeForDecision`
- `server/src/models/Agent.ts` — capabilities, tools, constraints, logo
- `server/src/routes/courtrooms.ts` — Decision/Execution bridge on start
- `server/src/index.ts` — mount `/api/decisions`
- `server/package.json` — test scripts
- `server/src/a2a/messageParser.ts` — export `normalizeDebateRequest`
- `client/src/types/index.ts` — Decision types added
- `client/src/context/AppContext.tsx` — decision state + API methods

---

## Testing & verification

```bash
cd server
npm test            # 33 tests: state machine, usage, parsing, A2A, lifecycle
npm run build       # TypeScript compiles
```

### Coverage
- Decision creation + evidence recording
- Execution lifecycle (failed run persists degraded state)
- Task lifecycle (partial/explicit states)
- State transitions (valid + invalid)
- Token usage aggregation and cost estimation
- Structured result parsing (valid, fenced, malformed, missing fields)
- A2A message normalization compatibility

## Known limitations (Phase 1)

> Superseded for async behavior by **Phase 2** (see below). Items marked ✅ are
> now implemented by the async execution engine.

- ✅ `startDecision` runs the debate synchronously through the existing
  DebateEngine; true async/background execution is a later phase. *(Now async in
  Phase 2.)*
- ✅ `pause`/`resume` update Decision state but do not yet suspend an in-flight
  synchronous debate run. *(Now real in Phase 2.)*
- Claim extraction is coarse: it maps `position/arguments/risks/recommendation`
  onto claim types rather than performing semantic analysis.
- No automatic model fallback yet; the default assigned-model behavior is
  preserved.
- ✅ Task dependencies are declared but a dependency scheduler is not yet
  implemented. *(Now implemented in Phase 2.)*

## Recommended next phase

> **Async execution engine** (item 1) is implemented in **Phase 2** below.

1. ✅ **Async execution engine** — background scheduler/executor, pause/resume/
   retry/cancel, progress, recovery, and an internal event system.
2. **Claim graph** — richer claim relationships, verification task type, and
   evidence linking.
3. **Model routing** — select a model per Task based on quality/cost/latency,
   with fallback on failure.
4. **Evidence sources** — plug in web search, PDF, GitHub, and Notion via the
   Evidence abstraction.
5. **Red-team / verification tasks** — execute `challenge` and `verification`
   task types to harden Decisions before `awaiting_review`.
6. **Observability UI** — visualize Execution/Task/Agent/Model/LLM stack on the
   frontend.

---

# Phase 2 — Persistent Async Execution Engine

Updates the Phase 1 architecture so Executions run **asynchronously in the
background** beneath the DecisionOrchestrator, without breaking the Courtroom
API, the 5 debate strategies, A2A, or the UI.

## Architecture principles

- **API must not execute long-running Decisions.** `/api/decisions/:id/start`
  now validates, transitions Decision → `debating`, creates a `queued`
  Execution, seeds initial tasks, and returns `202` with an `executionId` —
  returning immediately.
- **Scheduler decides WHAT runs**; the executor decides HOW; **handlers contain
  task logic**; the orchestrator coordinates; **persistence is the source of
  truth** (a crashed worker can be replaced); **events only describe state
  changes** (never drive behavior).

## New engine components

### Scheduler (`scheduler.ts`)
A **pure** function `schedule(executionStatus, tasks)` returning
`{ executable, blocked }`. No I/O, no business logic — easy to test and swap.
Given the execution status and the full task list it decides which tasks are
ready to run based on:

- Execution must be `running` (or `queued` and being processed) — not paused/
  cancelled/completed/failed.
- Dependencies: a task is ready only when all its dependency tasks are
  `completed`.
- Retry backoff: a `retrying` task is not ready until `nextRetryAt` has passed.
- Priority ordering (lower number = higher priority run first).
- Task may be `pending`/`ready`/`retrying` (never `running`/`completed`).

### Error classifier (`errorClassifier.ts`)
`classifyError`, `isRetryableError`, `buildTaskError`, `buildExecutionError`,
`isDependencyFailureKind`. Classifies thrown errors into
`TaskFailureKind` = `retryable` | `permanent` | `dependency`. May provide a
`retryAfterMs` hint. Maps to stable `code`/`message` fields persisted on
Task/Execution `error`.

### Event system (`eventBus.ts` + `ExecutionEvent` model)
`ExecutionEventBus` — an in-process `EventEmitter` (swappable later for a real
queue) that also **persists** each emitted event as an `ExecutionEvent` doc.
`emit({ type, executionId, decisionId, taskId, data, timestamp })` sets a
default `timestamp`. Event types include `task.started`, `task.completed`,
`task.retrying`, `task.failed`, `execution.completed`, `execution.failed`,
`execution.cancelled`, `execution.paused`, `execution.resumed`.

### Task handlers (`handlers/*`, `handlers/index.ts`)
`TaskHandlerRegistry` + `DefaultTaskHandlerRegistry`. A handler implements
`canHandle(type)` and `execute(task, context)`. Current handlers all delegate
to `DebateEngine.executeForDecision` for Phase 2:
- `debate` → `debateHandler`
- `analysis` → `analysisHandler`
- `synthesis` → `synthesisHandler`

### Executor (`executor.ts`)
`TaskExecutor` claims work with `workerId` + `leasedAt` (atomic claim on the
`ready`/`pending`/`retrying` task), runs it via the matching handler, aggregates
`onUsage` into the Execution's token/cost records, and on failure decides
**retry vs permanent fail**:
- `canRetry = attempt <= task.maxRetries` (maxRetries = retries after the first
  attempt) and error is retryable → task `retrying`, `retryCount++`,
  `nextRetryAt = now + backoff(retryCount)`.
- Otherwise → task `failed` permanently with the classified error.
- Idempotency guard: a task already `completed` with a result is never re-run.

### Worker (`worker.ts`)
A lightweight in-process poller (the stand-in for a real queue) with a singleton
guarded by an `active` flag (does not act until `start()`). Each `tick`:

1. **Recover stale tasks** — `running` tasks whose `leasedAt` is older than
   `staleTaskTimeoutMs` are reset to `retrying` with backoff (crashed worker).
2. **Recover interrupted executions** — `running`/`queued` executions whose
   `updatedAt` is stale and have no in-flight tasks are re-processed.
3. **Process executions** — for each non-terminal running/queued execution, run
   `schedule`, mark ready tasks, then claim/run up to `maxConcurrentTasks`.
4. **Maybe finalize** — when a background task settles, re-check; if no task is
   still in progress, finalize the execution:
   - all tasks completed → `execution.completed` + Decision `completed`
     (with extracted `confidence`)
   - any task permanently failed → `execution.failed` + Decision `failed`

Exposes `wake()` (trigger an immediate tick) and `tickNow()` (synchronous
single tick — used by tests). Concurrency limited by `maxConcurrentTasks`.
`maybeFinalize` re-runs after each settled background task (plus a short retry)
to avoid the completion race between simultaneously finishing tasks.

## Orchestrator behavior

- `startDecision` is now **async**: transition → create `queued` Execution →
  create a single `debate` task → return `{ executionId }` immediately. The
  worker executes it in the background.
- `pauseDecision` / `resumeDecision` / `cancelDecision` are **real**: they
  transition the Decision and the Execution(s) and, on cancel, mark non-terminal
  tasks as `cancelled`.
- `getSnapshot` includes a `progress` summary (`progress`, completed/failed/
  running/pending/ready task counts).
- The legacy synchronous `createCourthouseExecution` / `linkFromCourtroom`
  path is preserved verbatim for Courtroom compatibility.

## State machine additions

- Decision: added `cancelled`.
- Execution: added `queued` (initial), `cancelled`, `cancelledAt`; removed
  `pending`/`partial`.
- Task: added `queued`, `retrying`, `paused`, `cancelled`.
- `phaseFromStatus` now maps a `cancelled`/`failed` terminal Decision so the UI
  shows `cancelled`/`failed` instead of a stale phase.

## Schema / persistence changes

- `Execution` — new `queued`/`cancelled`/`cancelledAt`; progress counters
  `totalTasks/completedTasks/failedTasks/runningTasks/pendingTasks/readyTasks`.
- `Task` — retry fields (`retryCount`, `maxRetries`, `nextRetryAt`,
  `lastError`), lease fields (`workerId`, `leasedAt`), `attempts`, `result`,
  persistent `TaskErrorSchema`.
- `ExecutionEvent` — new collection of persisted state-change events.
- `Decision` — `cancelled` added to the status enum.

## API changes

- `POST /api/decisions/:id/start` → returns `202` with `{ executionId }`
  (no longer blocks on the debate).
- `POST /api/decisions/:id/cancel` — cancels the Decision + its Execution(s).
- `GET /api/executions/:executionId` — execution detail (ownership-checked).
- `GET /api/tasks/:taskId` — task detail (ownership-checked).
- Client: `AppContext` gained `cancelDecision`; `startDecision` already handles
  the `202` async response.

## Startup & shutdown

`index.ts` boot is now async: connect to Mongo → `worker.start()` (activate the
singleton) → listen. SIGINT/SIGTERM trigger graceful shutdown (worker
`stop()`, server close, Mongo disconnect).

## Intentionally NOT implemented (Phase 2)

- Web/PDF/GitHub/Notion integrations.
- `challenge`, `verification`, `human_review`, `tool_call` handlers (types and
  registry slots exist; no handlers registered for them yet).
- WebSockets/SSE — the UI polls snapshots for progress; the internal event
  system is built now and will feed streaming later.

## Tests

| File | Scope |
| --- | --- |
| `scheduler.test.ts` | Pure scheduler: readiness, deps, backoff, priority |
| `executionEngine.test.ts` | In-process worker + fake handler: async lifecycle, retries/exhaustion, cancellation, stale recovery, idempotency, concurrency, 10-decision stress, dependency ordering, progress |

**Concurrency note:** DB-backed test files run in parallel child processes, so
each uses a distinct DB name (`hathap_test_engine`,
`hathap_test`, …) to avoid cross-file interference. Tests construct their own
`Worker` instances and drive them with `tickNow()` (never rely on the singleton
ticking on its own).

```bash
cd server
npm run test:scheduler  # pure scheduler tests
npm run test:engine     # in-process engine + worker tests
npm test                # full suite (56 tests)
npm run build           # TypeScript compiles
```

## Phase 2 deliverable summary

- Pure scheduler + dependency/priority/backoff resolution.
- Executor with worker claim/lease, idempotency, usage aggregation, retry-vs-
  fail decision.
- Worker: poll loop, stale-task + interrupted-execution recovery, concurrency
  ceiling, wake/tickNow, completion finalization.
- Handler registry + debate/analysis/synthesis handlers (delegating to
  DebateEngine).
- Real pause/resume/cancel for Decisions + Executions.
- Progress tracking (progress % + per-status task counters).
- Persistent internal event system.
- Async `start` (202) + execution/task detail endpoints + cancel.
- Graceful startup/shutdown with worker activate/deactivate.
- Tests: scheduler + engine (all green), full suite green, build green.
- Docs updated (this section).
