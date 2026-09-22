# Security Audit Report (Phase 12.6)

Date: 2026-09-22 · Baseline: `c3498ce` · Remediation commit: `d916de1`

## 1. Summary

Ran `npm audit` on both workspaces and remediated every actionable vulnerability with
**in-range, patch-level** dependency updates. No `package.json` manifest changed; only
`package-lock.json` files were updated. All changes were verified locally and in CI.

| Workspace | Before | After |
|-----------|--------|-------|
| server (runtime)    | 6 (4 moderate, 2 high) | **0** |
| client (build/dev)  | 17 (1 low, 4 moderate, 12 high) | **10 (3 moderate, 7 high)** |

The remaining 10 client findings are **not safely fixable in-range** (see §3); each
requires a semver-major upgrade that is out of scope for this audit phase.

## 2. Remediated

### Server (`npm update` — all within declared ranges)

| Package | From → To | Advisories resolved |
|---------|-----------|---------------------|
| `express` | 4.22.2 → 4.22.3 | express `4.22.2` advisory; pulls fixed `qs`/`body-parser` |
| `qs` | 6.15.2 → 6.16.0 | GHSA-x5fp-wj9c-mxmx (array-limit bypass), GHSA-4mjr-xmp4-gh2g (isoBuffer DoS) |
| `body-parser` | 1.20.5 → 1.20.8 | GHSA-v422-hmwv-36x6 (invalid `limit` disables size enforcement) |
| `mongoose` | 7.8.9 → 7.8.12 | GHSA-664h-wqgq-64gw (prototype pollution in update casting) |
| `ip-address` | 10.2.0 → 10.7.2 | GHSA-mwp4-54f8-5fhr / GHSA-4xrf-jv44-h6hh / GHSA-22jq-vg5j-6vgg (SSRF & trust-boundary) |
| `brace-expansion` | 1.1.15 → 1.1.21 | GHSA-3jxr-9vmj-r5cp, GHSA-mh99-v99m-4gvg, GHSA-rgw5-rvv9-x895 (DoS) |

### Client (`npm update` — all within declared ranges)

| Package | From → To | Advisories resolved |
|---------|-----------|---------------------|
| `postcss` | 8.5.15 → 8.5.28 | GHSA-fxqj-rqcc-2cmp, GHSA-r28c-9q8g-f849 (source-map path traversal) |
| `react-router-dom` | 6.30.4 → 6.30.6 | GHSA-jjmj-jmhj-qwj2 (open redirect → XSS in `<Link>`/`useNavigate`) |
| `js-yaml` | 4.2.0 → 4.3.2 | GHSA-52cp-r559-cp3m, GHSA-5p4m-2wfm-xmqj, GHSA-2883-xcg3-v3hh (CPU/slow-loris) |
| `nanoid` | 3.3.12 → 3.3.19 | GHSA-28wg-ghj8-5hjv, GHSA-2v37-7h3g-55p8 (infinite loop) |
| `browserslist` | 4.28.2 → 4.29.0 | GHSA-c83g-rgw3-j3cx, GHSA-73wf-gq98-2v4g (OOM / prototype write) |
| `baseline-browser-mapping` | 2.10.35 → 2.11.25 | GHSA-w5vr-8v7q-w6rv (DoS on invalid input) |
| `postcss-selector-parser` | 6.1.2 → 6.1.4 | recursive-AST DoS |
| `minimatch` (v3 branch) | → 3.1.5 | ReDoS advisories (non-ts-estree branches) |
| `brace-expansion` | 1.1.15 / 2.1.1 → 1.1.21 / 2.1.7 | DoS advisories (all branches) |

## 3. Residual (not safely fixable — requires semver-major)

| Package | Sev | Why not fixed | Fix path (follow-up) |
|---------|-----|---------------|----------------------|
| `vite` 5.4.21 (3 advisories) | high | fix requires `vite@8.3.0` (breaking). Advisories cover dev-server only (fs.deny bypass, dep `.map` traversal, launch-editor UNC) and are not reachable in CI build/production. | Major upgrade vite 5 → 8 in a dedicated future phase |
| `esbuild` 0.21.5 (1 advisory) | moderate | pulled in by `vite`; same dev-server-only scope | Resolved by the vite major upgrade |
| `@typescript-eslint/*` 6.21.0 (5 entries) | high | vulnerable `>=6.16.0 <=7.5.0`; fix requires major 6 → 8 (ESLint 9 peer). Dev-time lint only; ReDoS is in file-pattern globbing, not runtime. | Bump `@typescript-eslint` to 8.x + revalidate ESLint config |
| `minimatch` 9.0.3 (1 entry) | high | exact-pinned by `@typescript-eslint/typescript-estree@6.21.0`; cannot be moved in-range | Resolved by the @typescript-eslint major upgrade |
| `react-router` 6.30.6 (2 advisories) | moderate | patched only in v7 (`<7.18.0` vulnerable). One advisory (deserializeErrors) affects SSR hydration — this app has no SSR; the backslash open-redirect requires attacker-controlled links and is browser-only | Optionally evaluate react-router v7 migration |

## 4. Validation (local + CI)

Configs unchanged. `package.json` files byte-identical; only lockfiles updated.

- Server: `tsc --noEmit` ✓ · `npm test` → **254/254 pass, 0 fail** ✓ · `npm run build` ✓
- Client: `npm run lint` ✓ (max-warnings 0) · `tsc --noEmit` ✓ · `npm run build` ✓
- CI: GitHub Actions run **35716722199** (`d916de1`) → **success**
  - Client (lint + typecheck + build): all steps success
  - Server (typecheck + tests + build, Mongo container): all steps success

## 5. Audit re-runs

- Server: `npm audit` → **found 0 vulnerabilities**
- Client: `npm audit` → 10 remaining (3 moderate, 7 high) — all in §3 residual set; none actionable without a semver-major bump.