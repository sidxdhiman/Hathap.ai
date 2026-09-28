# Hathap.ai — Phase 17 todos (server-side authentication invalidation)

Last updated: Phase 17, **in progress and uncommitted**.

Status: implementation and tests are written and locally green in the files that
have been run, but the full server suite has **not** been re-run end-to-end since
the last round of test-fixture fixes, and no documentation has been updated yet.
**Phase 17 is not finished and must not be described as complete.**

Baseline for comparison: `HEAD == origin/main == 5350698`
(`docs: phase 16 correct samesite site-vs-origin analysis`), server `272/272`,
client `60/60`.

---

## 1. Done and verified

### Investigation

- [x] Verified the baseline: branch `main`, clean tree, in sync with `origin/main`.
- [x] Traced server and client authentication end to end: issuance, storage,
      verification, protected routes, SSE, A2A, and error handling.
- [x] Confirmed Phase 16 left the cookie migration deliberately unimplemented
      because the deployment topology is undefined in this repository.

### Design decision (recorded, implemented)

- [x] Chose a monotonic per-user counter `User.authVersion`, embedded in each
      credential as the `av` JWT claim, as the invalidation mechanism. It needs
      no session store, no new collection and no new dependency, and it stays
      correct across multiple API instances because the only shared state is
      MongoDB, which the app already requires.
- [x] Decided and documented the honest consequences:
  - Invalidation is **per-user, not per-token**. Logout, password change and
    account deletion end *every* session for that user, including other devices.
    Per-device revocation would require a session store, which this phase
    intentionally does not introduce.
  - **Backward compatible, no migration.** Pre-existing user documents have no
    stored `authVersion`; pre-`av` credentials carry no claim. Both normalize to
    `0`, so deploying this phase does not force a single user to sign in again.
  - Account deletion needs no counter bump: the deleted `User` document is what
    the credential is resolved against, so the credential stops authenticating.
  - Password change returns a replacement credential to the acting client, so the
    device that changed the password is not immediately signed out.
  - A signature-valid JWT is not authentication. Existence and non-invalidation
    must be checked, so **every** bearer-token path must go through the shared
    verifier.

### Server implementation

- [x] `server/src/models/User.ts` — added `authVersion` (default `0`) with a
      comment explaining legacy normalization and the absence of a backfill.
- [x] `server/src/utils/authToken.ts` (new) — `readAuthVersion`, `signToken`,
      `extractBearerToken`, `verifyAuthToken`, `bumpAuthVersion`; HS256 pinned,
      7-day expiry, opaque `null` on any failure.
- [x] `server/src/middleware/authMiddleware.ts` — strict `Bearer ` parsing,
      shared verification, user-existence and `av` enforcement; database faults
      return `500`, rejected credentials return an opaque `401`.
- [x] `server/src/a2a/userBuilder.ts` — the A2A path had its own JWT verification
      that would have bypassed invalidation; it now uses the shared verifier.
- [x] `server/src/routes/auth.ts` — signup/login issue via `signToken`; new
      authenticated `POST /logout`; `change-password` increments the counter and
      returns a fresh credential; account-deletion invalidation documented.

### Client implementation

- [x] `client/src/context/AuthContext.tsx` — async best-effort server logout with
      unconditional local cleanup (local state clears even if the request fails);
      replacement credential adopted after a password change; session cleared
      directly after account deletion; debt comment updated.
- [x] `client/src/components/layout/Header.tsx` — awaits logout before navigating.
- [x] `client/src/pages/ProfilePage.tsx` — removed the redundant post-deletion
      logout call (deletion already clears the session, and the account is gone).

### Tests written

- [x] `server/src/tests/authEndpoints.test.ts` — harness reworked onto the
      production issuance path (`signToken` against the stored counter) plus
      explicit helpers for legacy / wrong-version / expired / missing-user
      credentials. New coverage for:
      - current, legacy (no `av`), invalid, garbage, expired, tampered,
        wrong-secret, `alg: none`, non-Bearer-scheme, missing header, non-numeric
        `av`, and stale-`av` credentials;
  - login and signup (success, duplicate signup, wrong password, no user
    enumeration between unknown email and wrong password);
  - logout (unauthenticated rejected; account-wide invalidation; every protected
    route refuses the dead credential; account survives; re-login issues a
    working credential);
  - password change (acting and other credentials invalidated, replacement works,
    pre-`av` credential also invalidated, failed change invalidates nothing);
  - account deletion (old credential refused on every route, cannot log in again,
    another account unaffected).
- [x] `client/src/context/AuthContext.test.tsx` — async logout, server
    invalidation call, local sign-out when the request fails, no server call
      without a token, replacement credential adoption, failed password change
      keeps the session, deletion clears without a logout call.

### Verification actually run (and passed)

