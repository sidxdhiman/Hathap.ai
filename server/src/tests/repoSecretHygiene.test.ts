import { test } from 'node:test';
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '../../..');
const scannerPath = path.join(repoRoot, 'scripts', 'secret-scan.cjs');

interface ScanFinding {
  rule: string;
  severity: string;
  tier: string;
  fingerprint: string;
  length: number;
  line: number;
}

const scanner = require(scannerPath) as {
  scanText: (source: string, text: string, options?: { fixturePath?: boolean }) => ScanFinding[];
  REPO_ROOT: string;
};

test('secret scanner detects provider-format credentials without echoing values', () => {
  const fabricated = `ghp_${'A'.repeat(36)}`;
  const findings = scanner.scanText('fixture.ts', `const t = '${fabricated}';`, { fixturePath: false });
  const hit = findings.find((f: ScanFinding) => f.rule === 'github-token');
  assert.ok(hit, 'expected a github-token finding for a fabricated provider-format token');
  assert.equal(hit!.severity, 'error');
  assert.ok(
    !JSON.stringify(findings).includes(fabricated),
    'findings must never contain the matched value, only a fingerprint'
  );
});

test('secret scanner skips placeholder-marked values and env-var-name references', () => {
  const placeholder = scanner.scanText(
    'fixture.ts',
    "JWT_SECRET = 'replace_this_with_a_secure_random_string'",
    { fixturePath: false }
  );
  assert.equal(placeholder.length, 0, 'placeholder-marked values must not be findings');

  const envName = scanner.scanText(
    'fixture.ts',
    "export const X_API_KEY_ENV = 'SOME_UPSTREAM_API_KEY';",
    { fixturePath: false }
  );
  assert.equal(envName.length, 0, 'env-var-name literals are references, not credentials');
});

test('secret scanner escalates live-looking assignments outside fixtures, downgrades inside tests', () => {
  const sample = 'SIGNING_KEY = "qW8xL2mN4pR6sT9vY1zA3bC5dE7fG"';
  const outside = scanner.scanText('src/config.ts', sample, { fixturePath: false });
  assert.ok(
    outside.some((f: ScanFinding) => f.rule === 'env-secret-assignment' && f.severity === 'error'),
    'live-looking assignment in a non-fixture path must be an error'
  );

  const inside = scanner.scanText('src/tests/config.test.ts', sample, { fixturePath: true });
  assert.ok(
    inside.some((f: ScanFinding) => f.rule === 'env-secret-assignment' && f.severity === 'warning'),
    'same value in a test fixture path must be downgraded to a warning'
  );
});

test('tracked repository content contains no error-tier secret findings', () => {
  const output = execFileSync(process.execPath, [scannerPath], {
    cwd: scanner.REPO_ROOT || repoRoot,
    encoding: 'utf8',
    timeout: 180000,
  });
  assert.ok(output.includes('PASS'), `secret-scan must pass on tracked files, got:\n${output}`);
  assert.ok(output.includes('0 error(s)'), `expected zero errors, got:\n${output}`);
});
