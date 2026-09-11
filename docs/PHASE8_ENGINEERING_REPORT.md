# Phase 8 Engineering Report — Decision Memory & Outcomes

**Status:** Implemented, tested, building clean
**Server tests:** 194 pass / 0 fail (161 baseline + 33 new memory/E2E tests)
**Server:** `npx tsc --noEmit` clean, `npm run build` clean
**Client:** `npx tsc --noEmit` clean, `npm run build` clean

## Problem

Every completed decision discarded its entire intelligence trace. A user who ran
ten decisions could not retrieve which ones succeeded, what metrics changed, or
which lessons applied to a new problem. The planner made decisions in a vacuum —
no history, no feedback loop, no outcomes.

Phase 8 adds a structured Decision Memory & Outcomes layer that makes every
completed/cancelled/failed decision an indexable, queryable unit of historical
intelligence — without adding any LLM calls, vector stores, or generic RAG.

## Design goals (and how they were met)

### 1. Memory = index, not RAG

Memory is a structured document recording what happened: category, domain,
problem type, tags, entities, key claims, final recommendation, and a quality
score. Retrieval is deterministic structured similarity — no embeddings, no
vector DB, no generic text search. The quality score weights category (0.25),
domain (0.20), problem type (0.20), tags (0.20), entities (0.10), text
Jaccard overlap (0.25), time recency (0.05), and output type match (+0.10),
capped at 1.0.

### 2. Planner gets bounded, untrusted historical context

`buildHistoricalMemory` queries the retrieval service, caps at
`maxContextSize` (3000 chars), and wraps output in
`<historical_decision_memory>` delimiters with a security contract. The
planner system prompt explicitly states this is *untrusted reference data* —
it informs planning, never controls it. Memory retrieval uses `emitEvent:
false` so planner queries are invisible to the event log.

### 3. Expected vs. actual outcomes with variance

Outcomes are first-class documents (`kind: 'expected' | 'actual'`) with typed
metrics. `pairMetrics` computes raw variance and direction-aware `achieved`
status. Missing targets or values yield `meaningful: false` — the system
never guesses. Expected defaults to `pending`; actual defaults to `unknown`.

### 4. Human feedback is never reinterpreted

`DecisionFeedback` records `accepted | rejected | modified | unknown`. A
rejection is never automatically converted to a model failure — the system
respects the human's explicit statement. One record per decision (upsert on
POST/PATCH). The enrichment layer reads feedback to flag decisions whose
recommendation was rejected by the user.

### 5. Lessons with provenance

`DecisionLesson` records text + source (`human | llm_suggestion`) + status
(`confirmed | unconfirmed`). An LLM suggestion can never be created as
`confirmed` — only a human PATCH can confirm it. Lessons are counted in
retrieval results so downstream consumers see how many lessons a past
decision produced.

### 6. Ownership is never delegated

Every API route verifies ownership via `Decision.findOne({ _id, userId })`
and returns 404 (never 403) for non-owners. Retrieval queries filter by
`userId` at every level — `DecisionMemory`, `Outcome`, `DecisionLesson`,
`DecisionFeedback`. The "other user never surfaces" invariant is covered
by a dedicated test.

### 7. DELETE purge

`DELETE /api/decisions/:id` now also removes all Phase 8 artifacts
(`DecisionMemory`, `Outcome`, `DecisionFeedback`, `DecisionLesson`) for
that decision — cascade cleanup handled deterministically in the route.

## Memory lifecycle

```
Decision completes/cancels/fails
         │
    ┌────┴────┐
    │         │
    ▼         ▼
Worker      Orchestrator
(completion) (cancellation)
    │         │
    └────┬────┘
         ▼
recordDecisionMemory / createForDecision
         │
    DecisionMemory (status = completed | cancelled | failed)
```

Memory creation is best-effort try/catch with dynamic import — it never
blocks the decision lifecycle. Tags and categories come from
`decision.metadata` only (no LLM calls). Final recommendation comes from
persisted `ReconciliationResult`.

