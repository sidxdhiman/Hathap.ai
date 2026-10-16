# Hathap.AI - Debate & Collaboration Platform

A modern web application for creating debate rooms ("Courtrooms") where multiple AI agents and AI models collaborate, debate, and reach consensus on complex topics.

## 🎯 Features

### Core Functionality
- **Authentication**: JWT-based signup/login with per-user data scoping, server-side credential invalidation (logout, password change, account deletion), a single client request/credential layer with centralized 401 sign-out, password change, data export, and account deletion
- **Dashboard**: Overview with statistics and recent courtrooms
- **Models Management**: Connect and manage AI models from multiple providers. A custom model's base URL is untrusted input that makes the *server* dial a socket, so it is validated on save and again on every request: `http`/`https` only, no embedded credentials, no query string or fragment, and a destination that must resolve to public address space (loopback, private, link-local/cloud-metadata and other special-purpose ranges are refused, redirect targets are re-checked, and the connection is pinned to the address that was validated). Operators running a provider on a private address must opt in explicitly with `MODEL_URL_ALLOWLIST` (see `server/.env.example`); with it unset, no private destination is reachable.
- **Agent Templates**: Create reusable AI agent personas with custom prompts
- **Courtroom Creation**: Set up debate rooms with specific objectives
- **Debate Visualization**: Real-time threaded debate discussion
- **Consensus Panel**: Track agreements, disagreements, and recommendations
- **Multiple Debate Modes**: Consensus, Majority Vote, Devil's Advocate, Judge Mode, Open Debate

### Supported Model Providers
- OpenAI (GPT series)
- Anthropic (Claude)
- Google Gemini
- DeepSeek
- Ollama (local)
- Any OpenAI-compatible API

### Agent Types
- Senior Architect
- Security Engineer
- Product Manager
- Startup CTO
- Devil's Advocate
- Performance Expert
- Custom user-defined agents

## 🛠️ Tech Stack

- **Frontend**: React 18.2
- **Language**: TypeScript
- **Styling**: Tailwind CSS 3.4
- **UI Components**: Custom with shadcn/ui patterns
- **Icons**: Lucide React
- **Routing**: React Router v6
- **Build Tool**: Vite 5
- **State Management**: React Context API

## 🧠 Decision Intelligence Architecture

Hathap is evolving from a multi-agent debate app into an AI **Decision Intelligence
platform**. Phase 1 introduces a persistent, observable Decision/Execution/Task
foundation alongside the existing Courtroom flow. See
[`docs/DECISION_ARCHITECTURE.md`](docs/DECISION_ARCHITECTURE.md) for the full
architecture, state machines, entity definitions, and migration strategy.

- **Decision** → a first-class decision problem with status/phase
- **Execution** → a persistent, recoverable run of a Decision
- **Task** → an executable unit of work within an Execution
- **Claim** → structured statements (fact/assumption/opinion/inference/…)
- **Evidence** → a clean abstraction for future sources (web, PDF, GitHub, …)
- **`/api/decisions`** → new REST surface; the Courtroom API remains backward-compatible

## 📁 Project Structure

```
Hathap.ai/
├── client/                 # Frontend React application
│   ├── src/
│   │   ├── components/
│   │   │   ├── layout/    # Header, Layout components
│   │   │   └── ui/        # Reusable UI components
│   │   ├── context/       # React Context for state management
│   │   ├── data/          # Mock data
│   │   ├── pages/         # Page components
│   │   ├── types/         # TypeScript type definitions
│   │   ├── utils/         # Helper functions
│   │   ├── App.tsx        # Main app with routing
│   │   ├── main.tsx       # Entry point
│   │   └── index.css      # Global styles
│   ├── package.json       # Frontend dependencies
│   ├── vite.config.ts     # Vite configuration
│   └── tsconfig.json      # TypeScript config
│
└── server/                 # Backend Node.js + Express API
    ├── src/
    │   ├── a2a/           # Agent-to-Agent protocol
    │   ├── engine/        # Debate engine and AI logic
    │   ├── middleware/    # Express middleware
    │   ├── models/        # MongoDB schemas
    │   ├── routes/        # API routes
    │   ├── services/      # Business logic
    │   ├── utils/         # Helper functions
    │   └── index.ts       # Server entry point
    ├── package.json       # Backend dependencies
    └── tsconfig.json      # TypeScript config
```

