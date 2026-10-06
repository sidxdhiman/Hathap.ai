# Authentication & Session Architecture

Status: **partially implemented.** Phase 17 built and tested the revocable
session model — server-side credential invalidation, a real logout endpoint and
live user resolution on every authenticated request. The cookie transport that
Phase 16 proposed is **still not implemented** and remains blocked on the §4.4
deployment decision record.
Evidence baseline for §2/§4: `3c4cf44` (`feat: phase 15 enable client typescript strict mode`)
Scope: how Hathap.ai authenticates, what the repository actually guarantees about
deployment, and the design + code/test plan to move from "JWT in `localStorage`"
to secure session cookies.

**Read this first.** Two different things are tracked here and they must not be
confused:

| Capability | State |
|---|---|
| Server-side credential invalidation (`av` claim + `User.authVersion`) | **Implemented and tested** (Phase 17, §2.4) |
| Account-existence check on every authenticated request | **Implemented and tested** (Phase 17, §2.4) |
| `POST /api/auth/logout` ending sessions server-side | **Implemented and tested** (Phase 17, §2.4) |
| A2A honouring credential invalidation | **Implemented and tested** (Phase 17, §2.4) |
| Single client request/credential layer; one 401 → sign-out path | **Implemented and tested** (Phase 18, §2.5) |
| Token still readable by page scripts (`localStorage`) | **Unchanged — still an open limitation** (§2.4, §2.5.4) |
| Token validated on load (`/api/auth/me` bootstrap) | **Implemented and tested** (Phase 20, §2.5.5) — a stale token is rejected on load, not by the first API call |
| `HttpOnly` cookie transport | **Not implemented** — blocked on §4.4 |
| CSRF token / Origin enforcement | **Not implemented** — contingent on cookies (§6.3) |

Nothing about cookies may be described as done. JWT in `localStorage` is still
the shipped transport, so the XSS token-theft exposure in §2.3.1 remains open.

---

## 1. Decision summary

**Phase 16 outcome: B — architecture-first.** The cookie migration was **not**
implemented in this phase because the repository does not define a production
deployment topology, and cookie `SameSite` / `Secure` semantics are *undefined*
until it does. Implementing cookies first would mean guessing.

Precisely, the migration is blocked on two one-line facts that the code cannot
supply (§4.3, §10.1):

1. **Is the API on the same registrable domain as the SPA?** This decides whether
   `SameSite` contributes any CSRF protection. If not, `SameSite=None` is forced
   and the CSRF token becomes the only defence.
2. **Is the public origin HTTPS?** `Secure` is required in every case, and
   `SameSite=None` is impossible without it.

The one decision that is safe to make now, and is recorded here, is the
**session model**: keep the existing stateless HS256 JWT and move it into an
`HttpOnly` cookie, plus add a revocable version counter so logout / password
change / account deletion actually invalidate credentials. That requires **no new
infrastructure** and no in-memory session store. See §5.

**Phase 17 shipped the revocable half of that decision** — the version counter,
live account resolution, a real logout endpoint and A2A parity — over the
existing bearer transport (§2.4). The cookie half remains blocked.

Blocking prerequisite (§4.4): the operator must fill in the deployment decision
record before the cookie implementation starts. That block applies to cookies
only; it did not apply to the invalidation work in Phase 17, which needed no
deployment decision.

---

## 2. Current authentication architecture (verified at `3c4cf44`)

Every line reference below was read directly from the tree at the baseline commit.

### 2.1 Server

| Concern | Reality | Evidence |
|---|---|---|
| Token issuance | `jwt.sign({ id: user._id }, getJwtSecret(), { expiresIn: '7d' })` on both signup and login; response body is `{ token, user }` | `server/src/routes/auth.ts:59`, `:74` |
| Token claims | `id` only. No `jti`, no `iat`, no `iss`/`aud`, no session/version claim | `server/src/routes/auth.ts:59`, `:74` |
| Verification | `requireAuth` reads the `Authorization` header only, takes `auth.split(' ')[1]`, `jwt.verify`, sets `req.userId` | `server/src/middleware/authMiddleware.ts:9-20` |
| User existence | Never checked. A token for a deleted user still authenticates; `/me`, `/change-password`, `/export-data` then 404, other routes keep writing rows for a non-existent owner | `server/src/middleware/authMiddleware.ts:13-16` vs `server/src/routes/auth.ts:84-85` |
| Logout | **No server-side logout endpoint exists.** Logout is client-only state clearing | `server/src/routes/auth.ts` (routes: `POST /signup`, `POST /login`, `GET /me`, `POST /change-password`, `POST /export-data`, `DELETE /account`) |
| Revocation | None. A 7-day token survives password change and account deletion | `server/src/routes/auth.ts:94-117`, `:208-283` |
| Protected surface | Every protected route uses the same `requireAuth`; there is no per-route auth variation (SSE included) | e.g. `server/src/routes/decisions.ts:622`, `:662`, `:738` |
| CORS | Allow-list only: no `Origin` header, OR in the `CORS_ORIGINS` allow-list. The `Host` header is **never** consulted. Production with an empty allow-list rejects all cross-origin browser requests; same-origin requests are unaffected because browsers do not apply CORS to them | `server/src/middleware/cors.ts`, `server/src/config/security.ts:87-95`, `server/src/tests/corsMiddleware.test.ts` |
| CORS credentials | **Not enabled.** `credentials` is not set, so no `Access-Control-Allow-Credentials` header is emitted today (asserted by `server/src/tests/corsMiddleware.test.ts`) | `server/src/middleware/cors.ts` |
| Reverse-proxy trust | `app.set('trust proxy', ...)` is never called, so `req.ip`/`req.protocol` are wrong behind a proxy. CORS no longer depends on the `Host` header at all | `server/src/index.ts` (verified: no occurrence of `trust proxy` anywhere in `server/src`) |
| Rate limiting | `30 / 15 min` mounted on the **whole** `/api/auth` router, so `/me`, `/change-password`, `/export-data` and `DELETE /account` share the same per-IP budget as login | `server/src/index.ts:61-67`, `:77` |
| Cookies | No cookie is ever read, written, or signed. `cookie-parser` is not a dependency | `server/package.json:18-30` (verified: no `cookie` reference in `server/src`) |
| SSE | Authenticated by `requireAuth` before the stream opens; client sends the JWT in a request header via fetch-based streaming | `server/src/routes/decisions.ts:662-663`; `client/src/hooks/useDecisionEventStream.ts:160-174` |
| A2A | Separate header-based path: `Authorization: Bearer`, else `X-A2A-API-Key` + `A2A_DEFAULT_USER_ID`, else `UnauthenticatedUser` | `server/src/a2a/userBuilder.ts:7-33`, mounted at `server/src/index.ts:87` |
| Secrets | `JWT_SECRET` required in production (≥ 16 chars) and refused otherwise | `server/src/config/security.ts:37-67`, `server/src/index.ts:29-36` |
| Process model | Single Express process that also runs the background worker; the execution event bus used by SSE is in-process | `server/src/index.ts:69-91`, `server/src/tasks/worker.ts`, `server/src/decision/eventBus.ts` |

### 2.2 Client

| Concern | Reality | Evidence |
|---|---|---|
| Token persistence | `localStorage` keys `hathap_token` and `hathap_user`, owned by a single transport module; storage is written synchronously next to the React state, never from an effect | `client/src/api/authTransport.ts`, `client/src/context/AuthContext.tsx` |
| Token retrieval | `readStoredToken()` inside the shared request layer; **no** module outside `authTransport.ts` reads the key | `client/src/api/client.ts:132` |
| API calls | **No direct `fetch` remains.** Every call goes through `apiFetch` / `apiJson` / `apiText`, which attach the credential and normalize errors | `client/src/api/client.ts`, all callers |
| API base URL | `import.meta.env.VITE_API_URL` if set, otherwise relative `/api` (dev proxy), resolved once in the request layer | `client/src/api/client.ts:22` |
| Protected routing | `ProtectedRoute` gates on `isAuthenticated`, i.e. the presence of a stored credential; there is still no server validation on load | `client/src/App.tsx:25-31` |
| Auth restoration | Lazy `useState` init from storage, so the session is known on the **first render**; no `/api/auth/me` bootstrap call | `client/src/context/AuthContext.tsx` |
| 401 handling | Centralized. A 401 on a request that carried a credential reports session invalidation once; `AuthContext` clears state and storage, and route guards redirect | `client/src/api/client.ts:147-151`, `client/src/context/AuthContext.tsx` |
| Logout | Clears React state and `localStorage` first and unconditionally, then calls `POST /api/auth/logout` best-effort with the retired token | `client/src/context/AuthContext.tsx` |
| Password change / export / delete | All go through the shared layer; delete clears local state without calling logout | `client/src/context/AuthContext.tsx` |
| Existing tests | Request layer (23), restoration, login success/failure, signup success/failure, logout, dead-session sign-out, protected-route navigation, deep-link without bounce, 401 sign-out, SSE 401 handling | `client/src/api/client.test.ts`, `context/AuthContext.test.tsx`, `context/AppContext.test.tsx`, `context/EvaluationContext.test.tsx`, `pages/AppRoutes.integration.test.tsx`, `hooks/useDecisionEventStream.test.ts` |

