# Production Secret-Management Contract (Phase 34)

**Status:** authoritative for production secret provisioning. Supersedes the
secret-handling guidance scattered across `README.md` (Phase 30 contract),
`DEPLOYMENT_CHECKLIST.md` (Phase 32–34) and `docs/SECRET_SCANNING.md` where
they overlap. Everything below is derived from the actual implementation
(`server/src/index.ts`, `server/src/config/security.ts`,
`server/src/utils/encryption.ts`, `server/src/utils/authToken.ts`,
`server/src/scripts/rotateApiKeyEncryption.ts`, `server/.env.example`,
`client/src/api/client.ts`) — no invented variable names or requirements.

**Scope limit:** nothing is deployed from this repository. There is no
Dockerfile, PaaS descriptor, reverse-proxy config, or production hostname in
the tree. This contract is therefore platform-neutral: it specifies *what the
application requires and enforces*, and lists the platform decisions still
needed before launch (§9).

---

## 1. Complete environment inventory

### 1.1 Server (runtime; read via `process.env`, `dotenv.config()` from the
process working directory)

| Variable | Minimum | Enforcement in code | Production status |
|---|---|---|---|
| `NODE_ENV=production` | exact string `production` (trimmed, case-insensitive) | Switches on every production rule (JWT enforcement, deny-by-default CORS, generic client errors, MONGODB_URI guard). Unset ⇒ silent development behavior + boot warning | **Required** |
| `JWT_SECRET` | ≥ 16 chars | Boot guard exits(1) before `listen`; `getJwtSecret()` re-checks on every sign/verify call (HS256 pinned) | **Required** |
| `API_KEY_ENCRYPTION_SECRET` | ≥ 32 chars | Boot guard exits(1) in *every* environment; `deriveEncryptionKey()` re-checks per call; AES-256-GCM at-rest key for stored model-provider credentials | **Required** |
| `MONGODB_URI` | explicit connection string | **Phase 34:** production exits(1) when unset/blank (`resolveMongoUri` in `config/security.ts`) — the previous silent `mongodb://localhost:27017/hathap` fallback is development-only now. Connection failure exits(1) after driver timeout; userinfo is redacted from driver error logs | **Required** |
| `PORT` | default `4000` | `app.listen(PORT)`, binds all interfaces; no `HOST` variable exists | Optional |
| `CORS_ORIGINS` | comma-separated origins | Required when client and API differ by origin; production reflects no browser origin when unset (deny-by-default; `Host` is never trusted) | Required for split-origin |
| `TRUST_PROXY` | hop count / `loopback` / … | Required behind a proxy (otherwise the auth rate limiter collapses to one site-wide bucket); unset on an internet-facing socket is the secure default | Topology-dependent |
| `APP_URL` | public origin | Sent upstream as `HTTP-Referer`; default `http://localhost:5173` | Recommended |
| `A2A_BASE_URL` | public API origin | Published in the A2A agent card; default `http://localhost:4000` | If A2A exposed |
| `A2A_API_KEY` + `A2A_DEFAULT_USER_ID` | both or neither | Service auth path for A2A; header ignored unless both set | Optional |
| `BRAVE_SEARCH_API_KEY` | provider key | Real web research only with a key; misconfiguration fails when a research task runs, not at boot | Optional |
| `HATHAP_RESEARCH_PROVIDER` | `auto`\|`brave`\|`mock`\|`duckduckgo` | Provider pinning; default `auto` | Optional |
| `MODEL_URL_ALLOWLIST` | exact base URLs | Only for deliberately private providers (e.g. local Ollama); unset ⇒ SSRF guard blocks all private destinations | Optional |
| `OPENAI_API_KEY` | provider key | Fallback key for stored models with no key of their own | Optional |
| `API_KEY_ENCRYPTION_SECRET_OLD` | ≥ 32 chars | Rotation-CLI input only (old key for re-encryption); never a server runtime variable | Rotation window only |

### 1.2 Client (build time)

