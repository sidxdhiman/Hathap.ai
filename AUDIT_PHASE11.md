# Hathap.AI — Phase 11 Read-Only Product Audit

**Audit basis:** Read-only review of the full tree at commit `9a7dbb6` (Phase 11, clean working tree).
**Date:** 2026-09-20
**Scope:** Every phase shipped 1→11. This audit reads the implementation, not the documentation or marketing.

Classification legend (per capability):
- **REAL** — genuinely implemented and executable on real data
- **PARTIAL** — works with caveats
- **MOCK** — placeholder logic shipped as if real
- **PROVIDER-DEPENDENT** — real, but needs an external key/provider
- **MISSING** — absent entirely
- **DOC-ONLY** — documented, but no code

Evidence claims are tagged:
- **FACT** — directly observed in the code at `9a7dbb6`
- **INFERENCE** — reasonable conclusion from observed code
- **GAP** — missing capability, no code has it

---

## 1. Executive summary

Hathap, as shipped today, is a **single-user, local-first Decision Intelligence engine**: an opinionated
research → AI debate → verification → red-team → reconciliation pipeline that produces an exportable,
secret-redacted decision report, with a structured memory/outcome layer and an offline evaluation
harness on top. It is a real, working full-stack system (Express + Mongo worker with a real task-graph,
real LLM debate via OpenAI-compatible providers, SSE live progress) — **not** a mock frontend. The
original "AI agents debate" framing is now the legacy Courtroom flow; the product surface is Decisions.

What is NOT true about it:

- **FACT** — Research is still **mock by default**: `server/.env:18-20` sets `HATHAP_RESEARCH_PROVIDER=auto`
  with `# BRAVE_SEARCH_API_KEY=` commented out, so out-of-the-box decisions show "web research" that is
  deterministic synthetic content (`research/mockResearchSource.ts`). Phase 11 fixed the *honesty* of that
  mock (explicitly labeled everywhere, hard-blocked in production, a one-click real demo that refuses to
  fake), but it did not change the default.
- **FACT** — Verification, red team, reconciliation, memory similarity, relevance scoring, and evaluation
  are **deterministic heuristics**, not LLM judges (see §3 and §5).
- **FACT** — No CI, no Docker, no deployment, no observability. `server/.env` **is committed to git** with a
  JWT secret and the AES key; `JWT_SECRET` falls back to the literal string `'secret'`
  (`routes/auth.ts:9`, `middleware/authMiddleware.ts:4`); CORS is wide open; no rate limiting; no helmet.
- **FACT** — The Profile page is a hardcoded "Alex Johnson / alex@hathap.ai" mock with three dead buttons
  (`client/src/pages/ProfilePage.tsx:17-29,168-176`).
- **FACT** — The landing page asserts data-residency controls, SOC 2 auditing, and a "calculated risk
  score (0-100)" that do not exist in code (`client/src/pages/LandingPage.tsx:49,53,87`).

**Positive differentiators that are real:** the persistent, recoverable task-graph engine with
retries/leases/dependency scheduling and stale-task recovery; evidence provenance (provider + `retrievedAt`
stamped server-side, content-hash dedup); the honesty-by-design culture (production refuses mock research;
reports never invent a recommendation; evaluation never invents a missing measurement); SSE with
`Last-Event-ID` resume; deterministic model routing with bounded runtime fallback; a schema-validated
intelligent planner with a deterministic fallback.

**Bottom line:** a credible engineering artifact and a believable single-user demo, but not yet a product
anyone can run with real sources by default, trust for a consequential decision, or pay for. Phase 11 made
real web research *possible* (Brave provider + explicit demo route) but it is still not the default, and the
decision-quality loop (outcomes/feedback/memory) has no real users behind it.

---

## 2. Current user journey

Traced end-to-end from code. Stage-by-stage verdict.