### 2.3 Verified security consequences of the current design

1. **Token theft via XSS is trivially available.** Any script executing on the
   origin (injected script, malicious extension, compromised dependency) reads
   `localStorage.hathap_token` and gets a 7-day bearer credential for the full
   account. An `HttpOnly` cookie removes that read primitive entirely.
2. **There is no way to end a session server-side.** Not on logout, not on
   password change, not on account deletion. This is independent of the storage
   mechanism and is the more urgent of the two problems.
3. **Expired/revoked sessions are invisible to the user.** The app renders and
   then fails per-request, with 401s swallowed into empty lists.
4. **No CSRF exposure today** — and this is a real property of the *bearer
   header* model, not of the token itself: a cross-site attacker cannot make the
   browser attach a header the attacker's page cannot set. Any move to cookie
   transport must re-establish an equivalent control (§6.3).

Items 1, 2 and 3 describe the Phase 16 baseline. §2.4 records what Phase 17
changed; item 1 (XSS token theft) is **still open**. Item 3 (invisible
expiry) is addressed by Phase 18 — see §2.5 — which closes the *visibility*
half of it; the credential is still not proactively checked on load.

---

## 2.4 What Phase 17 implemented (verified)

§2 and §2.3 above describe the tree at `3c4cf44` and are kept as the historical
baseline. This section describes the design that actually shipped, so the two are
not confused. Every claim below is covered by an executed test (§10.2).

### 2.4.1 The revocation mechanism

A signature-valid JWT is **not** treated as authentication. Verification now also
establishes that the account still exists and that the credential is still the
account's current one.

- `User.authVersion` (`Number`, default `0`) is a monotonic per-user counter.
- Each credential carries the counter it was issued under as the **`av`** claim.
- Invalidation is a single atomic `$inc` on the user document. It needs no
  session store, no new collection and no new dependency, and it stays correct
  across multiple API instances because the only shared state is MongoDB, which
  the application already requires.
- Verification compares the presented `av` against the stored counter. A mismatch
  is a rejection.
- A credential that predates the `av` claim carries none and is treated as
  version `0` — the version it was issued under. Documents written before
  `authVersion` existed read back as `0` via `readAuthVersion`. **No backfill
  migration is required and no user is forced to sign in again on deploy.**

### 2.4.2 Where it lives

| Concern | Location |
|---|---|
| Issuance, verification, counter read/bump, header parsing | `server/src/utils/authToken.ts` (new): `signToken`, `verifyAuthToken`, `extractBearerToken`, `readAuthVersion`, `bumpAuthVersion` |
| Express middleware | `server/src/middleware/authMiddleware.ts` — `requireAuth` is now `async` and routes every credential through `verifyAuthToken` |
| A2A authentication | `server/src/a2a/userBuilder.ts` — bearer credentials now go through the same `verifyAuthToken` path |
| Counter storage | `server/src/models/User.ts` — `authVersion: { type: Number, default: 0 }` |
| Routes | `server/src/routes/auth.ts` — `POST /logout` added; `change-password` bumps and re-issues |
| Client | `client/src/context/AuthContext.tsx`, `client/src/components/layout/Header.tsx`, `client/src/pages/ProfilePage.tsx` |

Every code path that accepts a bearer token goes through `verifyAuthToken`. A
second, weaker verification path is exactly the bug the A2A regression test
(§2.4.5) exists to prevent.

### 2.4.3 Invalidation semantics, stated honestly

- **Invalidation is per-user, not per-token.** Signing out, changing a password
  or deleting an account ends *every* session for that account, including other
  devices. Per-device revocation would need a server-side record of every issued
  token — a session store — which this phase deliberately does not introduce.
- `POST /api/auth/logout` bumps the counter, so it signs the account out
  everywhere. It does **not** revoke only the credential that made the request.
- `POST /api/auth/change-password` bumps the counter and then re-issues a fresh
  credential to the caller, because that caller just proved knowledge of both the
  current and the new password. Every *other* session is invalidated.
- `DELETE /api/auth/account` needs no bump: removing the `User` document *is* the
  invalidation, because every credential now resolves against a live account.
  This also removes the "ghost owner" problem described in §2.1 — a token for a
  deleted user no longer authenticates and other routes can no longer write rows
  for a non-existent owner.
- A missing token, a bad signature, an expired token, a malformed identity, a
  missing account and a stale `av` are **all** reported identically
  (`401 Unauthorized`), so the response cannot be used to probe which check
  failed.
- A **database fault** is deliberately *not* reported as `401`. It returns `500`,
  so a transient outage is never mistaken by a client or an operator for "your
  session ended".
- A malformed identity claim (for example `id: "not-an-object-id"`) is refused
  before any database work, using `mongoose.isObjectIdOrHexString`. Without this
  guard the value reached `User.findById`, where Mongoose raised a `CastError`
  that surfaced as `500` — telling the caller "retry later" for a credential that
  can never become valid. It is now an ordinary `401`.

### 2.4.4 Client behaviour

- `logout()` clears local state **first and unconditionally**, then calls
  `POST /api/auth/logout` best-effort. Local sign-out never depends on the
  network call succeeding. If that call fails, the server may still honour the
  credential until it expires — stated as a known limit, not papered over.
- `changePassword()` adopts the replacement token from the response, so the device
  that changed the password stays signed in instead of being dropped at login.
- `deleteAccount()` clears local state only; there is no session left to
  invalidate server-side.
- `Header.handleLogout` awaits `logout()` so navigation does not race the server
  invalidation call.

### 2.4.5 What is still open

- The token is still in `localStorage` and therefore still readable by any script
  on the origin. §2.3.1 remains an open exposure. Invalidating a stolen token
  helps only after the legitimate owner signs out or changes a password; it does
  not stop the theft.
- TTL is still **7 days**. §5.2's proposed 15-minute access token, `iat`-based
  absolute session cap and sliding re-issue are cookie-model work and were not
  part of this phase.
- No cookies, no CSRF token, no Origin enforcement, no split rate limiter.
- §4.4 is still unanswered, so §5 and §6 remain a design rather than a plan of
  record.

> The two client gaps named above — no central `api/client.ts` and no shared
> `401` handler — were closed by Phase 18. See §2.5. The remaining open items in
> this list are unchanged.

### 2.4.6 Deviations from the Phase 16 design in §5.2

| Phase 16 design | Shipped in Phase 17 | Why |
|---|---|---|
| claim `ver` | claim **`av`** | Same design, different name; `av` is the actual field. Documentation must use the shipped name. |
| `User.tokenVersion` | **`User.authVersion`** | Same design, different name. |
| TTL 15 min + sliding re-issue + 8 h absolute cap | **unchanged 7-day TTL** | Those are tied to cookie transport and a session bootstrap that do not exist yet. Shortening the TTL without re-issue would log users out every 15 minutes. |
| logout "cookie-clear plus client state reset" | logout **bumps the counter** | With no cookie there is nothing to clear server-side; the counter is what makes logout real. The consequence — logout is account-wide — is stated in §2.4.3. |
| `server/src/a2a/userBuilder.ts` "unchanged behavior" | **changed to use `verifyAuthToken`** | Leaving signature-only verification on the A2A path would have left revocation bypassable, which would have made the whole mechanism cosmetic. |
| account deletion bumps `tokenVersion` | **no bump; user document removal is the invalidation** | There is no account left to bump. |

