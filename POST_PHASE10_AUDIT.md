# Hathap.AI — Post-Phase-10 Audit Report

**Audit basis:** Read-only review of the full tree at commit `aeb6930` (Phase 10, clean working tree).
**Date:** 2026-09-18
**Scope:** Every phase shipped (`agent_context.md` says the roadmap is "Frontend only with **mock data**" — this audit corrects that; the codebase is a real, working full-stack system).

---

## 0. Headline

- **What is built:** A fully-functional local-first full-stack app. Legacy **Courtroom** flow (real multi-agent LLM debates) **and** the newer **Decision** pipeline (task-graph: research → debate → verification → red team → reconciliation, SSE live progress, decision reports, memory/outcomes) both work end-to-end against real LLM providers.
- **What is NOT built:** No CI, no Docker/deploy automation, no observability, no client tests, no real research engine by default (mock is the active provider), no external tool integrations, no multi-tenant/billing/SSO. Several marketing claims on the landing page and a large share of `IMPLEMENTATION_SUMMARY.md` describe aspirations, not code.
- **Single biggest gap (next direction):** The product's edge — "AI agents that *research the web* and cite sources before they debate" — is **fake by default**. `HATHAP_RESEARCH_PROVIDER` defaults to `mock`, and the real provider only hits DuckDuckGo Instant Answer. See §10.

Classification legend: **IMPLEMENTED** / **PARTIAL** (works, with caveats) / **MOCKED** (placeholder logic shipped) / **PROVIDER-DEPENDENT** (real, but needs external keys) / **DOC-ONLY** (described, no code) / **MISSING**.

---

## 1. Capability Classification

