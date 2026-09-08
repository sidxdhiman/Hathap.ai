# Hathap.AI — Phase 4 Engineering Report

**Scope:** Verification, Red Team & Evidence Graph (V/RT/EG)
**Status:** Complete
**Tests:** 97 passing (72 prior + 25 new), TypeScript clean, server build clean.

---

## 1. What was implemented

Phase 4 turns the pipeline from "debate produces an answer" into a pipeline that
challenges its own answer. After the debate produces a **candidate verdict**, the
decision now flows through verification (evidence-based, deterministic), a red
team (adversarial, deterministic, auditable), and a reconciliation stage that
merges those into a **final verdict** — while recording which evidence supports,
contradicts, or merely relates to each claim.

```
Decision → Research (Phase 3) → Debate (candidate verdict) → VerifyClaim (×K) ∥ RedTeam
                                                                    │
                                                                    ▼
                                                             Reconciliation (final verdict)
                                                                    │
                                                         needsMoreResearch? (persisted, no recursion)
```

### New task types (Phase 2 engine)
- `verify_claim` — one per deterministically selected claim (fact > assumption >
  recommendation > inference; evidence-backed weighted; capped at 8).
- `red_team` — one per decision, runs in parallel with verification.
- `reconciliation` — depends on **all** verify_claim tasks + the red_team task.

All three are ordinary task types: they flow through the existing
scheduler/executor/worker (`decision/scheduler.ts`, `decision/executor.ts`,
`tasks/worker.ts`), so retries, backoff, lease recovery, idempotency, usage
accounting, priority, and dependency resolution come for free.

### New models (`server/src/models/`)
| Model | Purpose |
| --- | --- |
| `EvidenceRelationship.ts` | Explicit `supports`/`contradicts`/`related` claim↔evidence edges; unique compound index `{decisionId, claimId, evidenceId}`; idempotent upserts. |
| `VerificationResult.ts` | One auditable result per `(claimId, taskId)`: status + classified evidence IDs + rationale + confidence + mode. |
| `RedTeamFinding.ts` | Structured adversarial finding: severity, type, description, related claim/evidence IDs, suggested action. |
| `ReconciliationResult.ts` | Merged final verdict: recommendation, surviving/rejected/uncertain/unresolved/red-team IDs, `needsMoreResearch`, `researchQuestions`, rationale. |

### New services (`server/src/decision/`)
- **`evidenceGraphService.ts`** — idempotent relationship upserts, per-claim /
  per-evidence / per-decision queries, decision-scoped delete, and
  `seedFromExistingClaims` which bridges Phase 3's coarse
  `claim.supportingEvidenceIds / contradictingEvidenceIds / evidenceIds` into
  explicit graph edges.
- **`verificationService.ts`** — deterministic verification:
  - any `contradicts` relationship → **contradicted**
  - else any `supports` → **supported**
  - else any `related` (or evidence provided) → **inconclusive**
  - else → **unsupported**
  Idempotent map-reduce persisted via `findOneAndUpdate(…, {upsert})` on
  `(claimId, taskId)`.
- **`redTeamService.ts`** — 5 deterministic adversarial analyses:
  1. assumptions with no supporting evidence (`invalid_assumption`, high)
  2. claims with contradicting evidence (`contradictory_evidence`, high)
  3. non-opinion claims with no evidence (`missing_evidence`, medium)
  4. evidence not linked to any claim (`logic_gap`, medium)
  5. inferences with no linked evidence (`missing_evidence`, low)
- **`reconciliationService.ts`** — categorizes claims by verification status,
  collects red-team finding IDs, flags `needsMoreResearch` when claims were
  contradicted or high/critical findings exist, builds a rationale string, and
  upserts the single `ReconciliationResult` per `(decisionId, taskId)`.

### New handlers (`server/src/tasks/handlers/`)
`verifyClaimHandler`, `redTeamHandler`, `reconciliationHandler` — thin
boundaries validating input/ownership scope before delegating to their services,
and registered in the default registry (`handlers/index.ts`).

### Wiring (`server/src/tasks/handlers/debateHandler.ts`)
After the debate completes and claims are persisted:
1. `evidenceGraphService.seedFromExistingClaims(decisionId, executionId)` — bridges
   the coarse Phase 3 attribution into explicit graph edges.
2. Creates `verify_claim` task(s) for the selected claims.
3. Creates the `red_team` task (parallel with verification).
4. Creates the `reconciliation` task depending on all of the above.

The downstream refs are recorded in the debate task's `output.phase4`. The
orchestrator's `phaseForType` / worker's `inferPhase` now map these new task
types to the `verifying` phase so the snapshot shows correctly.

### API / snapshot
New ownership-scoped endpoints under `/api/decisions/:id`:
- `GET /:id/verifications`
- `GET /:id/verifications/:claimId`
- `GET /:id/red-team`
- `GET /:id/reconciliation`
- `GET /:id/evidence-graph`
- `GET /:id/claims/:claimId/evidence`
- `GET /:id/claims/:claimId` — extended with explicit `relationships` +
  `verification`