---

## 2.5 What Phase 18 implemented (verified)

Phase 18 is a **client refactor**. It changed no server endpoint, no token
format, and no auth semantics — it gave the client one place that knows how to
make an authenticated request and one place that decides a session is dead.

### 2.5.1 Two new modules

| Module | Responsibility | Deliberately *not* responsible for |
|---|---|---|
| `client/src/api/authTransport.ts` | The only module that touches `localStorage`; holds `hathap_token` / `hathap_user` and the session-invalidation listener registry | Any HTTP, any React |
| `client/src/api/client.ts` | API base URL, credential attachment, error normalization, 401 detection, `apiFetch` / `apiJson` / `apiText` / `readJson` / `toApiError` | Navigation, retries, caching, storage layout |

Because the storage keys appear in exactly one file, the eventual cookie
migration (§4.4, §5) becomes an edit to `authTransport.ts` plus the wiring in
`client.ts`, rather than a change across five modules.

### 2.5.2 The rules the request layer enforces

1. **One credential source.** A request reads the token from the transport.
   No caller builds an `Authorization` header.
2. **No navigation, no retry, ever.** On a dead session the layer reports
   invalidation and returns. Route guards react to state. This is what makes a
   redirect loop structurally impossible rather than merely unlikely.
3. **Invalidation requires a credential on the request.** A 401 is treated as a
   dead session only when the request actually carried a token. A failed login is
   a normal 401 and must not sign out anything; neither must a 401 from an
   endpoint called with `auth: false`.
4. **A 5xx is not a dead session.** Only HTTP 401 retires the session, so a
   server or database fault never logs the user out.
5. **Never resend.** The layer does not retry, including after invalidation —
   the same token would only be rejected again.
6. **JSON content type only where there is a JSON body.** A body-less POST (the
   Phase 17 logout endpoint, among others) carries no `Content-Type`. The server
   routes it targets do not read `req.body`, so this is verified safe rather than
   assumed.

### 2.5.3 Session state and sign-out

`AuthContext` mirrors the transport: storage is written synchronously alongside
React state, never from an effect, so a request issued immediately after login
already carries the new credential.

The stored session is read in the `useState` initializer, so it is resolved on
the **first render**. This is load-bearing: an implementation that reads storage
in a mount effect presents the app as signed out for one render, the guard
redirects to `/login`, and the arrival of the token then bounces the user to
`/dashboard` — so a page refresh on any protected route lands them somewhere
other than where they were. `AppRoutes.integration.test.tsx` guards this.

`logout()` clears local state first and unconditionally, then calls
`POST /api/auth/logout` best-effort with the **retired** token passed explicitly
(the stored one is already gone by then). Local sign-out never depends on the
network call.

### 2.5.4 What Phase 18 does not do

- It does **not** move the credential out of `localStorage`. §2.3.1 stays open.
- It does **not** validate the token on load — `ProtectedRoute` gates on
  credential *presence*. **Superseded by Phase 20 (§2.5.5):** the `/api/auth/me`
  bootstrap now runs, so a stale token is rejected on load rather than by the
  first API call. What Phase 18 established (one request path, one 401 handler)
  is what Phase 20 reuses; there is no second authentication path.
- It does **not** shorten the 7-day TTL.
- It does **not** add retries, caching, request cancellation, or a query-string
  credential. SSE keeps its `Authorization` header rather than moving the token
  into a URL, where it would land in logs.
- It does **not** implement cookies, CSRF, CORS credentials, or server sessions.

### 2.5.5 Phase 20: startup session validation

**Status: implemented and tested.** The `loading → authenticated | anonymous`
machine described in §5.4 now exists over the bearer transport:

- `AuthContext` starts in `loading` when a credential is stored, issues exactly
  one `GET /api/auth/me` through `api/client.ts`, and only then reports
  `authenticated`. `ProtectedRoute` / `LoggedInRoute` render a neutral pending
  state while `status === 'loading'` instead of redirecting, so a deep link is
  no longer bounced through `/login` and back.
- The request travels the Phase 18 path — `api/client.ts` attaches the
  `Authorization` header, and a `401` reaches the same centralized invalidation
  handler as any other credentialed `401`. Startup validation therefore inherits
  signature, expiry, account-existence and `authVersion` checks (§2.4) without a
  second implementation.
- Four outcomes, deliberately distinct: `valid`, `invalid` (the only one that
  signs the device out), `unavailable` (network failure or `5xx` — the credential
  is **kept**, because an outage is not proof of a dead credential), and `idle`.
- A credential issued by login/signup/password-change skips the bootstrap: the
  server just authenticated it, so a round trip would add latency and no
  information.
- A validation response that lands after the credential was already retired (a
  concurrent `401`) is discarded, so no orphaned `hathap_user` is written back
  into storage.

**Not claimed:** the credential is still in `localStorage`, the TTL is unchanged,
and cookies/CSRF are still unimplemented.

---

## 3. Options considered

| # | Option | New infrastructure | Reachable protection gain | Verdict |
|---|---|---|---|---|
| 1 | Keep bearer + `localStorage` | none | none | Rejected: leaves token theft and no-revocation in place |
| 2 | **Stateless JWT inside an `HttpOnly` cookie (+ revocable `tokenVersion`)** | none | XSS token-theft resistance, real logout, session invalidation on password change / account deletion, bounded cookie lifetime | **Recommended** |
| 3 | Opaque random token + server-side session rows in MongoDB | none (MongoDB is already required) | Everything in 2, plus per-session auditing, immediate revocation, "sign out everywhere" | Reasonable future step; only if per-session control becomes a product requirement |
| 4 | In-memory session store | none, but unsafe | — | **Rejected**: a second API instance (or a restart) silently logs everyone out; the app is already single-process for the worker and SSE bus, so a session store would *encourage* horizontal scaling that the rest of the system does not support |
| 5 | Short-lived access token + rotating refresh token | none | Reduces the stolen-token window, adds refresh surface | Defer: revisit after 2, which is a prerequisite anyway |

Option 2 is chosen because it preserves the existing stateless verification path
(so no new store, no new dependency, no multi-instance regression) while removing
the browser-readable credential and adding real revocation. The claim payload
gains `ver` (a per-user `tokenVersion`); `requireAuth` compares it against MongoDB
and 401s on mismatch. That costs one indexed lookup per authenticated request,
which is the same order of work the routes already do.

---

## 4. Deployment topology: what the repository actually supports

### 4.1 Hard evidence

| Statement | Evidence |
|---|---|
| Development is **same-origin by default**: Vite proxies `/api` to `http://localhost:4000` | `client/vite.config.ts:9-16` |
| `VITE_API_URL` can switch the client to a cross-origin API, and the code supports it (relative or absolute base) | `client/src/api/client.ts:22-28` |
| The server never serves the SPA. There is no static mount and no SPA fallback in the production app | `server/src/index.ts:38-104` (verified: no `express.static`, no `sendFile`) |
| Production CORS is deny-by-default; cross-origin production requires an explicit `CORS_ORIGINS` allow-list | `server/src/config/security.ts:87-95`, `server/.env.example:27-36` |
| Same-origin production works because browsers do not apply CORS to same-origin requests; the server never infers same-origin from `Host`, so a forged `Origin`/`Host` pair cannot widen the allow-list (Phase 21) | `server/src/middleware/cors.ts`, `server/src/tests/corsMiddleware.test.ts` |
| No TLS/proxy assumption is *configured* anywhere; `trust proxy` is never configured | verified: no `trust proxy` / `X-Forwarded` / `req.secure` in `server/src` |
| HTTPS is only an **assumption in prose**, never a configuration | `agent_context.md` "**HTTPS in Production**: Assumes production deployment uses HTTPS"; `DEPLOYMENT_CHECKLIST.md` → "Navigate to `https://your-domain.com`". No `Secure`-related setting or deploy artifact corroborates it |
| **No deployment artifacts exist in the repository.** No Dockerfile, compose file, nginx/Caddy config, Procfile, `vercel.json`, `netlify.toml`, or infrastructure-as-code | verified: `git ls-files` matches only `.github/workflows/ci.yml` |
| The only documented production guidance is a host *suggestion list*, and the suggested pairings are **different registrable domains** | `DEPLOYMENT_CHECKLIST.md` → "Step 1: Backend Deployment" / "Step 2: Frontend Deployment"; `agent_context.md` §3 "Deployment" |
| CI does not set `NODE_ENV`, so production defaults are never exercised anywhere | `.github/workflows/ci.yml:31-37` |
| **There is no deployment pipeline either.** The only workflow runs typecheck, tests and build; there is no deploy job, no environment, and no hosting target | verified: `.github/workflows/ci.yml:16-86` (jobs `server`, `client` — neither deploys) |
| The absence of production environment configuration is a **real absence, not an ignore artifact**: `.gitignore` excludes `.env`, `.env.local`, `.env.*.local` and `server/.env`, but *not* `client/.env.production`, and no such file is tracked | `.gitignore:6-9`; `git ls-files` shows `client/.env.development` as the only client env file |
| **A full-tree URL sweep finds no production origin.** The only deployment-related URLs in the entire repository are the placeholders `https://your-domain.com` and `https://your-domain.com/api`; every other `https?://` match is an LLM provider endpoint, a specification reference, or a documentation link | verified: URL sweep over all tracked files |
| The dev env file sets an **absolute cross-origin** API base, so cross-origin is the exercised path in development — but that is a local choice, not production evidence | `client/.env.development:1` |
| No `Access-Control-Allow-Credentials` is ever emitted: the CORS middleware passes only `{ origin }` and the client never sets `credentials`, so a cookie transport would not work today | `server/src/middleware/cors.ts`, `client/src/api/client.ts:137-142` |

