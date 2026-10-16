# Secret scanning & credential hygiene (Phase 31; owner actions updated Phase 33)

Added after GitHub secret-scanning **alert #1** (`secret_type=mongodb_atlas_db_uri_with_credentials`,
created 2026-10-15T12:40:54Z, 14 seconds after the Phase 30 push) matched a
**synthetic test fixture** in `server/src/tests/securityConfig.test.ts`. This
document is the standing procedure for local scanning, alert triage, and
credential rotation. Full incident narrative: `docs/PHASE31_ENGINEERING_REPORT.md`.

## What runs automatically

| Gate | Where | Command |
|---|---|---|
| CI job `secret-scan` | `.github/workflows/ci.yml` (first job) | `node scripts/secret-scan.cjs` |
| Regression test | `server/src/tests/repoSecretHygiene.test.ts` (part of `npm test`, runs in the server CI job) | spawns the scanner; asserts `0 error(s)` |

## Running locally

```bash
node scripts/secret-scan.cjs            # tracked files (what CI runs)
node scripts/secret-scan.cjs --history  # every reachable blob in git history
```

Exit code 1 iff there is at least one **error-tier** finding. Findings are
printed as `file:line [rule] fingerprint=<sha256-prefix> length=<n>` — the
scanner never prints the matched value, so its own output cannot leak a
credential into a terminal, log, or CI transcript.

The scanner is dependency-free (Node stdlib only, CommonJS, no install step).

## Classification tiers

- **Hard rules** (`github-token`, `aws-access-key-id`, `google-api-key`,
  `slack-token`, `private-key-block`, `stripe-live-secret`): always **error**,
  in any path.
- **Partner rules** (`credentialed-uri`, `jwt`, `bearer-credential`,
  `openai-style-key`, `stripe-test-secret`, `env-secret-assignment`): **error**
  in normal paths, downgraded to **warning** in test-fixture paths
  (`tests/…`, `*.test.*`, `*.spec.*`), where synthetic values are expected.
- **Skipped by heuristic** (never reported): values containing placeholder
  markers (`replace`, `example`, `test`, `secret`, `user`, `password`,
  `localhost`, …), code expressions (`process.env…`, `f(…)`, `${…}`), and
  env-var-name literals (`'BRAVE_SEARCH_API_KEY'`).
- **Name rules**: tracked paths such as `.env`, `*.pem`, `id_rsa*`,
  `credentials.json` are always errors.
- **Allowlist**: `scripts/secret-scan.allowlist.json` — entries are
  `{ "rule", "fingerprint", "reason" }`. Fingerprints are sha256 prefixes;
  never store the value itself.

## Scope & honest limitations

- It is a **heuristic backstop**, not a replacement for GitHub's provider-aware
  secret scanning. Concretely: the Phase 31 false-positive literal
  (`…:topsecret@….mongodb.net/…`) contains the marker word `secret` and is
  therefore skipped by the placeholder heuristic — GitHub's detector caught it,
  this scanner deliberately would not. Do not treat a local PASS as proof that
  no secret-shaped literal exists.
- It does not scan: unreachable/purged git objects, GitHub Actions logs,
  container images, or local untracked files (`.env` is untracked by design).
- `--history` covers every blob reachable from local refs, which after the
  Phase 12.2 history cleanup is the post-cleanup history only.

## Alert triage procedure (executed for alert #1)

1. Open the alert location (file, line, commit). **Never print the flagged
   value** into chat, logs, or commits.
2. Inspect with structure-only analysis: length, entropy, placeholder markers,
   line context (`git log -S <prefix>` for introduction commit).
3. Classify:
   - **False positive** (synthetic/test/placeholder, provable from source):
     restructure the offending literal so the pattern no longer matches (e.g.
     assemble URIs from fragments at runtime), keep equivalent assertions, then
     dismiss the GitHub alert as `false_positive` with the evidence.
   - **Live credential**: treat as an incident — rotate FIRST, then remove the
     literal, then decide on any history rewrite only with explicit owner
     authorization (this repo does not rewrite history or force-push).
4. Record the outcome in the phase report and `DEPLOYMENT_CHECKLIST.md`.

## Rotation procedures (owner-run; never commit replacement values)