- `GET /:id/snapshot` — extended with `evidenceRelationships`, `verifications`,
  `redTeamFindings`, `reconciliation`
- `DELETE /:id` — also clears all new collections

All endpoints follow the existing auth pattern: every route resolves the
Decision by `{ _id, userId: req.userId }` first and returns **404** (not 403)
so non-owners cannot even infer existence; claim/evidence sub-resources are
required to belong to the decision.

### Frontend
- Types (`client/src/types/index.ts`): `EvidenceRelationship`,
  `VerificationResult`, `RedTeamFinding`, `ReconciliationResult`,
  `Phase4DownstreamRefs`; `DecisionSnapshot` extended.
- `client/src/context/AppContext.tsx`: `getVerifications`, `getRedTeamFindings`,
  `getReconciliation`, `getEvidenceGraph`.
- `client/src/pages/DecisionDetailPage.tsx`: Reconciliation panel
  (surviving/rejected/uncertain/finding counts + `needsMoreResearch` questions),
  Verification panel (status badges, evidence classification counts, rationale),
  Red-Team Findings panel (severity + type badges, suggested actions).

---

## 2. The evidence graph (`supports` / `contradicts` / `related`)

The graph is **explicit and queryable** rather than inferred at read time.

- **`supports`** — evidence materially supports the claim.
- **`contradicts`** — evidence materially conflicts with the claim.
- **`related`** — relevant, but neither clearly supports nor contradicts.

**Critical invariant:** `NOT(supports) ≠ contradicts`. Lack of support is not
contradiction. This is enforced in the verification classifier (a claim with
only `related` evidence is `inconclusive` or `unsupported`, never `contradicted`)
and asserted in tests (`evidenceGraph.test.ts`, `verificationRedTeam.test.ts`).

`seedFromExistingClaims` idempotently migrates Phase 3 data so existing
decisions gain the graph without a destructive migration.

---

## 3. Verification (`verify_claim`)

- **Evidence-based, not LLM opinion.** The handler loads the claim's explicit
  relationships plus any input evidence, classifies deterministically, and
  persists an auditable `VerificationResult` with a written rationale and a
  heuristic confidence.
- **Idempotent per `(claimId, taskId)`.** Retrying a verify_claim task updates
  the same record — no duplicate results.
- **Input validation is strict.** Missing/malformed `claimId` / `claimStatement`
  is a permanent (non-retryable) error; a claim/evidence not owned by the
  decision is rejected.

---

## 4. Red team (`red_team`)

Adversarial by construction: it attacks the candidate decision rather than
agreeing with it, looking for the reasons the verdict could be wrong. Findings
are structured (`type` + `severity` + description + linked claim/evidence IDs +
suggested action), persisted, and later fed to reconciliation. It is read-only
over claims/evidence and cannot modify external state or untrusted configuration
(asserted in tests).

---

## 5. Reconciliation (`reconciliation`)

Produces the **final verdict** from the candidate + evidence:

| Decision rule | Outcome |
| --- | --- |
| claim verified `supported`/`inconclusive` | `survivingClaimIds` |
| claim verified `contradicted` | `rejectedClaimIds` |
| claim verified `unsupported` / no result | `uncertainClaimIds` |
| both supporting AND contradicting evidence present | `unresolvedConflictIds` |
| contradicted claims OR high/critical red-team findings | `needsMoreResearch = true` + `researchQuestions[]` |

The candidate recommendation is preserved (it remains in the debate task
output as the audit trail); reconciliation's `recommendation` is the final one.
**No auto-research recursion:** `needsMoreResearch` is persisted as a structured
signal for a future phase rather than spawning new research tasks.

---

## 6. Execution trace (how the graph actually runs)

Driven by the Phase 2 engine with real persisted task IDs:

1. `startDecision` creates research tasks (priority 10) and a `debate` task
   (priority 1) depending on them.
2. Worker schedules research → debate when research completes.
3. `debateHandler` runs the debate, persists claims, seeds the evidence graph,
   and creates:
   - `verify_claim` task per selected claim (priority 5, depends on debate)
   - `red_team` task (priority 5, depends on debate) — runs **in parallel**
   - `reconciliation` task (priority 1, depends on **all** verify tasks + red
     team)
4. Worker runs verification + red team concurrently; `reconciliation` stays
   blocked until both finish.
5. When reconciliation settles, no tasks remain in progress and the worker
   finalizes the execution → Decision `completed` with the final recommendation.

The `phase4Execution.test.ts` exercises exactly this with a fake debate handler
(debate requires an LLM, not available headlessly) plus the **real**
verify/red_team/reconciliation handlers, asserting all persisted tasks complete,
contradicted claims are rejected (not merely unsupported), `needsMoreResearch`
is flagged, and no research recursion occurs.

---

## 7. Test results