## Retrieval

`DecisionMemoryRetrievalService` accepts a `MemoryRetrievalQuery`:
- `userId` — always required (ownership gate)
- `excludeDecisionId` — the current decision (never returned)
- `category`, `domain`, `problemType`, `tags`, `entities` — structured
  fields matched with `$in` queries
- `outputType` — enriched from actual outcomes (filtering only)
- `statuses` — defaults to `['completed','cancelled','failed']`
- `maxResults` — defaults to policy max (5)

Retrieval queries by `userId` + `status` + `$or` on matching metadata
fields, excludes the current decision, then scores via
`StructuredSimilarityProvider`. Results are enriched with actual outcome
status (success/failure), confirmed lesson count, and feedback presence.

## Event types

Eight new event types in `eventBus.ts`:
`memory.created`, `memory.retrieved`, `outcome.created`,
`outcome.updated`, `feedback.created`, `feedback.updated`,
`lesson.created`, `lesson.updated`.

## API endpoints (all auth + ownership-scoped via 404)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/decisions/:id/memory` | Own memory record |
| GET | `/api/decisions/:id/related` | Related past decisions |
| GET | `/api/decisions/:id/outcomes` | Expected vs. actual outcomes |
| POST | `/api/decisions/:id/outcomes` | Create outcome |
| PATCH | `/api/decisions/:id/outcomes/:outcomeId` | Update outcome |
| GET | `/api/decisions/:id/feedback` | Own feedback |
| POST | `/api/decisions/:id/feedback` | Create/update feedback (upsert) |
| PATCH | `/api/decisions/:id/feedback/:feedbackId` | Update feedback |
| GET | `/api/decisions/:id/lessons` | Own lessons |
| POST | `/api/decisions/:id/lessons` | Create lesson |
| PATCH | `/api/decisions/:id/lessons/:lessonId` | Update lesson |
| DELETE | `/api/decisions/:id` | Also purges memory + outcomes + feedback + lessons |

## Frontend

Four new components in `client/src/components/decision/`:

| Component | Purpose |
|-----------|---------|
| `MemoryPanel` | Displays the decision's own memory index (category, domain, tags, entities, quality score) |
| `OutcomePanel` | Expected vs. actual outcomes with variance, status badges, metric pairing |
| `FeedbackPanel` | Human feedback (accepted/rejected/modified/unknown) with reasoning display |
| `LessonsPanel` | Lesson list with source badges (human/llm), status (confirmed/unconfirmed), creation timestamps |

All panels are integrated into `DecisionDetailPage` under a "Memory & Outcomes"
section. Fetch-on-mount with loading/error states and toast feedback.

`AppContext` exposes 14 new methods for CRUD operations on memory, outcomes,
feedback, and lessons. All client types defined in `client/src/types/index.ts`.

## Files

### New files (server)
- `server/src/models/DecisionMemory.ts` — memory index schema
- `server/src/models/Outcome.ts` — expected/actual outcomes schema
- `server/src/models/DecisionFeedback.ts` — human feedback schema
- `server/src/models/DecisionLesson.ts` — lessons schema
- `server/src/memory/types.ts` — all Phase 8 shared types
- `server/src/memory/memoryPolicy.ts` — defaults + version string
- `server/src/memory/similarityService.ts` — structured similarity scoring
- `server/src/memory/decisionMemoryService.ts` — index builder + quality
- `server/src/memory/outcomeService.ts` — outcome CRUD + variance
- `server/src/memory/feedbackService.ts` — feedback upsert
- `server/src/memory/lessonService.ts` — lesson CRUD with provenance guard
- `server/src/memory/decisionRetrievalService.ts` — bounded retrieval + enrichment
- `server/src/memory/memoryContextBuilder.ts` — untrusted context block
- `server/src/memory/index.ts` — barrel exports
- `server/src/tests/memory.test.ts` — 30 tests (unit + HTTP + service)
- `server/src/tests/memoryE2E.test.ts` — 3 tests (worker/orchestrator/planner E2E)

