# Hathap.ai — Phase 11 todos (Real Web-Grounded Research)

Last updated: after Phase 11 verification.

## Phase 12.2 follow-up
- [ ] Review the remote GitHub Actions CI results triggered by the Phase 12.2
      commit (`f73d6bc`, pushed to `main`): confirm the Server job (typecheck,
      254/254 tests, build) and Client job (typecheck, build) pass on the
      Actions tab; address any runner-only failures if the remote run differs
      from the local clean-check.
The remaining items (server test tsc fix, full verify, commit + push) are now
complete. Server suite is 246/246, server `tsc --noEmit` clean, server build
green, client `tsc --noEmit` + `npm run build` green, and the completed commit
was pushed to `main` with a clean tree.

## Remaining (blocking the ship)
- [x] **Fix `server/src/tests/researchProvider.test.ts` tsc errors** (run
      `npx tsc --noEmit` in `server/`). Fixed against the actual signatures:
      - `(70,16)(71,16)(73,13)(74,13): TS2532` — caused by the optional
        `metadata?`/`snippet?`/`content?` fields on `ResearchResult` (repo
        tsconfig is `strict` only — no `noUncheckedIndexedAccess`). Fixed by
        narrowing via `const first = results[0]` plus `assert.ok(first.metadata
        | .snippet | .content)` assertion-function narrowing (also fixed a
        latent pre-existing bug: `instanceof Date.constructor` → `instanceof
        Date`, which was never exercised because this test was not yet executed).
      - `(129,44)(136,44)(144,35): TS2345` — `resolveResearchProvider` signature
        is `(override?: string, env: ResearchEnv)`; the env object is now passed
        as the second argument.
- [x] Re-run `npx tsc --noEmit` (server) — clean, 0 errors.
- [x] Re-run `npm test` in `server/` — full suite green (246/246).
- [x] Re-run client `npx tsc --noEmit` + `npm run build` — confirmed green.
- [x] `git add -A`, commit, push to `main`, clean tree confirmed.

## Done
- [x] Server Brave research source (`server/src/research/braveResearchSource.ts`) —
      Brave Web Search API mapping, clamping, metadata stamping, fixture `fetchFn`
      seam, never-silent mock.
- [x] Server research config (`server/src/research/researchConfig.ts`) — provider
      resolution (`brave | mock | duckduckgo | auto`), `describeResearchStatus`,
      `researchSetupInstructions`.
- [x] Server factory rework — explicit provider, auto mode, mock always labeled.
- [x] Server routes (`server/src/routes/research.ts`) — `/api/research/status` +
      demo route; reportService provider lines; `.env(.example)` Brave key.
- [x] Server tests wired: `researchSecurity.test.ts` and
      `researchProvider.test.ts` both listed in the `npm test` script
      (`server/package.json`) — confirmed included; no test-runner changes
      needed.
- [x] Client types (`client/src/types/index.ts`) — `provider` on evidence,
      `ResearchStatus`, `WebGroundedDemoRequest/Result`, `retrievedAt`.
- [x] Client AppContext — `getResearchStatus()` + `runWebGroundedDemo()`.
- [x] Client DashboardPage — web-grounded status banner; ResearchPanel /
      EvidenceExplorer provider/query/retrievedAt rendering.
- [x] Client verified: `tsc --noEmit` clean, `npm run build` green.
- [x] Docs: PHASE11 engineering report + README research-setup section.