### 4.2 Finding: production topology is undefined

**Phase 19 result: still unclassified.** The repository supports *two* mutually
exclusive production shapes and commits to neither:

- **S1 — same-origin**: SPA and API behind one origin (reverse proxy, or the
  server gains a static mount).
- **S2 — cross-origin**: SPA on a static host/CDN, API on a Node host, related
  only by `CORS_ORIGINS`.

The documented hosting suggestions point at S2 with *unrelated* domains
(`*.vercel.app` + `*.herokuapp.com` are different registrable domains, so they
are also cross-**site**). No proxy, origin, or domain is pinned anywhere.

Phase 19 re-ran the inventory exhaustively against every tracked file (not a
sample) specifically to try to close this. It **could not**, and the negative
result is now itself the evidence:

| Searched for | Result |
|---|---|
| Dockerfiles, compose, Kubernetes, Helm, Terraform/Pulumi/CDK | none tracked |
| Reverse proxies (nginx, Caddy, Apache, Traefik) | none tracked |
| PaaS/hosting descriptors (`Procfile`, `heroku.yml`, `vercel.json`, `netlify.toml`, `render.yaml`, `railway.json`, `fly.toml`, `app.yaml`, `serverless.yml`) | none tracked |
| Cloud storage/CDN config for `client/dist` | none tracked |
| GitHub Actions deploy workflows, release workflows, environments | none — `ci.yml` is the only workflow |
| Production env files | none tracked, and not gitignored (see §4.1) |
| Hostnames, domains, custom origins, `*.example.com`-style production hosts | only the `your-domain.com` placeholders |
| Ingress rules, load-balancer config, `trust proxy` / `X-Forwarded-*` handling | none |

**Conclusion.** The deployment topology is not "unknown but inferable" — it is
**absent from the repository**, and it is information that only an operator
holds. There is no configuration to infer it from, and no amount of further
static analysis will produce it. That is why §4.4 is a decision record rather
than a recommendation, and why the cookie migration stays blocked.

### 4.3 Why this blocks a cookie implementation

Cookie transport is a function of topology, not a drop-in replacement.

**First, the distinction that actually governs cookie behaviour.** `SameSite` is
evaluated on the **site**, not the **origin**. A site is *scheme + registrable
domain*; an origin additionally includes the port. So `app.example.com` and
`api.example.com` are **cross-origin but same-site**, and `localhost:5173` →
`localhost:4000` is likewise cross-origin but same-site. A request is cross-site
only when the registrable domain or the scheme differs. Consequence: **cookies are
always sent on same-site requests regardless of the `SameSite` value**, so
`SameSite=Lax` (and `Strict`) survives subdomain and port changes. It is *not*
true that `Lax`/`Strict` are "not sent on cross-origin XHR/fetch" — they are not
sent on cross-**site** subrequests. (Verified against the MDN `SameSite`
reference, the W3C 2020 Chrome SameSite talk, and a CISA advisory that states the
rule directly: a `Sec-Fetch-Site: same-site` value means "the same registrable
domain and scheme but a different origin", and "cookies are always sent on
same-site requests regardless of SameSite".)

Applying that rule:

| Topology | Cookie that actually works | Why the others fail |
|---|---|---|
| S1 same-origin | `__Host-hathap_session; Secure; HttpOnly; SameSite=Strict; Path=/` | — best case: `__Host-` blocks subdomain cookie injection and `Strict` blocks every cross-site request class |
| S2 cross-origin, **same site** (e.g. `app.example.com` + `api.example.com`) | `Secure; HttpOnly; SameSite=Lax; Path=/` (optionally `Domain=example.com`; omit `Domain` and the cookie stays host-only on the API) | `Strict` is *also* usable here, but it breaks sign-in from an external link. `SameSite=None` would work and is **not** wanted — it discards all `SameSite` protection for no benefit |
| S2 cross-origin, **cross site** (the shape the documented host list implies: `*.vercel.app` + `*.herokuapp.com`) | `Secure; HttpOnly; SameSite=None; Path=/` — the only value sent, and it is forced | `Lax`/`Strict` are not sent at all → silent 401s. `None` requires `Secure`, so HTTPS is mandatory, and it provides **zero** CSRF protection, so the token and Origin checks in §6.3 become the *only* line of defence |

So the blocking question is not "can we write a cookie" — it is narrower and
sharper: **is the API on the same registrable domain as the SPA, and is the public
origin HTTPS?** The first decides whether `SameSite` contributes any CSRF
protection at all. The second decides whether a `Secure` cookie is deliverable
outside `localhost`.

The repository genuinely does not answer either. The hosting guidance is a
*generic suggestion list* — frontend on "Vercel, Netlify, or any static
hosting", backend on "Heroku, Railway, AWS, DigitalOcean" (`agent_context.md`
§"Deployment", `DEPLOYMENT_CHECKLIST.md` Step 1/Step 2) — with no origin, no
domain, and no proxy pinned anywhere. Default PaaS domains make it cross-**site**;
custom domains on both sides make it same-site. Those two outcomes need
materially different security designs (§6.1), and shipping the wrong one either
breaks production sign-in or silently removes the primary CSRF defence.

There is weak evidence for HTTPS: `agent_context.md` states "HTTPS in
Production: Assumes production deployment uses HTTPS", and the checklist's
verification step says to navigate to `https://your-domain.com`. That is an
assumption in prose, not a configuration — there is no `trust proxy`, no
`Secure`-related setting, and no deployment artifact to corroborate it.

Development does not constrain the choice either way, and should not be
over-weighted: the default dev topology is same-origin through the Vite proxy
(`client/vite.config.ts:9-16`), and a cross-origin dev setup
(`localhost:5173` → `localhost:4000`) is still *same-site*, so `Lax` works there
too. The one real dev trap is that a cross-site dev setup on plain HTTP cannot
carry a `SameSite=None` cookie at all — which is another reason not to pick the
cross-site design speculatively.

This is the concrete reason implementation is deferred: an unrecorded, single-word
operator decision changes the security posture, and guessing it wrong is worse
than not shipping.

### 4.4 Deployment decision record (must be completed before implementation)

> **Phase 19 status: OPEN — no field below can be answered from the repository.**
> Phase 19 inventoried every tracked file to attempt to close this record (§4.2)
> and found no deployment artifact, workflow, production environment file, or
> production hostname of any kind. These values are therefore genuinely
> operator-held, and none of them has been guessed or defaulted. Filling in this
> table is the only thing that unblocks the cookie migration.

**How to read this table.** Every row is `UNKNOWN — OPERATOR DECISION REQUIRED`
because no evidence exists in-repo. Where the *shape* of the answer already
constrains the follow-on work, the consequence column says what your answer
selects — that is the actionable part, not a default recommendation. Rows marked
*derived* are not independent choices: they are consequences of the rows above
them, and become determinable automatically once the rows above are answered.