### New files (client)
- `client/src/components/decision/MemoryPanel.tsx`
- `client/src/components/decision/OutcomePanel.tsx`
- `client/src/components/decision/FeedbackPanel.tsx`
- `client/src/components/decision/LessonsPanel.tsx`

### Modified files
- `server/src/decision/eventBus.ts` — 8 new event types
- `server/src/tasks/worker.ts` — `recordDecisionMemory` hook on completion
- `server/src/decision/orchestrator.ts` — cancelled-decision memory hook
- `server/src/routes/decisions.ts` — 12 new endpoints + DELETE purge
- `server/src/planning/planTypes.ts` — `historicalMemory` in `PlanContext`
- `server/src/planning/planner.ts` — `buildHistoricalMemory` + untrusted context injection + system prompt
- `server/package.json` — test script includes new test files
- `client/src/types/index.ts` — Phase 8 type definitions
- `client/src/context/AppContext.tsx` — 14 new context methods
- `client/src/pages/DecisionDetailPage.tsx` — Phase 8 panel integration

## Test coverage (33 new tests)

| File | Tests | Covers |
|------|-------|--------|
| `memory.test.ts` | 30 | Memory CRUD, POST create idempotent, PATCH status, memory policy defaults, expected-vs-actual variance/achieved, feedback upsert + rejection semantics, lesson creation + human-only confirmation, retrieval basic + outputType filtering + policy cap, MemoryContextBuilder bounded output + no user leak, other-user isolation, DELETE purge, cross-user 404 |
| `memoryE2E.test.ts` | 3 | Worker completion auto-creates memory index, orchestrator cancellation records cancelled memory, planner planCall includes historicalMemory context |

## Notable bugs found & fixed during the build

1. **Enrichment ObjectId/string mismatch.** `DecisionRetrievalService.enrich`
   used `c.decisionId` (raw ObjectId) as a Map key where the Map was populated
   with string keys via `String(o.decisionId)`. Fixed by using `String(c.decisionId)`
   for all lookups.

2. **Aggregate pipeline type mismatch.** `DecisionLesson.aggregate` with
   `{ decisionId: { $in: decisionIds } }` failed when `decisionIds` were
   strings but the field schema was `ObjectId`. Fixed by converting to
   `mongoose.Types.ObjectId` instances for the aggregate pipeline.

3. **Aggregate userId type mismatch.** Same issue for `userId` in the
   aggregate `$match` — fixed by wrapping in `new mongoose.Types.ObjectId()`.

4. **Test assertion on excluded decision.** The "userB isolation" test asserted
   that `histB1` (the current decision) appeared in related results — but it's
   excluded by `excludeDecisionId`. Fixed by adding a second userB decision
   (`histB2`) and asserting on its title instead.

5. **E2E ObjectId comparison.** `memoryEvent.decisionId` is an ObjectId
   instance; the test compared it with `assert.equal` against a string.
   Fixed with `String(memoryEvent.decisionId)`.

## Verification commands

```bash
cd server
npx tsc --noEmit   # clean
npm test           # 194 pass / 0 fail (was 161)
npm run build      # clean

cd ../client
npx tsc --noEmit   # clean
npm run build      # clean (tsc && vite build)
```

## Scope limits

- **No vector DB / no generic RAG.** Memory is structured similarity only.
  Adding semantic search is a future phase.
- **No LLM in memory layer.** Categories, tags, and entities come from
  `decision.metadata`; final recommendation from `ReconciliationResult`.
  No LLM calls for memory indexing or retrieval.
- **One feedback record per decision.** Upsert semantics — no history of
  feedback changes (future: audit trail).
- **Memory context is reference-only.** The planner receives it as untrusted
  data in a delimited block; it cannot modify planning behavior beyond
  informing the context.
- **No client-side test runner.** Frontend covered by `tsc + vite build` and
  backend HTTP tests exercising the same data contract.
