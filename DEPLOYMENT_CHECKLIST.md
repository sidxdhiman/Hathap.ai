# 🚀 Deployment Checklist

> **Phase 33 — credential containment & release gate (authoritative for
> go/no-go and credential status).** Phase 32 remains the record of the
> rotation tooling; Phase 30 for release items, Phase 31 for credential
> hygiene. The material below the Phase 30 divider predates Phase 30 (a
> token-budget era record from 2024) and is kept only as history. Evidence for
> every ✅ is a command actually executed in this repository; evidence for
> every ⬜ is the absence of that execution.

---

## Phase 33 — Credential Containment & Production Release Gate

> **Go/No-Go: 🔴 NO-GO for production deployment.** Full evidence:
> `docs/PHASE33_ENGINEERING_REPORT.md`. Statuses below are evidence-backed;
> "owner action required" means this phase reached a checkpoint that only the
> repository/platform owner can perform (provider consoles, GitHub UI).

### A. Security actions — status table

| # | Action | Status | Evidence |
|---|---|---|---|
| 1 | Historical `server/.env` exposure | **Confirmed (upgraded from probable/unverified) — rotation still owner-pending** | Pre-cleanup commits `46aa067a4…`, `aeb6930b…`, `9a7dbb6690…` and their `server/.env` blobs (`99282f1`, 455 B; `2a4a6be`, 841 B) resolve on GitHub today (REST API, 2026-10-16). The file's key list (names/lengths only, values never printed or stored): `MONGODB_URI` (32, credential-free localhost, equals current local), `JWT_SECRET` (9), `API_KEY_ENCRYPTION_SECRET` (36), `PORT`, `A2A_BASE_URL`, `HATHAP_RESEARCH_PROVIDER`. **Not implicated:** MongoDB Atlas credentials, GitHub PAT, `BRAVE_SEARCH_API_KEY`, `A2A_API_KEY` — absent from the historical file and from all scanned history |
| 2 | Historical `JWT_SECRET` (9-char) | **Local side contained; production rotation owner-action-required** | Hash comparison only: current local `JWT_SECRET` (47 chars) ≠ exposed value. No production deployment exists, so the exposed secret signs nothing live. Before any go-live, generate a **fresh** value from a clean secret manager — never reuse any historical value |
| 3 | Historical `API_KEY_ENCRYPTION_SECRET` (36-char) | **Local data re-keyed off the exposed key (executed + verified)** | Owner-authorized local-only migration (2026-10-16): pre-migration dry-run `scanned=8 reEncrypted=3 alreadyOnNewKey=5 failed=0`; `--yes` run identical with `failed=0`; post-migration `--verify-only` under the current local key: `total=8 decryptable=8 plaintext=0 undecryptable=0` (exit 0); under the exposed key: `decryptable=0` — the exposed key no longer decrypts anything. Backup of all 8 encrypted records (ciphertext only, ACL-restricted, outside the repo) validated before the write; post-migration comparison: 0 missing, 0 unexpected changes, exactly the 3 expected ciphertexts changed |
| 4 | GitHub secret-scanning alert #1 | **Owner action required (still OPEN)** | API re-read 2026-10-16: `state=open`, `resolution` null, only alert ever. Synthetic Atlas-URI fixture (Phase 31/32) remains proven false-positive; fixture literal is assembled from fragments (`securityConfig.test.ts:132-135`) and no longer exists as a single literal. Dismiss as `false_positive` in the UI (Security → Secret scanning) — no phase automates this |
| 5 | Push protection | **Verified complete** | Repo metadata (`security_and_analysis`): `secret_scanning=enabled`, `secret_scanning_push_protection=enabled`; push-protection-alerts endpoint: 0 alerts. Verified via API 2026-10-16 (status was "unknown" in Phases 31–32) |
| 6 | Production-grade secret provisioning | **Not implemented / blocked on platform (owner)** | Nothing has ever been deployed; no Dockerfile/PaaS/proxy config exists. Startup guards live-verified this phase: missing `API_KEY_ENCRYPTION_SECRET` → exit 1; `NODE_ENV=production` without/with-short `JWT_SECRET` → exit 1 before listening. Requirements: README → Production Configuration Contract |
| 7 | AES migration tooling safety | **Verified complete** | Code review (decrypt-old/encrypt-new only; undecryptable preserved), 19/19 rotation tests incl. 4 new spawned-CLI refusal/dry-run tests; refusal paths re-exercised live (missing old secret, identical secrets, missing `--yes` → exit 1 each) |

### B. Remaining owner actions (incident stays OPEN until done)

- [ ] **Dismiss secret-scanning alert #1** as `false_positive` in the GitHub UI
      (Phase 33 re-verified it is still open; evidence in §A4).
