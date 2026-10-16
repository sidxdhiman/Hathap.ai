# Phase 33 — Credential Rotation Execution & Production Release Gate

**Date:** 2026-10-16 · **Baseline:** `dc44ffb` (Phase 32) · **Repository:** `sidxdhiman/Hathap.ai` (public)

## 1. Executive summary & decision

| Item | Result |
|---|---|
| **Production readiness decision** | 🔴 **NO-GO** — historical exposure is now **confirmed** (was probable/unverified); provider-key and GitHub-UI owner actions remain open (Section 10) |
| Historical exposure classification | **Upgraded to confirmed**: the pre-cleanup commits containing `server/.env` are retrievable on GitHub today (Section 2). No secret value was ever printed, stored, or committed |
| Containment executed | **Local AES re-key executed and verified** (owner-authorized, local dev DB only): 3 records migrated off the exposed key; all 8 records now decrypt only under the current local secret |
| GitHub security state changed? | **No.** Read-only API inspection only; alert #1 left open for the owner to dismiss; no history rewrite; no force-push |
| Code changes | Minimal & justified: `rotate:api-keys` npm script (correcting a false Phase 32 claim), 4 new spawned-CLI regression tests, release-gate docs |
| Security incident status | **OPEN** — local containment achieved; production rotations still pending at provisioning; provider-key verification is an owner action |

## 2. Evidence reviewed for the historical credential exposure

- Baseline verified clean at `dc44ffb` == `origin/main`; Phase 32 report, `DEPLOYMENT_CHECKLIST.md`, `docs/SECRET_SCANNING.md`, README rotation section, `server/src/config/security.ts`, `server/src/index.ts`, `server/src/utils/encryption.ts`, `server/src/utils/authToken.ts`, `server/src/services/encryptionKeyMigration.ts`, `server/src/scripts/rotateApiKeyEncryption.ts`, `server/src/tests/credentialRotation.test.ts`, `.github/workflows/ci.yml`, `scripts/secret-scan.cjs` all re-read.
- **Phase 31's open question is now answered.** The pre-cleanup commits cited by `AUDIT_PHASE11.md` — `46aa067a4…` (2026-09-16), `aeb6930b…` (2026-09-18), `9a7dbb6690…` (2026-09-19) — **resolve on GitHub** (REST commits API, 2026-10-16, via the stored git credential; values never printed). Their git trees contain **`server/.env`** blobs `99282f1…` (455 B) and `2a4a6be…` (841 B). Unreachable from any current ref (remote advertises only `main` → `dc44ffb`), but retrievable by anyone who knows the SHAs — and the SHAs are printed in tracked audit docs.
- **Content inspection was structure-only.** Blob contents were decoded transiently in process memory to enumerate **key names, value lengths, and sha256 equality against the current local `server/.env`** — never printed, never written to disk, and immediately discarded.
- Git-state verification: `git ls-remote origin` shows a single ref (`main`); the local cleanup tag `pre-phase12-credential-history-cleanup` → `ed493df…` is not on the remote; tracked/historical secret scans report 0 errors.
- Local `server/.env` (untracked, development): verified `MONGODB_URI` is localhost with no userinfo; values never displayed.

## 3. Per-credential containment & rotation status

Historical `server/.env` key inventory (names and lengths only; values never shown):

| Key in exposed file | Length | Equals current local? | Classification / status |
|---|---|---|---|
| `MONGODB_URI` | 32 | **Yes** | Credential-**free localhost** URI — proves **no MongoDB Atlas credential ever lived in `server/.env`** (correcting the Phase 32 "Atlas password" wording) |
| `JWT_SECRET` | 9 | **No** (current: 47) | Application signing secret. Local side contained; production value must be freshly generated at provisioning. No provider console exists — rotation = replace env + restart |
| `API_KEY_ENCRYPTION_SECRET` | 36 | **No** (current: 64) | AES at-rest key. **Local data re-keyed off it this phase** (Section 5) |
| `PORT`, `A2A_BASE_URL`, `HATHAP_RESEARCH_PROVIDER` | — | Yes | Non-secrets |
| *(absent)* GitHub PAT, Atlas PAT, `BRAVE_SEARCH_API_KEY`, `A2A_API_KEY` | — | — | **Not implicated** — absent from both historical blobs and from all scanned git history (0 `github-token` findings) |

- **Owners:** the repository owner (app secrets; OpenRouter keys). No third-party revocation is possible for app secrets; they carry no provider-side state.
- **Provider-key follow-up:** 3 local `Model` records (below) held provider keys encrypted under the exposed AES key. Ciphertext lived only in the local MongoDB (never in git), so exploiting them required a DB copy as well — but the owner should still rotate those OpenRouter keys if active (Section 10).
- No credential was used to authenticate anywhere; no provider resource was accessed. The exposed values were used **only** as decryption/encryption inputs in the local migration, and only transiently in process environment variables (never as command-line text).

## 4. JWT rotation verification & remaining session risks

Implementation re-verified (`authToken.ts`, `config/security.ts`, `index.ts`):

