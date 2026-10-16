# Phase 32 — Credential Rotation & Production Security Gate

**Date:** 2026-10-16 · **Baseline:** `689dadc` (Phase 31) · **Repository:** `sidxdhiman/Hathap.ai` (public)

## 1. Executive summary & decision

| Item | Result |
|---|---|
| **Production readiness decision** | 🔴 **NO-GO** — five blockers remain open (Section 10) |
| Credential rotation executed? | **No.** Procedures documented and tooling designed/tested only; no rotation, revocation, or live migration was performed |
| GitHub security state changed? | **No.** Read-only inspection only; no alert dismissal, no push-protection change, no force-push |
| Security incident status | **OPEN** — historical `server/.env` exposure remains *probable/unverified* (classification unchanged from Phase 31) |
| Code changes | Minimal, justified: injectable encryption key (backward-compatible), new migration service, operator CLI, 15 new regression tests |

The phase delivered a **safe, dry-run-first credential-rotation runbook**, a **tested AES key-migration tool**, and an **evidence-based production gate**. Nothing destructive was executed.

## 2. Security state audit — JWT

Evidence: `server/src/utils/authToken.ts`, `server/src/config/security.ts`, `server/src/index.ts`.

- **Algorithm:** HS256 only; `verifyAuthToken` pins `ALLOWED_ALGORITHMS` — no algorithm-confusion surface (`none`, RS→HS downgrade rejected).
- **Secret resolution:** `getJwtSecret()` re-reads the environment on every call (no module-load caching) → an in-process env swap takes effect for newly signed/verified tokens without restart semantics surprises; production (`NODE_ENV=production` exact match) refuses a missing or `<16`-char secret at startup (`index.ts` guard) and at sign/verify time.
- **Rotation mechanics:** single shared secret, no `kid`/key-rollover header. Rollout = change `JWT_SECRET` → all existing tokens fail → all users re-login. Per-user immediate invalidation exists independently via `User.authVersion` (`av` claim) — password change / "sign out everywhere" bumps it and every older token is rejected on the next request.
- **TTL:** 7 days fixed. Recorded as a hardening candidate (shorter access + refresh split), out of scope to change this phase.

## 3. Security state audit — AES API-key encryption

Evidence: `server/src/utils/encryption.ts`, `server/src/services/modelService.ts`, `server/src/models/Model.ts`.

- **Construction:** `scrypt(secret, salt=hathap-api-key-v1, 32)` → AES-256-GCM; 12-byte random IV; 16-byte auth tag; wire format `enc:v1:` + base64url(`iv‖tag‖ciphertext`).
- **Authentication:** GCM tag verified on decrypt — tampering and truncation raise and are covered by tests.
- **Hazards identified (pre-existing):**
  1. **Format version, no key identifier.** `v1` says "how it was encrypted", not "with which key" — a new-key record and an old-key record are indistinguishable by shape.
  2. **`encryptApiKey` is idempotent** on already-`enc:v1:` input (returns it unchanged). Swapping `API_KEY_ENCRYPTION_SECRET` in env **without** migrating stored records silently commits every `Model.apiKey` to the *old* key while the app can only decrypt with the *new* one → **permanent loss of provider credentials** (they must be re-entered manually).
  3. **Plaintext passthrough:** legacy records without the `enc:v1:` prefix are returned as-is, so a stolen DB yields some keys in cleartext. Migration tooling now classifies them (0 found locally — Section 8).
- **Storage:** `Model.apiKey` in MongoDB; `GET /api/models` opportunistically runs `migratePlainTextApiKeys(userId)` (encrypt-in-place, same key). Unchanged this phase.

## 4. Credential rotation procedures (documented, not executed)

Added to `DEPLOYMENT_CHECKLIST.md` (Phase 32 §B) and `docs/SECRET_SCANNING.md` (rotation table):

