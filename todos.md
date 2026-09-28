# Hathap.ai — Phase 16 todos (Authentication architecture)

Last updated: Phase 16 (after completion of Phase 15 at commit `3c4cf44`).

## Phase 16 scope

- [x] Inspect the baseline and verify HEAD == the Phase 15 commit.
- [x] Trace the complete authentication flow on both sides (issuance, storage,
      verification, protected routes, SSE, A2A, error handling).
- [x] Establish what the repository actually guarantees about deployment
      topology, from repository evidence only.
- [x] Compare the bearer/localStorage model with a cookie-session model,
      including CSRF, CORS-credentials and session-invalidation consequences.
- [x] Choose the smallest responsible scope and write it down.
- [x] Re-run the full quality gates and audits; commit and push.

## Outcome: B — architecture-first

The cookie migration was **not** implemented, because the production deployment
topology — the input that determines `SameSite`, `Secure` and `Domain` — is not
defined anywhere in this repository. The design is written up in
[`docs/AUTHENTICATION_ARCHITECTURE.md`](docs/AUTHENTICATION_ARCHITECTURE.md)
and is implementation-ready: current-state inventory, target session model,
CSRF/CORS design, per-file change list, test plan, and acceptance criteria.

## Phase 16 findings (evidence recorded)

- **Deployment topology is undefined.** The repository contains no deployment
  artifacts (`git ls-files` matches only `.github/workflows/ci.yml`): no
  Dockerfile, compose file, nginx/Caddy config, Procfile, or hosting config.
  Development is same-origin by default (Vite proxies `/api`), but the only
  production guidance is a *host suggestion list* pairing a CDN/static host with
  a Node host (`DEPLOYMENT_CHECKLIST.md`, `agent_context.md`) — different
  registrable domains, i.e. cross-**site**. The server never serves the SPA.
- **Why cookies could not be safely implemented now.** With the documented
  cross-site hosting pairing, `SameSite=Lax`/`Strict` cookies are never sent
  (silent 401s in production only) and `SameSite=None` needs HTTPS plus a shared
  registrable domain the repo does not own; cross-origin dev is plain HTTP, where
  `SameSite=None` is rejected outright. `trust proxy` is never configured, so
  neither the `Secure` decision nor a reliable same-origin check can be made
  from code today.
- **Session model chosen for the future phase**: keep the stateless HS256 JWT,
  move it into an `HttpOnly` cookie, and add a revocable `User.tokenVersion`
  (`ver` claim) so logout, password change and account deletion actually
  invalidate credentials. No new dependency, no new collection, no in-memory
  session store (an in-memory store would make multi-instance deployment unsafe,
  and the app is already single-process for the worker and the SSE event bus).
- **Verified current weaknesses** (unchanged by this phase): 7-day tokens with
  only an `id` claim; no server-side logout endpoint; `requireAuth` never checks
  that the user still exists; the `/api/auth` rate limiter covers `/me`,
  `export-data` and account deletion as well as login; CORS emits no
  `Access-Control-Allow-Credentials`; the client has no shared HTTP layer and
  swallows 401s into empty lists.
- **Change surface is large but bounded**: ~76 authenticated `fetch` call sites
  across 5 client modules. A shared `client/src/api/client.ts` is a hard
  prerequisite — adding `credentials` and a CSRF header to 76 hand-rolled
  fetches is not reviewable.
- **Dependencies**: unchanged. No package.json/lockfile edit in this phase;
  audits stay at server 0 and the 12 documented client findings.

## Where we are

Phases 1-16 are committed and pushed to `main`. Quality gates at the Phase 16
baseline: server `tsc --noEmit` clean, 272/272 tests, build green; client
`tsc --noEmit` clean, lint clean, 60/60 tests, `typecheck:config` clean, build
green. Server audit 0; client audit 12 (documented, unchanged).

## Done (Phases 11-15 recap)

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
- Phase 15: Client TypeScript `strict: true`; cookie migration investigated and
  deferred pending a defined topology.
- Phase 16: Authentication/session architecture specified
  (`docs/AUTHENTICATION_ARCHITECTURE.md`); migration still deferred, now with an
  exact code/test plan and an operator decision record that unblocks it.

## Remaining (ship blockers / known debt)

- **Cookie-session migration**: fully specified but not implemented. Blocked on
  the deployment decision record in
  `docs/AUTHENTICATION_ARCHITECTURE.md` §4.4 (topology, HTTPS, proxy hops,
  origins, replica count).
- **No server-side logout or token revocation** — independent of the cookie
  question and fixable on its own (`User.tokenVersion` + `POST /api/auth/logout`).
- **No centralized client 401 handling** — an expired session currently looks
  like empty data instead of a re-login.
- Client `npm audit` residual findings (12) are documented in
  `docs/SECURITY_AUDIT_REPORT.md`; revisit together with a Vite →
  `@typescript-eslint` major upgrade in a dedicated phase.
- Login rate limiting covers the whole `/api/auth` router (30 / 15 min), which
  will need splitting when `/me` runs on every page load.
- Non-auth authentication-adjacent findings recorded during the Phase 16
  investigation (SSRF via user-supplied model `baseUrl`, mass assignment on
  `PUT /api/decisions/:id` and `PUT /api/models/:id`, missing parent-ownership
  checks on courtroom messages/verdict, A2A task authorization) are tracked
  separately and are out of scope for the session-migration phase.