| # | Capability | Classification | Evidence |
|---|-----------|---------------|----------|
| 1 | Auth (JWT signup/login, encrypted API keys at rest) | IMPLEMENTED | `routes/auth.ts`, `middleware/authMiddleware.ts`, bcrypt cost 10; AES-256-GCM `utils/encryption.ts`; startup guard `index.ts:16-21` |
| 2 | Models CRUD + live connection test | IMPLEMENTED | `routes/models.ts`, `ModelsPage.tsx` (Add/Edit/Test/Delete) |
| 3 | Agent persona templates | IMPLEMENTED | `routes/agents.ts`, `AgentsPage.tsx`; 10 default agents seeded on signup (`routes/auth.ts`) |
| 4 | Courtroom CRUD + participants | IMPLEMENTED | `routes/courtrooms.ts`, `CourtroomsPage.tsx`, `CourtroomDetailPage.tsx` |
| 5 | Legacy courtroom debate engine (real LLM) | IMPLEMENTED | `engine/debateEngine.ts`, `engine/strategies/*` (consensus, majority vote, devil's advocate, judge, open debate), `agentRunner.ts`, `verdictGenerator.ts` — all call `engine/llmClient.ts` (real OpenAI-compatible SDK) |
| 6 | Legacy debate start/error UX | IMPLEMENTED | `POST /api/courtrooms/:id/start`; `CourtroomDetailPage.tsx:108-159` (402 / key / no-model error suggestions) |
| 7 | Declaration of multi-strategy support | IMPLEMENTED | 5 registered strategies (engines) |
| 8 | Decision task pipeline (fixed graph) | IMPLEMENTED | `orchestrator.ts:176-232` → research tasks (prio 10) + debate task (prio 1, depends on research) |
| 9 | Intelligent planning mode | IMPLEMENTED (calls a real LLM) | `planning/planner.ts`; bounded timeout + fallback on provider failure (`docs/PHASE5`) |
| 10 | Model routing (auto/manual) | IMPLEMENTED (deterministic) | `routing/` scoring policy `routing-v1`; no LLM in the router |
| 11 | Research (evidence gathering) | **PARTIAL / MOCKED-BY-DEFAULT** | `researchSourceFactory.ts:24-26` (default `mock`); `mockResearchSource.ts` (deterministic seeded output, no internet); real but weak `duckDuckGoResearchSource.ts:23` (Instant Answer API only, key-less) |
| 12 | Research evidence → debate injection | IMPLEMENTED | `evidencePrompt.ts` (untrusted `<research_evidence>` block, user-message placement), `AgentRunner.ts:83-89` |
| 13 | Claim persistence from debate output | IMPLEMENTED | `claimPersistence.ts`; orchestration via `debateHandler` |
| 14 | Evidence graph (supports/contradicts/related) | IMPLEMENTED (deterministic seed) | `evidenceGraphService.ts` |
| 15 | Claim verification | IMPLEMENTED (deterministic, evidence-based — **no LLM judge**) | `verificationService.ts`, `verifyClaimHandler.ts` |
| 16 | Red-team analysis | IMPLEMENTED (deterministic template) | `redTeamService.ts`, `redTeamHandler.ts` (comment: "A full LLM-based red team is deferred") |
| 17 | Reconciliation | IMPLEMENTED | `reconciliationService.ts`, `reconciliationHandler.ts` |
| 18 | Background worker / scheduling / retries | IMPLEMENTED | `tasks/worker.ts`, `decision/scheduler.ts`, `decision/executor.ts`, error classifier `errorClassifier.ts` |
| 19 | State machine (draft/debating/paused/cancelled/completed…) | IMPLEMENTED | `decision/stateMachine.ts`; lifecycle used by routes + orchestrator |
| 20 | Pause / resume / cancel decisions | IMPLEMENTED | `orchestrator.ts:293-394` |
| 21 | Token/cost accounting per execution | IMPLEMENTED (estimate via hardcoded pricing tables) | `decision/usage.ts`; aggregated in Execution + snapshot |
| 22 | SSE live progress + reconnection (Last-Event-ID) | IMPLEMENTED | `routes/decisions.ts`, `eventBus.ts` (`onAny`/`offAny`, replay ≤500, 15s keepalive); client `useDecisionEventStream.ts` |
| 23 | Decision report generation (12 sections + redaction + export) | IMPLEMENTED | `reportService.ts`; `DecisionDetailPage.tsx` export/copy; `GET /api/decisions/:id/report` |
| 24 | Decision memory / outcome / feedback / lessons | PARTIAL | `memory/*` stored fine; similarity retrieval is **heuristic token overlap, not embeddings**; outcomes recorded only when the user submits them via API |
| 25 | Benchmark / evaluation harness | PARTIAL | Deterministic offline metrics (`evaluation/metrics.ts`) incl. `method: 'call'`, `responseFormat`, `parallelCallCount`; baselines seeded on-demand via `/api/evaluations/seed` button; auto-graded (no LLM judge) |
| 26 | Decision-engine evaluation runner | IMPLEMENTED / PROVIDER-DEPENDENT | `evaluationRunner.ts:181-265` decision-engine path runs **real decisions** (real LLM spend possible) |
| 27 | A2A agent protocol (agent card, JSON-RPC, REST) | PARTIAL (server inbound only) | `a2a/setupA2A.ts` (in-memory task store, auth via JWT or `X-A2A-API-Key`); **no client integration** |
| 28 | Client auth + app state + theming | IMPLEMENTED | `AuthContext.tsx` (JWT in localStorage `hathap_token`), `AppContext.tsx`, `ThemeContext.tsx` |
| 29 | Client pages (dashboards, CRUD, decisions, evaluation) | IMPLEMENTED | 15+ pages; `vite.config.ts` proxies `/api` → `:4000` |
| 30 | Client tests | **MISSING** | Zero `*.test/*.spec` files under `client/` |
| 31 | Server tests | IMPLEMENTED | `node --test` 21 files; 231 tests green at audit time (one Phase-5 timing flake under full-suite load, green in isolation) |
| 32 | CI / deploy automation | **MISSING** | No workflows in `.github/`, no Dockerfile, no docker-compose, no PM2/.env orchestration |
| 33 | Observability (logs/metrics/tracing/error tracking) | **MISSING** | Ad-hoc `console.log/error` only — no structured logging, no metrics collection, no error service |
| 34 | Production security hardening | **MISSING** | No helmet, no rate limiting, wide-open `app.use(cors())`, `JWT_SECRET` default is `'secret'`, `.env` files **tracked in git**, only `GET /api/health` unauthenticated |
| 35 | Unit-level docs: engineering reports per phase | IMPLEMENTED | `docs/PHASE{O..10}_ENGINEERING_REPORT.md` exist (they are honest; Phase 10 report explicitly says "No new intelligence") |
| 36 | Landing-page claims (tool integrations, data residency, threat-shield scoring) | **DOC-ONLY / MISSING** | `LandingPage.tsx` copy ("project management tools, document repos, CI/CD", "data residency controls") — no corresponding code; "2,600 tokens / 3,900 tokens" budget copy is example math, not a budget engine |

> **Note on IP / packaging:** committed `dist/` for server+client is a legacy side effect of early phases, not a release artifact. No npm package, no immutable builds.

---

## 2. The 13 Audit Answers (evidence-based)

1. **"Fully-functional"** → Yes, for local dev: auth, models, agents, courtrooms, decisions, SSE, reports all run. Because research defaults to `mock`, out-of-the-box "research" is simulated.
2. **"Full-stack"** → Yes: Express 4 + Mongoose 7 server, React 18 + Vite 5 client, real HTTP + JWT wiring.
3. **"Multi-agent debate"** → Real and implemented. `agentRunner.ts` per-agent real LLM calls with explicit JSON contract; strategies orchestrate rounds; `verdictGenerator` synthesizes.
4. **"10 phases *complete*"?** → No. Phases 1→10 cleanly shipped, but "intelligence" parts are thin: research is mock-by-default, red team and verification are deterministic (no LLM), memory similarity is not embeddings. Phase 10 shipped as UI + SSE + reports + evaluation UI (explicitly **not** new intelligence — `docs/PHASE10_ENGINEERING_REPORT.md:139`).
5. **"Finished"?** → No horizontal capability is "finished". Production build, CI, deployment, real research, observability, client tests, and the honest first-run experience (§8) all remain.
6. **What would a new developer inherit?** → A 30k+ LOC monorepo, two execution paths (courtrooms vs decisions) sharing the debate engine, tightly-coupled `orchestrator.ts` + `worker.ts`, 231 passing server tests, zero client tests, no scale-out concerns (single-process worker pump). Distinct compared to a fresh greenfield.
7. **What is the actual product?** → "An AI decision-review board": multi-agent debate with structured arguments + a synthesized verdict, upgraded into a research→debate→verify→red-team→reconcile pipeline with a downloadable decision report. The courtroom UI is the older, thinner slice of the same engine.
8. **What is the actual state?** → Working alpha, local-first, not deployable without work (no CI/CD, no monitoring, `.env` in git, defaults not prod-safe, seeds a demo user, `JWT_SECRET` fallback `'secret'`).
9. **Whither the two voices?** → Docs say "Frontend only, mock data" (agent_context) / "No new intelligence" (Phase 10 report) — code is a full engine. The most overstated bits: "10 default agents", "intelligent planner", "red team/verification" (deterministic), "memory/outcomes", benchmark scoring, landing-page integration claims.
10. **Is phase 10 universally great?** → Yes for stack/UI/scope discipline (SSE, reports, evaluation, no bloated deps). Interpretations for costs: only `decision-engine` evaluation path spends; static path is free.
11. **EOF?** → No. Clean ingest/continuity concerns remain: onboarding/signup UX, research providers, deployment, monitoring, removal/parallelism of legacy flows, AI-litany bare-minimum (rate limiting, helmet, non-default secrets).
12. **Forgotten accruals / new ghosts invited:** The biggest visible residual is profile. `ProfilePage.tsx` is a hardcoded "Alex Johnson / alex@hathap.ai" mock with non-wired buttons (Change Password / Download Data / Delete Account do nothing) while auth is real — profile, change-password and data-ownership endpoints are **missing**. Also: `A2A` is inert from the product's point of view; `evaluation`'s decision-engine mode can spend real money during developer smoke tests; the "Evaluator" strategy with `method:'call'` / `responseFormat` / `parallelCallCount` is **not visible in the metrics reached so far** (evaluation is offline/heuristic).
13. **Role-based revolution / parallelism:** Two server sides (legacy courtrooms — user-facing, simpler — and decisions — newer, orchestrated) share the engine but do NOT conflict; A2A is a third, inbound-only interface. No multi-tenancy, roles, or billing features exist.

---

## 3. Server Architecture (read directly, at `aeb6930`)

**Boot:** `server/src/index.ts` — Express, CORS open, health route, six routers (auth/models/agents/courtrooms/decisions/evaluations) + `setupA2A(app)`, JWT middleware on all but `/api/health`, fatal exit on short `API_KEY_ENCRYPTION_SECRET`.

**Decision engine flow:**
```
createDecision (draft; strategy=consensus; maxRounds=3; verificationEnabled=false)
  └─ objective stored as Evidence (user_input)
startDecision ─ fixed ──► Execution(queued) → research tasks (prio 10) → debate task (prio 1, deps=research) → worker.wake()
            └─ intelligent ─► Execution(pending) → decisionPlanner.planExecution (LLM) → compile → queue → wake
debateHandler → debateEngine.executeForDecision(real LLM, evidence injection, routing override)
             → persistClaims → evidenceGraph.seed → schedulePhase4DownstreamTasks
verifyClaimHandler (deterministic, no LLM) ‖ redTeamHandler (deterministic, no LLM)
  └─► reconciliationHandler (deterministic merge)
reportService → 12-section decision report (+ regex key/value redaction + redactMarkdown)
```

**SSE:** `GET /api/decisions/:id/events` — 15s keepalive, replay last ≤500 events, `Last-Event-ID` resume on reconnect; bus = in-process `EventEmitter` (`eventBus.ts onAny/offAny`).

**Worker:** single-process `worker.ts` pump (claim→lease→run→complete; retry via `errorClassifier`); tasks are real Mongo `Task` docs with dependency IDs. No cross-process distribution.

---

## 4. Provider-Dependency Reality Check

- **Debate / verdict / planning:** real LLM calls via `openai` SDK (OpenAI-compatible baseUrl → works with OpenAI, Anthropic-compat, Google compat, OpenRouter, DeepSeek, Ollama).
- **Without any keys/models:** debate fails fast with a clear guidance error (`llmClient.ts:23-31`); decision pages show pre-start blockers in UI. No "fake AI" path ships in the debate engine itself.
- **Research:** `mock` (default) → deterministic fake results; `duckduckgo` → only Instant Answer API (no general web/general search). No Brave/Google/Tavily/Exa/Serper/SearXNG provider exists.
- **Evaluation:** fully offline/deterministic (heuristics, price tables, no LLM judge). The `decision-engine` runner path executes **real** decisions (real cost possible).

---

## 5. Client Architecture

- React 18 + Vite 5 + Tailwind; `AuthContext` (localStorage `hathap_token` + `hathap_user`), `AppContext`, `ThemeContext`, `EvaluationContext`.
- 15+ pages: Landing, Login, Signup, Onboarding, Dashboard, Models, Agents, Courtrooms (+Detail/New), Decisions (+Create/Detail), Evaluation, Profile.
- No client test files; no lint/typecheck run is wired in CI (it passes locally; `npm run tsc`/`build` verified at Phase 10).

---

## 6. Onboarding / First-Run (Startup Test)

1. **Blank slate signup:** `POST /api/auth/signup` → JWT + **10 default agents auto-created** (seeded), zero models.
2. **Onboarding page** picks provider preset (gpt-4o / claude-3.5-sonnet / gemini-1.5-pro) → Model form requires provider+apiKey+modelName; server-side live connection test on save.
3. **Then a real first result** takes: add a model → (optional) create agents → courtrooms flow: create → add participants → **Start Debate** → real engine runs rounds + verdict → verdict + messages persisted (courtroom path works with no research). **OR** decisions flow: new decision → research queries run under `mock` (fake sources) → debate → report.
4. **Friction points:** no seeded model; real research can't be demoed without an extra provider switch; profile is fake ("Alex Johnson"); no billable/user-visible onboarding tour; new users hitting the Decisions flow first will see crisp SSE progress with fake research citations.

---

## 7. Do-NOT-Build-Yet (explicit deferral)

Do **not** build these while the products above are broken/incomplete:
- Multi-tenancy / orgs / roles / permissions / SSO / billing
- Vector-embedding infrastructure for memory search (heuristic token overlap covers current scale)
- Polling contract replacements (Resumption-Hints) atop eventBus
- A2A client-side integration (no feature drives it)
- Kubernetes-scale worker distribution
- NFT/metaverse-style "courtroom" gamification

---

## 8. Gap Conditions Before "Trustworthy Alternative to a Real Advisory Board"

| Gate | Current state |
|------|----------------|
| Sources are real | **No** — mock by default; DDG-only if enabled |
| Every agent statement carries a verifiable citation | No — coarse claim→evidence attribution, no token-level grounding ([A2A-3], §provenance) |
| Memory simularity truthful | **No** — heuristic overlap shown as "similarity" |
| Verification extends beyond in-decision evidence | **No** — deterministic, in-graph only |

---

## 9. Recommended "Smallest Honest Improvement First" (single highest-impact next direction)

**Replace the mock research provider with a real one as the default (e.g., Brave/Exa/Serper/Google CSE behind the existing `ResearchSource` interface) and make "DuckDuckGo" a real general web provider — then gate citation quality so every cited output shows a live URL. Ship this + a one-click "Run demo decision (web-grounded)" button on the Decisions empty state.**

Rationale in one line: everything already built (debate, claims, graph, verification, report) becomes **truer** the moment sources are real; it is the single change that most increases the product's value, requires no new schema/UI (providers already implement `search(query, options)`), and finally turns the headless agent pipeline into an honest research-grade deliverable.

**Budget the rest in order:** (2) client tests + CI, (3) fix Profile/honest onboarding, (4) minimal prod hardening (helmet, rate limit, real secrets, un-track `.env`), (5) observability, (6) LLM-based red team / verification upgrade only after evidence grounding is real.

---

*Generated read-only; no files modified for this audit except this document.*