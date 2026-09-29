# Hathap.ai — Phase 17 todos (server authentication invalidation)

Last updated: Phase 17.

## Phase 17 scope

- [x] Add server-side credential invalidation: a per-user `User.authVersion`
      counter carried in each credential as the `av` claim.
- [x] Centralize issuance and verification in `server/src/utils/authToken.ts` and
      route every bearer-authenticated path (Express middleware and A2A) through it.
- [x] Add `POST /api/auth/logout`; make password change and account deletion
      invalidate outstanding credentials.
- [x] Client: call the logout endpoint best-effort, and adopt the replacement
      credential returned by a password change.
- [x] Harden `verifyAuthToken` against a non-ObjectId identity claim, which
      reached Mongoose as a `CastError` and surfaced as `500`.
- [x] Regression test for A2A invalidation, exercising the real counter bump
      rather than a mock.
- [x] Unit tests for `server/src/utils/authToken.ts`.
- [x] Re-run the full quality gates and audits; update the documentation.
- [x] Commit and push Phase 17 to `main` (`6d6c466`).

## Phase 17 outcome

Server-side credential invalidation is **implemented and tested**. A
signature-valid JWT is no longer sufficient to authenticate: every bearer
credential additionally resolves the account and is compared against that
account's `User.authVersion` counter.

- `POST /api/auth/logout` exists and ends the session server-side.
- Changing a password invalidates every outstanding credential for the account and
  re-issues one to the device that made the change.
- Deleting an account invalidates its credentials by removing the user document.
- A2A bearer credentials go through the same verification, so invalidation cannot
  be bypassed on that surface.
- A token for a deleted account, or one naming an identity that is not a valid
  ObjectId, is rejected with `401` rather than a server error.
- Credentials issued before the `av` claim existed are treated as version `0`, so
  no backfill migration is required and nobody is signed out on deploy.

Stated limits: invalidation is **per-user, not per-token**, so signing out ends
every session for that account including other devices; there is still no
server-side session store; and the token remains in `localStorage`, so it is still
readable by any script on the origin.

**The cookie migration remains unimplemented** and still blocked on the Phase 16
deployment decision record. JWT-in-`localStorage` is still the shipped transport.

## Phase 17 findings (evidence recorded)

- **A stalled `npm test` was a real bug, not a flake.** The suite was neither slow
  nor blocked on the database: `decisionIntelligence.test.ts` failed in its
  `before` hook with `E11000 duplicate key error ... email_1`, because Phase 17
  changed that file's fixtures from bare ObjectIds to real `User` documents
  without adding `User.deleteMany` to its cleanup. Its `after` hook then
  dereferenced an unassigned `server`, so `mongoose.connection.close()` was never
  reached; the leaked connection kept the child process alive, and
  `--test-timeout=0` meant it never gave up — so the suite hung indefinitely
  instead of failing. Five test files had the missing `User` cleanup. Fixed by
  adding `User` cleanup and guarding the `after` hooks, so a failed `before` can
  never leak a connection again.
- **Three test files were byte-corrupted** — a stray `0x0D` and a `0x07` control
  character inside a doc comment, plus mixed line endings — left behind by an
  earlier interrupted write. Repaired, which also collapsed roughly 2,400 lines
  of spurious diff noise down to the real changes.
- **The malformed-identity bug was confirmed, not assumed.** Temporarily removing
  the `mongoose.isObjectIdOrHexString` guard and re-running produced
  `CastError: Cast to ObjectId failed for value "not-an-object-id" ... for model
  "User"`, proving both the bug and that the new regression test detects it. The
  guard was then restored.

## Where we are

Phases 1-17 are committed and pushed to `main` (Phase 17: `6d6c466`). Quality
gates at the Phase 17 baseline: server `tsc --noEmit` clean, **341/341 tests**,
build green; client `tsc --noEmit` clean, lint clean, **66/66 tests**,
`typecheck:config` clean, build green. Server audit **0**; client audit 12
(documented, unchanged).

