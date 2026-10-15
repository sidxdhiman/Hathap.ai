# Phase 31 — Credential Exposure Review

**Date:** 2026-10-15 · **Baseline:** `3d6e215` (Phase 30) · **Repository:** `sidxdhiman/Hathap.ai` (public)

## 1. Executive summary & classification

A GitHub credential-leak alert email was investigated end-to-end. Outcome:

| Finding | Classification | Status |
|---|---|---|
| Secret-scanning **alert #1** (`mongodb_atlas_db_uri_with_credentials`) | **False positive** — synthetic test fixture | Source fixed this phase; **alert left open for manual dismissal by the owner** (no GitHub security-state changes were made) |
| Historical **`server/.env`** (JWT secret + AES encryption key, pre-Sep-21.2 history cleanup) | **Probable / unverified historical exposure** | **Unresolved security risk.** Owner rotation actions open; incident is **not** declared closed |

No live credential was found in the worktree or in any commit reachable from local refs. No force-push occurred. No secret values were printed, committed, or transmitted at any point in this phase.

## 2. Alert evidence

- Alert `#1`: `secret_type=mongodb_atlas_db_uri_with_credentials`, provider MongoDB, `state=open`, `validity=unknown`, `publicly_leaked=true`, `push_protection_bypassed=false`, created `2026-10-15T12:40:54Z` — **14 seconds after the Phase 30 push** of `3d6e215`.
- Location: `server/src/tests/securityConfig.test.ts`, line 127, cols 26–77, blob `061409264e…`, commit `3d6e215`.
- Repository secret-scanning alert inventory: **open=1, resolved=0** (only alert ever). No other `secret_type` has ever alerted.
- Push events (last ~90 days, 40 events scanned): **zero force-pushes**.
- Push protection: **status unknown** — push-protection-alerts API returns 404; `security_and_analysis` statuses not readable from the local credential.

## 3. Why alert #1 is a false positive

- The flagged literal was `mongodb+srv://admin:topsecret@ac-abc.mongodb.net/db` — credentials `admin`/`topsecret`, host `ac-abc.mongodb.net`, path `/db`. All synthetic; not a real Atlas cluster.
- `git log -S` shows the literal was introduced by `3d6e215` (Phase 30) as part of a **`redactCredentials` regression test** asserting that userinfo is stripped while host/path stay visible for diagnosis.
- The adjacent fixture in the same suite (`mongodb://user:paaSword@cluster0.example…`) is likewise synthetic. The repo has no MongoDB Atlas deployment; `server/.env` (local, untracked) points at `mongodb://localhost:27017/hathap`.
- Conclusion: provider-pattern match on a deliberate, documented test fixture. Remedy = remove the pattern-matching literal (done), then dismiss the alert (owner action).

## 4. Historical `server/.env` — probable, unverified exposure

- `AUDIT_PHASE11.md` and `POST_PHASE10_AUDIT.md` state as fact that a tracked `server/.env` (JWT secret + AES encryption key) was removed in a **September 21 history cleanup** (tag `pre-phase12-credential-history-cleanup` → `ed493df`, local-only, never pushed per `git ls-remote`).
- `server/.env` appears in **no commit reachable from any local ref**; the pre-cleanup SHAs cited by the audit docs (`46aa067`, `aeb6930`, `9a7dbb6`) are **missing from the object database**; the local reflog begins at the cleanup; commit search cannot see rewritten-away commits. All consistent with a rewrite (`git filter-repo`-style).
- Whether the pre-cleanup commits ever reached GitHub is **not verifiable from this machine**.
- **Absence of a secret-scanning alert is not evidence the credentials were never exposed.** Treated as probable/unverified historical exposure with open rotation actions (Section 10). No history rewrite, force-push, or rotation was performed.

## 5. Evidence examined

- GitHub API (read-only, stored git credential): alert #1 full record + locations (value/snippet fields redacted before display), resolved-alerts list, push-protection endpoints, push events.
- Git: `git log --all`, `log -S`, `log --follow`, `ls-remote`, reflog, tags, `rev-list --objects --all` + `fsck` unreachable/dangling (4 unreachable WIP commits and 4 unreachable blobs from Sep 24/30 — all benign).
- Worktree + full history secret sweep: 464 worktree files, 1510 history blobs (1509 scanned), 1041 candidate findings — **zero** hits for GitHub tokens, AWS/Google/Slack/Stripe keys, or PEM blocks. Every high-tier candidate was a placeholder (`replace_this…`), documented fake (`ci-local-test-…`), dev-only fallback (`DEV_FALLBACK_JWT_SECRET='secret'`), or test fixture.
- Local `server/.env` (untracked): values fingerprinted (length/entropy/prefix only); neither fingerprint appears anywhere in history.
- Application config paths: `server/src/config/security.ts`, `server/src/index.ts`, `server/.env.example`, `.github/workflows/ci.yml`, README production contract.