## 🚀 Getting Started

### Prerequisites
- Node.js 20 (LTS) — pinned in `.nvmrc` at the repository root
- npm or yarn
- MongoDB (local or Atlas, needed to run the server)

### Installation

> There is **no root `package.json`**: running `npm install` in the repository
> root installs nothing. `client/` and `server/` are independent workspaces and
> each has to be installed on its own. On Windows, `install.bat` at the
> repository root does both.

1. Clone the repository:
```bash
git clone <repository-url>
cd Hathap.ai
```

2. Install frontend dependencies:
```bash
cd client
npm install
```

3. Install backend dependencies:
```bash
cd ../server
npm install
```

4. Configure environment variables:
```bash
# In server directory
cp .env.example .env
# Edit .env with your MongoDB URI, JWT secret, and encryption secret
#
# Two values are load-bearing — the server refuses to start without them:
#   JWT_SECRET                >= 16 characters (required when NODE_ENV=production)
#   API_KEY_ENCRYPTION_SECRET >= 32 characters, always
# `.env.example` ships placeholders that already satisfy both.
#
# Web-grounded research (Phase 11): add a Brave Developer API key to go real, e.g.
#   BRAVE_SEARCH_API_KEY=BSA_xxxxxxxxxxxxxxxxxxxx
#   HATHAP_RESEARCH_PROVIDER=brave        # 'auto' (default) also works once the key is set
# Without a key, research runs in explicit mock mode (+ a one-click web-grounded
# demo route at POST /api/research/demo returns setup instructions, never silent
# placeholder data). See docs/PHASE11_ENGINEERING_REPORT.md.
```

5. Add a model on the Models page (API key, base URL) so agents have something
   to call.

   Model base URLs must resolve to public address space — loopback, RFC1918,
   link-local and other special-purpose ranges are refused by default. The
   shipped **"Ollama (local)"** preset points at `http://localhost:11434/v1`,
   which is exactly such a destination, so using it requires an explicit
   operator opt-in in `server/.env`:
```bash
MODEL_URL_ALLOWLIST=http://localhost:11434/v1
```
   The value is a comma-separated list of exact base URLs (see
   `server/.env.example`); leave it unset to keep every private destination
   unreachable.

6. Start the development servers:

**Backend (from server directory):**
```bash
npm run dev
```
Server will run on `http://localhost:4000`

**Frontend (from client directory):**
```bash
npm run dev
```
Frontend will run on `http://localhost:5173`

### First-run checklist

1. Open `http://localhost:5173` and sign up — every new account is seeded with
   10 ready-made agents, so you are never starting from an empty roster.
2. **Models → Add model**: paste a provider key and base URL (see the
   `MODEL_URL_ALLOWLIST` note above for local providers). Runs need at least
   one *enabled* model; without one every task fails with
   `No models configured or enabled`.
3. **Decisions → New decision → Start**: you do not pick participants — a
   decision with no panel automatically debates with your own agent roster
   (capped by its configured agent limit), and the resolved panel is saved
   onto the decision.
4. **Courtrooms**: create a courtroom, add at least one participant, then
   Start. The Start button stays disabled until there is a participant and an
   enabled model.
5. **Evaluations → Seed benchmark → New run → Execute**: the seeded benchmark
   runs against your decision engine with no provider configuration of its
   own. A failed run keeps the reason on each case result
   (`GET /api/evaluations/runs/:id/results`).

### Build for Production

**Frontend:**
```bash
cd client
npm run build
```
The optimized build will be in the `client/dist` directory.

**Backend:**
```bash
cd server
npm run build
```
The compiled build will be in the `server/dist` directory.

## 🚀 Production Configuration Contract (Phase 30)

Everything below is read from the implementation (`server/src/index.ts`,
`server/src/config/security.ts`, `server/src/utils/encryption.ts`,
`server/src/research/researchConfig.ts`, `client/src/api/client.ts`,
`server/.env.example`). It states what the code enforces — not what any
particular host does. No deployment has been performed from this repository:
there is still no Dockerfile, compose file, PaaS descriptor, reverse-proxy
config or production hostname in the tree.