| # | Question | Answer (operator) | What your answer selects |
|---|---|---|---|
| 1 | Production topology: **S1 same-origin** or **S2 cross-origin**? | `UNKNOWN — OPERATOR DECISION REQUIRED` | Selects the whole design. S1 unlocks `SameSite=Strict` + `__Host-` and makes CORS irrelevant to the browser. S2 forces a CORS allow-list and a deliberate `SameSite` choice. |
| 2 | If S2: is the API on the **same registrable domain** as the SPA? (e.g. `app.example.com` + `api.example.com` = same site) | `UNKNOWN — OPERATOR DECISION REQUIRED` | Same-site → `SameSite=Lax` works and keeps most CSRF protection. Cross-site (unrelated domains, e.g. `*.vercel.app` + `*.herokuapp.com`) → `SameSite=None; Secure` is **forced**, `SameSite` protection is gone entirely, and the CSRF token (§6.3) becomes the *only* defence. |
| 3 | Is the public origin **HTTPS** on both SPA and API? | `UNKNOWN — OPERATOR DECISION REQUIRED` | Required for any `Secure` cookie outside `localhost`, and mandatory for `SameSite=None` (row 2). A plaintext public origin makes a cookie transport non-viable without TLS first. |
| 4 | Exact **frontend production origin** (scheme + host + port) | `UNKNOWN — OPERATOR DECISION REQUIRED` | Must be the literal `CORS_ORIGINS` entry in S2 (rows 5–6), and is what a cross-site CSRF `Origin` check compares against. |
| 5 | Exact **API production origin** (scheme + host + port) | `UNKNOWN — OPERATOR DECISION REQUIRED` | The value of `VITE_API_URL` at client build time; decides whether the client issues relative `/api` paths or absolute cross-origin URLs. |
| 6 | Exact value(s) for the server's **`CORS_ORIGINS`** allow-list | `UNKNOWN — OPERATOR DECISION REQUIRED` — *derived from rows 4–5* | Empty/unset in production means every cross-origin browser request is rejected today (`config/security.ts:87-95`). Must be exact origins, never `*`. |
| 7 | Does a **reverse proxy** sit in front of Express? If so, how many hops? | `UNKNOWN — OPERATOR DECISION REQUIRED` | `trust proxy` is never configured, so `req.ip`/`req.protocol` are wrong behind a proxy (affects the auth rate limiter and any future `Secure`/`req.secure` logic). CORS no longer depends on `Host`, so proxy `Host` handling is not a CORS concern (Phase 21 removed the `Origin === http(s)://${Host}` convenience). |
| 8 | Where does **TLS terminate**, and does the edge set `X-Forwarded-Proto`? | `UNKNOWN — OPERATOR DECISION REQUIRED` | Determines whether Express can learn the public scheme at all; with no `trust proxy` it cannot. |
| 9 | Should **Express serve `client/dist`** (making S1 self-contained), or does a proxy/CDN serve it? | `UNKNOWN — OPERATOR DECISION REQUIRED` — *required for S1* | Server currently mounts **no static handler and no SPA fallback**, so S1 is not achievable today without this change. |
| 10 | Does the browser reach the API **directly**, or only through a proxy? | `UNKNOWN — OPERATOR DECISION REQUIRED` | Decides whether the browser ever sees the API origin (rows 4–6) and therefore whether CORS is involved at all. |
| 11 | **API replica count** — single process or more than one? | `UNKNOWN — OPERATOR DECISION REQUIRED` | More than one forbids any in-memory session store and requires the **process-local SSE event bus** (`server/src/decision/eventBus.ts`) to be made cross-instance first. Also multiplies `MONGODB_URI`/worker concerns. |
| 12 | Any other cookie-affecting constraint — subdomain policy, third-party cookie blocking, embedded/webview use? | `UNKNOWN — OPERATOR DECISION REQUIRED` | Modern third-party-cookie blocking can neuter `SameSite=None` outright even in S2 cross-site, which would force a same-site topology or a different transport. |

**Minimal unblocking set.** Rows **1, 2, 3** are the blocking minimum: they
determine whether cookie transport is even the right target. Rows 4–6 follow
mechanically from them. Row 9 is required to *implement* S1. Rows 7, 8, 11 are
required to implement correctly but do not change the cookie design choice.

**Recommended default if the operator has no preference: S1 (same-origin).** It is
the only shape in which `SameSite=Strict` + a `__Host-` cookie is available, CORS
becomes irrelevant for the browser, and CSRF exposure is minimal by construction.
It also matches the app's current single-process assumptions. **This is a
recommendation only — it has not been applied**, and rows 1–12 remain unanswered.

---

## 5. Target session model (conditional on §4.4)

**Status: not implemented.** §5 describes the cookie-based target that Phase 16
designed and Phase 17 did **not** build. It remains conditional on §4.4. The
revocable-counter mechanism Phase 17 shipped is described in §2.4; it works over
the current bearer transport and is a prerequisite for, not a substitute for,
this section.

### 5.1 Transport

The `SameSite` value is a direct function of the §4.4 answer, so it must be
selected by configuration rather than hard-coded. The cookie is always host-only
(never set `Domain`), always `HttpOnly`, and always `Secure` where the origin is
HTTPS:

| §4.4 answer | Cookie |
|---|---|
| S1 same-origin | `__Host-hathap_session; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=<ttl>` |
| S2, same site | `hathap_session; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=<ttl>` (`Strict` is also valid; prefer `Lax` if sign-in must survive an external link) |
| S2, cross site | `hathap_session; Secure; HttpOnly; SameSite=None; Path=/; Max-Age=<ttl>` — forced, and it removes all `SameSite` CSRF protection, so §6.3 becomes the only defence |

- `__Host-` is only valid in S1: the prefix requires `Secure` + `Path=/` + no
  `Domain`, and browsers only honour it from a secure origin. In S2, use the
  unprefixed name.
- `Secure` is set unconditionally in production and may also be set in local
  development — browsers treat `http://localhost` as a secure context and accept
  `Secure` cookies there, which keeps a single code path across environments.
  It must **not** be set for a non-localhost plaintext origin, or the browser
  will silently drop the cookie.
- If the operator answers "cross site" and declines HTTPS, the cookie migration
  is not viable at all and the bearer flow must be retained for that deployment.
  That trade-off must be written down, not assumed.

### 5.2 Payload and lifetime

> The counter itself **is** implemented, under the shipped names `av` /
> `authVersion` rather than `ver` / `tokenVersion` (§2.4.6). The TTL, `iat` cap and
> sliding re-issue below are **not** implemented and remain cookie-model work.

- Keep the HS256 JWT; payload becomes `{ id, ver, iat, exp }` where `ver` is
  `User.tokenVersion` (default `0`).
- Access token TTL: **15 minutes**, down from today's 7 days. This is the single
  largest reduction in exposure window.
- No separate refresh credential. The session cookie is re-issued (same cookie,
  fresh `exp`) on successful authenticated requests, with an absolute session cap
  of 8 hours enforced server-side from `iat`. The browser never reads it.
- `requireAuth` verifies signature **and** `alg: HS256` **and** loads
  `User.tokenVersion`. Mismatch, missing user, or expiry ⇒ `401`.
- `tokenVersion` increments on password change and on account deletion, which
  invalidates every outstanding token for that user in one write.
- `User.tokenVersion` is a single new numeric field on the existing `User`
  document (default `0`). No new collection, no new dependency, no new service.

### 5.3 Logout semantics

- `POST /api/auth/logout` clears the cookie (`Max-Age=0`, same attributes) and
  returns `204`. It bumps `tokenVersion` **only** for "sign out everywhere"; the
  default logout is cookie-clear plus client state reset.
- Client `logout()` becomes: call the endpoint (best effort), clear state, navigate
  to `/login`. Logout must not depend on the request succeeding.
- `DELETE /api/auth/account` clears the cookie before responding.
- A2A clients are unaffected: `server/src/a2a/userBuilder.ts` keeps its
  `Authorization: Bearer` and `X-A2A-API-Key` paths. Browser cookies must not be
  accepted as A2A authentication.

### 5.4 Client state model

Replace "token present?" with a three-state machine:

```
loading  → GET /api/auth/me (once per page load)
authenticated (user) | anonymous
```