| # | Stage | Verdict | Evidence |
|---|-------|---------|----------|
| 1 | Signup / login | **REAL** | JWT + bcrypt-10 (`routes/auth.ts`). Signup auto-seeds 10 default agents. Client stores token in localStorage (`context/AuthContext.tsx`). |
| 2 | Dashboard | **REAL** | Stats and active-decisions read real API data; Phase 11 adds a truthful "web-grounded research" status banner (mock=labeled yellow, live=green) (`DashboardPage.tsx:127-174`). |
| 3 | Create decision | **REAL** | Title/objective/context, one research query per line, planning mode (fixed/intelligent), routing (auto/manual), "verify claims" toggle (`CreateDecisionPage.tsx:50,93,257-262`). Creatable as a draft. |
| 4 | Research | **PROVIDER-DEPENDENT (default MOCK)** | `auto` → Brave only if `BRAVE_SEARCH_API_KEY` is set, else the labeled mock (`researchConfig.ts:101-124`). Without a key, decisions display synthetic `research.example.com` citations. Production env hard-fails instead of mocking (`researchConfig.ts:110-115`). |
| 5 | Reasoning / debate | **REAL / PROVIDER-DEPENDENT** | Real LLM calls via the OpenAI-compatible SDK to the user's configured model (`engine/llmClient.ts`, `engine/debateEngine.ts`). Fails fast with guidance when no model/key. 5 real strategies. |
| 6 | Verification | **PARTIAL** | Deterministic evidence-relationship counting — no LLM. "supported/contradicted/unsupported/inconclusive" derived from supports/contradicts counts (`decision/verificationService.ts:166-190`). |
| 7 | Red team | **PARTIAL** | Deterministic template findings (un-evidenced assumptions, contradictions, orphaned evidence, evidenceless inferences). The code itself says "A full LLM-based red team is deferred to a future phase" (`decision/redTeamService.ts:15-16`). |
| 8 | Reconciliation | **PARTIAL** | Deterministic merge of verification + red-team into surviving/rejected/uncertain claims; can flag `needsMoreResearch`, but the recommendation text is passed through largely unchanged (`decision/reconciliationService.ts:100-122`). |
| 9 | Final decision | **REAL** | State machine draft→debating→completed/failed/cancelled; confidence extracted from the debate verdict (`tasks/worker.ts:455-468`). |
| 10 | Report | **REAL** | 12-section Markdown with secret redaction + export/copy (`decision/reportService.ts`). Honest "no recommendation yet" for unreconciled decisions. |
| 11 | Evaluation / outcome / memory | **PARTIAL** | Memory auto-indexed on completion (`worker.ts` → `memory/decisionMemoryService.ts`). Outcomes/feedback/lessons are stored but **only exist if a user manually submits them via API** (`routes/decisions.ts:814-928`). Evaluation harness is real but fully offline/deterministic; "decision-engine" runs execute real decisions and can spend real money. |

**Onboarding friction (FACT):** a new user must (a) find and add a model with an API key (connection
tested live on save), and (b) to see real research, also set a Brave key in `server/.env` and restart the
server. The web-grounded demo route refuses to run without the key (`routes/research.ts:56-63`) — honest,
but a poor first-run for someone who never edits `.env`.

---

## 3. Capability inventory