Phase 32 added validated tooling for the AES rotation; procedures are also
summarized in `DEPLOYMENT_CHECKLIST.md` → Phase 32 with evidence in
`docs/PHASE32_ENGINEERING_REPORT.md`. **No production rotation has been
executed** (nothing is deployed). Phase 33 executed the AES re-keying of the
local dev database off the exposed historical key only — see
`docs/PHASE33_ENGINEERING_REPORT.md`. The CLI is runnable as
`npm run rotate:api-keys -- --dry-run` (or via `ts-node`/`dist`) from `server/`.

| Credential | Procedure | Blast radius |
|---|---|---|
| `JWT_SECRET` | Generate ≥16 random chars; replace the env value on the deployment platform; restart; verify a login round-trip and confirm an old (pre-rotation) token is rejected. Rollback = restore the previous value + restart. Single signing secret: all replicas must switch together (this repo is single-replica) | All existing sessions/JWTs become invalid; users must re-authenticate. Covered by `server/src/tests/credentialRotation.test.ts` |
| `API_KEY_ENCRYPTION_SECRET` | Use the migration tool — never swap the value alone. (1) `mongodump` backup; (2) **stop the app**; (3) `npm run rotate:api-keys -- --dry-run` with the new secret in `API_KEY_ENCRYPTION_SECRET` and the old one in `API_KEY_ENCRYPTION_SECRET_OLD`; (4) re-run with `--yes`; (5) `--verify-only` until `plaintext=0` and undecryptable matches only pre-existing failures; (6) switch the platform env to the NEW value, start, verify a model call; (7) retire the OLD secret only after step 6 succeeds | Blind rotation = stored model API keys permanently unreadable. Records neither key can decrypt are reported by id and never overwritten. A running instance still holds the OLD key — migrating while it runs would make re-keyed records unreadable to it |
| `MONGODB_URI` | Atlas: rotate the DB user password (or create a new user), update env, restart, verify health endpoint + one DB write path. *(Phase 33 evidence: no Atlas credential ever lived in the historical `server/.env` — its URI was a credential-free localhost address)* | Existing URI breaks once rotated; single-instance repo, restart is sufficient |
| `A2A_API_KEY`, `BRAVE_SEARCH_API_KEY` | Standard env replacement + restart + verify the dependent path (`/api/a2a/*`, research provider mode). *(Neither key was present in the historical `server/.env` — Phase 33 verified by key enumeration)* | A2A peers / Brave queries fail until updated on both sides |
| Model provider keys (OpenRouter et al.) | Regenerate in the provider console if their ciphertext was ever encrypted under an exposed encryption key (Phase 33: local records `6a3cd154…`/`6a3cd170…`/`6a59cbfd…` were, until the local migration) | Provider-side key abuse; ciphertext alone requires a DB copy to exploit |

## Open owner actions (updated Phase 33)

- [ ] **Dismiss GitHub secret-scanning alert #1** as `false_positive` after
  reviewing the Phase 31 fix. Phase 33 re-verified via API (2026-10-16): the
  alert is **still open** (`state=open`, no resolution). No phase has changed
  any GitHub security state — dismissal is a manual UI action
  (Security → Secret scanning).
- [x] **Push protection** — Phase 33 verified via repo metadata that
  `secret_scanning_push_protection.status=enabled` (and secret scanning
  itself enabled; 0 push-protection alerts). Status was unknown in Phases
  31–32.
- [ ] **Historical `server/.env` exposure** — Phase 33 **confirmed** the
  pre-cleanup commits (`46aa067…`, `aeb6930…`, `9a7dbb6…`) and their
  `server/.env` blobs are still retrievable on GitHub by SHA. The exposed
  values are the old app `JWT_SECRET` and `API_KEY_ENCRYPTION_SECRET` (no
  Atlas/GitHub/Brave credential was ever in the file). Local containment is
  done (current local secrets differ; local DB re-keyed off the exposed
  AES key). Owner remains: rotate/regenerate anything at production
  provisioning, rotate the old OpenRouter provider keys if still active, and
  optionally ask GitHub Support to purge the unreachable objects.
- [ ] Re-run `node scripts/secret-scan.cjs --history` after any future
  history operation.
