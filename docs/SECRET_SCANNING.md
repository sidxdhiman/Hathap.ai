# Secret scanning & credential hygiene (Phase 31)

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

| Credential | Procedure | Blast radius |
|---|---|---|
| `JWT_SECRET` | Generate ≥64 random chars; replace the env value; restart; re-login and verify an auth round-trip | All existing sessions/JWTs become invalid; users must re-authenticate |
| `API_KEY_ENCRYPTION_SECRET` | **Do not rotate without a re-encryption plan.** Steps: (1) inventory encrypted fields (`server/src/config/…` AES usage), (2) one-off maintenance-window script that decrypts with the old key and re-encrypts with the new, (3) swap env, (4) run migration, (5) verify decryption of every stored provider key, (6) retire the old key | Blind rotation = stored model API keys become permanently unreadable. Until migration tooling exists, rotation means losing encrypted provider keys |
| `MONGODB_URI` | Atlas: rotate the DB user password (or create a new user), update env, restart, verify health endpoint + one DB write path | Existing URI breaks once rotated; single-instance repo, restart is sufficient |
| `A2A_API_KEY`, `BRAVE_SEARCH_API_KEY` | Standard env replacement + restart + verify the dependent path (`/api/a2a/*`, research provider mode) | A2A peers / Brave queries fail until updated on both sides |

## Open owner actions (Phase 31)

- [ ] **Dismiss GitHub secret-scanning alert #1** as `false_positive` after
  reviewing this phase's fix (left open intentionally; Phase 31 made no GitHub
  security-state changes).
- [ ] **Rotate the historical `JWT_SECRET` and `API_KEY_ENCRYPTION_SECRET`**
  (probable pre-Phase-12.2 exposure; see the Phase 31 report). Blocked on a
  re-encryption plan for the AES key.
- [ ] **Consider enabling push protection** (not verifiable from this repo;
  the push-protection-alerts API is unavailable, so whether pushes are blocked
  today is unknown).