| # | Capability | Classification | Evidence |
|---|-----------|---------------|----------|
| 1 | JWT auth + login/signup + bcrypt | REAL | `routes/auth.ts`, `middleware/authMiddleware.ts` |
| 2 | Model CRUD + live connection test | REAL | `routes/models.ts:80`; API keys encrypted at rest |
| 3 | AES-256-GCM encryption of stored keys | REAL | `utils/encryption.ts`; startup guard `index.ts:17-21` |
| 4 | Agent template CRUD + 10 seeded personas | REAL | `routes/agents.ts`, signup seed `routes/auth.ts:22-30` |
| 5 | Legacy Courtroom CRUD + real multi-agent debate | REAL | `routes/courtrooms.ts`, `engine/debateEngine.ts` (real LLM) |
| 6 | Decision task-graph pipeline (fixed graph) | REAL | `orchestrator.ts:176-232` |
| 7 | Intelligent planning (LLM → strict JSON → validate → compile) | REAL / PROVIDER-DEPENDENT | `planning/planner.ts`, `planValidator.ts`, `fallbackPlanner.ts` |
| 8 | Deterministic model routing (quality/capability/specialization/reliability/cost/latency) | REAL | `routing/scoring.ts`; runtime fallback `executor.ts:331-390` |
| 9 | Web research — Brave provider | REAL / PROVIDER-DEPENDENT | `research/braveResearchSource.ts` (fixed host, error taxonomy, clamping) |
| 10 | Web research — default mode | **MOCK-BY-DEFAULT** | `server/.env:18-20` + `researchConfig.ts` auto→mock |
| 11 | Web research — DuckDuckGo | PARTIAL | Instant-Answer API only, not general web (`duckDuckGoResearchSource.ts`) |
| 12 | Evidence provenance (provider, retrievedAt, content-hash dedup) | REAL | `researchService.ts:147-196`, `models/Evidence.ts` |
| 13 | Evidence → claim attribution graph (supports/contradicts/related) | REAL (deterministic seed) | `evidenceGraphService.ts`, `debateHandler.ts` |
| 14 | Claim verification | PARTIAL (deterministic) | `verificationService.ts` (counts, no semantic check) |
| 15 | Red team | PARTIAL (deterministic template) | `redTeamService.ts` |
| 16 | Reconciliation | PARTIAL (deterministic merge) | `reconciliationService.ts` |
| 17 | Scheduler / executor / leases / retries / stale recovery | REAL | `decision/scheduler.ts`, `executor.ts`, `tasks/worker.ts` |
| 18 | Pause / resume / cancel | REAL | `orchestrator.ts:293-394` |
| 19 | SSE live events, `Last-Event-ID` resume, keepalive | REAL | `routes/decisions.ts:662`, `decision/eventBus.ts`, client `useDecisionEventStream.ts` (Bearer auth, no token in URL) |
| 20 | Token/cost accounting | REAL (estimated price tables) | `decision/usage.ts` (hardcoded per-model $/token) |
| 21 | Decision report (12 sections, redaction, export/copy) | REAL | `reportService.ts`, `DecisionDetailPage.tsx` |
| 22 | Decision memory + similarity retrieval | PARTIAL | `memory/similarityService.ts` = Jaccard token overlap + metadata; no embeddings; auto-created on completion |
| 23 | Outcomes / feedback / lessons | PARTIAL | Stored; populated only if a user submits them (`routes/decisions.ts:814-928`) |
| 24 | Evaluation harness (benchmarks, runs, rubrics, baselines, comparisons) | REAL (offline/deterministic) | `evaluation/*`; `metrics.ts` word-overlap; no LLM judge |
| 25 | Evaluation decision-engine runner | REAL / PROVIDER-DEPENDENT | `evaluationRunner.ts:209-265` runs real decisions (real LLM spend) |
| 26 | A2A protocol server | PARTIAL (inbound only) | `a2a/setupA2A.ts`; no client/feature integration |
| 27 | Client pages (15+), routing, contexts | REAL | `client/src/pages/*`, `App.tsx` |
| 28 | Client tests | **MISSING** | Zero `.test`/`.spec` under `client/` |
| 29 | Server tests | REAL | `node --test`, 21 files; `todos.md` reports 246/246 green at Phase 11 close |
| 30 | CI / deploy automation | **MISSING** | `.github/` has only `copilot-instructions.md`; no Dockerfile, compose, PM2/systemd, deploy scripts |
| 31 | Observability (logs/metrics/tracing/error tracking) | **MISSING** | `console.log/error` only; no logger, no metrics, no error service |
| 32 | Security hardening | **MISSING** | Open `app.use(cors())` (`index.ts:25`); no rate limit; no helmet; `JWT_SECRET` fallback `'secret'`; `server/.env` + `dist/*` committed to git |
| 33 | Profile / account flows (change password, export data, delete account) | **MOCK** | `ProfilePage.tsx` hardcoded, 3 dead buttons; no API routes exist |
| 34 | Landing-page claims (residency, SOC 2, risk score) | **DOC-ONLY** | `LandingPage.tsx:49,53,87` — no code |

---

## 4. Differentiation

What is genuinely implemented and could matter (each is REAL; limitation noted):

