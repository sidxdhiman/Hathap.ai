# Hathap.ai — Phase 11 todos (Real Web-Grounded Research)

Last updated: end of Phase 11 work session.
Everything on disk is Phase-11 complete **except the server test file listed in
"Remaining"**. Client is verified green. The two remaining tasks are: (1) resolve
the server `tsc` errors in the research provider test file, (2) final verify +
commit + push.

## Remaining (blocking the ship)
- [ ] **Fix `server/src/tests/researchProvider.test.ts` tsc errors** (run
      `npx tsc --noEmit` in `server/`). Current errors seen at last check:
      - `(70,16)(71,16)(73,13)(74,13): TS2532 Object is possibly 'undefined'` —
        `results[0].provider/.metadata/.snippet/.content` indexing under strict
        `noUncheckedIndexedAccess`; narrow before indexing (e.g. assert
        `results.length === 1` then access via a narrowed assignment, or use
        non-null-local `const first = results[0]` after a length check).
      - `(129,44)(136,44)(144,35): TS2345` — arguments to the provider resolver /
        status call are objects where a `string` is expected; wait — verify the
        actual current signature (rename `resolvingResearchProvider` →
        `resolveResearchProvider`, confirm `describeResearchStatus`/`researchSetupInstructions`
        signatures) against `server/src/research/researchConfig.ts` before
        rewriting these calls.
- [ ] Re-run `npx tsc --noEmit` (server) — must be clean.
- [ ] Re-run `npm test` in `server/` — full suite green (was 231/231).
- [ ] Re-run client `npx tsc --noEmit` + `npm run build` — confirm still green.
- [ ] `git add -A`, commit (Phase 11 + POST_PHASE10_AUDIT.md), push to `main`,
      confirm clean tree.

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
- [x] Server tests wired: `researchSecurity.test.ts` (in npm test list) + new
      `researchProvider.test.ts` (exists on disk, not yet in npm test list —
      decide: add to `server/package.json` test script or fold into security test).
- [x] Client types (`client/src/types/index.ts`) — `provider` on evidence,
      `ResearchStatus`, `WebGroundedDemoRequest/Result`, `retrievedAt`.
- [x] Client AppContext — `getResearchStatus()` + `runWebGroundedDemo()`.
- [x] Client DashboardPage — web-grounded status banner; ResearchPanel /
      EvidenceExplorer provider/query/retrievedAt rendering.
- [x] Client verified: `tsc --noEmit` clean, `npm run build` green.
- [x] Docs: PHASE11 engineering report + README research-setup section.