### Runtime, build and start

| Requirement | Value | Verified in |
|---|---|---|
| Node.js | 20 (LTS), pinned in `.nvmrc` (root); CI reads it via `node-version-file` | `.nvmrc`, `.github/workflows/ci.yml` |
| Install | `npm ci` in each of `server/` and `client/` (each has its own lockfile; there is no root `package.json`) | `README` above, CI |
| Server build | `cd server && npm run build` → `server/dist` (git-ignored) | `server/package.json` |
| Server start | `cd server && npm start` → `node dist/index.js` | `server/package.json` |
| `.env` location | `dotenv.config()` loads from the **process working directory**, so start the server from `server/` | `server/src/index.ts` |
| Client build | `cd client && npm run build` (`tsc && vite build`) → `client/dist`; `VITE_API_URL` is baked in at build time | `client/package.json` |

### Required environment variables

| Variable | Required | What the code actually does |
|---|---|---|
| `NODE_ENV=production` | **Required** (not enforced) | Exact-string match switches on every production rule. Unset ⇒ silently development: fallback JWT secret allowed, dev CORS origins allowed, raw error messages returned to clients. The server now prints a boot warning when it is unset (`index.ts`). |
| `JWT_SECRET` (≥ 16 chars) | Required in production | Server exits(1) at boot if missing or short when `NODE_ENV=production`. Development falls back to a non-secret value with a warning. |
| `API_KEY_ENCRYPTION_SECRET` (≥ 32 chars) | Required in **every** environment | Server exits(1) at boot; AES-256-GCM key derivation also re-checks per call. **Changing it later makes every stored model key undecryptable unless they are migrated first** — rotation requires the migration tool (see Credential rotation below). |
| `MONGODB_URI` | Required in practice | Silent default `mongodb://localhost:27017/hathap`; a connect failure exits(1) after the driver timeout. Format is not validated at boot. |
| `PORT` | Optional (default `4000`) | `app.listen(PORT)` with **no host argument** — it binds all interfaces. There is no `HOST` variable. |
| `CORS_ORIGINS` | Required when client and API are on different origins | Comma-separated allow-list. Production reflects **no** browser origin when unset; requests without an `Origin` header are always allowed. No credentials header is ever emitted. |
| `TRUST_PROXY` | Required **behind** a reverse proxy | Opt-in hop count (`1`), `true/false`, `loopback`/`linklocal`/`uniquelocal`; unset ⇒ `X-Forwarded-For` ignored (secure default). Unset behind a proxy collapses the auth rate limiter (30 req/15 min) into one site-wide bucket. |
| `APP_URL` | Recommended | Public origin sent upstream as `HTTP-Referer`; defaults to `http://localhost:5173`. |
| `A2A_BASE_URL` | Recommended if the A2A surface is exposed | Published in the agent card and logged at boot; defaults to `http://localhost:4000`. |
| `A2A_API_KEY` + `A2A_DEFAULT_USER_ID` | Optional | Service auth for A2A; both must be set or the header is ignored. |
| `BRAVE_SEARCH_API_KEY`, `HATHAP_RESEARCH_PROVIDER` | Optional | Default `auto`: real research only with a key, otherwise an explicitly labeled mock. A production misconfiguration fails when a research task runs, **not** at boot. |
| `MODEL_URL_ALLOWLIST` | Optional | Opt-in list of exact base URLs that may be private addresses (SSRF guard); unset ⇒ no private destination reachable. |
| `OPENAI_API_KEY` | Optional | Fallback provider key for stored models that have no key of their own. |
| Client: `VITE_API_URL` | Optional | Baked in at build time. Unset ⇒ relative `/api/…` on the SPA's own origin (same-origin topology or reverse proxy required). Must not include an `/api` suffix. |

Secret generation: any strong random value, e.g. `openssl rand -base64 48` for
`JWT_SECRET` and a 32+ character random string for
`API_KEY_ENCRYPTION_SECRET`. Placeholders in `server/.env.example` satisfy the
length checks but are public — replace them. Never commit real values
(`server/.env` is git-ignored).