- **JWT secret rotation:** set new `JWT_SECRET` → deploy/restart → all sessions invalidated → users re-login (announce first). Rollback = restore old value (old tokens become valid again). No stored data depends on the JWT secret, so this is env-only and data-safe.
- **AES encryption-key rotation (two-step, mandatory):** (1) set `API_KEY_ENCRYPTION_SECRET=<new>` **and** `API_KEY_ENCRYPTION_SECRET_OLD=<current>` in the environment (app now decrypts with new-first, old-fallback); (2) run the migration CLI `--dry-run`, review counts, then re-run with `--yes` to re-encrypt every record under the new key; (3) only after the CLI reports 0 remaining old-key records, remove `…_OLD`. Skipping step 2 is the data-loss hazard from Section 3.
- **Ordering:** AES migration first (data-dependent), JWT rotation second (session-only) — or both during a maintenance window with user notice.
- **Historical exposure rotation (owner, production):** rotate Atlas password, GitHub PAT, and any credential that lived in the old `server/.env`, in that order, before go-live.

## 5. AES key-migration tooling

New files (all tested):

- **`server/src/utils/encryption.ts` (modified):** `deriveEncryptionKey()` exported; `encryptApiKey`/`decryptApiKey` accept an optional explicit key (`string | Buffer`); default env-driven behavior is byte-identical to before (regression-covered).
- **`server/src/services/encryptionKeyMigration.ts`:** `reencryptStoredValue` (try new key → fall back to old key → if neither decrypts, **throw and leave the record untouched** — never overwrites a record it cannot read); `migrateModelApiKeys({oldSecret,newSecret,dryRun,persist})` (per-record isolation, counts + `_id`s only — never key material; read-back verification after every write; typed `failed[]` classes `undecryptable-with-both-keys`/`persist-failed`/`verify-failed` for resume); `verifyModelApiKeys(secret)`; a `PersistableRecord` seam so tests run without a live collection.
- **`server/src/scripts/rotateApiKeyEncryption.ts`:** operator CLI registered in `server/package.json`. Defaults to **`--dry-run`**; writes require explicit `--yes`; `--verify-only` performs a pure read-only decrypt survey; env inputs `API_KEY_ENCRYPTION_SECRET` (new) + `API_KEY_ENCRYPTION_SECRET_OLD` (old); refuses to start without the old secret (exit 1 — exercised in a test); output is counts/ids only.

## 6. Evidence examined

- Full reads of the JWT/AES paths listed in Sections 2–3 plus `routes/models.ts`, `models/User.ts` (`authVersion`), CI workflow, and test-DB wiring (`mongodb://localhost:27017/hathap_test*`).
- GitHub API read-only via stored git credential (values never printed): `/secret-scanning/alerts`, `/secret-scanning/alerts/1`, `/rate_limit`, repo meta, `actions/permissions`, CI job logs.
- **Local dev database** surveyed read-only with the new `--verify-only` CLI: 8 records hold keys; **5 decrypt** under the current local secret; **0 plaintext**; **3 undecryptable** (`modelId=6a3cd15452ca7f541d506e89`, `6a3cd17052ca7f541d506e8f`, `6a59cbfd51ed856c50632bbe`) — live proof the orphaned-record hazard is real. Records preserved; local dev data only, nothing deployed.
- CI: run `38753193043` (Phase 31 baseline) completed/success — Server ✓, Client ✓, Secret scan ✓.

## 7. Limits of the investigation

- **Alert #1 status could not be re-verified this phase:** `/secret-scanning/alerts` and `/alerts/1` both now return **404** while `/rate_limit` (200) and repo meta (200) succeed — rate-limit/repo-meta work, so this is a permission or availability difference, not a blanket auth failure. Phase 31 last observed the alert **open**; current status is **unverifiable via API** and must be confirmed in the GitHub UI (owner action).
- **Push protection still unverifiable:** `security_and_analysis` empty; `actions/permissions` and CI job logs return **403** (admin required). Prior phase: unknown.
- GitHub-side objects, Actions logs, and mirrors remain uninspectable (same limits as Phase 31 §6).
- The local scanner is a heuristic backstop; GitHub provider-aware scanning remains the primary detector (`docs/SECRET_SCANNING.md` → Scope & limitations).
- The 3 undecryptable local records cannot be attributed from here (forgotten local secret vs. copied prod ciphertext); classification is out of scope.