- HS256 pinned at verification; `getJwtSecret()` re-reads the environment per call (in-process rotation semantics); production refuses missing/<16-char secrets at startup and at sign/verify (live-verified this phase: missing → exit 1; short → exit 1; both before `listen`).
- Supported mechanism: single shared `JWT_SECRET` env var; no `kid`/rollover — rotation invalidates **all** outstanding tokens (7-day TTL); per-user invalidation via `authVersion` unaffected. Rollback = restore previous value + restart (regression-tested).
- Operator procedure (production, at provisioning — not executable today because no production environment exists): generate ≥16-char random in a secret manager → set env → restart → login round-trip must succeed with a **new** token while a pre-rotation token is rejected → announce forced re-login. All replicas must switch together (single-replica constraint).
- **Remaining session risk:** none live — nothing is deployed, and the current local secret is not the exposed one. If the historical 9-char secret was ever used on any other system, tokens signed under it remain forgeable there until that system rotates.
- Production verification is **not** claimable from local tests; the runbook above is the pending owner procedure.

## 5. AES encryption-key migration — dry-run & execution

Safety review confirmed the Phase 32 design: old key used **only to decrypt**, new key only to encrypt; records neither key can authenticate are preserved byte-for-byte; per-record isolation; read-back verification after each write; counts/ids only in all output; CLI defaults to dry-run and refuses writes without `--yes` (live-exercised: missing old secret → exit 1; identical secrets → exit 1; no `--yes` → exit 1).

**Owner-authorized local execution** (explicit written authorization with safeguards; local dev DB only — target re-verified as credential-free `localhost` before every step):

| Step | Evidence |
|---|---|
| Dry-run (new = current local key, old = exposed key) | `scanned=8 withKey=8 reEncrypted=3 alreadyOnNewKey=5 plaintextEncrypted=0 failed=0` |
| Why 3 records | The 3 records (ids `6a3cd154…`, `6a3cd170…`, `6a59cbfd…`; created 2026-06-25/07-17, pre-cleanup) were encrypted under the then-current — now-exposed — key; the other 5 (created 2026-10-07..09) use the current key. The "unparseable" record differs only in its stored `baseUrl`; its ciphertext is a normal `enc:v1:` value |
| Backup before write | All 8 encrypted records (ciphertext + restoration metadata, no plaintext, no key material) written to `%TEMP%\opencode\hathap_local_key_backup.json`, ACL restricted to the owner account, **outside the repo**; read-back validated: count=8, ids match DB, all values `enc:v1:` |
| Execution (`--yes`) | `scanned=8 withKey=8 reEncrypted=3 alreadyOnNewKey=5 plaintextEncrypted=0 failed=0` (exit 0) + built-in post-verify `total=8 decryptable=8 plaintext=0 undecryptable=0` |
| Independent `--verify-only` (current key) | `total=8 decryptable=8 plaintext=0 undecryptable=0`, exit 0 |
| Compare vs backup | 8/8 present, exactly 3 expected ciphertext changes, 0 unexpected changes, 0 missing, 0 extra records |
| Exposed key no longer load-bearing | `--verify-only` under the exposed historical key: `decryptable=0` (8 undecryptable), exit 1 as designed |

- **Production migration:** not applicable — no production database exists; the production runbook (backup → stop app → dry-run → `--yes` → `--verify-only` → switch env → retire old) stands in `docs/SECRET_SCANNING.md`.
- Backup retention: keep until the owner accepts this migration, then securely delete (`icacls` lockdown already applied; delete or shred). Never commit it (it is outside the repository by design).

## 6. GitHub alert #1 & push protection

- **Alert #1 — still OPEN** (API, 2026-10-16): `state=open`, `resolution=null`, `secret_type=mongodb_atlas_db_uri_with_credentials`; open=1, resolved=0 — the only alert ever. The triggering literal no longer exists in source (fixture assembled from fragments at `securityConfig.test.ts:132-135`); dismissal as `false_positive` is a manual owner UI action and was **not** automated.
- **Push protection — VERIFIED ENABLED**: repo metadata `security_and_analysis.secret_scanning_push_protection.status=enabled` (+ `secret_scanning=enabled`, validity checks disabled); push-protection-alerts endpoint returns 0 alerts. This closes the Phase 31/32 "unknown" item.
- Limits: Actions logs, runner artifacts, GitHub-side unreachable-object enumeration beyond the three cited commits, and any mirrors remain uninspectable.

## 7. Production secret provisioning (deployment prerequisites)

Verified against code (nothing deployed; no Dockerfile/PaaS/proxy config exists):