### Credential rotation (Phase 32)

Both rotation procedures are documented with evidence in
[`DEPLOYMENT_CHECKLIST.md`](DEPLOYMENT_CHECKLIST.md) → Phase 32 and
[`docs/PHASE32_ENGINEERING_REPORT.md`](docs/PHASE32_ENGINEERING_REPORT.md).
Neither has been executed against any environment — both are pending owner
action.

- **`JWT_SECRET`:** replace the value in the deployment environment and
  restart. There is a single signing secret (no key rollover, no `kid`), so
  rotation **invalidates every outstanding token** and all users re-auth.
  All replicas must receive the same value together (this repo is
  single-replica). Rollback = restore the previous value and restart — tokens
  signed under it become valid again. Regression coverage:
  `server/src/tests/credentialRotation.test.ts`.
- **`API_KEY_ENCRYPTION_SECRET`:** never swap the value alone — stored model
  keys would become permanently unreadable. With the app **stopped**, run
  `server/src/scripts/rotateApiKeyEncryption.ts`
  (`--dry-run` → `--yes` → `--verify-only`) with the new secret in
  `API_KEY_ENCRYPTION_SECRET` and the old one in
  `API_KEY_ENCRYPTION_SECRET_OLD`, after taking a database backup. Only after
  `--verify-only` reports `undecryptable=0 plaintext=0` may the deployment
  environment switch to the new value and the old secret be retired.

### Startup, health, shutdown

- Boot order: env guards (`API_KEY_ENCRYPTION_SECRET`, then `JWT_SECRET` in
  production) → MongoDB connect → background worker start → routes →
  `GET /api/health` → listen. Any guard or connect failure logs and exits(1);
  the health route exists only after a successful connect, and the process does
  not listen before then.
- `GET /api/health` → `200 {"ok":true}`, unauthenticated, un-rate-limited —
  use it as the platform health check.
