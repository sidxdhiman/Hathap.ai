# Hathap.ai — Phase 14 todos (Truthful docs + auth error surfacing)

Last updated: Phase 14 (after inspection at commit `6411cb8`).

## Where we are

Phases 1-13 are committed and pushed to `main`. The full quality gates pass
locally at the Phase 13 baseline (`6411cb8`):

- Server: `tsc --noEmit` clean, **272/272** tests pass, `npm run build` green.
- Client: `tsc --noEmit` clean, `npm run lint` clean, vitest suite green
  (~58 tests / 13 files), `tsc -p tsconfig --noEmit` for `vite.config.ts` clean,
  `npm run build` green.
- Security: server `npm audit --omit=dev` reports 0 findings; client audit
  findings are a documented residual set (see `docs/SECURITY_AUDIT_REPORT.md`).
- CI: `.github/workflows/ci.yml` runs the server and client jobs on every push.
- Auth endpoints shipped in Phase 13: `/api/auth/me`, `/change-password`,
  `/export-data`, `/account` (delete), with the ProfilePage bound to real data.

The Phase 12.2 item to "review the remote GitHub Actions run for `f73d6bc`" is
superseded: many subsequent commits (Phases 12.3-13) were pushed and verified
locally with the same gates; the local and CI job sets are identical.

## Phase 14 scope

- [x] Inspect the repo at the Phase 13 baseline and record what is actually true.
- [x] Refresh this ledger so it reflects Phases 12-13 reality instead of Phase 11.
- [x] README "Future Enhancements" — remove items that are already implemented.
- [x] `agent_context.md` — fix claims contradicted by the repo (tests, CI, rate
      limiting, CORS, security headers) and add a dated current-state note.
- [x] Login/Signup — surface the server-provided error message instead of a
      generic `alert()` so users see the real failure reason (e.g. "User exists").
- [ ] Re-run full validation (server tsc/tests/build; client tsc/lint/test/
      typecheck:config/build), commit, push, report.

## Done (Phases 11-13 recap)

- Phase 11: Real web-grounded research (Brave + DuckDuckGo sources), provider
  resolution (`brave | mock | duckduckgo | auto`), research status/demo routes,
  web-grounded dashboard banner, provider-labeled evidence. `researchProvider`
  test tsc fixes; suite 246/246 at the time.
- Phase 12: Auth hardening — production `JWT_SECRET` enforcement, CORS
  allow-list, helmet, auth endpoint rate limiting; removal of mock/loose
  research fallbacks; client strict-ish config reviews; security audit report.
- Phase 13: Honest-surface fixes — auth endpoints (`/me`, change-password,
  export-data, delete account), ProfilePage bound to real API data,
  `verificationEnabled` default on and honored in fixed mode, LandingPage no
  longer claims fake verdicts, README auth labeling.

## Remaining (ship blockers / known debt)

- Client `tsconfig.json` has `strict: false` while the server is `strict: true`
  (gap, tracked; a strict-mode migration is a large client-wide refactor).
- JWT is stored in `localStorage` (readable by any page script). A
  session-cookie / SameSite migration is a future hardening item, documented in
  `AuthContext.tsx`.
- Client `npm audit` residual findings (12) are documented in
  `docs/SECURITY_AUDIT_REPORT.md`; keep pinned to those versions or bump when
  compatible.
- Login rate limiting covers auth endpoints only; broader per-endpoint limits
  are not yet configured.