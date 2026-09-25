# Hathap.ai — Phase 15 todos (Client strict mode)

Last updated: Phase 15 (after completion of Phase 14 at commit `9935c04`).

## Phase 15 scope

- [x] Inspect the baseline and verify HEAD == the Phase 14 commit.
- [x] Investigate the four candidate debt items (client `strict:false`, JWT in
      localStorage, 12 residual npm audit findings, auth-only rate limiting) and
      record evidence-based findings.
- [x] Enable client TypeScript `strict: true` and fix the single blocked error —
      client and server now share the same strict configuration.
- [x] Re-run the full client + server quality gates and audits; commit and push.

## Phase 15 findings (evidence recorded)

- **Client strict mode**: enabling `--strict` produced exactly one error
  (`ResearchPanel.tsx` JSX child of type `unknown`); the `any`-typed codebase
  already satisfied the rest of the strict checks. Client and server are now
  both `strict: true`.
- **JWT in localStorage / cookie-session migration**: deferred, not forced.
  Auth is Bearer-token over `Authorization` headers read from `localStorage`
  across 6 client files (`AuthContext`, `AppContext`, `EvaluationContext`,
  `useDecisionEventStream`, `CourtroomDetailPage`) plus server middleware that
  reads the header only. There is no server-side session store, no logout
  endpoint, and the production deployment topology (frontend vs API origin,
  HTTPS) is not defined in this repo — cookie `SameSite`/`Secure` semantics
  cannot be chosen responsibly yet. A migration would be a broad cross-cutting
  change (server middleware, CORS credentials, CSRF, every client fetch,
  ~10 test files) and is deliberately not forced into Phase 15.
- **npm audit**: client still 12 findings (5 moderate, 7 high); each requires a
  semver-major upgrade (vite 5 → 8, `@typescript-eslint` 6 → 8, react-router
  v7) and is dev/test-time only — documented in `docs/SECURITY_AUDIT_REPORT.md`.
  No upgrade was made for the sake of the count. Server audit remains 0.
- **Rate limiting**: auth endpoints limited (30 / 15 min) via
  `express-rate-limit`; the code comment documents why it is intentionally not
  global. Broader limits risk interfering with SSE, polling, and the execution
  worker; not a Phase 15 change.

## Where we are

Phases 1-14 are committed and pushed to `main`. Quality gates at the Phase 15
baseline: server `tsc --noEmit` clean, 272/272 tests, build green; client
`tsc --noEmit` clean (now under `strict: true`), lint clean, 60/60 tests,
`typecheck:config` clean, build green.

## Done (Phases 11-14 recap)

- Phase 11: Real web-grounded research (Brave + DuckDuckGo sources), provider
  resolution, research status/demo routes, web-grounded dashboard banner.
- Phase 12: Auth hardening — production `JWT_SECRET` enforcement, CORS
  allow-list, helmet, auth endpoint rate limiting; client test tooling; audit
  remediation + documented residual set.
- Phase 13: Honest-surface fixes — auth endpoints (`/me`, change-password,
  export-data, delete account), real ProfilePage binding, `verificationEnabled`
  default on, truthful LandingPage/README claims.
- Phase 14: Truthful docs (`todos.md`, README Future Enhancements,
  `agent_context.md`) and auth error surfacing (login/signup show the real
  server message via toasts).

## Remaining (ship blockers / known debt)

- JWT stored in `localStorage` (readable by any page script). HTTP-only session
  cookie migration is deferred pending a defined deployment topology and a
  dedicated cross-cutting phase (see Phase 15 findings above).
- Client `npm audit` residual findings (12) are documented in
  `docs/SECURITY_AUDIT_REPORT.md`; revisit together with a Vite →
  `@typescript-eslint` major upgrade in a dedicated phase.
- Login rate limiting covers auth endpoints only; broader per-endpoint limits
  are not yet configured.