| Variable | Enforcement | Notes |
|---|---|---|
| `VITE_API_URL` | Baked into the bundle at `vite build` | Unset ⇒ relative `/api/…` (same-origin/proxy topology). Changing the API origin requires a client rebuild+redeploy. No secret ever belongs in a `VITE_*` variable — the bundle is public |

## 2. Secret generation rules

- `JWT_SECRET`: generate in the platform's secret manager, ≥ 16 random chars
  (e.g. `openssl rand -base64 48` → 64 chars). **Must never be any historical
  value** — the confirmed-exposed development value was 9 chars
  (`docs/PHASE33_ENGINEERING_REPORT.md` §3); anything with that provenance is
  permanently tainted.
- `API_KEY_ENCRYPTION_SECRET`: ≥ 32 random chars from a CSPRNG, generated in
  the secret manager. Same no-historical-reuse rule (exposed value was 36
  chars).
- `A2A_API_KEY` (if used): independently generated random; shares no root with
  the above.
- `MONGODB_URI` database credentials: provisioned and rotated by the database
  platform; never reuses credentials from any other system.
- Each secret is **independently generated** — no shared entropy, no derived
  siblings, no “one master secret for everything”.
- Generation never happens in a shell command line that would land in shell
  history or `ps` output: generate inside the secret manager UI/CLI or with
  the value redirected straight into the manager, never as a visible argv.

## 3. Storage and injection

- **Secrets live only in the platform's secret manager** (or equivalent
  platform env store) and are injected as **process environment variables**
  into the single server instance at start. The application reads
  `process.env` directly; there is no vault SDK, no remote config client, and
  no key file support — process env is the entire injection surface.
- `server/.env` is git-ignored, local-development-only, and must never exist
  on a production host. `dotenv.config()` will silently load it if present —
  production platforms must inject env directly and ship no `.env` file.
- `server/.env.example` is tracked and public: its placeholders satisfy length
  checks only and carry no real entropy. CI's secret scan
  (`scripts/secret-scan.cjs`) enforces that no real-looking secret enters the
  tree.
- **Never** put secret values in: repository files, commits, CI logs/workflow
  inputs, command-line arguments, Docker build args/layers, client bundles, or
  error messages. The rotation CLI deliberately prints counts/ids only;
  driver error logs redact `scheme://user:pass@` userinfo.

## 4. Instance, worker and replica requirements

- The server is **single-replica by construction** (README, Phase 30): the
  task worker, SSE event bus, scheduler and rate-limit store are all
  process-local. Exactly one server process receives the environment; that
  one process is also the worker. There is no separate worker process to
  provision.
- Every required variable (§1.1) must be present in *that* process's
  environment at start — the platform's env is the single source of truth.
- Horizontal scaling remains unsupported until worker/SSE/rate-limit move to
  shared infrastructure (open deployment decision).

## 5. Preventing development fallbacks in production

All development fallbacks now fail closed under `NODE_ENV=production`
(live-verified from `dist`, Phase 33/34):

| Fallback | Development | Production |
|---|---|---|
| `JWT_SECRET` unset | non-secret value `secret` + warning | **exit(1)** before `listen` (missing or <16) |
| `API_KEY_ENCRYPTION_SECRET` unset/short | exit(1) | exit(1) |
| `MONGODB_URI` unset | `mongodb://localhost:27017/hathap` | **exit(1)** (Phase 34 hardening) |
| CORS unknown browser origin | Vite dev origins allowed | denied (no reflection) |
| `NODE_ENV` unset | development behavior + boot warning | — (set it explicitly) |

Post-provisioning verification checklist (owner, on the real environment):

1. Boot log shows **no** `[config] NODE_ENV is not set` warning and **no**
   development-JWT-fallback warning.
2. `GET /api/health` returns `200 {"ok":true}` after connect.
3. A token minted before provisioning (or under any historical secret) is
   rejected; a fresh login round-trip succeeds.
4. A deliberate stop with `JWT_SECRET` removed fails with `FATAL` + exit 1
   (proves the guard is live in the deployed artifact, not just in CI).