## 8. Changes implemented

| File | Change |
|---|---|
| `server/src/utils/encryption.ts` | Key-injection seam (`EncryptionKeyInput`, `deriveEncryptionKey`, optional key params); default behavior unchanged |
| `server/src/services/encryptionKeyMigration.ts` | **New** — classification, dry-run, resume-safe persist, read-back verification |
| `server/src/scripts/rotateApiKeyEncryption.ts` | **New** — operator CLI (`--dry-run` default, `--yes` to write, `--verify-only`) |
| `server/src/tests/credentialRotation.test.ts` | **New** — 15 tests (JWT rotation/revocation/production-refusal; AES round-trip/wrong-key/tamper/truncation/idempotency-hazard/plaintext; migration dry-run/real/idempotent re-run/persist-failure-resume/verify) |
| `server/package.json` | Test script registers the new suite |
| `DEPLOYMENT_CHECKLIST.md` | Phase 32 section: verified state table, operator runbooks, five blockers, 🔴 NO-GO |
| `README.md` | Credential-rotation subsection; secret-scan CI bullet; rotation cell no longer claims "no tool" |
| `docs/SECRET_SCANNING.md` | Rotation table now points at the migration CLI; owner actions updated for the API-404 limitation |

**Not changed:** JWT code, auth routes, model routes, DB schemas, CI workflow, scanner rules. No secret values were printed, copied, or committed; no rotation/migration was executed against anything but read-only local verification.

## 9. Validation

| Gate | Command | Result |
|---|---|---|
| Server typecheck | `npx tsc --noEmit` (server) | ✅ exit 0 |
| Server tests | `npm test` (server) | ✅ **530/530** (515 prior + 15 new) |
| Server build | `npm run build` | ✅ exit 0 |
| Client lint | `npm run lint` | ✅ exit 0 |
| Client typecheck | `npm run typecheck:config` + `tsc` | ✅ exit 0 |
| Client tests | `npm test` | ✅ **123/123** |
| Client build | `npm run build` | ✅ exit 0 |
| Secret scan (tracked) | `node scripts/secret-scan.cjs` | ✅ 292 sources, **0 errors**, 5 fixture warnings → PASS |
| Secret scan (history) | `node scripts/secret-scan.cjs --history` | ✅ 1281 sources, **0 errors**, 18 fixture warnings → PASS |
| CLI refusal path | migration CLI without `…_OLD` | ✅ exit 1, no writes |
| CLI read-only survey | `--verify-only` on local dev DB | ✅ counts only (8/5/0/3), no mutation |

All warnings are the known placeholder fixtures in `tests/`/`*.test.*` (Phase 31 rules). Diff reviewed line-by-line: no secret material in any staged change.

## 10. Production go/no-go & outstanding owner actions

🔴 **NO-GO.** Blockers, in recommended order:

1. **Rotate historical-exposure credentials** (probable/unverified `server/.env`: Atlas password, GitHub PAT, any co-stored secret) — the incident cannot close until done.
2. **Verify secret-scanning alert #1 in the GitHub UI** (API returned 404 this phase) and dismiss it if still open — it is the documented Phase 31 false positive.
3. **Enable push protection** (repo is public; status unverifiable with current credential — requires admin).
4. **Rotate production `JWT_SECRET` and `API_KEY_ENCRYPTION_SECRET`** from a clean secret manager using the Section 4 runbooks — **never** swap the AES secret without running the migration CLI first (idempotent-encrypt data-loss hazard, Section 3).
5. **Provision production-grade secrets** (`NODE_ENV=production` startup guard will refuse weak/missing values — intentional).

Standing constraints maintained: security incident **OPEN**; classification unchanged; no rotation executed; no GitHub security state changed; no history rewrite or force-push; no secret ever printed or committed.