- **Required env:** `NODE_ENV=production` (exact match switches on all production rules), `JWT_SECRET` ≥16 (production refuse-to-start live-verified), `API_KEY_ENCRYPTION_SECRET` ≥32 (refuse-to-start live-verified in every env), `MONGODB_URI` (silent localhost default — must be set), `CORS_ORIGINS` when cross-origin, `TRUST_PROXY` when behind a proxy, recommended `APP_URL`.
- **Storage/injection:** platform secret manager or process env; `server/.env` is git-ignored, local-only, and must never contain production values. Never commit `.env` files; placeholders in `server/.env.example` are public and satisfy only length checks.
- **Uniqueness:** `JWT_SECRET`, `API_KEY_ENCRYPTION_SECRET`, and `MONGODB_URI` credentials must each be independently generated/managed; none may reuse any historical value (Sections 2–3).
- **Verification that no dev fallback is in use:** boot under `NODE_ENV=production` must not print the development-fallback warning; a pre-rotation/foreign token must be rejected; `GET /api/health` after connect; login round-trip. If `JWT_SECRET` were missing the process exits(1) — the fallback secret can never silently serve production.
- **Constraints:** single replica (process-local worker/SSE/rate-limit), graceful SIGINT/SIGTERM shutdown, no `uncaughtException` handler (supervisor must restart), stdout-only logging with credential redaction, health probe `GET /api/health`.

## 8. Validation results (exact commands & outcomes)

| Gate | Command | Result |
|---|---|---|
| Server typecheck | `npx tsc --noEmit` (server) | ✅ exit 0 |
| Server tests | `npm test` (server) | ✅ **534/534** (530 prior + 4 new CLI tests) |
| Server build | `npm run build` | ✅ exit 0 |
| Client lint | `npm run lint` | ✅ exit 0 |
| Client typecheck | `npx tsc --noEmit` + `npm run typecheck:config` | ✅ exit 0 |
| Client tests | `npm test` | ✅ **123/123** (15 files) |
| Client build | `npm run build` | ✅ exit 0 |
| Secret scan (tracked) | `node scripts/secret-scan.cjs` | ✅ 296 sources, **0 errors**, 5 known fixture warnings → PASS |
| Secret scan (history) | `node scripts/secret-scan.cjs --history` | ✅ 1294 sources, **0 errors**, 18 known fixture warnings → PASS |
| CLI refusal paths | missing old secret / identical secrets / missing `--yes` | ✅ exit 1 each, no values echoed |
| CLI dry-run (spawned, test DB) | new regression test | ✅ exit 0, counts correct, record byte-identical afterwards |
| Local migration | dry-run → `--yes` → `--verify-only` → backup compare (Section 5) | ✅ all steps verified; counts recorded |
| Boot guards (dist) | `NODE_ENV=production` × {missing JWT, short JWT, missing AES} | ✅ exit 1 each, no listener opened |
| CI after push | run `38881284343` on `adc101f` | ✅ Server ✓, Client ✓, Secret scan ✓ (conclusion=success) |

Final Git state: `main` == `origin/main`, working tree clean, no force-push, no history rewrite. Baseline `dc44ffb` → Phase 33 commit `adc101f` (+ this CI-evidence follow-up).

## 9. Final production go/no-go decision

🔴 **NO-GO.** Explicit reasons:

1. Historical credential exposure is **confirmed**, and the exposed objects remain retrievable on GitHub until the owner pursues rotation follow-up and (optionally) a GitHub Support purge.
2. Owner actions are open: dismiss alert #1; rotate the old OpenRouter keys if still active; generate fresh production secrets at provisioning.
3. No production environment, TLS, hostname, backups, or deploy descriptor exist (Phase 30 §B/§C unchanged).
4. Engineering completion ≠ incident closure ≠ deployment readiness. The incident stays **OPEN**.

## 10. Remaining owner actions, authorizations & next steps

1. **Dismiss secret-scanning alert #1** as `false_positive` in the GitHub UI (re-verified still open; evidence: Phase 31 §3, Section 6).
2. **Rotate the OpenRouter provider keys** behind local records `6a3cd154…`, `6a3cd170…`, `6a59cbfd…` if still active (OpenRouter dashboard → Keys), then update the model entries.
3. **At production provisioning:** generate fresh `JWT_SECRET` (≥16) and `API_KEY_ENCRYPTION_SECRET` (≥32) from a clean secret manager (never reuse historical values), set `NODE_ENV=production`, and run the Section 4/5 runbooks. **Authorization for any production-side secret change or migration is explicitly not granted by this phase.**
4. **Optional but recommended:** GitHub Support request to permanently purge the unreachable pre-cleanup objects (`46aa067…`, `aeb6930…`, `9a7dbb6…` and blobs `99282f1…`, `2a4a6be…`). Force-push cannot remove unreachable objects.
5. **After accepting the local migration:** securely delete `%TEMP%\opencode\hathap_local_key_backup.json` (ciphertext-only rollback; retention = until acceptance).
6. Re-run the history secret scan after any future history operation.

**Authorization record:** the local AES migration was executed only after explicit owner authorization with ten mandatory safeguards, all of which were followed (local-target verification, pre-write validated backup, code-behavior confirmation, dry-run preservation, post-migration verify, backup comparison, counts-only reporting, backup outside the repo with restricted ACL). No production access, credential rotation, history rewrite, alert dismissal, or deployment was performed or authorized.

**Secret-handling record:** no credential value was printed, committed, transmitted in command arguments, or written to any tracked file at any point. Historical secret values were held only transiently in process memory/environment for hash comparison and the authorized local migration; the only persistent artifact is the ciphertext-only backup outside the repository.
