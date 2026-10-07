# Hathap.ai - Phase 23 todos (model provider URL / SSRF hardening)

Last updated: Phase 23.

## Phase 23 scope

- [x] Audit every consumer of `Model.baseUrl` (single `new OpenAI` in
      `server/src/engine/llmClient.ts`, its raw diagnostic re-fetch, and the
      `POST`/`PUT`/`POST :id/test` routes) and route all of them through one
      guard module.
- [x] Add `server/src/security/modelUrlGuard.ts`: write-path validation
      (`validateModelBaseUrl`) and request-time validation + transport
      (`safeModelFetch`), with a DNS test seam and an HTTP transport seam.
- [x] Enforce URL syntax rules: `http`/`https` only, no embedded credentials,
      no query/fragment on a stored value, length cap, WHATWG normalisation of
      alternate IPv4/IPv6 spellings before any check runs.
- [x] Enforce the destination rule: IP literals must already be public
      (IANA special-purpose, RFC1918, CGNAT, link-local/metadata, multicast,
      reserved, loopback, and the IPv6 equivalents), local/single-label
      hostnames are refused, and every DNS answer must be public with the
      socket pinned to the validated address (no rebinding TOCTOU).
- [x] Bound and re-validate redirects (max 3 hops) and drop
      `authorization`/`cookie`/`proxy-authorization` on a cross-origin redirect.
- [x] Keep the client-visible message coarse and free of DNS/IP/stack detail;
      log the specific cause server-side.
- [x] Add `MODEL_URL_ALLOWLIST` as an explicit, empty-by-default operator opt-in
      for providers that really do live on a private address.
- [x] Regression tests: new `modelSsrf.test.ts` (49 cases); re-run every quality
      gate.
- [x] Update documentation (audit report, auth architecture non-goals, README,
      `.env.example`, `agent_context.md`) and commit.

## Phase 23 outcome

**The server no longer dials a user-chosen private network address.**
`Model.baseUrl` is untrusted input that makes the *server* open a socket, so
Phase 22 authorisation alone was never enough. Every outbound provider request
now leaves through `safeModelFetch`, which parses with the WHATWG URL parser
(so `0x7f.0.0.1`, `2130706433`, `0177.0.0.1`, `[::ffff:127.0.0.1]` normalise to
what they really are first), allows only `http`/`https`, refuses embedded
credentials and (on save) query strings/fragments, refuses IP literals outside
public address space and local/single-label hostnames, resolves the name exactly
once, requires **every** answer to be public, and pins the socket to the address
it validated through a custom `lookup`. Redirects are re-checked on every hop,
capped at 3, and cross-origin hops lose `authorization`/`cookie`/`proxy-authorization`.
`validateModelBaseUrl` applies the DNS-free half of those rules on
`POST`/`PUT /api/models`, so a bad URL is a clean `400` instead of a dial.

**Nothing leaks through the error message.** A blocked request returns
`Model provider URL rejected: <one of seven fixed reasons>` - never a resolved
address, a resolver error, a stack or a credential - so the message cannot be
used as an internal DNS/network oracle; the specific cause is logged server-side
as `[model-url-guard] blocked provider host="..." (...)`. In `callLLM` the guard
error is extracted *before* the retry wrapper, so it is never retried and never
rewritten into a generic "LLM call failed after N attempts".