- Shutdown: on `SIGINT`/`SIGTERM` the server stops accepting connections,
  lets in-flight worker tasks drain (≤ 10 s), disconnects from MongoDB, and
  exits 0. There is **no** `uncaughtException` handler: an uncaught exception
  terminates the process (Node's default) and the platform must restart it.
  `unhandledRejection` is logged and does **not** crash the process.
- **Single-replica constraint:** the task worker, the SSE event bus and the
  rate-limit store are all process-local. Running more than one API replica
  without external coordination will double-execute work and break live event
  delivery.

### Logging and error responses

- In production, client-facing errors are the generic message from
  `serverErrorMessage` (`utils/httpError.ts`); the detail is logged
  server-side only. Development passes the real message through.
- Startup-failure, unhandled-rejection and middleware-error logs redact
  `scheme://user:pass@` credentials (Phase 30), so a malformed `MONGODB_URI`
  cannot print a connection-string password into the log stream.
- Some deliberate 400 validation responses echo the validator's own message;
  these are caller-input echoes, not internal state.

### What this contract does not cover

Hosting platform, TLS termination, DNS, backups, log aggregation and the
SPA/API topology are **not** defined by this repository. See
[`DEPLOYMENT_CHECKLIST.md`](DEPLOYMENT_CHECKLIST.md) for the readiness
checklist and [`docs/AUTHENTICATION_ARCHITECTURE.md`](docs/AUTHENTICATION_ARCHITECTURE.md)
§4.4 for the topology decision record that gates the HttpOnly cookie migration.

## 🔧 Development & CI (Reproducible Verification)

The repository is verifiable from a clean checkout. The GitHub Actions workflow at
`.github/workflows/ci.yml` runs the exact commands below on every push to `main` and
every pull request targeting `main`.

### Node version

- Node.js **20 (LTS)** — pinned in `.nvmrc` at the repository root.
- CI (`actions/setup-node@v4`) reads `.nvmrc` via `node-version-file`, so CI and local
  development stay in sync.

### Clean install

Both `server/` and `client/` ship their own `package-lock.json`. Use `npm ci` (not
`npm install`) for reproducible installs:

```bash
cd server
npm ci

cd ../client
npm ci
```

### Environment variables

- Copy `server/.env.example` to `server/.env` and fill in real values locally.
- `server/.env` is local-only and git-ignored — never commit it.
- `.env.example` is the tracked template (placeholders only, safe to commit).
- Minimum variables:
  - `MONGODB_URI` — MongoDB connection string (default `mongodb://localhost:27017/hathap`)
  - `JWT_SECRET` — strong random value (>= 16 chars) for auth signing; required in production
  - `API_KEY_ENCRYPTION_SECRET` — >= 32 chars for AES-256-GCM at-rest encryption
  - Optional: `CORS_ORIGINS`, `BRAVE_SEARCH_API_KEY`, `HATHAP_RESEARCH_PROVIDER`
- The server test suite runs against `mongodb://localhost:27017/hathap_test*` databases
  in deterministic mock mode; tests do not require real provider API keys.

### Run / verify

```bash
# Server (from server/)
npm run dev          # dev server on http://localhost:4000
npm test             # full test suite (requires local MongoDB)
npx tsc --noEmit     # typecheck
npm run build        # build server/dist

# Client (from client/)
npm run dev          # dev server on http://localhost:5173
npm run lint         # ESLint (fails on any warning)
npm test             # Vitest unit/component tests (jsdom, no backend/network needed)
npx tsc --noEmit     # typecheck application source (src)
npm run typecheck:config  # typecheck Vite build config (vite.config.ts via tsconfig.node-check.json)
npm run build        # build client/dist
```

### What CI checks

- **Server job** (`npm ci`, `npx tsc --noEmit`, `npm test`, `npm run build`), with a
  MongoDB service container so tests need no external database.
- **Client job** (`npm ci`, `npm run lint`, `npm test`, `npx tsc --noEmit`,
  `npm run typecheck:config`, `npm run build`) — both the application source project
  (`tsconfig.json`) and the Vite build-config project (`tsconfig.node.json` /
  `vite.config.ts`) are typechecked separately.
- **Secret-scan job** (`node scripts/secret-scan.cjs`) — dependency-free scan of
  every tracked file for credential-shaped material. Findings are printed as
  `file:line [rule] fingerprint=… length=…` — matched values are never printed.
  The same scanner is enforced inside the server test suite
  (`repoSecretHygiene.test.ts`) and supports `--history` for git-history scans
  (see [`docs/SECRET_SCANNING.md`](docs/SECRET_SCANNING.md)).
- CI uses fake/test-only values only; no real credentials are stored in the workflow or
  required to pass.

### Security audit

`npm audit` is not a CI gate by design: several findings only resolve through
semver-major upgrades of build/test tooling, so a blocking audit gate would
fail required CI against an intentional, documented dependency state. Current
measured state (Phase 30, re-run in this repository):

- **Server: 3 high, 0 critical.** All three are the same chain —
  `ts-node-dev` → `chokidar` → `braces@3.0.3`
  ([GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm),
  stack-exhaustion DoS through deeply nested patterns). npm reports
  **no fix available** (no patched `braces` is published). Verified exposure:
  `npm ls braces --omit=dev` is empty — the chain exists only under
  `devDependencies`, is loaded only by `npm run dev`, and the production
  start path (`node dist/index.js`) loads none of these modules. Attack
  condition is a local development machine watching attacker-shaped file
  patterns. **Disposition: deferred** until a patched `braces` ships or the
  dev runner is replaced; re-check on every dependency change. (The earlier
  `proxy-addr` critical was remediated in Phase 28.)
- **Client: 21 findings (6 moderate, 13 high, 2 critical)**, all in
  development/build/test tooling: `tailwindcss`/`@typescript-eslint` chains
  (`braces`, `minimatch`, `fast-glob`, `postcss-selector-parser`),
  `vite`/`esbuild` (dev-server request smuggling), `react-router` (fixed only
  in v7), and `vitest`'s `tinypool`/`@vitest/mocker` (test-runner only).
  None of these packages are imported by application source, so none are
  bundled into `client/dist`; the shipped artifact is static HTML/JS/CSS.
  Phase 30 removed the one safely fixable high (`source-map-js`, in-range
  lockfile update, 22 → 21). The remaining findings need semver-major
  upgrades (Vite 8, Tailwind 4, React Router 7, Vitest 5, ESLint-serializer
  majors) and are **deferred with acceptance**, not marked harmless — they
  are real advisories whose exposure is currently build/test-time on trusted
  code.

Run `npm audit` in `client/` and `server/` whenever dependencies are touched
and review the output against [`docs/SECURITY_AUDIT_REPORT.md`](docs/SECURITY_AUDIT_REPORT.md).

### Authentication and sessions

Authentication is a stateless HS256 JWT (claims `{ id, av }`, 7-day expiry) sent by
the browser as `Authorization: Bearer <token>` and read from `localStorage`.

**Server-side credential invalidation is implemented (Phase 17).** A signature-valid
JWT is not sufficient to authenticate: every request additionally resolves the
account and checks the credential's `av` claim against a per-user `User.authVersion`
counter. Consequences:

- `POST /api/auth/logout` exists and increments that counter, so signing out ends
  the session server-side.
- Changing a password invalidates every outstanding credential for the account and
  re-issues one to the device that made the change.
- Deleting an account invalidates its credentials by removing the user document.
- A2A bearer credentials go through the same verification, so invalidation cannot
  be bypassed on that surface.
- A token naming an account that no longer exists, or an identity that is not a
  valid ObjectId, is rejected with `401` rather than a server error.

Known limits, stated plainly: invalidation is **per-user, not per-token**, so
signing out ends every session for that account including other devices; there is
still no server-side session store; and the token is still held in `localStorage`,
so any script on the origin can read it. Server-side invalidation bounds how long a
stolen credential is useful — it does not prevent the theft.

**A2A task authorization is enforced (Phase 24).** Both A2A transports
(`/a2a/jsonrpc` and `/a2a/rest`) reject an unauthenticated caller before they
parse or dispatch, and ownership is checked in the task store, so one account
cannot read, cancel, resume or live-subscribe to another account's task. A
foreign task id and an id that never existed return byte-identical responses, so
the surface is not an existence oracle. The agent-card discovery document at
`/.well-known/agent-card.json` stays public and carries no user data.

**The client has a single request/credential layer (Phase 18).** No module reads
the stored token or builds an `Authorization` header itself:

- `client/src/api/authTransport.ts` is the only module that touches
  `localStorage` (`hathap_token` / `hathap_user`), so replacing the storage
  mechanism is a change to one file.
- `client/src/api/client.ts` is the only module that makes requests. It attaches
  the credential, sets `Content-Type: application/json` only when there is a JSON
  body, and turns failures into a single error type that keeps the server's own
  error message.
- A `401` on a request that carried a credential retires the session exactly once,
  clearing state and storage; route guards then redirect. A `401` without a
  credential (a failed login) and a `5xx` (a server fault) do **not** sign the
  user out. The layer never retries and never navigates, so a dead session cannot
  produce a redirect loop.

The token is validated on page load (Phase 20): a stored credential is checked
once with `GET /api/auth/me` before the route guards will render protected UI. A
stale token is rejected then and there — the guards wait in a pending state
rather than bouncing a deep link through `/login` — while a network failure or
server error is not treated as proof of a dead credential and leaves the session
intact.

Moving to `HttpOnly` session cookies is designed but **not implemented**: cookie
`SameSite`/`Secure`/`Domain` depend on the production topology (same-origin vs
cross-origin, HTTPS termination), which this repository does not define. The
current-state inventory, the implemented invalidation design, the target
session/CSRF/CORS design, the exact code and test plan, and the deployment decision
record that must be completed first are in
[`docs/AUTHENTICATION_ARCHITECTURE.md`](docs/AUTHENTICATION_ARCHITECTURE.md).

## 🔑 Key Pages

### Login Page (`/`)
- JWT-based signup and login
- Demo credentials: register an account with any email and password

### Dashboard (`/dashboard`)
- Overall statistics
- Quick actions
- Recent courtrooms list

### Models Page (`/models`)
- View all connected models
- Add new model integrations
- Edit/delete existing models
- Test API connections

### Agents Page (`/agents`)
- Browse agent templates
- Create custom agents
- Configure system prompts
- Assign models to agents

### Courtrooms Page (`/courtrooms`)
- View all courtrooms
- Filter by status
- Quick actions

### Create Courtroom (`/courtrooms/new`)
- Multi-step form
- Configure debate objective
- Select debate mode
- Add participants

### Courtroom Detail (`/courtrooms/:id`)
- Left sidebar: Participants and rounds
- Center: Debate thread with messages
- Right sidebar: Consensus panel and status
- Start/pause debate controls

## 🎨 Design System

### Color Palette
- **Background**: Gradient from slate-950 to slate-900
- **Primary**: Blue (400-600)
- **Accent**: Cyan (400-500)
- **Text**: Slate (100-400)
- **Success**: Green
- **Warning**: Orange/Yellow
- **Error**: Red

### Design Features
- Dark mode first approach
- Glassmorphism effects
- Smooth transitions and animations
- Responsive design (mobile, tablet, desktop)
- Professional SaaS aesthetic

## 📊 Initial State

This frontend now starts with no models, agents, or courtrooms. Data is persisted per-user via the backend API (MongoDB). When you first sign up, your workspace will be empty so you can connect models and create agents and courtrooms.

## 🔧 Backend API

The backend is a Node.js + Express + TypeScript server located in the `server/` directory. It provides:

- **JWT-based authentication**: Secure user authentication and authorization
- **Per-user CRUD endpoints**: Models, agents, and courtrooms management
- **MongoDB integration**: Data persistence with Mongoose ODM
- **A2A Protocol**: Agent-to-Agent communication support
- **Debate Engine**: Multi-agent debate orchestration with various strategies
- **OpenAI Integration**: LLM-powered agent responses

### API Endpoints:
- `/api/auth/*` - Authentication (signup, login, me, change-password, export-data, delete-account)
- `/api/models/*` - AI model management
- `/api/agents/*` - Agent template CRUD
- `/api/courtrooms/*` - Courtroom and debate management

The backend runs on port `4000` by default (configurable via PORT env variable).  
CORS is allow-list based: development allows the Vite dev origins, and production
reflects only the origins listed in `CORS_ORIGINS`. The `Host` header is never
trusted to infer same-origin, and no `Access-Control-Allow-Credentials` header is
emitted.

## 🔄 State Management

Uses React Context API (`AppContext`) for global state:
- Models list and operations
- Agent templates and operations
- Courtrooms and operations
- Participants management

## 🛣️ Routing

- `/` - Login page
- `/dashboard` - Dashboard
- `/models` - Models management
- `/agents` - Agent templates
- `/courtrooms` - Courtrooms list
- `/courtrooms/new` - Create new courtroom
- `/courtrooms/:id` - Courtroom detail

## 📝 Future Enhancements

Already implemented (for reference, so they are not re-listed below): the
Express backend API, real multi-provider AI model calls, user authentication
and persistence, decision/evidence export, debate history, and the fixed +
intelligent planning engines.

Genuinely future work:

- Real WebSocket communication (live updates currently use server-sent events)
- Advanced analytics across decisions
- Model parameter fine-tuning from the UI
- Team collaboration features

## 📄 License

MIT License - See LICENSE file for details

## 👨‍💻 Development

### Available Scripts

**Frontend (client/):**
```bash
npm run dev       # Start Vite development server
npm run build     # Build for production
npm run preview   # Preview production build
npm run lint      # Run ESLint
npm test          # Run Vitest unit/component tests
npm run typecheck:config  # Typecheck the Vite build config (vite.config.ts)
```

**Backend (server/):**
```bash
npm run dev       # Start development server with hot reload
npm run build     # Compile TypeScript to JavaScript
npm start         # Run compiled production build
npm test          # Run the full test suite (requires local MongoDB)
```

### Code Quality

- TypeScript typechecking enforced in CI (server runs strict mode; the client is typechecked non-strict)
- ESLint configured
- Responsive design tested
- Cross-browser compatible

### End of Document
