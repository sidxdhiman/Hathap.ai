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
`awaiting_review`, `completed`, `failed`, `paused`.

### Execution
A persistent run of a Decision. Tracks: `decisionId`, `status`, `startedAt`,
`completedAt`, `currentPhase`, `currentTask`, `progress`, `error`, `retryCount`,
`maxRetries`, `tokenUsage`, `estimatedCost`, `actualCost`, and `metadata`.
Executions persist even if the server process dies.

**Statuses:** `pending`, `running`, `paused`, `completed`, `failed`, `partial`.

### Task
An executable unit of work within an Execution. Tracks: `executionId`, `type`,
`status`, `priority`, `input`, `output`, `assignedAgent`, `assignedModel`,
`dependencies`, `startedAt`, `completedAt`, `error`, and `metadata`.

**Task types (extensible):** `research`, `analysis`, `debate`, `challenge`,
`verification`, `synthesis`, `human_review`.

**Statuses:** `pending`, `ready`, `running`, `completed`, `failed`, `skipped`.

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
- `POST /api/decisions/:id/start` — start
- `POST /api/decisions/:id/pause` — pause
- `POST /api/decisions/:id/resume` — resume
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

- `startDecision` currently runs the debate synchronously through the existing
  DebateEngine; true async/background execution is a later phase.
- `pause`/`resume` update Decision state but do not yet suspend an in-flight
  synchronous debate run.
- Claim extraction is coarse: it maps `position/arguments/risks/recommendation`
  onto claim types rather than performing semantic analysis.
- No automatic model fallback yet; the default assigned-model behavior is
  preserved.
- Task dependencies are declared but a dependency scheduler is not yet
  implemented.

## Recommended next phase

1. **Async execution engine** — run Executions in the background (queue),
   enabling true pause/resume/retry and real-time progress.
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