**Bug found and fixed by the new tests:** the pinned `lookup` was invoking
Node's non-`all` callback as `(address, family)` instead of `(err, address,
family)`, so a pinned connect would have treated the address as an error. Fixed
in `modelUrlGuard.ts`.

**Stated limits (what this does NOT stop).** SSRF is hardened, not "fully
prevented". Still possible by design: a publicly routable attacker-controlled
host is reachable (application-level port probing through ordinary provider
failures, not through the guard); an allow-listed URL is trusted and skips the
destination check; plaintext `http` remains permitted for third-party
OpenAI-compatible providers; an operator who lists a private base URL opts that
destination in permanently; and any *future* code path that dials a model URL
without going through `safeModelFetch` bypasses this boundary entirely. A2A task
authorization, process-local SSE fan-out, the cookie migration (blocked on
A4.4) and the split rate limiter are unchanged and still out of scope.

**Test counts:** server grew from **368** to **417** (49 in
`modelSsrf.test.ts`); client is unchanged at **114**. No client file changed and
no dependency was added or removed, so the audits are unchanged (server 4 - 1
critical `proxy-addr` + 3 high `braces` via `ts-node-dev`; client 22).



## Phase 22 scope

- [x] Audit every authenticated route for ownership enforcement (BOLA/IDOR).
- [x] Close the missing parent-ownership check on courtroom messages and verdict
      (`GET /api/courtrooms/:id/messages`, `/verdict`): verify the courtroom
      belongs to the caller, otherwise `404`.
- [x] Fix the decision-delete cascade: `DELETE /api/decisions/:id` deleted child
      rows by `decisionId` alone, so a foreign id destroyed another user's data.
      Ownership is now verified before any cascade.
- [x] Close mass assignment on `PUT /api/decisions/:id` and `PUT /api/models/:id`
      with explicit field allow-lists (no more `userId`/lifecycle rewrites).
- [x] Add runtime type validation to `POST /api/auth/signup` and `/login`
      (blocks Mongo operator injection and non-string `bcrypt` `500`s); enforce
      the existing 8-character minimum at signup.
- [x] Treat malformed ObjectIds on the touched routes as a controlled `404`
      instead of a `500`.
- [x] Regression tests: new `phase22Authorization.test.ts` (9 cases) and 4 auth
      input-validation cases in `authEndpoints.test.ts`.
- [x] Re-run the full quality gates; update documentation.
- [x] Commit and push Phase 22 to `main`.

## Phase 22 outcome

**Authorization and input boundaries hardened; auth semantics untouched.**
`GET /api/courtrooms/:id/messages` and `/verdict` now resolve the courtroom
against the caller's `userId` before reading the id-keyed child rows, returning
the same `404` for a foreign and a nonexistent courtroom. `DELETE
/api/decisions/:id` verifies ownership before its cascade, so a foreign decision
id can no longer wipe another user's executions/tasks/evidence/memory rows; the
cascade also now captures execution ids *before* deleting them, fixing an
existing silent task-orphaning bug.

**No field the server owns is writable through a generic update.** `PUT
/api/decisions/:id` accepts only the seven content fields and rejects empty
`title`/`objective`; `PUT /api/models/:id` accepts only the five descriptive
fields and applies the API key separately. `userId`, `status`, `currentPhase`,
timestamps and key hints can no longer be mass-assigned.

**Credential handlers validate types at runtime.** `signup` and `login` require
non-empty strings for every field, so `{ email: { $gt: '' } }` is rejected
instead of reaching `User.findOne` (operator injection) and a non-string
password is a `400` instead of a `bcrypt` `500`. Signup now also enforces the
8-character minimum that `change-password` already required.

**Stated limits.** SSRF via user-supplied model `baseUrl`, A2A task
authorization, and process-local SSE fan-out remain out of scope and unchanged;
the token stays in `localStorage` and the cookie migration is still blocked on
the §4.4 deployment decision record.

**Test counts:** server grew from **355** to **368** (9 in
`phase22Authorization.test.ts`, 4 auth validation); client is unchanged at
**114**. No client file changed.

**Audit note:** the server audit now reports 1 **critical** transitive finding
(`proxy-addr`, GHSA-jqcg-44mw-7w3h, IPv4-mapped IPv6 trust subnet), newly
disclosed since Phase 12.6 and not actioned here (a dependency change is out of
scope for this phase); see `docs/SECURITY_AUDIT_REPORT.md`. The client audit
reports 2 moderate `react-router` findings (fix requires a breaking major).

## Phase 21 scope

- [x] Remove the production same-origin CORS check that trusted the client-sent
      `Host` header (`origin === http(s)://${Host}`), which let a forged
      `Origin`/`Host` pair widen the origin allow-list.
- [x] Move the CORS policy into `server/src/middleware/cors.ts` and route every
      decision through `isAllowedCorsOrigin` (no `Host` input).
- [x] Stop leaking internal error text from 5xx responses in production via
      `server/src/utils/httpError.ts`, and add a global Express error handler.
- [x] Add regression tests: `corsMiddleware.test.ts` (including
      Host-independence) and `httpError.test.ts`.
- [x] Re-run the full quality gates and audits; update documentation.
- [x] Commit and push Phase 21 to `main`.

## Phase 21 outcome