| Command | Result |
| --- | --- |
| `npm test` (server) | **97 passing** (72 prior + 25 new), 0 failures |
| `npx tsc --noEmit` (server) | clean |
| `npm run build` (server) | clean |
| `npx tsc --noEmit` (client) | only 2 **pre-existing** errors in `DashboardPage.tsx` & `OnboardingPage.tsx` (unrelated to Phase 4, verified present before these changes) |

New test files:

| File | Tests | Scope |
| --- | --- | --- |
| `evidenceGraph.test.ts` | 8 | upsert/idempotency/update, categorization, NOT(supports)≠contradicts, coarse-seed bridge, decision-wide query, delete |
| `verificationRedTeam.test.ts` | 8 | supported / contradicted / related-only-not-contradicted / idempotent upsert / decision-wide query / red-team finding generation / persistence / no side effects on untrusted config |
| `reconciliation.test.ts` | 5 | reject-keeps semantics, needsMoreResearch flag, red-team integration, persistence, single upsert |
| `phase4Execution.test.ts` | 4 | full persisted execution graph with real task IDs, contradicted-vs-unsupported, no research recursion, terminal reconciliation |

---

## 8. Security

- **Ownership enforcement on every new endpoint** via
  `Decision.findOne({ _id, userId: req.userId })` first; 404 for non-owners.
- **Claim/evidence sub-resources must belong to the decision** before being read
  or used; handlers validate scope before delegating to services.
- **Research/evidence/claims remain untrusted data.** Verification, red team,
  and reconciliation treat them as read-only inputs — they never influence task
  permissions, system prompts, API keys, or trigger external actions.
- **No new attack surface:** no arbitrary URL fetch, no graph DB, no streaming
  sockets; everything reuses the existing proven execution engine and its
  error/retry taxonomy.

---

## 9. Limitations (intentional)

- Verification and red team are **deterministic** (evidence-based / rule-based).
  LLM-driven verification (`mode: 'llm' | 'hybrid'`) and LLM-based adversarial
  attack generation are future work; the `mode` field is forward-compatible.
- `needsMoreResearch` is **persisted, not auto-executed** — turning it into a
  bounded research round is a later phase (by design, to avoid
  research→verify→research loops).
- Claim selection for verification is a simple deterministic heuristic (fact >
  assumption > recommendation > inference, evidence-backed weighted, cap 8); it
  deliberately does not use an LLM or a model router.
- No graph database or giant graph visualization — the evidence graph is
  relational and rendered in the simple decision-detail UI.

---

## 10. Next phase (recommended)

1. **Auto research round** — on `needsMoreResearch`, schedule a **bounded** new
   research pass seeded with `researchQuestions`, re-run verification only on
   new/affected claims (single extra round, then recommend human review).
2. **LLM-assisted verification & red team** — `mode: 'llm'/'hybrid'` for
   `verify_claim` and an LLM-driven adversarial agent for `red_team`, with usage
   flowing through `context.onUsage` and outputs still persisted as structured,
   auditable findings.
3. **Model routing & cost** — pick models per task based on quality/cost/latency
   with fallback on failure; surface per-verification cost.
4. **Streaming observability** — push the already-built internal event system over
   SSE/WebSockets so the verification/red-team/reconciliation stages stream live.
5. **Human review & override** — surface `needsMoreResearch`/unresolved conflicts
   to a reviewer who can accept/reject the reconciliation and record the decision
   reason.

---

## 11. Files touched (Phase 4)

**New (server):**
`src/decision/evidenceGraphService.ts`, `src/decision/verificationService.ts`,
`src/decision/redTeamService.ts`, `src/decision/reconciliationService.ts`,
`src/models/EvidenceRelationship.ts`, `src/models/VerificationResult.ts`,
`src/models/RedTeamFinding.ts`, `src/models/ReconciliationResult.ts`,
`src/tasks/handlers/verifyClaimHandler.ts`, `src/tasks/handlers/redTeamHandler.ts`,
`src/tasks/handlers/reconciliationHandler.ts`,
`src/tests/evidenceGraph.test.ts`, `src/tests/verificationRedTeam.test.ts`,
`src/tests/reconciliation.test.ts`, `src/tests/phase4Execution.test.ts`.

**Modified (server):**
`src/decision/types.ts` (task types + Phase 4 types), `src/models/Task.ts`
(schema enum), `src/tasks/handlers/debateHandler.ts` (graph seeding +
downstream scheduling), `src/tasks/handlers/index.ts` (registry),
`src/decision/orchestrator.ts` (`phaseForType`, snapshot), `src/tasks/worker.ts`
(`inferPhase`, confidence), `src/routes/decisions.ts` (endpoints + delete),
`package.json` (test list).

**Modified (client):**
`src/types/index.ts`, `src/context/AppContext.tsx`,
`src/pages/DecisionDetailPage.tsx`.

**Docs:** `docs/DECISION_ARCHITECTURE.md` (Phase 4 section), this report.