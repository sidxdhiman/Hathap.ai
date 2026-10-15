'use strict';

const { execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const ALLOWLIST_PATH = path.join(__dirname, 'secret-scan.allowlist.json');

const HARD_RULES = [
  { id: 'github-token', description: 'GitHub token (ghp_/gho_/ghu_/ghs_/ghr_/github_pat_)', re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b|\bgithub_pat_[A-Za-z0-9_]{20,}\b/ },
  { id: 'aws-access-key-id', description: 'AWS access key id (AKIA...)', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { id: 'google-api-key', description: 'Google API key (AIza...)', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { id: 'slack-token', description: 'Slack token (xox...)', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { id: 'private-key-block', description: 'PEM private key block', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { id: 'stripe-live-secret', description: 'Stripe live secret key (sk_live_/rk_live_)', re: /\b(?:sk|rk)_live_[A-Za-z0-9]{16,}\b/ },
];

const SECRET_KEYWORDS = 'SECRET|PASSWORD|PASSWD|API_?KEY|ACCESS_?KEY|PRIVATE_?KEY|AUTH_?TOKEN|ACCESS_?TOKEN|REFRESH_?TOKEN|SESSION_?KEY|CREDENTIALS?|SIGNING_?KEY|ENCRYPTION_?KEY';

const ENV_SECRET_ASSIGNMENT_RE = new RegExp(
  `(?:^|[\\s;{,["'])(?:export\\s+)?([A-Z][A-Z0-9_]*(?:${SECRET_KEYWORDS})[A-Z0-9_]*|(?:${SECRET_KEYWORDS}))\\s*[:=]\\s*(?:["']([^"'\\r\\n]{8,})["']|([A-Za-z0-9+/.\\-]{8,}))`,
  'g',
);

const PARTNER_RULES = [
  { id: 'credentialed-uri', description: 'URI with embedded userinfo (scheme://user:pass@host)', re: /\b[a-z][a-z0-9+.-]*:\/\/[^/\s:@'"`]+:[^/\s@'"`]+@[^'"`\s]+/i },
  { id: 'jwt', description: 'JWT-shaped token (eyJ...)', re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/ },
  { id: 'bearer-credential', description: 'Bearer authorization token', re: /\bBearer\s+[A-Za-z0-9_\-.~+/]{20,}={0,2}/ },
  { id: 'openai-style-key', description: 'sk- style API key', re: /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}\b/ },
  { id: 'stripe-test-secret', description: 'Stripe test secret key (sk_test_)', re: /\bsk_test_[A-Za-z0-9]{16,}\b/ },
  {
    id: 'env-secret-assignment',
    description: 'Secret-shaped env/assignment literal',
    re: ENV_SECRET_ASSIGNMENT_RE,
    valueGroup: (m) => m[2] || m[3],
  },
];

const FORBIDDEN_NAME_RULES = [
  { id: 'tracked-dotenv', re: /(^|\/)\.env$|(^|\/)\.env\.local$/ },
  { id: 'tracked-private-key-file', re: /\.(pem|key|pfx|p12|ppk)$/ },
  { id: 'tracked-ssh-key', re: /(^|\/)id_(rsa|dsa|ecdsa|ed25519)/ },
  { id: 'tracked-credentials-file', re: /(^|\/)credentials\.json$|(^|\/)\.npmrc$|(^|\/)\.aws\// },
];

const PLACEHOLDER_MARKERS = [
  'replace', 'placeholder', 'example', 'your-', 'your_', 'changeme', 'change-me',
  'change_me', 'replaceme', 'xxxx', '<', '>', 'dummy', 'sample', 'fake',
  'synthetic', 'mock', 'demo', 'localhost', '127.0.0.1', 'redacted', 'unset',
  'todo', 'optional', 'abcdef', 'ci-local', 'not-used', 'not_used', 'do-not-use',
  'insecure', 'pass', 'password', 'secret', 'test', 'user',
];

const CODE_EXPR_MARKERS = ['(', '=>', '${', 'process.env'];

const SKIP_EXTENSIONS = /\.(png|jpe?g|gif|ico|woff2?|ttf|otf|eot|pdf|zip|gz|mp4|webm|webp|avi|mov|db|sqlite|lock)$/i;
const SKIP_FILES = new Set(['package-lock.json']);
const MAX_FILE_BYTES = 1_500_000;
const FIXTURE_PATH_RE = /(^|\/)(tests?|__tests__)\//i;

function sha256Hex(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function fingerprintOf(value) {
  return sha256Hex(value).slice(0, 32);
}

function isFixturePath(filePath) {
  return FIXTURE_PATH_RE.test(filePath) || /\.(test|spec)\.[jt]sx?$/i.test(filePath);
}

function looksLikePlaceholder(value) {
  const lower = value.toLowerCase();
  return PLACEHOLDER_MARKERS.some((marker) => lower.includes(marker));
}

function looksLikeCodeExpression(value) {
  return CODE_EXPR_MARKERS.some((marker) => value.includes(marker));
}

function looksLikeEnvVarName(value) {
  return /^[A-Z][A-Z0-9_]{3,}$/.test(value);
}

function loadAllowlist() {
  try {
    const parsed = JSON.parse(fs.readFileSync(ALLOWLIST_PATH, 'utf8'));
    return new Set((parsed.entries || []).map((e) => `${e.rule}:${e.fingerprint}`));
  } catch {
    return new Set();
  }
}

function asGlobal(re) {
  return re.global ? re : new RegExp(re.source, `${re.flags}g`);
}

function scanText(source, text, options = {}) {
  const fixturePath = options.fixturePath !== undefined
    ? options.fixturePath
    : isFixturePath(source);
  const findings = [];

  for (const rule of HARD_RULES) {
    for (const match of text.matchAll(asGlobal(rule.re))) {
      const value = match[0];
      const before = text.slice(0, match.index);
      findings.push({
        rule: rule.id,
        tier: 'hard',
        severity: 'error',
        source,
        line: before.split('\n').length,
        column: match.index - before.lastIndexOf('\n'),
        fingerprint: fingerprintOf(value),
        length: value.length,
      });
    }
  }

  for (const rule of PARTNER_RULES) {
    const re = asGlobal(rule.re);
    for (const match of text.matchAll(re)) {
      const value = rule.valueGroup ? rule.valueGroup(match) : match[0];
      if (!value || value.length < 8) continue;
      if (looksLikePlaceholder(value)) continue;
      if (looksLikeCodeExpression(value)) continue;
      if (looksLikeEnvVarName(value)) continue;
      const before = text.slice(0, match.index);
      findings.push({
        rule: rule.id,
        tier: 'partner',
        severity: fixturePath ? 'warning' : 'error',
        source,
        line: before.split('\n').length,
        column: match.index - before.lastIndexOf('\n'),
        fingerprint: fingerprintOf(value),
        length: value.length,
      });
    }
  }

  return findings;
}

function scanTrackedFileNames(paths) {
  const findings = [];
  for (const filePath of paths) {
    for (const rule of FORBIDDEN_NAME_RULES) {
      if (rule.re.test(filePath)) {
        findings.push({
          rule: rule.id,
          tier: 'name',
          severity: 'error',
          source: filePath,
          line: 0,
          column: 0,
          fingerprint: 'n/a',
          length: 0,
        });
      }
    }
  }
  return findings;
}

function isScannableBinary(buffer) {
  const probe = buffer.subarray(0, 8000);
  return probe.includes(0);
}

function listTrackedFiles() {
  const out = execFileSync('git', ['ls-files'], { cwd: REPO_ROOT, encoding: 'utf8' });
  return out.split(/\r?\n/).filter(Boolean);
}

function listHistoryBlobs() {
  const revs = execFileSync(
    'git',
    ['rev-list', '--objects', '--all'],
    { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  const seen = new Set();
  const blobs = [];
  for (const line of revs.split(/\r?\n/)) {
    const [oid, ...rest] = line.split(' ');
    if (!oid || seen.has(oid)) continue;
    seen.add(oid);
    const name = rest.join(' ');
    if (name && (SKIP_FILES.has(path.basename(name)) || SKIP_EXTENSIONS.test(name))) continue;
    blobs.push({ oid, name: name || `(blob ${oid.slice(0, 8)})` });
  }
  return blobs;
}

function catFileBatch(oids) {
  const chunks = [];
  const input = Buffer.from(oids.join('\n') + '\n', 'utf8');
  const stdout = execFileSync('git', ['cat-file', '--batch'], {
    cwd: REPO_ROOT,
    input,
    maxBuffer: 512 * 1024 * 1024,
  });
  let offset = 0;
  while (offset < stdout.length) {
    const nl = stdout.indexOf(0x0a, offset);
    if (nl === -1) break;
    const header = stdout.toString('utf8', offset, nl).trim();
    offset = nl + 1;
    const parts = header.split(' ');
    if (parts.length < 3) continue;
    const [oid, type, sizeStr] = parts;
    const size = Number(sizeStr);
    const content = stdout.subarray(offset, offset + size);
    offset += size + 1;
    if (type === 'blob') chunks.push({ oid, content });
  }
  return chunks;
}

function runScan(options = {}) {
  const allowlist = loadAllowlist();
  const errors = [];
  const warnings = [];
  let allowlisted = 0;
  let scanned = 0;

  const record = (finding) => {
    const key = `${finding.rule}:${finding.fingerprint}`;
    if (allowlist.has(key)) {
      allowlisted += 1;
      return;
    }
    if (finding.severity === 'error') errors.push(finding);
    else warnings.push(finding);
  };

  const tracked = listTrackedFiles();
  for (const finding of scanTrackedFileNames(tracked)) record(finding);

  for (const filePath of tracked) {
    if (SKIP_FILES.has(path.basename(filePath)) || SKIP_EXTENSIONS.test(filePath)) continue;
    const abs = path.join(REPO_ROOT, filePath);
    let stat;
    try {
      stat = fs.statSync(abs);
    } catch {
      continue;
    }
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES) continue;
    const buffer = fs.readFileSync(abs);
    if (isScannableBinary(buffer)) continue;
    scanned += 1;
    for (const finding of scanText(filePath, buffer.toString('utf8'))) record(finding);
  }

  if (options.history) {
    const blobs = listHistoryBlobs();
    const contents = catFileBatch(blobs.map((b) => b.oid));
    const nameByOid = new Map(blobs.map((b) => [b.oid, b.name]));
    for (const { oid, content } of contents) {
      if (content.length > MAX_FILE_BYTES || isScannableBinary(content)) continue;
      scanned += 1;
      const name = nameByOid.get(oid) || oid;
      for (const finding of scanText(name, content.toString('utf8'))) record(finding);
    }
  }

  return { errors, warnings, allowlisted, scanned };
}

function printReport(result) {
  const lines = [`secret-scan: ${result.scanned} source(s) scanned (values are never printed)`];
  const all = [
    ...result.errors.map((f) => ['ERROR', f]),
    ...result.warnings.map((f) => ['WARN ', f]),
  ];
  for (const [tag, f] of all) {
    lines.push(`  ${tag} ${f.source}:${f.line} [${f.rule}] fingerprint=${f.fingerprint} length=${f.length}`);
  }
  if (result.allowlisted) {
    lines.push(`  allowlisted finding(s) suppressed: ${result.allowlisted}`);
  }
  lines.push(
    `secret-scan: ${result.errors.length} error(s), ${result.warnings.length} warning(s) -> ${result.errors.length ? 'FAIL' : 'PASS'}`,
  );
  console.log(lines.join('\n'));
}

function main(argv) {
  const history = argv.includes('--history');
  const result = runScan({ history });
  printReport(result);
  process.exit(result.errors.length ? 1 : 0);
}

if (require.main === module) {
  main(process.argv.slice(2));
}

module.exports = {
  REPO_ROOT,
  HARD_RULES,
  PARTNER_RULES,
  PLACEHOLDER_MARKERS,
  scanText,
  runScan,
  isFixturePath,
  looksLikePlaceholder,
  loadAllowlist,
  fingerprintOf,
};