- [ ] **Rotate the two/three OpenRouter provider keys** stored in local dev
      records `6a3cd154…`, `6a3cd170…`, `6a59cbfd…` **if still active** — they
      were encrypted under the exposed historical key until this phase's local
      migration (ciphertext never left the local DB, so exposure requires a DB
      copy too; rotation closes it regardless). OpenRouter dashboard → Keys →
      regenerate/revoke; then update the model entries.
- [ ] **At production provisioning:** generate **fresh** `JWT_SECRET` (≥16) and
      `API_KEY_ENCRYPTION_SECRET` (≥32) from a clean secret manager; set
      `NODE_ENV=production`; never reuse any historical value. Follow
      `docs/SECRET_SCANNING.md` rotation table.
- [ ] **Consider a GitHub Support request** to purge the unreachable
      pre-cleanup commits/blobs (`46aa067…`, `aeb6930…`, `9a7dbb6…` and their
      `server/.env` blobs) — unreachable objects are not removed by force-push
      and remain retrievable by anyone who knows the SHAs (the SHAs are cited
      in tracked audit docs). Requires the owner's GitHub account; no phase
      rewrites history.
- [ ] **After accepting the Phase 33 migration**, securely delete the backup
      at `%TEMP%\opencode\hathap_local_key_backup.json` (ciphertext-only
      rollback file; ACL already restricted to the owner account) — e.g.
      `icacls … /inheritance:r` then delete, or a file-shredding tool. Keep it
      until then; do not commit it (it is outside the repo by design).

### C. Production blockers (🔴 NO-GO — all must clear before deployment)

1. Historical credential exposure **confirmed and only partially contained**:
   the exposed secrets still exist in retained GitHub objects (§A1); provider
   key rotation (§B) and alert dismissal (§B) are owner-pending.
2. No production environment exists (§A6) — deployment platform, TLS,
   hostname, backups, single-replica topology decision all open (Phase 30 §B/§C).
3. Production secrets must be freshly generated at provisioning (§B); no
   production `JWT_SECRET`/`API_KEY_ENCRYPTION_SECRET` has ever been set.

**The security incident stays OPEN** until §B is completed with evidence and
confirmed by the owner. Local engineering completion ≠ incident closure ≠
deployment readiness.

---

## Phase 32 — Credential Rotation & Production Security Gate

> **Status superseded by Phase 33 (above).** Kept as the record of the
> rotation tooling and runbooks. Two Phase 32 statements were corrected by
> Phase 33 evidence: the historical `server/.env` did **not** contain an Atlas
> password or GitHub PAT (it held app secrets + a credential-free localhost
> URI), and push protection is now **verified enabled**.

> **Go/No-Go: 🔴 NO-GO for production deployment.** Full evidence:
> `docs/PHASE32_ENGINEERING_REPORT.md`; runbooks below and in
> `docs/SECRET_SCANNING.md`.

### A. Verified implementation and tests (this phase — no production effect)

| Item | Evidence |
|---|---|
| Encryption architecture documented with code evidence | scrypt(secret, fixed salt `hathap-api-key-v1`) → AES-256-GCM, 12-byte random IV, 16-byte auth tag, format `enc:v1:`+base64url(iv‖tag‖ct); **format version only — no key identifier** in ciphertext (`server/src/utils/encryption.ts`) |
| Key-injectable encrypt/decrypt (minimum justified change) | `encryptApiKey`/`decryptApiKey` accept an optional secret or 32-byte derived key; default env behavior byte-identical; backward compatible (`encryption.ts`) |
| Migration service | `server/src/services/encryptionKeyMigration.ts`: new-key-first classification, old-key fallback, undecryptable records preserved byte-for-byte, per-record failure isolation, read-back verification, dry-run, idempotent resume; counts/ids only in all output |
| Operator CLI | `server/src/scripts/rotateApiKeyEncryption.ts`: `--dry-run` (default-safe), requires `--yes` to write, `--verify-only` completeness check; prints counts and record ids only |
| Regression tests | `server/src/tests/credentialRotation.test.ts` — **15/15 pass**: JWT rotation invalidation + rollback recovery + production refusal; AES wrong-key/tamper/truncation fail-closed; encrypt idempotency hazard; migration dry-run/real/idempotent-re-run/persist-failure-resume/verify (corrupted ciphertext, interrupted migration, duplicate execution, partial failure all covered) |
| CLI refusal paths exercised locally | missing/short `API_KEY_ENCRYPTION_SECRET_OLD` → exit 1 with redacted message (no value echoed) |
| Local dev DB enumerated read-only (`--verify-only`) | 8 records with keys: 5 decrypt under the current local secret, **0 plaintext, 3 undecryptable** — concrete proof the undecryptable-record hazard is real (old local secrets); records preserved, never overwritten. Not production data; nothing deployed |