**Shipped in Phase 20 (§2.5.5)** for the non-cookie half: the three states, the
`/me` bootstrap, and guards that branch on `status` and render a pending state
while `loading`. The cookie-specific rows below (`credentials: 'include'`, the
CSRF header) remain pending on §4.4.

- `ProtectedRoute`/`LoggedInRoute` branch on `status`, not on a token string.
  While `loading`, render a neutral loading state instead of redirecting.
- A single `client/src/api/client.ts` owns the base URL, `credentials: 'include'`,
  the CSRF header, and **one** `401` handler that atomically clears auth state and
  redirects to `/login`. All 70 call sites route through it. This module is a hard
  prerequisite: adding `credentials` and a CSRF header to 70 hand-rolled fetches is
  not a reviewable change.
- The SSE hook keeps fetch-based streaming and simply adds
  `credentials: 'include'`; no `EventSource` rewrite is needed.

### 5.5 Rate limiting

The current limiter is mounted on the entire `/api/auth` router
(`server/src/index.ts:77`). Since Phase 20 the `/me` bootstrap **does** run on
every page load, so it now shares a 30-request/15-minute budget with login.
That is still one request per full page load (not per navigation), so the shared
budget is tolerable today; split it when the traffic proves otherwise:

- `loginLimiter` / `signupLimiter` — credential endpoints, 30 / 15 min per IP.
- `sessionLimiter` — `/me`, `/logout`, refresh, 120 / 15 min per IP+user.

---

## 6. CSRF, CORS, and the rest of the threat model

### 6.1 SameSite alone is not the control

`SameSite=Strict`/`Lax` is a real mitigation, but it must not be the only layer,
and its strength depends on the §4.4 topology decision:

- Under **cross-site** S2 the cookie carries no site restriction at all
  (`SameSite=None` is forced), so SameSite provides **zero** protection and the
  §6.3 layers are load-bearing.
- Under **same-site** S2, or under S1, SameSite does block cross-site requests —
  but not same-site ones. A compromised or user-controlled **sibling subdomain**
  (`evil.example.com`) is same-site, so it can issue credentialed requests of any
  method against the API and the browser will attach the cookie. S1 with a
  `__Host-` cookie stops that sibling from *overwriting* the cookie, but not from
  *using* it. Only a CSRF token (which a sibling cannot read) closes this.
- Legacy/embedded clients and some non-browser HTTP stacks do not implement
  SameSite at all, and a `SameSite=None` decision would be relied upon by exactly
  the clients least likely to enforce anything.

Therefore: **defense in depth, two independent layers.**

### 6.2 Layer 1 — cookie attributes

As in §5.1 (`__Host-`, `Secure`, `HttpOnly`, `SameSite`, `Path=/`). Host-only
cookies mean a subdomain cannot overwrite the session cookie.

### 6.3 Layer 2 — synchronizer token + request-origin validation

- **Double-submit CSRF token.** A readable, non-`HttpOnly` cookie
  `hathap_csrf` (random 32 bytes, `SameSite` matched to the session cookie,
  `Secure`, `Path=/`) mirrored into an `X-CSRF-Token` request header by the
  central client. Server compares the header to the cookie with a
  constant-time comparison and rejects a mismatch. A cross-site attacker can
  force the browser to *send* the cookie but cannot *read* it to populate the
  header, and cannot set the header on a simple request.
- **Origin/Referer check.** For every unsafe method (`POST`, `PUT`, `PATCH`,
  `DELETE`) on `/api/*`, require `Origin` (or `Referer` when `Origin` is absent)
  to match the configured allow-list. Reject with `403`. Requests with neither
  header are allowed only on documented non-browser paths (A2A, health) that
  never rely on ambient cookie authority.
- `Sec-Fetch-Site`, when present, is logged and treated as a second signal; it is
  defense-in-depth only, never the sole check.
- Safe methods (`GET`, `HEAD`) are exempt from the token check. They must remain
  side-effect free; `/api/auth/export-data` is currently a `POST` and stays a
  `POST`, so it is protected like every other mutation.
- The `/api/auth/*` limiter must not treat a missing CSRF token as a rate-limited
  failure, and CSRF rejections must be distinguishable (403) from auth failures (401)
  so the client can tell "session expired" from "request blocked".

### 6.4 CORS requirements (if cookies are used)

- `credentials: true` on the `cors` options, so `Access-Control-Allow-Credentials: true`
  is emitted. Today it is not (`server/src/index.ts:50`).
- The allow-list echo must be the **exact** origin string, never `*`. A wildcard
  with credentials is invalid per spec and would be rejected by browsers; do not
  "fix" a credential problem by widening the allow-list.
- `Vary: Origin` must be set, because the response differs per origin.
- Preflight must allow the headers the client sends (`Content-Type`,
  `X-CSRF-Token`, `Last-Event-ID`, `Accept`) and the SSE request must also receive
  the credential CORS headers. The current allow-list origin-function form
  (`server/src/middleware/cors.ts`) validates origins but emits no credentials;
  a cookie transport must add `credentials: true` and the required request headers.
- The existing production deny-by-default policy (`config/security.ts:87-95`) stays
  exactly as it is. Development keeps `http://localhost:5173` /
  `http://127.0.0.1:5173`. CORS must not be broadened to make a cookie migration
  "work" in an undeclared topology.
- The server does **not** infer same-origin from `Host`. Phase 21 removed the
  old `Origin === http(s)://${Host}` convenience because a caller could forge both
  headers together and widen the allow-list. Same-origin requests need no CORS
  handling at all: browsers do not apply CORS to them. If a future proxy build
  wants a scheme-aware check, use `req.protocol`/`req.hostname` after configuring
  `trust proxy`, never the raw `Host` header.

### 6.5 Non-goals

This design does not address (tracked separately, out of scope here): SSRF via
user-supplied model `baseUrl`, mass-assignment on `PUT /api/decisions/:id` and
`PUT /api/models/:id`, missing parent-ownership checks on courtroom
messages/verdict, A2A task authorization, and process-local SSE fan-out on
multi-replica deployments.

---

## 7. Exact code areas that change

**Status: mostly not implemented.** §7 is the cookie-phase change list. Phase 17
touched only the three rows marked below; everything else here is still pending.
Rows marked *shipped (Phase 17)* describe work that is done, and are listed for
traceability, not as a plan.

### 7.1 Server

| File | Change | Status |
|---|---|---|
| `server/src/config/cookies.ts` **(new)** | Single source of cookie names/attributes/TTL, S1 vs S2 profile, dev `Secure` handling. No `cookie-parser` dependency: parse `req.headers.cookie` for the single name needed. | pending |
| `server/src/config/security.ts` | Reuse `isAllowedCorsOrigin`; add a request-origin helper for the CSRF check; add `getTrustProxyHops()`. Keep the JWT rules unchanged. | pending |
| `server/src/models/User.ts` | Add `tokenVersion: Number, default 0`. | **shipped (Phase 17)** as `authVersion` |
| `server/src/middleware/authMiddleware.ts` | Read the session cookie, fall back to `Authorization: Bearer` (A2A/CLI/tests). Verify with `algorithms: ['HS256']`; load the user; compare `ver`; 401 on mismatch. Require an explicit `Bearer ` prefix for the header path. | **partly shipped (Phase 17)**: algorithm pinning, user load, version comparison and the explicit `Bearer ` prefix all landed. Cookie read not implemented. |
| `server/src/middleware/csrf.ts` **(new)** | Double-submit + Origin/Referer enforcement for unsafe methods on `/api`. | pending |
| `server/src/routes/auth.ts` | Set the session cookie on signup/login; add `POST /logout`; bump `tokenVersion` on change-password and account deletion; clear the cookie on account deletion. | **partly shipped (Phase 17)**: `POST /logout` and the change-password bump landed. Cookies not implemented; account deletion invalidates by removing the user document instead of a bump. |
| `server/src/index.ts` | Origin-function CORS with `credentials: true` + `Vary: Origin`; mount `csrfProtection`; `app.set('trust proxy', <configured hops>)`; split the `/api/auth` limiter; (S1 only) static mount for `client/dist` + SPA fallback that never shadows `/api`. | pending |
| `server/src/a2a/userBuilder.ts` | Unchanged behavior: header + API key only. Explicitly do not accept cookies here. | **superseded (Phase 17)**: bearer credentials now go through `verifyAuthToken` so invalidation cannot be bypassed. Still no cookie acceptance. |
| `server/src/utils/authToken.ts` **(new)** | Central issuance/verification/counter helper shared by `requireAuth` and A2A. | **shipped (Phase 17)** |
| `server/.env.example` | `TRUST_PROXY_HOPS`, `SESSION_TTL_MINUTES`, `CSRF_COOKIE_NAME`, and S2 `CORS_ORIGINS` guidance. | **partly done (Phase 19)**: `NODE_ENV` (which gates the production JWT rules) and the already-read-but-undocumented `APP_URL` are now documented. The three cookie-phase variables stay pending on §4.4 — their values *are* the decisions. |
| `server/package.json` | Add the new test files to the `test` script. | **shipped (Phase 17)** |