**Production configuration hardened; auth semantics untouched.** CORS is now
allow-list only: `CORS_ORIGINS` in production, the Vite dev origins in
development, and non-browser requests without an `Origin` header pass through.
The request `Host` header is never consulted, so a caller can no longer forge
`Origin` and `Host` together and have an arbitrary origin reflected.
`Access-Control-Allow-Credentials` is still never emitted, and no cookie, CSRF or
`credentials: true` behavior was introduced.

**5xx responses no longer echo internal errors in production.** Every 5xx handler
returns `serverErrorMessage(error)`; in production the client receives the
route's generic fallback (or `Internal server error.`) while the real error is
logged server-side. 4xx messages are unchanged. A global Express error handler
covers middleware-level errors as a safety net.

**Test counts:** server grew from **341** to **355** (8 CORS + 6 error-message
cases); client is unchanged at **114**. No client file and no auth behavior
changed.

## Phase 20 scope

- [x] Validate the stored credential on page load with a single
      `GET /api/auth/me` issued through the Phase 18 request layer, so no second
      authentication path is created on either side of the call.
- [x] Give the client session an explicit `loading` state and make
      `ProtectedRoute` / `LoggedInRoute` render a pending placeholder instead of
      redirecting while validation is in flight (no deep-link bounce through
      `/login`).
- [x] Keep four validation outcomes distinct: `valid`, `invalid` (the only one
      that signs the device out), `unavailable` (network failure or `5xx` keeps
      the credential), `idle`.
- [x] Skip the bootstrap for credentials the server just issued (login, signup,
      password change).
- [x] Ensure a validation response that lands after the credential was already
      retired cannot write an orphaned profile back into storage.
- [x] Harden `MemoryPanel` against a `related` payload without `memories`.
- [x] Update documentation that still claimed "no `/api/auth/me` bootstrap".
- [x] Full validation, diff review, commit, push.

## Phase 20 outcome

**Startup session validation shipped.** The `loading → authenticated |
anonymous` state machine from `docs/AUTHENTICATION_ARCHITECTURE.md` §5.4 now
exists over the bearer transport. The bootstrap request goes through
`api/client.ts`, so it inherits the Phase 17 server checks (signature, expiry,
account existence, `authVersion`) and the Phase 18 centralized `401` handling —
there is still exactly one request layer and one localStorage owner on the
client, and one verification path on the server.

**The failure semantics are the substance of the change.** A rejected credential
(`401`) is the only outcome that ends the session; a network failure or `5xx`
leaves the credential in place, because an outage is not evidence that a token
is dead. A credential minted by login/signup/password-change skips validation
entirely, and a validation response arriving after a concurrent `401` is
discarded so no orphaned `hathap_user` is persisted.

**No server file changed.** Cookies, `credentials: 'include'`, CSRF and the
split rate limiter remain unimplemented and blocked on §4.4 exactly as Phase 19
left them.

## Phase 20 findings (evidence recorded)

- **The working tree at Phase 20 start contained an unfinished, failing
  implementation.** HEAD was `9ede498 chore: record phase 20 remaining todos
  (work stopped)`, so Phase 20's application code was uncommitted while its
  `.phase20_remaining.txt` listed the outstanding work. Three client tests
  failed and one threw an unhandled exception.
- **Two of the three failures were test-harness defects, not product defects.**
  The `settle()` helper resets fetch call history so "exactly one request"
  assertions stay literal, and two validation tests then asserted on history it
  had just cleared. `settle()` now returns the validation calls it captured
  before the reset, so both the count and the request shape are asserted
  directly.
- **The third failure was a real product defect.** The integration mock for the
  pending-state test omitted `/related`, so `getRelatedDecisions` received `{}`
  and passed an object with no `memories` array into `MemoryPanel`, which
  dereferenced `related.memories.length` and threw during render. The test now
  reuses the shared decision-detail mock, and `MemoryPanel` degrades to its
  empty state instead of crashing the detail page on an unexpected payload.

## Where we are

Phases 1-20 are committed and pushed to `main`. Quality gates: server
`npx tsc --noEmit` clean, **341/341 tests**, build green; client lint clean
(`--max-warnings 0`), **114/114 tests**, `typecheck:config` clean, build green.

The client count moved from the Phase 19 baseline of 98 to 114: Phase 20 added
16 (13 in `AuthContext.test.tsx`, 3 in `AppRoutes.integration.test.tsx`).