### B. Operator actions still required (pending authorization / secure access)

- [ ] **Rotate `JWT_SECRET`** (probable historical exposure, Phase 31 §B):
  generate ≥16-char random, set in the deployment platform, restart, verify a
  login round-trip; all existing sessions become invalid (by design).
  Rollback: restore the previous value + restart.
- [ ] **Rotate `API_KEY_ENCRYPTION_SECRET`** (only with re-encryption):
  1. `mongodump` backup (recovery path).
  2. **Stop the app** (a running instance still holds the old key).
  3. `API_KEY_ENCRYPTION_SECRET=<NEW> API_KEY_ENCRYPTION_SECRET_OLD=<OLD> node dist/scripts/rotateApiKeyEncryption.js --dry-run`
  4. Re-run with `--yes`, then `--verify-only` (must report
     `undecryptable=<pre-existing failures> plaintext=0`).
  5. Set the new secret in the platform, start the app, verify model calls.
  6. Only then retire the OLD secret. Rollback = restore env + restart (or
     restore the backup) — no plaintext exposure needed at any step.
- [ ] **Verify and dismiss GitHub secret-scanning alert #1** as
  `false_positive` in the UI (Phase 32 could not re-read it via API: both
  alert endpoints returned 404 while `rate_limit`/repo-meta succeeded —
  status now only verifiable in the GitHub UI → Security → Secret scanning).
- [ ] **Check push protection** in repo Settings → Code security and analysis
  (not readable via API with the available credential; `security_and_analysis`
  empty, admin endpoints 403). Enable if off.

### C. Production blockers (🔴 NO-GO — all must clear before deployment)

1. Historical `server/.env` exposure **unaddressed**: neither rotation in §B
   has been executed and verified. Classification stays
   **probable/unverified historical exposure** — clean scans do not downgrade it.
2. Encryption-key migration **not executed anywhere with real data** (tooling
   validated by tests + local read-only verification only).
3. Deployment-platform configuration **unknown/unverified** (NODE_ENV, secrets
   present, single replica) — nothing has ever been deployed from this repo.
4. Push-protection status **unknown**; alert #1 dismissal pending owner action.
5. No staging, TLS, hostname, or backup procedure exists in this repository
   (Phase 30 §B items remain open).

**The security incident stays OPEN** until §B rotation items are completed
with evidence and confirmed by the owner.

---

## Phase 31 — Credential Exposure Review & Secret-Scanning Controls

> Authoritative for credential-hygiene items. Phase 30 remains authoritative
> for release items. Procedures: `docs/SECRET_SCANNING.md`; full evidence:
> `docs/PHASE31_ENGINEERING_REPORT.md`.

### A. Verified this phase

| Item | Evidence |
|---|---|
| GitHub secret-scanning alert #1 (`mongodb_atlas_db_uri_with_credentials`, open, `publicly_leaked=true`, created 14 s after the Phase 30 push) classified **false positive** | Location: `server/src/tests/securityConfig.test.ts:127` (blob from `3d6e215`) — synthetic `admin`/`topsecret` fixture on host `ac-abc.mongodb.net`; no other alerts (open=1, resolved=0); no force-pushes in the last ~90 days |
| False-positive literal removed from source | Fixture now assembled from fragments at runtime; assertions preserved (redaction equality + username/password absence). Alert left **open** for the owner to dismiss manually — Phase 31 made no GitHub security-state changes |
| Repo-wide + full-history scans | 464 worktree files / 1510 history blobs (incl. unreachable) inspected; all high findings classified placeholders/test fixtures/code expressions; new scanner: 287 tracked sources and 1267 history sources, **0 errors** |
| Recurrence prevention | `scripts/secret-scan.cjs` (dependency-free, values never printed) + CI job `secret-scan` + regression test `repoSecretHygiene.test.ts` in `npm test` |
| Push-protection status | **Unknown**: push-protection-alerts API returns 404; `security_and_analysis` statuses not readable. GitHub secret scanning itself is confirmed active |

### B. Unresolved security risk — historical `server/.env`

- **Classification: probable/unverified historical exposure.** Audit docs
  (`AUDIT_PHASE11.md`, `POST_PHASE10_AUDIT.md`) state as fact that
  `server/.env` (JWT secret + AES encryption key) was tracked before the
  Sep-21 history cleanup. The file never appears in any commit reachable from
  local refs; pre-rewrite SHAs cited by those audits are missing from the
  object database; the local reflog starts at the cleanup tag — consistent
  with a rewrite. **Whether those commits ever reached GitHub cannot be
  verified from this machine.**