### 7.2 Client

> Partially pre-built by Phase 18: `client.ts` exists and owns base URL,
> credential attachment and the single 401 → sign-out path, `AppContext` /
> `EvaluationContext` / `CourtroomDetailPage` / `useDecisionEventStream` already
> route through it, and `AuthContext` already delegates storage to
> `authTransport.ts`. The cookie-specific parts below — `credentials: 'include'`,
> `X-CSRF-Token`, `/me` bootstrap, dropping the bearer header — remain pending
> on §4.4.

| File | Change |
|---|---|
| `client/src/api/client.ts` **(new)** | Base URL resolution, `credentials: 'include'`, `X-CSRF-Token` injection, single `401` → session-clear + redirect, and a small typed `apiFetch`. |
| `client/src/context/AuthContext.tsx` | Drop `hathap_token`/`hathap_user` and all `localStorage` token handling; add `status: loading/authenticated/anonymous`; `/me` bootstrap; `logout()` calls the endpoint. |
| `client/src/context/AppContext.tsx` | Route all 39 calls through the client; stop swallowing 401 into `[]`. |
| `client/src/context/EvaluationContext.tsx` | Route all 24 calls through the client. |
| `client/src/pages/CourtroomDetailPage.tsx` | Route the 3 calls through the client. |
| `client/src/hooks/useDecisionEventStream.ts` | `credentials: 'include'`; drop the header/localStorage read. |
| `client/src/App.tsx` | Gate routes on `status`; render a loading state; redirect on `anonymous`. |
| `client/src/pages/LoginPage.tsx`, `SignupPage.tsx`, `ProfilePage.tsx` | Consume the new `status`/error surface; logout becomes async. |
| Tests (6 files listed in §2.2) | Rewrite the storage assertions into cookie/status/401 assertions. |

---

## 8. Test plan for the implementation phase

**Status: cookie-phase plan, not implemented.** The tests Phase 17 actually
added for the invalidation mechanism are listed in §10.2 instead.

Server (node:test, existing `src/tests/` harness, no new runner):

- login success sets the cookie with the exact documented attributes; response
  body carries `user` and **no** token.
- invalid login ⇒ 401/400 and no cookie.
- signup success + duplicate signup (409/400) and no cookie on failure.
- protected route with a valid cookie ⇒ 200; without ⇒ 401; with an expired,
  tampered, or `ver`-mismatched token ⇒ 401.
- logout clears the cookie; a replayed cookie after logout ⇒ 401 when the
  `tokenVersion` bump is requested.
- password change bumps `tokenVersion` ⇒ the pre-change cookie 401s.
- account deletion bumps `tokenVersion` and clears the cookie.
- export-data still returns only the caller's data with cookie auth.
- CORS: allowed origin gets `Access-Control-Allow-Origin: <exact>` +
  `Access-Control-Allow-Credentials: true` + `Vary: Origin`; a rejected origin
  gets none; a preflight for `X-CSRF-Token` is answered.
- CSRF: unsafe method with cookie and no/mismatched token ⇒ 403; with the correct
  token ⇒ passes; with a hostile `Origin` ⇒ 403; safe method without a token ⇒ passes.
- SSE stream authenticates by cookie and still enforces ownership before opening.

Client (Vitest + Testing Library):

- login success/failure, signup success/failure surface the server message.
- auth restoration via `/me` (authenticated, anonymous, network failure).
- logout calls the endpoint and clears state.
- protected route redirects on `anonymous`; shows a loading state while `loading`.
- a `401` from any call clears the session exactly once and redirects.
- `X-CSRF-Token` is attached to unsafe methods and not to `GET`.

Limits of the current harness (state these honestly rather than faking coverage):
jsdom does not implement cookie storage or SameSite enforcement, and node:test
does not run a browser's CORS preflight. Cookie attribute *emission*,
CSRF logic, and CORS headers are unit/integration testable; **real browser
SameSite behavior and a cross-site CSRF attempt are not**. They require either a
small Playwright matrix (dev same-origin, S1 prod-like, S2 prod-like) or an
explicit manual verification checklist recorded in the migration PR.

---

## 9. Rollout, rollback, acceptance criteria

Rollout: ship cookie auth behind a single flag/env switch that keeps the header
path alive, run both paths in CI, flip the client, then remove the header path
and `localStorage` handling in the same phase — no half-migrated state may ship.
Rollback: revert the client bundle and server build; `JWT_SECRET` rotation
invalidates all tokens either way.

Acceptance criteria for the **cookie implementation phase** (all must hold):

- [ ] §4.4 decision record completed and committed.
- [ ] Session cookie attributes match §5.1 exactly, asserted in a server test.
- [ ] No `localStorage` token read/write remains anywhere in `client/src`; a
      repo-wide search for `hathap_token` / `hathap_user` returns nothing.
- [ ] Server tests: every case in §8 server list passes.
- [ ] Client tests: every case in §8 client list passes; suite ≥ 60 tests stays green.
- [ ] CSRF verified for both layers, with a real-browser check recorded.
- [ ] CORS allow-list unchanged in production; `credentials` only where cookies are used.
- [ ] README, `.env.example`, and the deployment checklist describe the cookie
      model accurately; no stale `localStorage` claims remain.
- [ ] Full gates green: server `tsc --noEmit` / `npm test` / `npm run build`;
      client `npm run lint` / `npm test` / `tsc --noEmit` /
      `npm run typecheck:config` / `npm run build`.

Acceptance criteria **satisfied by Phase 17** (invalidation only, no cookies):

- [x] `POST /api/auth/logout` invalidates the session it was called with.
- [x] Password change and account deletion invalidate all outstanding tokens.
- [x] `npm audit` unchanged (server 0; client 12 documented) or updated in
      `docs/SECURITY_AUDIT_REPORT.md` with justification.
- [x] A regression test proves A2A honours invalidation rather than only the
      signature (§2.4.2, §10.2).
- [x] Full gates green, as recorded in §10.2.

Acceptance criteria **satisfied by Phase 18** (client transport only, no cookies):

- [x] No direct `fetch` remains in `client/src` outside `api/client.ts`.
- [x] `hathap_token` / `hathap_user` appear only in `api/authTransport.ts`.
- [x] A 401 on a credentialed request signs the device out through one path;
      a 401 without a credential, and a 5xx, do not (§2.5.2).
- [x] No retry and no navigation in the request layer, so no redirect loop.
- [x] Full gates green, as recorded in §10.2.

Still open, and explicitly **not** claimed by Phase 17: the cookie transport,
CSRF enforcement, the split rate limiter, and the shortened token TTL.

Still open, and explicitly **not** claimed by Phase 18: the cookie transport and
CSRF (as above), plus a `/api/auth/me` bootstrap that validates the token on
load (§2.5.4). The `status` state machine and central API client are no longer
in this list — they shipped in Phase 18.

**Update (Phase 20):** the `/api/auth/me` bootstrap is no longer open either —
it shipped in Phase 20 (§2.5.5) and is covered by `AuthContext.test.tsx` and
`AppRoutes.integration.test.tsx`. The `loading` state now exists in the shipped
code, not only in the §5.4 target description. Cookies and CSRF remain open and
unchanged.

## 10. Evidence appendix

Baseline inspected at `3c4cf44`, working tree clean, branch `main`.
Commands used: `git status`, `git log --oneline -10`, `git branch -vv`,
`git ls-files` (deployment-artifact search), repository-wide `grep` for
`localStorage|Authorization|Bearer|cookie|credentials|trust proxy` across
`client/src` and `server/src`, and direct reads of every file cited above.