The honest headline: the credential is now *verified* on load rather than merely
*present*, which removes the stale-shell flash and the wasted first API call.
It is still in `localStorage`, so nothing about token theft changed, and the
cookie migration is still blocked on §4.4.

## Phase 19 scope

- [x] Inventory deployment topology evidence across **every tracked file** (not a
      sample): containers, compose, Kubernetes, proxies, PaaS descriptors,
      IaC, hosting and CI/CD deploy workflows, env files, production URLs,
      `trust proxy`, reverse-proxy rules, and package production scripts.
- [x] Re-verify the Phase 18 foundation is intact: one `fetch` call site, one
      `localStorage` credential owner, centralized credentialed-401 handling, SSE
      that stops on 401 and never reconnects, synchronous session restoration.
- [x] Scoped security review: token leakage in errors/logs/URLs, `Authorization`
      logging, credentials in URLs, CORS behavior, secret handling, debug
      output, and unsafe deployment guidance.
- [x] Classify the topology — or, if it cannot be established from evidence, say
      so explicitly and record what is required from the operator.
- [x] Formalize the operator decision record
      (`docs/AUTHENTICATION_ARCHITECTURE.md` §4.4) so every unresolved field is
      explicit rather than implied.
- [x] Fix topology-independent defects found (undocumented-but-live env vars,
      stale documentation citations).
- [x] Reconcile `DEPLOYMENT_CHECKLIST.md`, `todos.md`, `server/.env.example`.
- [x] Validate, review the full diff, commit, push.

## Phase 19 outcome

**The topology could not be determined, and that is now the documented finding
rather than an open question.** No deployment artifact, deploy workflow,
production environment file, or production hostname exists anywhere in the
tracked tree. The repository is not "missing an answer we could infer" — it
contains no deployment configuration at all, so §4.4 is operator-held work.

**No application code changed, deliberately.** The Phase 18 architecture was
re-verified intact and left alone. Cookies, `credentials: 'include'`, CSRF and
cookie-based CORS remain unimplemented and must stay that way until §4.4 rows
1–3 are answered: guessing wrong either breaks production sign-in or silently
removes the primary CSRF defence.

Two concrete, topology-independent defects were fixed:

- `NODE_ENV` and `APP_URL` are both read by the server but were absent from
  `server/.env.example`. `NODE_ENV` gates the production JWT rules — unset, the
  process behaves as development and permits the fallback signing secret. Both
  are now documented with their failure modes.
- Two stale documentation citations left by the Phase 18 refactor: the
  `VITE_API_URL` reference still pointed at the pre-refactor
  `AuthContext.tsx`, and §7.2 referenced 5 client test files where §2.2 lists 6.

## Phase 19 findings (evidence recorded)

- **No deployment configuration exists.** No Dockerfile, compose, Kubernetes,
  Helm, Terraform/Pulumi/CDK, nginx/Caddy/Apache/Traefik config, `Procfile`,
  `heroku.yml`, `vercel.json`, `netlify.toml`, `render.yaml`, `railway.json`,
  `fly.toml`, `app.yaml`, `serverless.yml`, or CDN/storage config for
  `client/dist`. `.github/workflows/ci.yml` is the only workflow and its two jobs
  only typecheck, test and build — there is no deploy job and no environment.
- **No production origins.** A URL sweep over all tracked files found the only
  deployment-related URLs are the placeholders `https://your-domain.com` and
  `https://your-domain.com/api`. Every other `https?://` match is an LLM provider
  endpoint, a spec reference, or a documentation link.
- **The absence is real, not an ignore artifact.** `.gitignore` excludes `.env`,
  `.env.local`, `.env.*.local` and `server/.env` — but not
  `client/.env.production`, and no such file is tracked. `client/.env.development`
  is the only client env file.
- **Development is not evidence about production.** The default dev topology is
  same-origin through the Vite proxy, yet `client/.env.development` sets an
  absolute cross-origin `VITE_API_URL`. Both are same-*site* on localhost, so
  `SameSite=Lax` works either way; neither constrains the production choice.
- **CI's environment never sets `NODE_ENV=production`**, so the process-level
  production guards (the fatal JWT startup abort) are not exercised in automation.
  The production JWT and CORS *rules* are covered since Phase 21, because
  `securityConfig.test.ts` and `corsMiddleware.test.ts` set `NODE_ENV` per case.