1. **The persistent decision pipeline as first-class data.** Decisions/executions/tasks/claims/evidence/
   verifications/red-team/reconciliation are real Mongo documents forming a DAG with dependencies, retry
   classification, leases, and stale-task recovery (`decision/*`, `tasks/worker.ts`). Most "AI advisor"
   tools are chat threads; this is an auditable execution graph. **Limitation:** single-process worker,
   in-process event bus.
2. **Evidence provenance & honesty-by-design.** Research evidence is stamped with provider + retrieval
   time, deduped by content hash, clamped, and never silently faked; mock is labeled everywhere;
   production refuses mock (`researchConfig.ts`, `researchService.ts`, dashboard banner, report provider
   line). This trust discipline is rare and a defensible narrative differentiator. **Limitation:** content
   is search-snippet-level; no full-page fetches and no live-link verification.
3. **Deterministic, auditable checks instead of "another LLM opinion."** Verification, red team, and the
   reconciliation fold are rule-based and re-runnable, so the "why" is inspectable — a better fit for a
   decision memo than a black-box judge. **Limitation:** the heuristics are shallow (relationship counts),
   so "supported" can be trivially true.
4. **SSE live pipeline with replay.** Real-time task progress with `Last-Event-ID` resume and a polling
   fallback over a persisted event log. Genuinely watchable long-running work.
5. **Cost-aware deterministic routing with runtime fallback.** Weighted quality/capability/specialization/
   reliability/cost/latency scoring plus bounded re-routing to an alternate model on retryable provider
   failure (`routing/scoring.ts`, `executor.ts:331-390`).
6. **Schema-validated intelligent planning with a deterministic fallback.** The LLM proposes a plan as
   strict JSON; invalid or failed proposals fall back to a deterministic plan; planner usage is billed to
   the execution (`planning/planner.ts`). Real, not a moat.
7. **Offline evaluation harness with baselines/regression detection.** Deterministic structural/quality/
   evidence/outcome scoring, baselines, run-vs-run comparison — usable without additional spend, and the
   foundation for measuring decision quality later (`evaluation/*`).

None of these is a moat on its own. The most differentiating *combination* is: structured, auditable,
cost-tracked decision runs + honest evidence provenance. Phase 11 strengthened that combination.

---

## 5. Fake / demo-like areas (brutally honest)

Areas that look real in the UI/API but are not what they appear:

1. **Research is fake by default (the big one).** Out of the box, "web research" returns deterministic
   synthetic content from `research.example.com` (`mockResearchSource.ts`). It is now *honestly labeled*,
   but a user who adds research queries and runs a decision sees a fully polished research→debate→report
   flow built on fabricated sources. This is the single most consequential "fake" left.