## 6. Rotation and recovery (no value exposure at any step)

- **`JWT_SECRET`:** change the value in the secret manager → restart →
  every outstanding token is invalid (single secret, no `kid`; 7-day TTL;
  per-user `authVersion` unaffected) → announce forced re-login. Rollback =
  restore the previous value + restart. Never print either value; rotate from
  the manager's UI/CLI, not shell exports.
- **`API_KEY_ENCRYPTION_SECRET`:** never swap the value alone — stored model
  keys become permanently unreadable. Run the migration CLI
  (`server/src/scripts/rotateApiKeyEncryption.ts`, registered as
  `npm run rotate:api-keys`) **with the app stopped**: `--dry-run` → `--yes`
  → `--verify-only` (must report `undecryptable=0 plaintext=0`), after a
  verified `mongodump` backup. Old key retired only after the app has run
  successfully on the new key. Undecryptable records are preserved, never
  destroyed. In production the CLI now refuses a missing `MONGODB_URI`
  (Phase 34) so it can never silently target the development database.
- **`MONGODB_URI` credentials:** rotate inside the database platform, then
  restart the app with the new URI. No application-side migration involved.
- Recovery: the mongodump backup is the AES-rotation recovery path; JWT
  rollback is the previous env value. Neither requires printing a secret.

## 7. Build time vs runtime

| Concern | When | Where |
|---|---|---|
| Server secrets (`JWT_SECRET`, `API_KEY_ENCRYPTION_SECRET`, `MONGODB_URI`, …) | **Runtime** | Secret manager → process env at start. Never compiled in; `dist/` contains no env values (build is pure `tsc`) |
| Client API origin (`VITE_API_URL`) | **Build time** | Baked into the public bundle; rebuild to change |
| Node version (20), lockfiles | Build/provision | `.nvmrc`, `package-lock.json` per workspace |
| `NODE_ENV` | Runtime | Must be set in the deployment environment, not baked |

## 8. Logging and exposure hygiene

- Startup/unhandled/middleware error logs pass through `redactCredentials`
  (strips `scheme://user:pass@` userinfo from any logged text).
- Production client-facing errors are generic (`serverErrorMessage`);
  detail is server-log-only.
- Secret-scanning CI (tracked + `--history`) runs on every push and fails on
  any high-entropy candidate outside the reviewed fixtures; push protection
  is enabled server-side as a second gate. A clean scan does **not** prove an
  old credential was never accessed — it only proves the current tree is
  clean.

## 9. Unresolved platform decisions (blocks concrete provisioning)

The contract above is platform-neutral. Before any of it can be executed, the
owner must decide:

1. **Hosting platform** and its secret-manager (which injects env into the
   single server process) — nothing in the repo targets Fly/Render/AWS/GCP/
   Azure/K8s/etc.
2. **TLS termination, hostname/DNS**, and the resulting `CORS_ORIGINS` /
   `APP_URL` values; same-origin vs split-origin topology (decides whether
   `VITE_API_URL` is needed at all).
3. **Reverse-proxy hops** (`TRUST_PROXY` value) or none.
4. **MongoDB provisioning** (self-hosted vs Atlas), backup schedule
   (`mongodump`), retention, and a restore drill.
5. **Process supervision** — restart-on-crash is mandatory (no
   `uncaughtException` handler); health-check wiring to `GET /api/health`.
6. **Log aggregation/retention** and alerting.
7. **Client hosting** and the build pipeline that bakes `VITE_API_URL`.
8. **A2A exposure** decision (internet-facing or internal) and, if exposed,
   `A2A_API_KEY` provisioning.
9. **Model-provider keys** for production use (OpenRouter or other) —
   provisioned fresh, stored through the UI/API so they are AES-encrypted at
   rest under the production key.
10. **Replica count** — must remain 1 until multi-replica work lands.

Until decisions 1–5 are made and the owner provisions the §2 secrets in the
chosen manager, production secret provisioning is **blocked**, and the
release gate in `DEPLOYMENT_CHECKLIST.md` stays **NO-GO**.