- **Cookie transport would not work today even if implemented:** the CORS
  middleware passes only `{ origin }`, so `Access-Control-Allow-Credentials` is
  never emitted, and `client.ts` sets no `credentials` option. Both are already
  recorded in §6.4 and §7.
- **Security review found no token leakage.** `jwt.verify` errors are swallowed
  into `null` (no token in logs), the LLM client logs provider/model/URL but never
  the provider API key, and SSE uses fetch-based streaming so the JWT travels in
  the `Authorization` header and never in a URL or query string. `requireAuth`
  logs only database-fault errors, and reports 500 rather than 401 for them so a
  transient outage is not mistaken for a dead session.
- **The proxy-dependent CORS convenience was removed in Phase 21.** The old
  same-origin check compared `Origin` against `http(s)://${Host}`, i.e. it trusted
  the client-sent `Host` header, so a forged `Origin`/`Host` pair widened the
  allow-list. CORS now delegates entirely to the `CORS_ORIGINS`/development
  allow-list and never reads `Host`; `corsMiddleware.test.ts` pins this. §4.4 row 7
  is still open for `trust proxy`, but it no longer gates CORS. Recorded in §2.1,
  §4.1 and §6.4.



## Where we are

Phases 1-20 are committed and pushed to `main`. Phase 21 hardens production
configuration without touching auth semantics. Current quality gates — server
`tsc --noEmit` clean, **355/355 tests**, build clean; client lint clean, **114/114
tests**, `tsc --noEmit` and config typecheck clean, build clean.

The honest headline: the app is no closer to a cookie session than it was in
Phase 18, and it is not meant to be. What changed is that the blocker is a
written, itemized, 12-row decision record instead of a loose assumption, the
deployment gap is on the record as known debt, and the one production
same-origin check that trusted a client-sent header has been removed.

## Phase 18 scope

- [x] Add `client/src/api/authTransport.ts` as the only module that knows how the
      credential is stored, plus the session-invalidation listener registry.
- [x] Add `client/src/api/client.ts`: API base URL, credential attachment, error
      normalization, 401 detection, and `apiFetch` / `apiJson` / `apiText`.
- [x] Rewrite `AuthContext` on top of the shared layer, clearing local state before
      the best-effort logout call.
- [x] Migrate all 73 call sites (AppContext 39, EvaluationContext 24,
      CourtroomDetailPage 3, AuthContext 6, SSE 1) off direct `fetch`.
- [x] Route guards and `Header` consume `isAuthenticated` rather than a raw token.
- [x] Tests for credential attachment, error normalization, 401 sign-out (and the
      cases that must **not** sign out), SSE 401 handling, and deep-link behaviour.
- [x] Re-run the full quality gates and audits; update the documentation.
- [x] Commit and push Phase 18 to `main` (`81b757f`).

## Phase 18 outcome

The client now has one credential source and one request layer. No module reads
`hathap_token` or builds an `Authorization` header itself, and no direct `fetch`
remains outside `client/src/api/client.ts`.

- `authTransport.ts` owns `hathap_token` / `hathap_user` and the invalidation
  signal, so the eventual cookie migration is a change to one file.
- `client.ts` attaches the credential, sets `Content-Type: application/json` only
  when there is a JSON body, and preserves the server's own error message in a
  single `ApiError` type (`unauthorized` / `http` / `network`).
- A `401` on a request that carried a credential retires the session exactly once;
  a `401` without one (a failed login) and a `5xx` do not. The layer never retries
  and never navigates, so a dead session cannot cause a redirect loop.
- SSE stops on a `401` instead of reconnecting or falling back to polling with a
  dead credential.
- The stored session is resolved synchronously in the `useState` initializer, so a
  page refresh on a protected route no longer bounces through `/login`.

Phase 18 changed **no server file** and no auth semantics. Stated limits: the token
is still in `localStorage` and still readable by page scripts; it was still **not**
validated on page load (closed by Phase 20, below); TTL is still 7 days; and the
cookie migration, CSRF and split rate limiter remain unimplemented and blocked on
the Phase 16 deployment decision record.

## Phase 18 findings (evidence recorded)

- **Reading the session in a mount effect was a real bug, caught by the existing
  integration suite.** The first implementation resolved the stored session in a
  `useEffect`, so the app presented itself as signed out for exactly one render.
  `ProtectedRoute` redirected to `/login`; `LoggedInRoute` then saw the token
  arrive and redirected to `/dashboard`. The visible effect was that a page refresh
  on *any* protected route landed the user on the dashboard instead of the route
  they asked for — and on deep links the app went on to `/onboarding` via the
  dashboard's no-models redirect. Two pre-existing `AppRoutes.integration.test.tsx`
  cases failed, which is how it was found. Fixed by resolving storage in the
  `useState` initializer, and now asserted directly by a dedicated test.