2. **The "verification" toggle is cosmetic.** `CreateDecisionPage.tsx:257-262` ("Verify claims against
   retrieved evidence") sets `decision.configuration.verificationEnabled`, but the fixed-mode path never
   reads it (FACT: only evaluation code reads `verificationEnabled`). `debateHandler` decides
   verify/red-team/reconciliation from plan termination flags only, and fixed-mode has no plan, so it
   **always runs all three** (`tasks/handlers/debateHandler.ts:317-333`). Varying the toggle changes
   nothing in the default flow.
3. **"Supported" claims are trivial.** Verification marks a claim supported if ≥1 evidence doc links to
   it with no contradicting link (`verificationService.ts:174-190`), and research *automatically* writes
   an attribution claim per evidence item with a support link (`researchService.ts:241-284`). So a
   claim's "verification" often just restates its provenance. INFERENCE.
4. **Red-team findings are template output** of the same deterministic state — not adversarial reasoning.
   The code says so itself (`redTeamService.ts:15-16`).
5. **Profile page is 100% fake.** Hardcoded identity; "Change Password / Download Data / Delete Account"
   do nothing (`ProfilePage.tsx`) and have no backing routes.
6. **Landing page promises features that do not exist** — data residency controls, SOC 2 compliance
   auditing, a "calculated risk score (0-100)" (`LandingPage.tsx:49,53,87`). Also `README.md` still calls
   auth "Placeholder authentication system" and leads with the debate/courtroom framing while the product
   has moved to Decisions.
7. **"Intelligent" planning is fake when no model exists.** It degrades to a deterministic baseline plan
   (fine and honest), but the UI presents it under the "intelligent" label (`planner.ts:186-225`).
   INFERENCE.
8. **Memory "similarity" is word-overlap presented as decision-history intelligence** (Jaccard token
   overlap + metadata equality; `memory/similarityService.ts`). No semantics; at least documented and
   explainable.
9. **Estimated cost is a heuristic price table** (`usage.ts`) displayed as "$X" in the UI/report — real
   token counts, self-invented prices. Fine as an estimate; not actual billing.
10. **A2A is server-inbound only** and invisible to any user-facing feature.
11. **Benchmark "evidence coverage" numbers are computed from how many evidence docs mention a same
    token** (`evaluation/metrics.ts`), so a benchmark score can look meaningful while measuring token
    overlap. INFERENCE.

---

## 6. Technical gaps

Ordered roughly by significance (each is a GAP unless tagged).

1. **Real web research is not the default** and there is no managed key flow — changing research
   provider means editing `server/.env` and restarting. The research layer also stores search-snippet
   content rather than fetched page bodies, so evidence is thin even when real. (the provider itself is
   REAL; the default wiring is the gap)
2. **No CI.** `.github/` contains only `copilot-instructions.md`. Nothing runs `tsc`, `node --test`, or
   the client build on push. 246/246 is currently true (FACT, `todos.md`), but it is unenforced.
3. **No deployment story.** No Dockerfile/compose, no host setup, no PM2/systemd unit, no env docs beyond
   `.env.example`. The only "prod" signal is `NODE_ENV=production` + refuse-mock + refuse-a-broken
   encryption secret.
4. **Committing secrets + build artifacts.** `server/.env` (JWT secret + AES key), `client/.env.development`,
   and `server/dist/`, `client/dist/` are tracked (FACT: `git ls-files`). `.gitignore` ignores only
   `node_modules` (`/home/me/Documents/hathapai/.gitignore`). If this repo is ever made public, keys leak.
5. **Auth/security posture.** `JWT_SECRET` out-of-box fallback `'secret'` (`routes/auth.ts:9`,
   `middleware/authMiddleware.ts:4`); open `app.use(cors())` (`index.ts:25`); no rate limiting; no helmet;
   no token revocation; auth tokens held in localStorage (XSS-prone) with no refresh/rotate flow.
6. **No observability.** All logging is `console.log/error`. No structured logs, no request tracing, no
   metrics, no error dashboard — makes the retry/judge/debug loops (and honest reporting of "why") harder
   than it needs to be.
7. **No client tests and thin engine verification.** Zero client tests. Server covers unit/deterministic
   paths well, but the LLM-dependent paths are mocked; there is no golden-output test for a full real run.
8. **Single-process architecture.** One in-process worker and an in-memory `eventBus`; no queue broker, no
   horizontal scale, no cross-process SSE fanout. If the process dies, post-recovery event replay depends
   on the reload path (which exists) rather than an event log.
9. **Usage accounting is best-effort.** Costs are only estimates from hardcoded tables; drift between
   actual and estimated spend is unmeasured.
10. **SSE reconnection semantics** (`useDecisionEventStream.ts`) work, but there is a noted fallback gap:
    if the event stream dies with no `lastEventId`, the client may not re-run the snapshot fetch without a
    page reload. (INFERENCE; implementation appears correct with reload-safe fetch on mount)
11. **Provider taxonomy is Express-flavored.** Errors carry HTTP-ish status codes inside error objects
    consumed by the executor across providers; works, but couples worker semantics to HTTP.
12. **Database migration / schema versioning does not exist.** No migration tool; schema drift must be
    handled in new-model code.
13. **A2A remains non-functional for product use.** Inbound-only; no outbound calling; no UI.

---

## 7. Product and commercial gaps

These are product/market gaps, not code bugs. Each is a GAP unless tagged.

1. **No definition of decision quality, and no users producing outcomes to train it.** Outcomes/feedback/
   lessons and the memory graph only fill when someone manually submits them. No mechanism to detect
   "the user acted on this decision and it worked/failed" organically. Without that loop, "decision
   intelligence" claims are unproven.
2. **No pricing model decision.** Cost accounting exists but nothing monetizes it; there is no billing,
   no usage tiering, no per-seat model, no margin analysis on estimated spend.
3. **No multi-user story / no team slices.** Decisions/agents/models are global per-user. A B2B product
   needs workspaces, sharing, roles, and audit access.
4. **No compliance story.** Landing page promises SOC 2/residency; zero code enforces any of it; no audit
   log of who read what.
5. **No support motion.** No docs site, no chat, no status page, no contact path.
6. **Trust-onboarding gap.** "You must prove to me where the claim came from" is the whole pitch, but a
   brand-new user gets fake sources at first run (see §5.1).
7. **No mobile/offline.** Requires a running local server + Mongo; not a real deliverable for most
   non-technical users.

---

## 8. Potential users

Realistic candidate segments (severity-ordered by product fit with today's reality):

1. **Solo technical decision-makers / operators** (product engineers, technical founders, ops/infra
   leads) who (a) run the repo locally, (b) already have a model API key, (c) will set a Brave key, and
   (d) want a defensible written record of a high-stakes decision ("why did we pick this postgres
   provider / this vendor / this architecture"). Best fit today: it works single-user, locally, and the
   audit-friendly output is exactly what this person wants.
2. **Evaluate-your-own-decision professionals** — individual consultants, coaches, analysts who produce
   decision memos for clients and want provenance/redaction for free, and can keep research running with
   their own keys. The "report as deliverable" angle maps onto existing consulting workflow.
3. **Enterprise procurement/deal reviewers** (later) — evaluation and reconciliation fit external-facing
   memos about vendors/contracts once multi-user + compliance + real default research land.
4. **Researchers / rubric builders** (thinner) — the offline evaluation harness is usable for rubric
   experiments, but the LLM-judge gap and lack of dataset tooling makes this low priority now.

Non-fits (today): non-technical founders wanting a magic "risk score" (it is not built), teams wanting
collaboration (it is single-user), anyone on Safari without local server + Mongo.

---

## 9. Things NOT to build (do-not-build list)

1. **Real-time multiplayer/hypermedia chat rooms on top of Decisions.** Collaboration needs are
   asynchronous review, not rooms; Courtrooms already prove the "rooms" instinct — slow.
2. **Vector/embedding-heavy memory retrieval for v1.** Similarity today is word-overlap and is *honest,
   debuggable, and cheap*. Swap in embeddings only after a user says "past decisions didn't help me"
   with real data — not pre-emptively.
3. **LLM-judged evaluation of benchmark answers.** Without a labeled gold set, moving from token-overlap
   to LLM-judge "quality" just makes scores noise plus cost.
4. **Full page-crawling, PDF ingestion, or multi-format document research.** Snippet-level search evidence
   is enough for decisions right now; crawling adds cost, violations, and unmoderated content pipelines
   without a demonstrated user demand.
5. **A general-purpose "chat with your docs" assistant.** It is a completely different product and the
   killer feature is the structured decision pipeline, not chat.
6. **Marketplace/plugin ecosystem, A2A client, agent-to-agent commerce.** A2A remains inbound-only and
   unused by any user flow; no evidence users want it.
7. **Self-hosted multi-region data residency tooling.** The product is a localhost dev server; building
   residency engines yields zero value until someone deploys it.
8. **SOC 2 audit tooling / compliance scanner.** Unless an enterprise customer is asking, it is a
   dead-weight dark pattern of the landing page, not a feature.
9. **A mobile client.** No value for a localhost-first tool.
10. **Rewriting the heuristics to be "more sophisticated" determinism.** Heuristic complexity is a trap;
    replace them with LLM checks *only* where the deterministic layer is demonstrably wrong for users.

---

## 10. Candidate next directions (ranked)

1. **Make real research the default and frictionless.** Wire the Brave/OpenRouter key into the browser
   settings (models-style), add a dashboard "research" card, and treat mock as a dev-only escape hatch
   (it already is in prod). One new user should never touch `.env` (GAP today).
2. **Close the quality loop with one genuine user.** Before more features: stand up one real deployment
   (Docker + a managed Mongo), run 10-20 real decisions the operator actually faces, and ship the
   outcome/feedback/lessons flow into the report so "did this decision pay off" becomes trackable. This is
   the only way "decision quality" stops being asserted and becomes measured.
3. **Ship Engineering Foundations (sec/CI/deploy) as a "Phase 12"** — the shortlist: remove secrets from
   the repo (rotate + gitignore + purge from history), CI job running `tsc` + server tests + client build,
   Dockerfile/compose for one-command run, structured logging + request tracing, rate limiting + helmet +
   configurable CORS. Low glory, but hard gate for everything after.
4. **Fix the dishonest surfaces now, cheaply:** either make `verificationEnabled` actually disable steps in
   fixed mode or remove the toggle (§5.2); replace the hardcoded Profile page with read-only real user data
   and stub-or-remove the dead buttons; and edit the landing page to only claim what code does. These are
   hours each and remove the "fake" aura.
5. **Replace verification/red-team determinism with an LLM pass, gated on real evidence.** Only after real
   research is default (item 1) does it make sense to let the model actually read the evidence and give a
   grounded "supported/contradicted" with cited paths. Keep the deterministic layer as the fallback and as
   the record.
6. **Real-ish pricing estimate surfaced honestly:** label the "estimated cost" clearly in UI and report
   as an estimate based on public list prices with a link to the table, so users can plan spend without
   being misled.
7. **Workspace/share/audit for Decisions** only once a second real user shows up asking for it.

---

## 11. What Hathap must prove next

In one blunt paragraph: **Hathap must prove that a real, unstaged person will repeatedly use it on
decisions that materially matter to them, with real web-grounded research as the default, and that the
final report is so visibly evidence-attributed and honest that they act on it — and then report back
whether the decision paid off.** That proof requires (1) real research out-of-the-box with no `.env`
editing, (2) at least one named user with ≥10 completed real decisions and outcomes returned, (3) the
documented evidence of those decisions (reports + graph + memory) readable by a skeptic, and (4) the
engineering foundations (CI, deploy, secrets hygiene, basic security) so that "localhost only" stops being
an excuse. Until that cycle is closed, all differentiation claims — provenance, audibility, decision
intelligence, honesty — are excel-sheet claims about a well-built demo. Phase 11 bought real research
capability and an honest mock; the next phase must turn that into a default, trusted, repeated loop with
at least one real user.

---

## 12. Exact evidence: files inspected (and key lines)

Server — decision pipeline: `src/decision/orchestrator.ts` (config persisted `:78`; graph `:176-232`;
pause/resume/cancel `:293-394`), `decision/scheduler.ts`, `decision/executor.ts` (retry/fallback
`:331-390`), `decision/eventBus.ts`, `decision/stateMachine.ts`, `decision/errorClassifier.ts`,
`decision/usage.ts` (ESTIMATED_COST_PER_TOKEN), `decision/verificationService.ts` (supported/contradicted
counting `:166-190`), `decision/redTeamService.ts` (template findings `:15-16`), `decision/reconciliationService.ts`
(`:100-122`), `decision/reportService.ts` (12 sections, redaction, truncation), `decision/evidenceGraphService.ts`
(supports/contradicts/related, compound index).

Server — research: `research/researchConfig.ts` (`auto`→Brave-if-key-else-mock; prod refusal `:110-115`;
explicit mock label `:101-124`), `research/researchSourceFactory.ts` (never silent mock),
`research/researchService.ts` (provenance/dedup `:147-196`; auto-attribution claims `:241-284`),
`research/braveResearchSource.ts` (fixed host `api.search.brave.com`, 401/403=authentication, 429 with
Retry-After, 4xx=invalid, 5xx=unavailable, clamping, missing-key `INVALID_CONFIGURATION`),
`research/mockResearchSource.ts` (deterministic synthetic; escape tokens timeout/provider-outage/
auth-failure/rate-limit/invalid/no-act), `research/duckDuckGoResearchSource.ts` (Instant Answer only),
`routes/research.ts` (status + demo path that refuses without a real provider `:56-63`).

Server — worker/tasks: `tasks/worker.ts` (in-process polling, lease claims, stale recovery, decision
state transitions `:455-468`), `tasks/handlers/*` (`debateHandler.ts` phase-4 scheduling from plan
termination flags `:317-333`; `verifyClaimHandler.ts`, `redTeamHandler.ts`, `reconciliationHandler.ts`,
`researchHandler.ts`).

Server — engine/planning/routing/memory/evaluation: `engine/llmClient.ts` (OpenAI-compatible, decrypted
keys, requires model, no streaming), `engine/debateEngine.ts` (5 strategies), `planning/planner.ts`
(schema-validated JSON, fallback `:186-225`), `planning/planValidator.ts`, `planning/fallbackPlanner.ts`,
`routing/scoring.ts` (weighted neutral-safe scoring), `memory/decisionMemoryService.ts`,
`memory/similarityService.ts` (Jaccard word overlap), `evaluation/*` (`metrics.ts` token-overlap,
`qualityEvaluator.ts` never invents measurements, `evaluationRunner.ts` budgets/idempotency/5-min stale
lock/failure isolation, `evaluationService.ts`, `benchmark/baseline/*`).

Server — infra/http: `index.ts` (routes mounted, `cors()` `:25`, encryption-secret guard `:17-21`,
worker.start), `routes/auth.ts` (bcrypt, JWT `:9` fallback, signup agent seed), `routes/decisions.ts`
(954 lines; SSE `:662`; outcomes/feedback/lessons `:814-928`), `routes/models.ts`, `routes/agents.ts`,
`routes/courtrooms.ts`, `routes/evaluations.ts`, `middleware/authMiddleware.ts` (`'secret'` fallback `:4`),
`middleware/apiKeyEncryption.ts`, `utils/encryption.ts`, `a2a/setupA2A.ts`, `models/*.ts`,
`.env` (auto provider, commented-out Brave key), `.env.example`, `package.json`.

Server — tests: `src/tests/*` — 21 test files (agent, auth, courtrooms, decisions, decisionsSequence,
evaluations, execution, models, research, routing, etc.), `node --test`.

Client: `src/App.tsx` (routes: dashboards/decisions/evaluation/onboarding/profile + legacy
courtrooms + login/signup/landing), `src/pages/DashboardPage.tsx` (real stats + research-status banner
`:127-174` + onboarding redirect), `src/pages/CreateDecisionPage.tsx` (toggle `:50,93,257-262`),
`src/pages/DecisionDetailPage.tsx` (SSE + report export/copy; stage tabs include Verify/Red Team),
`src/pages/EvaluationPage.tsx` (benchmarks/runs/baselines/comparisons; decision-engine run settings
`:117`), `src/pages/ProfilePage.tsx` (hardcoded mock `:17-29,168-176`), `src/pages/LandingPage.tsx`
(marketing claims `:49,53,87`), `src/context/AuthContext.tsx`, `src/hooks/useDecisionEventStream.ts`,
`src/hooks/useEvaluations.ts`, `package.json` (no test script), `.env.development`
(`VITE_API_URL=http://localhost:4000`).

Docs / repo hygiene: `README.md` (outdated: "Placeholder authentication", debate-first framing),
`POST_PHASE10_AUDIT.md`, `todos.md` (Phase 11 done, 246/246 tests, builds green),
`docs/PHASE11_ENGINEERING_REPORT.md` (incl. research-provider and honest-mock decisions),
`docs/PHASE10_P9_ENGINEERING_REPORT.md`, `docs/PHASE4_P9_ENGINEERING_REPORT.md`,
`docs/DECISION_ARCHITECTURE.md`, `server/package.json`, `client/package.json`, `.github/`
(only `copilot-instructions.md`), `.gitignore` (only `node_modules`).

Repo facts: HEAD `9a7dbb6` (Phase 11, clean tree); tracked files ~397 including `server/.env`,
`client/.env.development`, `server/dist/`, `client/dist/`; no CI, no Dockerfile, no workflow.