- [x] `server`: `npx.cmd tsc --noEmit` — pass.
- [x] `client`: `npx.cmd tsc --noEmit` — pass.
- [x] `client`: `npm.cmd run lint` — pass (max-warnings 0).
- [x] `client`: `npm.cmd test` — `66/66` pass (was `60/60`).
- [x] `server`: `src/tests/authEndpoints.test.ts` — `37/37` pass.
- [x] `server`: `src/tests/researchProvider.test.ts` — `15/15` pass.

### A regression the phase uncovered, and the fix

The new user-existence requirement correctly broke **63 tests across 6 files**.
Those fixtures authenticated with a token naming a random, never-persisted
`ObjectId`, and only passed because the old `requireAuth` never checked that the
account existed. That is precisely the ghost-account hole this phase closes, so
the middleware was **not** weakened to make them pass. Instead the fixtures were
corrected to create real users:

- [x] `evaluation.test.ts`, `memory.test.ts`, `phase10.test.ts`,
      `decisionIntelligence.test.ts`, `researchSecurity.test.ts` — `userA`/`userB`
      are now real persisted `User` documents.
- [x] `researchProvider.test.ts` — was a pure unit-test file with no database
      connection; its `before`/`after` hooks now connect and clean up.
- [x] Their tokens were deliberately left **pre-`av`**, so these files now double
      as backward-compatibility coverage for credentials issued before the claim
      existed.
- [x] `authEndpoints.test.ts` — "does not delete another user records" was itself
      running on a token for an already-deleted user. It now recreates the
      account first and asserts against a real attacker.

---

## 2. To be done

### Blocking — must pass before Phase 17 can be called done

- [ ] **Re-run the full server suite end-to-end.** Last complete run was
      `280/295`, with all 15 failures in `researchProvider.test.ts`; that file now
      passes `15/15` in isolation, but the suite has not been re-run since. Target
      `295/295`.
- [ ] Re-run the server security audit and confirm it is still `0`.
- [ ] Confirm no unintended secret or fixture value entered the diff, and re-read
      the full diff for correctness.

### Code hardening identified but not yet done

- [ ] `verifyAuthToken` calls `User.findById(id)` on an arbitrary non-empty
      string. A *signed* credential carrying a malformed (non-ObjectId) `id`
      would make Mongoose throw a `CastError`, which `requireAuth` reports as
      `500` rather than `401`. Reachable only by a server-signed token, so low
      practical risk, but it should be closed — validate with
      `mongoose.isValidObjectId(id)` (or catch the cast error) and return the
      opaque `null` like every other malformed credential.
- [ ] Consider whether a logout whose network call fails should be surfaced to
      the user. Today the local session is cleared regardless, which is the right
      call for usability, but the credential remains server-valid until its
      7-day expiry or a later password change. This is a known, documented limit
      of a stateless token, not a bug.

### Test coverage still missing

- [ ] No dedicated regression test for the A2A fix. The change to
      `a2a/userBuilder.ts` is currently unverified: nothing fails if someone
      reintroduces independent verification there. Add a test that an
      authenticated A2A request works with a current credential and is refused
      after that credential is invalidated.
- [ ] No unit tests for `server/src/utils/authToken.ts` in isolation
      (`readAuthVersion` normalization of `null`/`undefined`/`NaN`/negative/
      fractional values, `extractBearerToken` edge cases).

### Documentation (not started)

- [ ] `docs/AUTHENTICATION_ARCHITECTURE.md` — still describes the mechanism as
      *proposed*, and uses the old `tokenVersion` / `ver` names. Must be rewritten
      to the implemented `authVersion` / `av`, and must state the per-user (not
      per-device) scope, the account-wide logout semantics, the password-change
      reissue, and the deletion-via-absence behaviour.
- [ ] `DEPLOYMENT_CHECKLIST.md` — mark the invalidation work done; do **not**
      imply the cookie migration or CSRF work happened.
- [ ] `README.md` — update the auth lifecycle if it currently describes the
      pre-Phase 17 behaviour.
- [ ] `agent_context.md` — record the new auth state.
- [ ] `todos.md` — this is still the Phase 16 document; add a Phase 17 outcome
      section so the history stays truthful.
- [ ] Replaced by this file: decide whether `todos.md` is kept as the Phase 16
      historical record or folded in here.

### Pre-existing debt — explicitly out of scope, must be recorded not fixed

- [ ] `server/src/routes/courtrooms.ts` has a verified cross-tenant
      authorization weakness. It was found during Phase 16/17 tracing and was
      **not** touched, to keep this phase's diff reviewable. It needs its own
      phase. Do not let it be described as resolved.
- [ ] Cookie-based sessions, CSRF protection, CORS credentials, and the
      `SameSite`/`Secure`/`Domain` decisions that depend on the undefined
      deployment topology all remain open from Phase 16.

### Commit and push

- [ ] Commit the Phase 17 implementation (runtime files, test files, docs) as a
      conventional commit, staged deliberately so no unrelated or secret file is
      included.
- [ ] Push `main` and verify `HEAD == origin/main` afterwards.