- **Bodyless POSTs no longer send a JSON content type.** The old code set
  `Content-Type: application/json` on every request. The Phase 17 logout endpoint
  and other bodyless POSTs are not `req.body`-dependent (verified by searching the
  server routes), so dropping the header is safe and makes the request layer's
  header set depend only on the request that is actually sent.

## Where we are

Phases 1-18 are committed and pushed to `main` (Phase 18: `81b757f`). Quality
gates at the Phase 18 baseline: server `tsc --noEmit` clean, **341/341 tests**,
build green; client lint clean, **98/98 tests**, `typecheck:config` clean, build
green. Server audit **0**; client audit 12 (documented, unchanged).

The client count moved from the Phase 17 baseline of 66 to 98: Phase 18 added 32
(23 for the request layer, 6 in `AuthContext.test.tsx`, 1 in
`useDecisionEventStream.test.ts`, 2 in `AppRoutes.integration.test.tsx`).

## Phase 17 (complete)

### Phase 17 scope

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
- **Verified current weaknesses** (as of Phase 16): 7-day tokens with only an `id`
  claim; no server-side logout endpoint; `requireAuth` never checks that the user
  still exists; the `/api/auth` rate limiter covers `/me`, `export-data` and
  account deletion as well as login; CORS emits no
  `Access-Control-Allow-Credentials`. The Phase 16 note that "the client has no
  shared HTTP layer and swallows 401s into empty lists" was addressed in Phase 18;
  the token-not-validated-on-load weakness is still open.
- **Change surface was large but bounded**: ~76 authenticated `fetch` call sites
  across 5 client modules, all of which Phase 18 migrated.
- **Dependencies**: unchanged. No package.json/lockfile edit in this phase;
  audits stay at server 0 and the 12 documented client findings.

## Done (Phases 11-23 recap)

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
- Phase 18: Client auth transport centralized and tested — `api/authTransport.ts`
  (sole storage owner + invalidation signal), `api/client.ts` (sole request layer,
  one 401 → sign-out path, no retry, no navigation), all 73 call sites migrated,
  and synchronous session restoration so a page refresh no longer bounces through
  `/login`. The token is still in `localStorage` and (as of Phase 18) was not yet
  validated on load — Phase 20 closed that gap.
- Phase 19: Deployment/auth decision formalized. An exhaustive inventory of every
  tracked file confirmed the production topology is **absent from the repository**,
  so the decision record in `docs/AUTHENTICATION_ARCHITECTURE.md` §4.4 was
  expanded to 12 explicit rows, each marked `UNKNOWN — OPERATOR DECISION REQUIRED`.
  **No cookie/CSRF code was written and none should be until those rows are
  filled.** Two undocumented-but-live server env vars were documented
  (`NODE_ENV`, `APP_URL`); no application behavior changed.
- Phase 20: Startup session validation shipped. `AuthContext` gained an explicit
  `loading` state and issues one `GET /api/auth/me` through the Phase 18 request
  layer; route guards render a pending placeholder instead of redirecting, so a
  deep link no longer bounces through `/login`. A `401` is the only verdict that
  signs the device out; network failures and `5xx` keep the credential. No server
  file changed. Cookie migration, CSRF and the split rate limiter remain
  unimplemented and blocked on §4.4.
- Phase 21: Production configuration hardened. The `Host`-trusting same-origin CORS
  convenience was removed and the policy moved to `server/src/middleware/cors.ts`
  (allow-list only, `Host` never read), and all 5xx error responses are sanitized in
  production by `server/src/utils/httpError.ts` plus a global Express error handler.
  Regression tests pin Host-independence and the production/non-production message
  split. Cookie migration, CSRF and the split rate limiter remain unimplemented and
  blocked on §4.4.
- Phase 22: Authorization and input boundaries hardened over the bearer transport.
  Courtroom messages/verdict gained a parent-ownership check; the decision-delete
  cascade verifies ownership before touching child rows (and no longer orphans
  tasks); `PUT /api/decisions/:id` and `PUT /api/models/:id` use field allow-lists
  instead of a raw body spread; and `signup`/`login` validate credential types at
  runtime. No auth semantics, cookie, CSRF or client behavior changed.