Phase 16 re-ran the full gates with no code changes: server `npx tsc --noEmit`,
`npm test` (272/272), `npm run build`; client `npm run lint`, `npx tsc --noEmit`,
`npm test` (60/60), `npm run typecheck:config`, `npm run build`; `npm audit` in
both workspaces (server 0, client 12 — unchanged, matching
`docs/SECURITY_AUDIT_REPORT.md`).

Line references in §2 and §4 are against the Phase 16 baseline commit
`3c4cf44`. Files modified in this phase (`README.md`, `DEPLOYMENT_CHECKLIST.md`,
`agent_context.md`, `todos.md`) are cited by section name, not line number, so
they stay correct after this commit.

### 10.1 Correction applied to this document

A review pass on the Phase 16 commit found that the first draft of §4.3, §5.1 and
§6.1 conflated **site** with **origin**. It claimed that `SameSite=Lax`/`Strict`
cookies are "not sent on cross-origin XHR/fetch", and recommended
`SameSite=None; Secure` for a same-site cross-origin deployment. Both are wrong:
`SameSite` is evaluated on the site (scheme + registrable domain), cookies are
sent on same-site requests regardless of the attribute value, and forcing
`SameSite=None` would have **removed** the primary CSRF defence in a deployment
that did not need it removed.

The corrected sections were verified against the MDN `Set-Cookie`/`SameSite`
reference, the W3C 2020 Chrome SameSite presentation, and a CISA advisory that
states the rule explicitly ("`Sec-Fetch-Site: same-site` … means the same
registrable domain and scheme but a different origin"; "cookies are always sent on
same-site requests regardless of SameSite"). The same correction was applied to
`DEPLOYMENT_CHECKLIST.md`.

**The correction narrows the blocking question; it does not remove it.** Once the
`SameSite` error is removed, the reasons to defer are exactly two, both still
unanswerable from the repository:

1. **Same-site or cross-site?** This decides whether `SameSite` contributes any
   CSRF protection at all. Default PaaS domains (`*.vercel.app` + `*.herokuapp.com`)
   imply cross-site; custom domains on both sides imply same-site. The two need
   materially different designs.
2. **HTTPS?** `Secure` is required in every case and `SameSite=None` is
   impossible without it. The repository asserts HTTPS in prose but never
   configures or deploys it.

Both are one-line operator answers (§4.4). Neither can be inferred from the code
without guessing, and guessing wrong means either a production sign-in outage or a
silently weakened CSRF posture. The §4.4 decision record is therefore retained as
the gate for the implementation phase.

### 10.2 Phase 17 implementation evidence

Phase 17 implemented §2.4 and left the cookie design in §4–§7 unimplemented.

**Gates, all re-run against the Phase 17 tree:**

| Gate | Command | Result |
|---|---|---|
| Server tests | `npm test` | **341 / 341 passed**, 0 failed, 0 cancelled |
| Server typecheck | `npx tsc --noEmit` | clean |
| Server build | `npm run build` | clean |
| Server audit | `npm audit --omit=dev` | **0 vulnerabilities** |
| Client tests | `npm test` | **66 / 66 passed** (13 files) |
| Client lint | `npm run lint` | clean (`--max-warnings 0`) |
| Client typecheck | `npx tsc --noEmit` | clean |
| Client config typecheck | `npm run typecheck:config` | clean |
| Client build | `npm run build` | clean |
| Client audit | `npm audit` | **12 findings** (5 moderate, 7 high) — the documented Phase 12.6 baseline in `docs/SECURITY_AUDIT_REPORT.md`, unchanged; all resolve only via a react-router semver-major |

**Test count:** the Phase 17 baseline was 295 server tests. Phase 17 added 46
(34 unit tests for `utils/authToken.ts`, 11 A2A invalidation tests, 1 endpoint
test for the malformed-identity rejection), giving 341.

**Coverage added for the claims in §2.4:**

| Claim | Test |
|---|---|
| Counter issuance, verification, expiry, signature, `alg:none`, legacy no-`av` credentials | `server/src/tests/authToken.test.ts` |
| Malformed / non-ObjectId identity ⇒ `401`, never a `CastError` | `server/src/tests/authToken.test.ts` and `authEndpoints.test.ts` (`GET /api/auth/me`) |
| Logout, password change and account deletion invalidate credentials, across sessions and routes | `server/src/tests/authEndpoints.test.ts` |
| A2A honours invalidation, using the real `bumpAuthVersion` write (nothing mocked) | `server/src/tests/a2aAuth.test.ts` |
| Client logout calls the endpoint, clears locally even when it fails, adopts the replacement password-change token | `client/src/context/AuthContext.test.tsx` |

**A note on how the malformed-identity bug was confirmed**, so the claim is not
taken on trust: the `mongoose.isObjectIdOrHexString` guard in
`verifyAuthToken` was temporarily disabled and the suite re-run. It failed with
`CastError: Cast to ObjectId failed for value "not-an-object-id" (type string) at
path "_id" for model "User"`, confirming both the bug and that the regression
test detects it. The guard was then restored.

### 10.3 Phase 18 implementation evidence

Baseline `f1ffb0a`, working tree clean, branch `main`. Phase 18 changed **no
server file**; the server gates were re-run to confirm that.

**Gates, all re-run against the Phase 18 tree:**

| Gate | Command | Result |
|---|---|---|
| Server tests | `npm test` | **341 / 341 passed**, 0 failed, 0 cancelled |
| Server typecheck | `npx tsc --noEmit` | clean |
| Server build | `npm run build` | clean |
| Client tests | `npm test` | **98 / 98 passed** (14 files) |
| Client lint | `npm run lint` | clean (`--max-warnings 0`) |
| Client typecheck | `npm run build` (`tsc` stage) | clean |
| Client config typecheck | `npm run typecheck:config` | clean |
| Client build | `npm run build` | clean |
| Client audit | `npm audit` | **12 findings** (5 moderate, 7 high) — the documented Phase 12.6 baseline in `docs/SECURITY_AUDIT_REPORT.md`, unchanged |

**Test count:** the Phase 17 baseline was 66 client tests. Phase 18 added 32
(23 in the new `client/src/api/client.test.ts`, 6 in `AuthContext.test.tsx`,
1 in `useDecisionEventStream.test.ts`, 2 in `AppRoutes.integration.test.tsx`),
giving 98.

**Structural checks** (repository-wide search over `client/src`):

| Check | Result |
|---|---|
| Direct `fetch(` outside `api/client.ts` | **none** — 73 call sites migrated |
| `hathap_token` / `hathap_user` outside `api/authTransport.ts` | **none** outside tests that assert on storage |
| `VITE_API_URL` outside `api/client.ts` | **none** |

**Coverage added for the claims in §2.5:**

| Claim | Test |
|---|---|
| Credential is attached; not attached for `auth: false` or when no session; an explicit token wins | `client/src/api/client.test.ts` |
| JSON content type only with a JSON body; body-less POST carries none | `client/src/api/client.test.ts` |
| Server `error` preserved; fallback messages; `unauthorized` / `http` / `network` classification; never retried | `client/src/api/client.test.ts` |
| 401 invalidates only when a credential was sent — public login 401 and 5xx do not | `client/src/api/client.test.ts`, `AuthContext.test.tsx` |
| An authenticated 401 clears state *and* storage, and the credential is not resent | `AuthContext.test.tsx`, `AppRoutes.integration.test.tsx` |
| Session is resolved on the first render, so a deep link does not bounce through `/login` | `AppRoutes.integration.test.tsx` |
| A rejected stream stops without reconnecting or polling | `client/src/hooks/useDecisionEventStream.test.ts` |

**A regression found and fixed during this phase, recorded because it would
otherwise recur:** the first implementation read the stored session in a mount
effect, so the app presented itself as signed out for one render. A guard
redirected to `/login`, and the arrival of the token then redirected to
`/dashboard` — so a page refresh on any protected route landed the user on the
dashboard instead of the route they requested. Two pre-existing
`AppRoutes.integration.test.tsx` cases failed as a result. The fix is to resolve
storage in the `useState` initializer (§2.5.3); the regression is now asserted
directly by "deep-links into a decision detail route without bouncing through
the login page".