The server count moved from the Phase 16 baseline of 295 to 341: Phase 17 added 46
tests (34 unit tests for `utils/authToken.ts`, 11 A2A invalidation tests, 1
endpoint test for the malformed-identity rejection).

## Phase 16 (complete)

### Phase 16 scope

- [x] Inspect the baseline and verify HEAD == the Phase 15 commit.
- [x] Trace the complete authentication flow on both sides (issuance, storage,
      verification, protected routes, SSE, A2A, error handling).
- [x] Establish what the repository actually guarantees about deployment
      topology, from repository evidence only.
- [x] Compare the bearer/localStorage model with a cookie-session model,
      including CSRF, CORS-credentials and session-invalidation consequences.
- [x] Choose the smallest responsible scope and write it down.
- [x] Review the Phase 16 architecture document against browser specifications
      and correct the site-vs-origin error in the `SameSite` analysis (§4.3, §5.1,
      §6.1 of the design doc, plus this file and the deployment checklist).
- [x] Re-run the full quality gates and audits; commit and push.

### Outcome: B — architecture-first

The cookie migration was **not** implemented, because the production deployment
topology — the input that determines `SameSite`, `Secure` and `Domain` — is not
defined anywhere in this repository. The design is written up in
[`docs/AUTHENTICATION_ARCHITECTURE.md`](docs/AUTHENTICATION_ARCHITECTURE.md)
and is implementation-ready: current-state inventory, target session model,
CSRF/CORS design, per-file change list, test plan, and acceptance criteria.

### Phase 16 findings (evidence recorded)

- **Deployment topology is undefined.** The repository contains no deployment
  artifacts (`git ls-files` matches only `.github/workflows/ci.yml`): no
  Dockerfile, compose file, nginx/Caddy config, Procfile, or hosting config.
  Development is same-origin by default (Vite proxies `/api`), but the only
  production guidance is a *host suggestion list* pairing a CDN/static host with
  a Node host (`DEPLOYMENT_CHECKLIST.md`, `agent_context.md`) — different
  registrable domains, i.e. cross-**site**. The server never serves the SPA.
- **Why cookies could not be safely implemented now.** The blocking input is the
  **same-site vs cross-site** question, not "can we set a cookie". `SameSite` is
  evaluated on the *site* (scheme + registrable domain), not the *origin*, so
  subdomains and different ports are same-site and `SameSite=Lax` works there.
  But with the documented cross-**site** hosting pairing, `SameSite=Lax`/`Strict`
  cookies are never sent (silent 401s in production only) and `SameSite=None` is
  forced — which requires HTTPS and removes all `SameSite` CSRF protection, making
  the CSRF token the sole defence. Whether production is same-site or cross-site
  is a one-line operator answer the repository does not contain, and the two
  outcomes need materially different designs. HTTPS is only asserted in prose
  (`agent_context.md`: "Assumes production deployment uses HTTPS"), never
  configured; `trust proxy` is never configured, so neither the `Secure` decision
  nor a reliable same-origin check can be made from code today.
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

## Done (Phases 11-17 recap)

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
- Phase 17: Server-side credential invalidation implemented and tested —
  `User.authVersion` + `av` claim, `server/src/utils/authToken.ts`,
  `POST /api/auth/logout`, invalidation on password change and account deletion,
  and A2A parity. Cookie migration still deferred on the same decision record.

## Remaining (ship blockers / known debt)

- **Cookie-session migration**: fully specified but not implemented. Blocked on
  the deployment decision record in
  `docs/AUTHENTICATION_ARCHITECTURE.md` §4.4 (topology, HTTPS, proxy hops,
  origins, replica count). The same block also gates the shortened token TTL, the
  CSRF token and the split rate limiter.
- **Token still in `localStorage`** — readable by any script on the origin.
  Server-side invalidation bounds how long a stolen credential is useful; it does
  not prevent the theft. Fixing it requires the cookie migration above.
- **Invalidation is per-user, not per-token.** Signing out or changing a password
  ends every session for the account, including other devices. Per-device
  revocation would need a server-side session store, which this phase deliberately
  did not introduce.
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