- Phase 23: Model provider URL / SSRF boundary hardened. `server/src/security/modelUrlGuard.ts`
  validates `Model.baseUrl` on `POST`/`PUT /api/models` and re-validates every outbound
  provider request through `safeModelFetch` (WHATWG-normalised URL rules, public-only DNS
  answers, socket pinned to the validated address, redirects re-checked and capped at 3 with
  credentials stripped cross-origin), with `MODEL_URL_ALLOWLIST` as an empty-by-default
  operator opt-in. Rejections return a coarse `Model provider URL rejected: ...` message with
  no address/resolver detail. No client file, dependency, auth semantics, cookie, CSRF or rate
  limiter changed.

## Remaining (ship blockers / known debt)

- **Cookie-session migration**: fully specified but not implemented. Blocked on
  the deployment decision record in
  `docs/AUTHENTICATION_ARCHITECTURE.md` §4.4 (topology, HTTPS, proxy hops,
  origins, replica count). The same block also gates the shortened token TTL, the
  CSRF token and the split rate limiter. **Phase 19 closed out the search for an
  in-repo answer**: there is no Dockerfile, compose file, Kubernetes manifest,
  proxy config, PaaS descriptor, deploy workflow, production env file, or
  production hostname in the tree, and CI only typechecks/tests/builds. The
  blocking minimum is rows 1–3 of §4.4 — S1 or S2, same-site or cross-site, and
  HTTPS. These require a human decision and cannot be derived from the code.
- **There is no deployment configuration in this repository at all.** Not a
  security bug, but it means hosting, TLS termination and the SPA/API topology
  are unowned work rather than something already solved. `trust proxy` is never
  set, and the server mounts no static handler and no SPA fallback.
- **Token still in `localStorage`** — readable by any script on the origin.
  Server-side invalidation bounds how long a stolen credential is useful; it does
  not prevent the theft. Fixing it requires the cookie migration above.
- **Invalidation is per-user, not per-token.** Signing out or changing a password
  ends every session for the account, including other devices. Per-device
  revocation would need a server-side session store, which this phase deliberately
  did not introduce.
- **The page-load bootstrap deliberately tolerates an unknown verdict.** Since
  Phase 20 a stale credential is caught on load, but a validation request that
  fails with a network error or `5xx` keeps the session and lets the request
  layer catch a real `401` later. That is the intended trade-off (an outage must
  not sign users out), not an open defect.
- Client `npm audit` residual findings (12) are documented in
  `docs/SECURITY_AUDIT_REPORT.md`; revisit together with a Vite →
  `@typescript-eslint` major upgrade in a dedicated phase.
- Auth rate limiting still covers the whole `/api/auth` router (30 / 15 min).
  Since Phase 20 that budget also covers the `/me` bootstrap, which runs once per
  full page load — tolerable now, but the router needs splitting if `/me` traffic
  or credential-endpoint traffic grows.
- Non-auth authentication-adjacent findings recorded during the Phase 16
  investigation: A2A task authorization and process-local SSE fan-out on
  multi-replica deployments remain tracked separately and out of scope. **Phase
  23 closed** the SSRF item: `Model.baseUrl` is now validated on the write path
  and re-validated (with DNS + socket pinning + redirect re-checks) on every
  outbound provider request via `server/src/security/modelUrlGuard.ts`, with an
  empty-by-default `MODEL_URL_ALLOWLIST` opt-in for providers that really do run
  on a private address. The residual exposure is documented, not eliminated. **Phase 22 closed** the other three: mass
  assignment on `PUT /api/decisions/:id` and `PUT /api/models/:id`, missing
  parent-ownership checks on courtroom messages/verdict, and (found while
  auditing) the cross-tenant decision-delete cascade and missing signup/login
  type validation.
- **Server audit now carries 1 critical transitive finding** (`proxy-addr`,
  GHSA-jqcg-44mw-7w3h), newly disclosed since Phase 12.6 and not actioned in
  Phase 22. It is only reachable behind a proxy with a configured trust
  boundary, and `trust proxy` is not set here, so practical exposure is limited;
  revisit as a dedicated dependency-remediation task. Client audit carries 2
  moderate `react-router` findings whose fix is a breaking major upgrade.
