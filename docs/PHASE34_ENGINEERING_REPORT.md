# Phase 34 — Production Secret Provisioning & Final Release Gate

**Date:** 2026-10-19 · **Baseline:** `0b9cc4f` (Phase 33) · **Repository:** `sidxdhiman/Hathap.ai` (public)

## 1. Executive summary & decision

| Item | Result |
|---|---|
| **Production readiness decision** | 🔴 **NO-GO** — owner/platform blockers remain (OpenRouter key verification, production secret provisioning, platform decisions, alert #1). Full list: §11 |
| Owner-action reconciliation | All 8 Phase 33 items re-audited with fresh evidence (§2). One closed this phase (backup deletion, owner-authorized); six remain open/blocked; one verified complete |
| Contract delivered | Platform-neutral **production secret-management contract** written (`docs/PRODUCTION_SECRET_CONTRACT.md`): full env inventory, enforcement, generation/injection/rotation rules, build-vs-runtime split, 10 open platform decisions |
| Hardening shipped | Last silent development fallback closed: production now **refuses to start without an explicit `MONGODB_URI`** (`resolveMongoUri`), in both `index.ts` and the rotation CLI; 5 new regression tests |
| Backup | **Deleted** (owner-accepted with 9 safeguards; all pre-deletion checks passed; deletion + limitations recorded in §8) |
| GitHub security state changed? | **No.** Read-only API inspection only; alert #1 left open for the owner; no history rewrite; no force-push; no settings change |
| Deployment / production secret change? | **None.** No deployment, no production migration, no production secret generated or modified |
| Security incident status | **OPEN** — local containment stands (Phase 33); production rotations pending at provisioning; provider-key verification is an owner action |

Baseline verified before work: `main == origin/main == 0b9cc4ffa62dc1308bab204c2ba82dc4fb8de839`, clean tree; CI runs `38881284343`/`38882089755` on the Phase 33 commits both `conclusion=success` (API, 2026-10-19).

## 2. Owner-action reconciliation (evidence, 2026-10-19)

| # | Item | Status | Evidence |
|---|---|---|---|
| 1 | Rotate/revoke the 3 OpenRouter keys (records `6a3cd154…`, `6a3cd170…`, `6a59cbfd…`) | **Owner action required** | §3 — no authorized provider access exists here; keys must never be probed from shell commands |
| 2 | Dismiss GitHub alert #1 as `false_positive` | **Owner action required (still OPEN)** | API 2026-10-19: `state=open`, `resolution=null`, `updated_at=2026-10-15`, open=1, resolved=0 — still the only alert ever |
| 3 | Fresh production `JWT_SECRET` | **Blocked on platform choice** | No hosting/secret manager exists to provision into (no Dockerfile/PaaS/proxy descriptor in tree). Guards live-verified (Phase 33): production missing/short → exit 1 before `listen`. Contract: `docs/PRODUCTION_SECRET_CONTRACT.md` |
| 4 | Fresh production `API_KEY_ENCRYPTION_SECRET` | **Blocked on platform choice** | Same as #3; ≥32 guard verified in every env; AES rotation requires the migration CLI runbook, never a bare swap |
| 5 | Production encrypted records / AES provenance | **No production data exists (verified by evidence); owner attestation outstanding** | Verified: nothing ever deployed (no platform descriptor anywhere in the tree; CI databases are ephemeral service containers); no remote `MONGODB_URI` in any tracked file, `.env.example`, or scanned git history (1302 history sources, 0 findings); the only database ever re-keyed was the local dev DB (Phase 33). Residual uncertainty: a database the owner keeps **outside this repository's visibility** cannot be enumerated from here — owner attestation required before go-live |
| 6 | GitHub push protection | **Verified complete** | API 2026-10-19: `secret_scanning=enabled`, `secret_scanning_push_protection=enabled`; 0 open push-protection alerts (second consecutive verified phase; was "unknown" in 31–32) |
| 7 | Phase 33 local migration backup | **Deleted this phase (owner-accepted)** | §8 |
| 8 | GitHub Support purge of unreachable objects | **Not implemented (optional owner action)** | No evidence a request was ever made (none can be created from this environment). Pre-cleanup commits `46aa067…`, `aeb6930…`, `9a7dbb6…` and `server/.env` blobs remain retrievable by SHA (Phase 33) |

## 3. OpenRouter key containment

- **What is known:** the three local `Model` records (created 2026-06-25/07-17) held provider keys encrypted with AES-256-GCM under the historically exposed key until Phase 33's migration. Ciphertext lived **only in the local MongoDB** — never in git (tracked/history scans: 0 findings). Using them required both the ciphertext and the exposed key (which was in git) **plus** a database copy.
- **Whether the keys are still active cannot be determined from this environment:** there is no authorized OpenRouter console/API access here, and testing a credential from a shell command is prohibited (argv exposure, unauthorized probing). Leaving this unverified is the honest status; it keeps the release gate closed (§11).
- **Owner steps (exact):** OpenRouter dashboard → Keys → look for keys created ≈ 2026-06-25 and ≈ 2026-07-17 (the three records' creation window) → delete or regenerate any that are still active → update the corresponding model entries in Hathap (Models → edit → new key) so future calls use the replacement. Replacement keys: never printed, never committed, never passed as command arguments. If rotation already happened, record it in `DEPLOYMENT_CHECKLIST.md` §B1 with a dashboard-side confirmation (without the key value).

## 4. Production secret-management contract

Delivered as `docs/PRODUCTION_SECRET_CONTRACT.md` (authoritative; README and checklist now point to it). Built entirely from the implementation, not invented:

- **Complete inventory** of every server runtime variable and the client's build-time `VITE_API_URL`, each with its actual enforcement (which guard, what minimum, what happens on failure).
- **Generation rules:** independent CSPRNG values per secret in the platform's secret manager; never any historical value; never generated/echoed via shell argv.
- **Injection:** process environment of the single server process (the app has no vault SDK/file support); `server/.env` is dev-only and must not exist in production; `.env.example` placeholders are public.
- **Instance/worker model:** single replica by construction (process-local worker/SSE/rate-limit); no separate worker to provision.
- **Dev-fallback prevention:** all fallbacks now fail closed under `NODE_ENV=production` (JWT, AES, and — new this phase — `MONGODB_URI`); post-provisioning verification checklist included.
- **Rotation/recovery without exposure:** JWT (env swap + restart, sessions invalidated) and AES (backup → stop app → dry-run → `--yes` → `--verify-only` → switch → retire) runbooks; log redaction; CLI counts-only output.
- **Build vs runtime:** server secrets runtime-only (`dist/` is pure `tsc` output, contains no env values); client API origin baked at build.
- **10 unresolved platform decisions** (hosting + secret manager, TLS/hostname/CORS topology, proxy hops, MongoDB + backups, supervision/health wiring, logs/alerting, client pipeline, A2A exposure, model-provider keys, replica count) — the concrete list blocking provisioning.

## 5. JWT provisioning & verification

- Implementation unchanged and re-verified: HS256 pinned; `getJwtSecret()` re-reads env per call (rotation semantics); production refuses missing/<16-char secrets at boot and at every sign/verify (regression tests: `securityConfig.test.ts`, `credentialRotation.test.ts`).
- **This phase's verification (from `dist`):** production boot with valid AES+JWT and **missing `MONGODB_URI`** → `FATAL: MONGODB_URI must be set…`, exit 1, no listener (ordering: AES guard → JWT guard → MONGODB guard, preserving Phase 33's guard evidence). Production boot with an explicit (unreachable) `MONGODB_URI` → guard passes, controlled connect failure, exit 1.
- **Correct behavior across instances:** single-replica by construction — all instances (one) receive the same env; there is no multi-instance path to misconfigure.
- **Token rejection after provisioning:** a token minted under any other secret fails verification (unit-tested: "refuses a signature credential signed with a different secret"); a pre-rotation/foreign token must be rejected in the real environment (owner verification step in the contract §5).
- **Production rotation was NOT performed** — no production environment exists. The operator procedure stands in the contract §6; claiming completion would be false.

## 6. AES key provenance, migration requirements, data-integrity risks

- **Key format/enforcement:** scrypt(secret, fixed salt) → AES-256-GCM; ≥32-char secret enforced at boot (every env) and per call; ciphertext format `enc:v1:` (no key identifier).
- **Production encrypted records:** none exist (§2 #5 evidence). Therefore no production migration is required today. If the owner attests to an external database, its provenance must be established before any go-live, and if its records were ever encrypted under the exposed historical key, the Phase 32/33 migration runbook (backup → dry-run → `--yes` → `--verify-only`) applies under authorization — **never** inferred from the local dev migration.
- **Data-integrity risk closed this phase (tooling):** the rotation CLI silently defaulted to `mongodb://localhost:27017/hathap` when `MONGODB_URI` was unset — in a production rotation window that could have targeted the wrong database. It now uses the same `resolveMongoUri` resolver as the server (production: refuse; development: localhost default).
- **Never discard the old key** while any data may depend on it — encoded in the runbook and the CLI's `--verify-only` gate.

## 7. GitHub alert & push-protection status

- **Alert #1: still open** (`state=open`, `resolution=null`, only alert ever; §2 #2). Owner dismissal as `false_positive` remains outstanding; no phase automates it.
- **Push protection: enabled** (+ secret scanning enabled; 0 push-protection alerts). Verified via API both this phase and Phase 33.
- Limits restated: a zero-error scan proves the current tree/history are clean of detectable secrets — it does **not** prove previously exposed credentials were never accessed. Unreachable pre-cleanup objects remain retrievable by SHA; force-push cannot remove them; optional GitHub Support purge is an owner action (§2 #8).

## 8. Temporary backup — retention, verification, deletion

Owner accepted the Phase 33 migration and authorized deletion with nine safeguards; all were executed (2026-10-19):

| Step | Evidence |
|---|---|
| 1. Backup identity | `%TEMP%\opencode\hathap_local_key_backup.json` exists, 3571 B, mtime 2026-10-16 (Phase 33), parses as JSON, structure `{createdAt, purpose, recordCount, records}`; `purpose` = "Phase 33 local AES key migration rollback (local dev DB, ciphertext only)"; `recordCount`=8; the 8 record ids match Phase 33's list (`6a3cd154…`…`6ac89fb2…`); all 8 stored `apiKey` values start with `enc:v1:` (ciphertext-only — no plaintext, no key material). Structure-only inspection; no value was printed |
| 2. Target verification | Local `MONGODB_URI` re-parsed: `mongodb://localhost:27017`, `userinfo_present=false` — local dev only |
| 3. Decryption health | `npm run rotate:api-keys -- --verify-only` → `total=8 decryptable=8 plaintext=0 undecryptable=0`, exit 0 — all records decrypt under the current local key |
| 4. Backup-vs-DB comparison | Temporary counts-only script (deleted after use): `backup_records=8 db_records=8 present=8 identical=5 changed=3 missing=0 extra=0` → PASS — exactly the 3 expected migrations, 0 unexpected, 0 missing |
| 5. Deletion | `Remove-Item -Force` on the exact verified file only (parent directory untouched); helper script also removed |
| 6. Post-deletion check | `Test-Path` → **false** |
| 7. Honest limitation | Ordinary file deletion does **not** guarantee physical erasure on SSDs, copy-on-write filesystems, or volumes with snapshots/backups. Residual risk accepted by the owner: content was ciphertext-only and the encryption key is not stored in the file |

## 9. Tests, builds, scans, CI

| Gate | Command | Result |
|---|---|---|
| Server typecheck | `npx tsc --noEmit` (server) | ✅ exit 0 |
| Server tests | `npm test` (server) | ✅ **539/539** (534 prior + 5 new `resolveMongoUri` tests) |
| Server build | `npm run build` | ✅ exit 0 |
| Boot guard (dist, new) | production + valid AES/JWT + **missing `MONGODB_URI`** | ✅ `FATAL: MONGODB_URI must be set…`, exit 1, no listener |
| Boot guard (dist, control) | production + valid AES/JWT + unreachable `MONGODB_URI` | ✅ guard passes; controlled connect failure, exit 1 |
| Client lint | `npm run lint` | ✅ exit 0 |
| Client typecheck | `npx tsc --noEmit` + `npm run typecheck:config` | ✅ exit 0 |
| Client tests | `npm test` | ✅ **123/123** (15 files) |
| Client build | `npm run build` | ✅ exit 0 |
| Secret scan (tracked) | `node scripts/secret-scan.cjs` | ✅ 297 sources, **0 errors**, 5 known fixture warnings → PASS |
| Secret scan (history) | `node scripts/secret-scan.cjs --history` | ✅ 1302 sources, **0 errors**, 18 known fixture warnings → PASS |
| CI after push | recorded in the final-state update below | (see §12) |

## 10. Final production GO/NO-GO decision

🔴 **NO-GO.** Explicit reasons:

1. Potentially active exposed provider keys cannot be verified from this environment (§3) — an open owner action.
2. Production secrets (`JWT_SECRET`, `API_KEY_ENCRYPTION_SECRET`) cannot be provisioned: no platform/secret manager exists (§4, §2 #3/#4).
3. AES-key provenance is established for everything visible from this repository, but an external-database attestation is outstanding (§2 #5).
4. Alert #1 is still open; the optional GitHub Support purge is undone (§2 #2/#8).
5. Hosting, TLS/hostname, proxy, backups, supervision and the other platform decisions (§4) remain open — mandatory deployment prerequisites, none implementable from the repository alone.

Engineering completion ≠ incident closure ≠ deployment readiness. **The incident stays OPEN.**

## 11. Remaining blockers — owner, exact next action

| # | Blocker | Owner | Exact next action |
|---|---|---|---|
| 1 | OpenRouter keys behind records `6a3cd154…`, `6a3cd170…`, `6a59cbfd…` unverified | Repo owner | OpenRouter dashboard → Keys → check keys created ≈2026-06-25/07-17 → delete/regenerate if active → update model entries; record confirmation in the checklist (§3) |
| 2 | GitHub alert #1 open | Repo owner | GitHub UI → Security → Secret scanning → alert #1 → dismiss as `false_positive` |
| 3 | Production secrets not provisioned | Repo owner (after platform choice) | Choose platform + secret manager → generate fresh `JWT_SECRET` (≥16) and `API_KEY_ENCRYPTION_SECRET` (≥32) in the manager → set `NODE_ENV=production` + explicit `MONGODB_URI` → run contract §5 verification |
| 4 | Platform undecided (hosting, TLS, proxy, MongoDB, backups, supervision, client pipeline, A2A, replica count) | Repo owner | Work the 10-item decision list in `docs/PRODUCTION_SECRET_CONTRACT.md` §9 |
| 5 | External-database attestation | Repo owner | Confirm in writing that no production/external database exists (or disclose it so provenance can be established) |
| 6 | Unreachable pre-cleanup git objects (optional) | Repo owner | Optional GitHub Support request citing commits `46aa067…`, `aeb6930…`, `9a7dbb6…` and blobs `99282f1…`, `2a4a6be…` |

## 12. Git state

- Phase 34 commit: `security: phase 34 production secret contract, MONGODB_URI production guard, and final release gate` (hash recorded in the repository history; CI run verified on push — see `git log` / Actions).
- No force-push, no history rewrite, no deployment, no production secret change, no GitHub security-state change.
- **Secret-handling record:** no credential value was printed, committed, transmitted in command arguments, or written to any tracked file. Backup verification was structure/count-only; the deleted backup was ciphertext-only. The local dev `MONGODB_URI` was inspected for scheme/host/userinfo-presence only.