- **Absence of a secret-scanning alert is not evidence the credentials were
  never exposed** — GitHub indexes reachable commits; a rewritten-away commit
  would not re-alert.

- [ ] **Owner action — rotate `JWT_SECRET`** (see `docs/SECRET_SCANNING.md`
  rotation table; all sessions invalidated). Keep this item open until done.
- [ ] **Owner action — rotate `API_KEY_ENCRYPTION_SECRET` ONLY with a
  re-encryption plan** (blind rotation makes stored model API keys
  undecryptable). Keep this item open until done and verified.

### C. Owner actions — GitHub state

- [ ] Dismiss secret-scanning **alert #1** as `false_positive` (evidence in
  this section) — done manually by the owner, not by Phase 31.
- [ ] Consider enabling push protection for `main`.

---

## Phase 30 — Release Blocker Review & Deployment Readiness

### A. Implemented and verified (this phase)

| Item | Evidence |
|---|---|
| Reverse-proxy support (opt-in `TRUST_PROXY`: hop count / `loopback` / …, refused otherwise) | `server/src/config/security.ts` `resolveTrustProxy`; wired via `app.set('trust proxy', …)` in `index.ts`; tests in `securityConfig.test.ts` |
| Boot warning when `NODE_ENV` is unset (previously: silent development rules incl. fallback JWT secret) | `server/src/index.ts`; warn-only, never a 500 |
| Credential redaction in startup / unhandled-rejection / middleware-error logs (`scheme://user:pass@` → `<redacted>`) | `redactCredentials` in `security.ts`; used in `index.ts`; regression tests |
| Latent A2A error-path hardening: `setupA2A(app)` now mounts **before** the error middleware so `next(error)` reaches the `{ error }` JSON handler instead of Express's HTML finalizer | `server/src/index.ts` (paths were unreachable in practice — defensive) |
| Dependency audit: measured, classified, dispositioned (no blind fixes) | Server 3 high (`braces` dev-chain, no fix, exposure documented) / client 21 findings; one safe in-range remediation applied (`source-map-js` 1.2.1→1.2.2, lockfile-only, 22→21). `npm audit fix`/`--force` rejected: dry-run churned 21 packages incl. an `@typescript-eslint` downgrade without removing findings. Full rationale in `README.md` → Security audit |
| Full local validation after changes | Server: `tsc --noEmit` clean, **511/511 tests** (2 consecutive full runs, exit 0; Phase 29's flaky `planningExecution` timeout did not recur — execution status stays `queued` until finalize, so `queued` under load is expected), `npm run build` clean. Client: `eslint` clean (0 warnings), `tsc --noEmit` clean, `typecheck:config` clean, **123/123 tests** (15 files), `npm run build` clean |
| Production configuration contract documented | `README.md` → "Production Configuration Contract (Phase 30)": required env vars and their actual enforcement, boot/health/shutdown semantics, single-replica constraint, client bake-time contract |
| `.env.example` updated | `server/.env.example` documents `TRUST_PROXY` semantics and the failure mode it prevents |

### B. Documented, not executed (verifiable later; not this phase's scope)

- [ ] **Staging deployment** — no staging environment exists in this repository; nothing has been deployed.
- [ ] **TLS / HTTPS end-to-end** — TLS termination is a platform concern, not implemented in this repo.
- [ ] **Production build from a clean checkout** (`npm ci && npm run build` in both packages, start from `server/`) — locally verified with `npm test`/`npm run build` trees, not on a clean remote host.
- [ ] **Live provider calls** (Brave Search, model endpoints) — tests use the explicitly-labeled mock.
- [ ] **Real-browser smoke test against a built bundle** — client tests are jsdom-based.
- [ ] **Backup / restore of MongoDB** — no backup tooling exists in this repo.
- [ ] **`npm audit` re-run** — numbers above are this phase's measurement; re-run on any dependency change.

### C. Not implemented — required before a real production launch

- [ ] **Container / deploy descriptor** (Dockerfile, compose, or PaaS config): none exists; the tree has no production process definition beyond `npm start`.
- [ ] **Reverse-proxy / web-server config**: no nginx/Caddy/Traefik config is checked in. The topology choice (same-origin SPA+API vs split origins) is still an open decision — see `docs/AUTHENTICATION_ARCHITECTURE.md` §4.4 — and it gates the HttpOnly-cookie migration (tokens are currently `localStorage`, i.e. XSS-readable).
- [ ] **Static hosting decision**: `client/dist` must be served at the domain root (no `base` is configured in `vite.config.ts`); sub-path hosting is unsupported as-is.
- [ ] **Log aggregation / monitoring / alerting**: logs go to stdout only; there is no metrics endpoint, no tracing, no on-call wiring.
- [ ] **Process supervision**: no `uncaughtException` handler (Node default: exit 1) — a supervisor must restart the process; graceful shutdown exists for SIGINT/SIGTERM only.
- [ ] **Backup automation and documented RTO/RPO**.
- [ ] **Rate-limit strategy for shared deployments** — limits are per-process in-memory; the single-replica constraint (README, Production Configuration Contract) must hold, or limits/worker/SSE must move to shared infrastructure.
- [ ] **Secret provisioning/rotation story** — especially `API_KEY_ENCRYPTION_SECRET` (no rotation tool; changing it bricks stored model keys).
- [ ] **Reproducible dependency-remediation plan** for the deferred audit findings (semver-major upgrades of Vite/Tailwind/React Router/Vitest/`@typescript-eslint` toolchains).

### D. Decisions the platform owner must supply

- [ ] Hostname(s) and DNS; public origin(s) for `CORS_ORIGINS`, `APP_URL`, `A2A_BASE_URL`.
- [ ] TLS termination point and proxy hop count (→ `TRUST_PROXY`).
- [ ] MongoDB provider, URI, credentials, retention/backup policy.
- [ ] Replica count (must be `1` until C's rate-limit/worker/SSE items are addressed).
- [ ] Which env-var values are provisioned where (the repo never embeds them; `server/.env` is git-ignored and local-only).
- [ ] Rollback mechanism and health-check path configuration (`GET /api/health` is the built-in probe).

### Release blockers disposition (Phase 29 gate, re-evaluated here)

| # | Finding | Disposition |
|---|---|---|
| 1 | No production config documentation | **Fixed** — README contract + this checklist |
| 2 | `NODE_ENV` unset ⇒ silent dev rules (fallback JWT secret, dev CORS) | **Fixed** — loud boot warning (env-var use itself is a deployment decision, §D) |
| 3 | No `trust proxy` support ⇒ behind-proxy auth rate-limit lockout | **Fixed** — opt-in `TRUST_PROXY`, secure default unchanged |
| 4 | Startup log could echo `MONGODB_URI` credentials | **Fixed** — `redactCredentials` on all three log sites |
| 5 | A2A routes mounted after error middleware (latent HTML/stack responses) | **Fixed** — reordered; paths currently unreachable (defensive) |
| 6 | Dependency advisories (server 3 high / client 21) | **Deferred with acceptance** — all in dev/build/test tooling; exposure, fix-availability and upgrade cost documented in README. No blind/downgrade fixes applied |
| 7 | One flaky server test under load (`planningExecution`, Phase 29) | **Not recurring** — root-caused (`queued` is a non-terminal state), 2× full-suite green |
| 8 | No deploy artifacts, monitoring, backups, topology (§C) | **Out of scope by design** — requires platform information that does not exist in this repo; tracked in §C/§D |

### Local validation procedure (re-run before any release)

```bash
cd server && npm ci && npx tsc --noEmit && npm test && npm run build
cd client && npm ci && npm run lint && npx tsc --noEmit \
  && npm run typecheck:config && npm test && npm run build
```

Plus CI on GitHub Actions (`.github/workflows/ci.yml` — server job with
MongoDB 7 service, client job, test-only env values) must be green on the
release commit, and `npm audit` re-run for a fresh exposure reading.

---

## Pre-Deployment Verification

### Code Changes
- ✅ `server/src/engine/agentRunner.ts` - maxTokens added
- ✅ `server/src/engine/llmClient.ts` - Error handling improved
- ✅ `client/src/pages/CourtroomDetailPage.tsx` - Error suggestions added
- ✅ `client/src/pages/ModelsPage.tsx` - Token budget card added

### TypeScript Compilation
- ✅ No errors in agentRunner.ts
- ✅ No errors in llmClient.ts
- ✅ No errors in CourtroomDetailPage.tsx
- ✅ No errors in ModelsPage.tsx

### Documentation
- ✅ CREDIT_FIX.md (backend explanation)
- ✅ FRONTEND_TOKEN_WARNINGS.md (frontend changes)
- ✅ TOKEN_BUDGET_GUIDE.md (user guide)
- ✅ IMPLEMENTATION_SUMMARY.md (overview)
- ✅ USER_FACING_EXAMPLES.md (UI examples)
- ✅ DEPLOYMENT_CHECKLIST.md (this file)

---

## Local Testing Checklist

### Backend Testing
- [ ] Backend server starts without errors
  ```bash
  cd server
  npm run dev
  ```
  Expected: "Server running on port 4000"

- [ ] No compilation errors
  ```bash
  cd server
  npm run build
  ```
  Expected: Compiles to dist/

- [ ] Database connection works
  - Check MongoDB connection string in .env
  - Verify MongoDB is running
  - Expected: "Connected to MongoDB"

### Frontend Testing
- [ ] Frontend dev server starts without errors
  ```bash
  cd client
  npm run dev
  ```
  Expected: "VITE v5.0.0 ready in X ms"

- [ ] No TypeScript errors
  ```bash
  cd client
  npx tsc --noEmit
  ```
  Expected: No output (no errors)

- [ ] Application loads in browser
  - Navigate to http://localhost:5173
  - Expected: Login page loads
  - No console errors

---

## Feature Testing Checklist

### Test 1: Models Page Token Budget Info
- [ ] Navigate to Models page
- [ ] Look for orange "Token Budget" card
- [ ] Card shows:
  - [ ] 2 agents = 2,600 tokens ✓
  - [ ] 3 agents = 3,900 tokens ✓
  - [ ] 4 agents = too much ✗
- [ ] Card shows 4 solutions
- [ ] Mobile view is responsive

### Test 2: Successful Debate (Safe Config)
- [ ] Add at least one model with valid API key
- [ ] Create courtroom with 2 agents
- [ ] Click "Start Debate"
- [ ] Expected: Debate runs successfully
- [ ] Verdict appears

### Test 3: Error Suggestions (Simulate)
**If you have limited API credits:**
- [ ] Create courtroom with 4 agents
- [ ] Click "Start Debate"
- [ ] Expected: HTTP 402 error appears
- [ ] Expected: Suggestions card appears below
- [ ] Suggestions include:
  - [ ] Add credits link
  - [ ] Use fewer agents
  - [ ] Use faster model
  - [ ] Try Ollama

### Test 4: Missing API Key Error
- [ ] Add model without API key
- [ ] Create courtroom with that agent
- [ ] Click "Start Debate"
- [ ] Expected: "No API key" error
- [ ] Expected: Suggestions show

### Test 5: No Models Error
- [ ] Delete all models
- [ ] Try to create courtroom
- [ ] Click "Start Debate"
- [ ] Expected: "No available model" error
- [ ] Expected: Suggestions show

### Test 6: Error Recovery
- [ ] Get insufficient credits error
- [ ] Modify debate (fewer agents)
- [ ] Click "Start Debate" again
- [ ] Expected: Either success or same error (if still out of credits)

---

## UI/UX Testing Checklist

### Visual Consistency
- [ ] Error cards use consistent colors (orange/red)
- [ ] Suggestion cards match design system
- [ ] Icons render correctly
- [ ] Text is readable (contrast)
- [ ] Spacing is consistent

### Responsive Design
- [ ] Desktop view (1920px)
  - [ ] Error card full width
  - [ ] Suggestions below
  - [ ] All readable

- [ ] Tablet view (768px)
  - [ ] Cards responsive
  - [ ] Text readable
  - [ ] No text overflow

- [ ] Mobile view (375px)
  - [ ] Cards stack vertically
  - [ ] Touchable buttons
  - [ ] Readable text

### Accessibility
- [ ] Error icon visible (not just color)
- [ ] Suggestion items have proper contrast
- [ ] Can navigate with keyboard
- [ ] Screen reader friendly (if testable)

---

## Performance Testing

### Load Times
- [ ] Models page loads < 2 seconds
- [ ] Error suggestions render instantly
- [ ] No layout shift when error appears
- [ ] No memory leaks (check DevTools)

### API Performance
- [ ] Debate starts within reasonable time
- [ ] Error detection is fast
- [ ] No duplicate API calls

---

## Browser Compatibility

Test on:
- [ ] Chrome/Chromium (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)

Expected: All features work identically

---

## Security Testing

- [ ] API keys not exposed in error messages
- [ ] No sensitive data logged
- [ ] Error messages don't leak information
- [ ] Tokens not visible in localStorage — **open item**. Server-side credential
      invalidation is implemented (Phase 17): logout, password change and account
      deletion all end outstanding credentials. That bounds how long a stolen token
      is useful; it does not stop page scripts from reading it. Moving the token
      into an `HttpOnly` cookie is specified but unimplemented — see
      [`docs/AUTHENTICATION_ARCHITECTURE.md`](docs/AUTHENTICATION_ARCHITECTURE.md)
- [ ] Expired or revoked credentials end the session promptly in the UI — **done**
      (Phase 18). Every client request goes through one layer; a `401` on a
      credentialed request clears the session once and the route guard redirects.
      Since Phase 20 this is also proactive: a stored token is validated on page
      load with `GET /api/auth/me`, so an already-dead token is rejected before
      the protected shell renders. A validation request that cannot reach a
      verdict (network failure, `5xx`) deliberately keeps the session.
- [ ] HTTPS ready (for production)

---

## Authentication & Session Prerequisites (Phase 16)

> **Phase 17 + 18 status.** The revocable-credential half is **done and does not
> need any of these answers**: `POST /api/auth/logout`, password-change
> invalidation, account-deletion invalidation and A2A parity are implemented and
> tested over the existing bearer token, and the client now has a single
> credential/request layer with one 401 → sign-out path. The questions below gate
> only the **cookie migration**, which remains unimplemented. They also gate the
> shortened TTL, the CSRF token and the split rate limiter described in §5–§6 of
> [`docs/AUTHENTICATION_ARCHITECTURE.md`](docs/AUTHENTICATION_ARCHITECTURE.md).
>
> **Phase 19 status: still open, now formally recorded.** Phase 19 inventoried
> every tracked file and confirmed the production topology is **absent from the
> repository** — there is no Dockerfile, compose file, Kubernetes manifest,
> proxy config, PaaS descriptor, deploy workflow, production env file, or
> production hostname anywhere. CI only typechecks, tests and builds. So these
> questions cannot be answered from the code; they need a human decision. The
> authoritative, expanded decision record is **§4.4** of
> [`docs/AUTHENTICATION_ARCHITECTURE.md`](docs/AUTHENTICATION_ARCHITECTURE.md) —
> fill it in there rather than here, so there is one source of truth.

Session cookies (`HttpOnly`, `Secure`, `SameSite`) cannot be configured until the
production topology is pinned down. The repository supports two mutually exclusive
shapes and currently commits to neither. Record the answers in §4.4 before
starting the migration:

- [ ] **Topology** — same-origin (SPA + API behind one origin) or cross-origin?
- [ ] If cross-origin: is the API on the **same registrable domain** as the SPA?
      `SameSite` is evaluated on the *site* (scheme + registrable domain), not the
      *origin*, so subdomains and different ports are still same-site and
      `SameSite=Lax` works for them. If the API is on an **unrelated** domain
      (e.g. `*.vercel.app` + `*.herokuapp.com`), `SameSite=None; Secure` is
      forced, which removes all `SameSite` CSRF protection and makes the CSRF
      token the only defence.
- [ ] Is the public origin HTTPS for both SPA and API? (`SameSite=None` requires
      it, and a `Secure` cookie is dropped on any other plaintext origin.)
- [ ] Where does TLS terminate, and how many proxy hops sit in front of Express?
      (`trust proxy` is currently never configured.)
- [ ] Exact origins to place in `CORS_ORIGINS` (only if cross-origin).
- [ ] Does a reverse proxy serve `client/dist`, or should Express serve it?
      (Express currently serves no static files and has no SPA fallback.)
- [ ] How many API replicas? More than one forbids any in-memory session store and
      requires the process-local SSE event bus to be addressed first.

### What to set before any production deploy (independent of the cookie decision)

These are safe to action now and do **not** depend on the topology answers above:

- [ ] Set `NODE_ENV=production`. It is read by the server but was previously
      undocumented; unset, the process behaves as development, which silently
      permits the predictable fallback JWT secret. CORS is already deny-by-default
      in production (only the `CORS_ORIGINS` allow-list is ever reflected, and the
      `Host` header is never trusted), so this is chiefly a JWT-secret concern.
- [ ] Set `JWT_SECRET` to a strong random value (>= 16 chars).
- [ ] Set `API_KEY_ENCRYPTION_SECRET` to a random value (>= 32 chars).
- [ ] Optionally set `APP_URL` to the public origin — it is sent to
      OpenAI-compatible providers as `HTTP-Referer` and was previously
      undocumented.

---

## Production Deployment

### Pre-Deployment
- [ ] All local tests passed
- [ ] Team code review complete
- [ ] Documentation reviewed
- [ ] Staging environment tested

### Deployment Steps

#### Step 1: Backend Deployment
```bash
# Ensure environment is set
export MONGODB_URI=<production-uri>
export JWT_SECRET=<production-secret>
export API_KEY_ENCRYPTION_SECRET=<production-secret>
export NODE_ENV=production
export APP_URL=<public-frontend-origin>   # optional; HTTP-Referer for LLM providers

# Build
cd server
npm run build

# Deploy dist/ folder to hosting
# (Heroku, Railway, AWS, etc.)

# Restart server
```

> There is no deployment configuration in this repository — no Dockerfile, no
> compose file, no PaaS descriptor, no deploy workflow, and no reverse-proxy
> config. The commands above therefore describe *what to set*, not a procedure
> that exists. Hosting, TLS termination and the SPA/API topology are decisions
> you have to make and encode; see the decision record in
> [`docs/AUTHENTICATION_ARCHITECTURE.md`](docs/AUTHENTICATION_ARCHITECTURE.md) §4.4.

#### Step 2: Frontend Deployment
```bash
# Build for production
cd client
npm run build

# Deploy dist/ folder to CDN/hosting
# (Vercel, Netlify, S3+CloudFront, etc.)
```

#### Step 3: Verification
- [ ] Backend health check: `GET /api/health` returns 200
- [ ] Frontend loads: Navigate to https://your-domain.com
- [ ] Login works
- [ ] Models page shows token budget card
- [ ] Can start debate successfully
- [ ] Error handling works

### Post-Deployment Monitoring

**First 24 hours:**
- [ ] Monitor error logs
- [ ] Check API response times
- [ ] Verify database connections
- [ ] Monitor user sessions

**Daily:**
- [ ] Check error rates
- [ ] Monitor performance
- [ ] Review user feedback
- [ ] Test key features

**Weekly:**
- [ ] Review usage statistics
- [ ] Check for any issues
- [ ] Plan any needed updates

---

## Rollback Plan

If issues occur post-deployment:

### Quick Rollback
```bash
# Backend
# Revert to previous commit and redeploy

# Frontend  
# Revert to previous build and redeploy
```

### Database Backup
- Ensure daily backups
- Can restore if needed
- Keep backup for 30 days

---

## Communication

### Before Deployment
- [ ] Notify team of upcoming deployment
- [ ] Share deployment time window
- [ ] Identify point-person for issues

### During Deployment
- [ ] Monitor deployment progress
- [ ] Document any issues
- [ ] Have rollback plan ready

### After Deployment
- [ ] Confirm all systems working
- [ ] Test key features
- [ ] Communicate success to team

---

## Documentation

### Update These After Deployment
- [ ] README.md - if deployment steps changed
- [ ] API documentation - if endpoints changed
- [ ] Known Issues section - add any new issues found
- [ ] Changelog - document all changes

### Notify Users
- [ ] Blog post about improvements (optional)
- [ ] In-app notification about token budgets
- [ ] Help documentation updated
- [ ] Support team trained

---

## Post-Deployment Support

### Common Questions from Users
1. **"Why do I need fewer agents?"**
   - Answer: Tokens are limited, fewer agents = lower cost

2. **"Can I use 5 agents?"**
   - Answer: If you have enough credits, yes. Otherwise 2-3.

3. **"What's Ollama?"**
   - Answer: Free local AI models, no API needed

4. **"How do I get more credits?"**
   - Answer: Visit your API provider (OpenAI, Anthropic, etc.)

### User Support Resources
- Provide TOKEN_BUDGET_GUIDE.md link
- Direct to USER_FACING_EXAMPLES.md for visuals
- Point to Models page for token info
- Suggest Ollama for no-cost option

---

## Metrics to Track

### Success Metrics
- Debate success rate (target: 95%+)
- Error recovery rate (users fixing their own errors)
- User satisfaction with suggestions
- Time to resolve credit issues

### Failure Metrics
- Error rate (target: <1%)
- Users stuck at "Insufficient credits" (target: 0%)
- Bug reports (target: 0 critical)
- Performance degradation (target: none)

### Usage Metrics
- Debates using 2 agents (most common)
- Debates using 3 agents
- Debates using 4+ agents (rare after update)
- Users accessing Models page token info

---

## Sign-Off Checklist

- [ ] Technical Lead: Code reviewed and approved
- [ ] Product Owner: Features meet requirements
- [ ] QA: Testing complete, no critical issues
- [ ] DevOps: Deployment plan verified
- [ ] Documentation: All docs updated
- [ ] Support: Team trained and ready

---

## Final Verification

```
DEPLOYMENT STATUS: [ ] Ready to Deploy
DEPLOYMENT TIME: [  ]
DEPLOYED BY: [  ]
VERIFICATION COMPLETE: [ ]
ROLLBACK READY: [ ]
SUCCESS: [ ]
```

---

## Post-Deployment Timeline

| When | Action | Owner |
|------|--------|-------|
| T-1h | Final checks | Tech Lead |
| T-0 | Deploy backend | DevOps |
| T+5m | Verify backend | Tech Lead |
| T+10m | Deploy frontend | DevOps |
| T+15m | Verify frontend | Tech Lead |
| T+30m | Test key features | QA |
| T+1h | Full verification | All |
| T+24h | Monitor issues | Support |
| T+1w | Review metrics | Product |

---

## Contact & Escalation

### During Deployment
- **Technical Issues:** Technical Lead
- **Deployment Issues:** DevOps/Infrastructure
- **Emergency:** CTO/Management

### After Deployment
- **User Issues:** Support Team
- **Bug Reports:** Development Team
- **Performance Issues:** DevOps/Backend Team

---

**Deployment Checklist Version:** 1.0
**Last Updated:** 2024
**Status:** Ready for Use