## 6. Limits of the investigation

- GitHub-side unreachable objects (pre-rewrite commits if ever pushed) cannot be enumerated from here; the old `server/.env` content, if it exists anywhere, was never retrieved or displayed.
- Actions logs, runner artifacts, and any third-party mirrors were not and cannot be inspected (no retention access; nothing is deployed).
- Push protection on/off could not be determined (API unavailable).
- The local scanner added this phase is a heuristic backstop with documented false-negative allowances (see `docs/SECRET_SCANNING.md` → Scope & limitations); GitHub provider-aware scanning remains the primary detector.

## 7. Remediation implemented

- `server/src/tests/securityConfig.test.ts:125` — the Atlas-shaped fixture is now **assembled from string fragments at runtime**; the exact scanner-triggering literal no longer appears in source or generated artifacts (verified: no match anywhere in the worktree outside `node_modules`/`.git`, including rebuilt `server/dist`). Assertions preserved and strengthened (equality with redacted form + username/password absence + host/path preservation).
- `DEPLOYMENT_CHECKLIST.md` — new authoritative **Phase 31** section: alert classification, historical-exposure record, owner action items.
- `docs/SECRET_SCANNING.md` — standing procedures: local scanning, alert triage, credential rotation, blast-radius notes.
- **No** credential was rotated, revoked, or rewritten; **no** git history was rewritten; **no** GitHub security state was changed.

## 8. Recurrence prevention

- `scripts/secret-scan.cjs` — dependency-free scanner (Node stdlib, CommonJS): hard rules (provider-format tokens, PEM blocks) always fail; partner rules (credentialed URIs, JWTs, bearer tokens, secret-shaped assignments) fail outside test fixtures and downgrade to warnings inside them; placeholder/code-expression/env-name heuristics; tracked-path name rules (`.env`, `*.pem`, `id_rsa*`, …); sha256-fingerprint allowlist (`scripts/secret-scan.allowlist.json`, currently empty); **matched values are never printed** — findings carry fingerprint + length only. `--history` scans every reachable blob.
- `.github/workflows/ci.yml` — new first job **`secret-scan`** runs the scanner on every push/PR.
- `server/src/tests/repoSecretHygiene.test.ts` — registered in `npm test` (hence in the server CI job): unit-tests detection/escalation/redaction guarantees and spawns a repo-wide scan asserting `0 error(s)`.

## 9. Validation

| Gate | Result |
|---|---|
| `node scripts/secret-scan.cjs` (tracked files) | PASS — 0 errors, 4 fixture warnings |
| `node scripts/secret-scan.cjs --history` (1267 sources) | PASS — 0 errors |
| Server `tsc --noEmit` | clean |
| Server `npm test` | **515/515 pass** (514 prior + 4 new hygiene tests incl. the repo-wide gate; one intermediate red run fixed a scanner regex gap for whole-key matches like `SIGNING_KEY`) |
| Server `npm run build` | clean |
| Client lint / `tsc --noEmit` / `typecheck:config` | clean (0 warnings) |
| Client `npm test` | **123/123 pass** |
| Client `npm run build` | clean |
| Triggering literal absent from worktree + rebuilt artifacts | verified, zero matches |
| CI after push | see commit/CI note below |

## 10. Outstanding owner actions (incident NOT closed)

1. **Dismiss GitHub secret-scanning alert #1** as `false_positive` (evidence: Section 3). Phase 31 intentionally made no GitHub security-state changes.
2. **Rotate `JWT_SECRET`** (probable historical exposure; Section 4) — replaces the signing secret; all existing sessions/JWTs become invalid; verify an auth round-trip afterwards.
3. **Rotate `API_KEY_ENCRYPTION_SECRET` only with a re-encryption plan** — blind rotation makes stored model API keys undecryptable. Sequence: inventory encrypted fields → maintenance-window re-encrypt script → swap env → migrate → verify every stored key decrypts → retire the old key. Keep open until done and verified.
4. **Consider enabling push protection** (current status unverifiable; Section 2).
5. Re-run `node scripts/secret-scan.cjs --history` after any future history operation.

Replacement credential values must never be requested, printed, stored in chat, or committed — update them only through the deployment environment/secret manager.
