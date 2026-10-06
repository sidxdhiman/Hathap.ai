import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import type { AddressInfo } from 'net';
import User from '../models/User';
import Agent from '../models/Agent';
import Model from '../models/Model';
import Courtroom from '../models/Courtroom';
import Message from '../models/Message';
import Verdict from '../models/Verdict';
import Decision from '../models/Decision';
import Claim from '../models/Claim';
import Evidence from '../models/Evidence';
import EvidenceRelationship from '../models/EvidenceRelationship';
import Execution from '../models/Execution';
import ExecutionEvent from '../models/ExecutionEvent';
import Task from '../models/Task';
import DecisionPlan from '../models/DecisionPlan';
import VerificationResult from '../models/VerificationResult';
import RedTeamFinding from '../models/RedTeamFinding';
import ReconciliationResult from '../models/ReconciliationResult';
import DecisionMemory from '../models/DecisionMemory';
import Outcome from '../models/Outcome';
import DecisionLesson from '../models/DecisionLesson';
import Benchmark from '../models/Benchmark';
import BenchmarkCase from '../models/BenchmarkCase';
import Rubric from '../models/Rubric';
import EvaluationRun from '../models/EvaluationRun';
import EvaluationCaseResult from '../models/EvaluationCaseResult';
import Baseline from '../models/Baseline';
import EvaluationComparison from '../models/EvaluationComparison';
import authRouter from '../routes/auth';
import { signToken } from '../utils/authToken';

const TEST_URI = process.env.MONGODB_URI_TEST_AUTH || 'mongodb://localhost:27017/hathap_test_auth';
const JWT_SECRET = process.env.JWT_SECRET || 'secret';

/**
 * Mint a credential exactly the way the server issues one, bound to the user's
 * CURRENT auth version. Reading the version from the database matters: a
 * password change or a sign-out bumps it, so a hard-coded version would start
 * failing for unrelated tests later in the file.
 */
async function tokenFor(id: string): Promise<string> {
  const user = await User.findById(id);
  assert.ok(user, `tokenFor() expected an existing user, got ${id}`);
  return signToken(user);
}

/** A credential as issued *before* Phase 17: correct signature, no `av` claim. */
function legacyTokenFor(id: string): string {
  return jwt.sign({ id }, JWT_SECRET, { expiresIn: '7d' });
}

/** A credential pinned to a specific auth version, to exercise the counter. */
function tokenForVersion(id: string, av: number): string {
  return jwt.sign({ id, av }, JWT_SECRET, { expiresIn: '7d' });
}

/** A well-signed credential whose expiry is already in the past. */
function expiredTokenFor(id: string, av = 0): string {
  return jwt.sign({ id, av }, JWT_SECRET, { expiresIn: '-1s' });
}

/** A credential for an id with no corresponding user document. */
function tokenForMissingUser(): string {
  return jwt.sign(
    { id: new mongoose.Types.ObjectId().toString(), av: 0 },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

/** A correctly signed credential whose identity is not a valid ObjectId. */
function tokenForNonObjectId(): string {
  return jwt.sign({ id: 'not-an-object-id', av: 0 }, JWT_SECRET, { expiresIn: '7d' });
}

async function makeServer(): Promise<{
  server: http.Server;
  port: number;
  request: (
    path: string,
    opts?: { method?: string; token?: string; authHeader?: string; body?: any }
  ) => Promise<{ status: number; body: any }>;
}> {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  const server = await new Promise<http.Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const port = (server.address() as AddressInfo).port;
  return {
    server,
    port,
    request: async (path, opts = {}) => {
      const headers: Record<string, string> = {};
      if (opts.authHeader !== undefined) headers.Authorization = opts.authHeader;
      else if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
      if (opts.body) headers['Content-Type'] = 'application/json';
      const res = await fetch(`http://127.0.0.1:${port}${path}`, {
        method: opts.method || 'GET',
        headers,
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      });
      const text = await res.text();
      let json: any = {};
      try {
        json = text ? JSON.parse(text) : {};
      } catch {
        json = { raw: text };
      }
      return { status: res.status, body: json };
    },
  };
}

async function clean(): Promise<void> {
  await Promise.all([
    VerificationResult.deleteMany({}),
    EvidenceRelationship.deleteMany({}),
    RedTeamFinding.deleteMany({}),
    ReconciliationResult.deleteMany({}),
    DecisionMemory.deleteMany({}),
    Outcome.deleteMany({}),
    DecisionLesson.deleteMany({}),
    Message.deleteMany({}),
    Verdict.deleteMany({}),
    Task.deleteMany({}),
    ExecutionEvent.deleteMany({}),
    DecisionPlan.deleteMany({}),
    Claim.deleteMany({}),
    Evidence.deleteMany({}),
    Execution.deleteMany({}),
    Decision.deleteMany({}),
    Courtroom.deleteMany({}),
    Agent.deleteMany({}),
    Model.deleteMany({}),
    Benchmark.deleteMany({}),
    BenchmarkCase.deleteMany({}),
    Rubric.deleteMany({}),
    EvaluationRun.deleteMany({}),
    EvaluationCaseResult.deleteMany({}),
    Baseline.deleteMany({}),
    EvaluationComparison.deleteMany({}),
    User.deleteMany({}),
  ]);
}

let server: Awaited<ReturnType<typeof makeServer>>;
let userA: any;
let userB: any;

async function createUser(email: string, name: string, password: string): Promise<any> {
  const hash = await bcrypt.hash(password, 10);
  return User.create({ email, name, passwordHash: hash });
}

/** Return an existing seeded account, recreating it if a prior test deleted it. */
async function ensureUser(email: string, name: string, password: string): Promise<any> {
  const existing = await User.findOne({ email });
  if (existing) return existing;
  return createUser(email, name, password);
}

/** Seed a full suite of user-owned + decision-scoped data for `userId`. */
async function seedOwned(userId: string, email: string): Promise<void> {
  const agent = await Agent.create({ name: 'Agent A', userId });
  const model = await Model.create({
    provider: 'openai',
    displayName: 'Test Model',
    modelName: 'gpt-test',
    apiKey: 'sk-test-secret',
    apiKeyHint: 'sk-te…',
    userId,
  });
  const benchmark = await Benchmark.create({ name: 'Bench', userId });
  await BenchmarkCase.create({ title: 'Case A', prompt: 'Prompt A', benchmarkId: benchmark._id, userId });
  const rubric = await Rubric.create({ name: 'Rubric A', userId });
  const evalRun = await EvaluationRun.create({
    name: 'Run A',
    benchmarkId: benchmark._id,
    userId,
    systemUnderTest: { kind: 'static', label: 'Static SUT' },
    limits: {
      maxCasesPerRun: 10,
      maxDurationMs: 60000,
      maxSliceMs: 30000,
      maxDecisionWaitMs: 10000,
      maxLlmCallsPerCase: 4,
      maxTokenBudgetPerCase: 2000,
      maxResultBytes: 10000,
    },
    selectedCaseIds: [],
  });
  await EvaluationCaseResult.create({
    runId: evalRun._id,
    caseId: new mongoose.Types.ObjectId(),
    userId,
    status: 'passed',
    score: 0.5,
  });
  const baseline = await Baseline.create({ name: 'Baseline A', userId });
  await EvaluationComparison.create({
    userId,
    baselineId: baseline._id,
    runAId: evalRun._id,
    type: 'run_vs_baseline',
  });

  const courtroom = await Courtroom.create({ userId, name: 'Court A', mode: 'consensus' });
  await Message.create({ courtroomId: courtroom._id, content: 'A message', agentName: 'agent', role: 'debater', roundNumber: 1 });
  await Verdict.create({
    courtroomId: courtroom._id,
    summary: 'A summary',
    recommendation: 'A verdict',
    confidenceScore: 70,
  });

  const decision = await Decision.create({
    userId,
    title: 'Decision A',
    objective: 'Should we ship it?',
    status: 'completed',
    configuration: { strategy: 'consensus' },
  });
  const decisionId = decision._id.toString();

  const claim = await Claim.create({ decisionId, text: 'Claim A', type: 'fact', status: 'proposed' });
  const evidence = await Evidence.create({
    decisionId,
    title: 'Evidence A',
    content: 'Content A',
    sourceType: 'user_input',
  });
  await EvidenceRelationship.create({
    claimId: claim._id.toString(),
    evidenceId: evidence._id.toString(),
    relationship: 'supports',
    source: 'agent',
    decisionId,
  });
  const execution = await Execution.create({
    decisionId,
    status: 'completed',
    progress: 100,
    currentPhase: 'completed',
  });
  const executionId = execution._id.toString();
  await Task.create({ executionId, type: 'debate', status: 'completed' });
  await ExecutionEvent.create({ decisionId, executionId, type: 'execution.completed' });
  await ExecutionEvent.create({
    decisionId,
    type: 'memory.created',
    data: { memoryId: new mongoose.Types.ObjectId().toString(), category: 'decision' },
  });
  await ExecutionEvent.create({
    type: 'evaluation.run.started',
    data: { runId: evalRun._id.toString(), userId },
  });
  await DecisionPlan.create({ decisionId, executionId, version: '1.0', source: 'baseline', planningMode: 'fixed', tasks: [], status: 'compiled' });
  await VerificationResult.create({
    claimId: claim._id.toString(),
    claimStatement: 'Claim A',
    status: 'supported',
    rationale: 'evidence',
    mode: 'evidence',
    decisionId,
  });
  await RedTeamFinding.create({ decisionId, severity: 'medium', type: 'contradictory_evidence', description: 'finding' });
  await ReconciliationResult.create({
    decisionId,
    recommendation: 'Ship it',
    rationale: 'Evidence supports it',
    survivingClaimIds: [claim._id.toString()],
    rejectedClaimIds: [],
    needsMoreResearch: false,
  });
  await DecisionMemory.create({
    userId,
    decisionId,
    title: 'Decision A',
    objective: 'Should we ship it?',
    summary: 'memory',
    quality: 'high',
  });
  await Outcome.create({ userId, decisionId, kind: 'expected', status: 'pending', description: 'outcome' });
  await DecisionLesson.create({ userId, decisionId, text: 'lesson', status: 'unconfirmed' });
}

before(async () => {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(TEST_URI);
  }
  await clean();
  server = await makeServer();
  userA = await createUser('a@test.local', 'Alice', 'correct-horse');
  userB = await createUser('b@test.local', 'Bob', 'battery-staple');
  await cleanExceptUsers();
});

async function cleanExceptUsers(): Promise<void> {
  await Promise.all([
    VerificationResult.deleteMany({}),
    EvidenceRelationship.deleteMany({}),
    RedTeamFinding.deleteMany({}),
    ReconciliationResult.deleteMany({}),
    DecisionMemory.deleteMany({}),
    Outcome.deleteMany({}),
    DecisionLesson.deleteMany({}),
    Message.deleteMany({}),
    Verdict.deleteMany({}),
    Task.deleteMany({}),
    ExecutionEvent.deleteMany({}),
    DecisionPlan.deleteMany({}),
    Claim.deleteMany({}),
    Evidence.deleteMany({}),
    Execution.deleteMany({}),
    Decision.deleteMany({}),
    Courtroom.deleteMany({}),
    Agent.deleteMany({}),
    Model.deleteMany({}),
    Benchmark.deleteMany({}),
    BenchmarkCase.deleteMany({}),
    Rubric.deleteMany({}),
    EvaluationRun.deleteMany({}),
    EvaluationCaseResult.deleteMany({}),
    Baseline.deleteMany({}),
    EvaluationComparison.deleteMany({}),
  ]);
}

after(async () => {
  server.server.close();
  await clean();
  await mongoose.connection.close();
});

describe('Auth GET /api/auth/me', () => {
  test('returns the authenticated user dataset (never the password hash)', async () => {
    const res = await server.request('/api/auth/me', { token: await tokenFor(String(userA._id)) });
    assert.equal(res.status, 200);
    assert.equal(res.body.email, 'a@test.local');
    assert.equal(res.body.name, 'Alice');
    assert.equal(String(res.body.id), String(userA._id));
    assert.ok(!res.body.passwordHash, 'password hash must never be exposed');
  });

  test('rejects unauthenticated requests', async () => {
    const res = await server.request('/api/auth/me');
    assert.equal(res.status, 401);
  });

  test('rejects a signature-valid token whose user no longer exists', async () => {
    // The token below is genuinely signed and unexpired. It must still be
    // refused: a valid signature proves the token was issued by us, not that
    // the account behind it still exists.
    const res = await server.request('/api/auth/me', { token: tokenForMissingUser() });
    assert.equal(res.status, 401);
  });

  test('rejects a token naming a non-ObjectId identity as 401, not a server error', async () => {
    // Regression: this identity reached the user lookup, where Mongoose raised a
    // CastError. That surfaced as 500, which told the caller "retry later" for a
    // credential that can never become valid. A malformed identity is an
    // authentication failure like any other.
    const res = await server.request('/api/auth/me', { token: tokenForNonObjectId() });
    assert.equal(res.status, 401);
    assert.equal(res.body.error, 'Unauthorized');
  });
});

describe('Auth credential verification', () => {
  test('accepts a current credential for an existing user', async () => {
    const res = await server.request('/api/auth/me', {
      token: await tokenFor(String(userA._id)),
    });
    assert.equal(res.status, 200);
  });

  test('rejects a request with no Authorization header', async () => {
    const res = await server.request('/api/auth/me');
    assert.equal(res.status, 401);
  });

  test('rejects a credential presented under a non-Bearer scheme', async () => {
    const token = await tokenFor(String(userA._id));
    for (const header of [`Basic ${token}`, `bearer ${token}`, `Token ${token}`, token, `Bearer`]) {
      const res = await server.request('/api/auth/me', { authHeader: header });
      assert.equal(res.status, 401, `scheme must be rejected: ${header.slice(0, 12)}`);
    }
  });

  test('rejects a structurally invalid credential', async () => {
    for (const token of ['not-a-jwt', 'a.b.c', '']) {
      const res = await server.request('/api/auth/me', { token });
      assert.equal(res.status, 401, `garbage token must be rejected: ${token}`);
    }
  });

  test('rejects a credential signed with a different secret', async () => {
    const forged = jwt.sign({ id: String(userA._id), av: 0 }, 'a-completely-different-secret', {
      expiresIn: '7d',
    });
    const res = await server.request('/api/auth/me', { token: forged });
    assert.equal(res.status, 401);
  });

  test('rejects an unsigned "alg: none" credential', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({ id: String(userA._id), av: 0, exp: Math.floor(Date.now() / 1000) + 3600 })
    ).toString('base64url');
    const res = await server.request('/api/auth/me', { token: `${header}.${payload}.` });
    assert.equal(res.status, 401);
  });

  test('rejects an expired credential', async () => {
    const res = await server.request('/api/auth/me', {
      token: expiredTokenFor(String(userA._id)),
    });
    assert.equal(res.status, 401);
  });

  test('rejects a credential with a tampered payload', async () => {
    const token = await tokenFor(String(userA._id));
    const [header, , signature] = token.split('.');
    const swapped = Buffer.from(
      JSON.stringify({
        id: String(userB._id),
        av: 0,
        exp: Math.floor(Date.now() / 1000) + 3600,
      })
    ).toString('base64url');
    const res = await server.request('/api/auth/me', { token: `${header}.${swapped}.${signature}` });
    assert.equal(res.status, 401);
  });

  test('accepts a pre-Phase-17 credential with no version claim', async () => {
    // Deploying the counter must not force anyone to sign in again: credentials
    // issued before the `av` claim existed are treated as version 0, which is
    // the version those accounts were created under.
    const res = await server.request('/api/auth/me', {
      token: legacyTokenFor(String(userA._id)),
    });
    assert.equal(res.status, 200);
  });

  test('rejects a credential whose version is behind the account', async () => {
    const current = await User.findById(userA._id).select('authVersion');
    const stale = tokenForVersion(String(userA._id), (current?.authVersion ?? 0) + 5);
    const res = await server.request('/api/auth/me', { token: stale });
    assert.equal(res.status, 401);
  });

  test('rejects a credential with a non-numeric version claim', async () => {
    const token = jwt.sign({ id: String(userA._id), av: '0' }, JWT_SECRET, { expiresIn: '7d' });
    const res = await server.request('/api/auth/me', { token });
    assert.equal(res.status, 401);
  });
});

describe('Auth POST /api/auth/logout', () => {
  test('rejects unauthenticated logout', async () => {
    const res = await server.request('/api/auth/logout', { method: 'POST' });
    assert.equal(res.status, 401);
  });

  test('invalidates the credential that logged out and every other one for the account', async () => {
    const user = await createUser('logout@test.local', 'Logout', 'logout-password');
    const id = String(user._id);

    // Two independent credentials, standing in for two devices.
    const deviceOne = await tokenFor(id);
    const deviceTwo = await tokenFor(id);

    const before = await server.request('/api/auth/me', { token: deviceOne });
    assert.equal(before.status, 200, 'both credentials start valid');

    const res = await server.request('/api/auth/logout', { method: 'POST', token: deviceOne });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);

    const afterSelf = await server.request('/api/auth/me', { token: deviceOne });
    assert.equal(afterSelf.status, 401, 'the credential used to log out is dead');

    // Invalidation is per-user, not per-token: the other device is signed out
    // too. This is the documented ceiling of the stateless architecture.
    const afterOther = await server.request('/api/auth/me', { token: deviceTwo });
    assert.equal(afterOther.status, 401, 'invalidation is account-wide');

    await User.deleteOne({ _id: user._id });
  });

  test('invalidates every credential issued before logout, on any protected route', async () => {
    const user = await createUser('logout2@test.local', 'Logout2', 'logout-password');
    const id = String(user._id);
    const old = await tokenFor(id);

    const meBefore = await server.request('/api/auth/me', { token: old });
    assert.equal(meBefore.status, 200);

    await server.request('/api/auth/logout', { method: 'POST', token: old });

    for (const [path, opts] of [
      ['/api/auth/me', {}],
      ['/api/auth/export-data', { method: 'POST' }],
      ['/api/auth/change-password', { method: 'POST', body: { currentPassword: 'logout-password', newPassword: 'another-password' } }],
      ['/api/auth/account', { method: 'DELETE' }],
    ] as const) {
      const res = await server.request(path, { token: old, ...opts });
      assert.equal(res.status, 401, `pre-logout credential must be refused by ${path}`);
    }

    // The account itself is untouched by signing out.
    assert.equal(await User.countDocuments({ _id: user._id }), 1, 'logout does not delete the account');
    await User.deleteOne({ _id: user._id });
  });

  test('logging in again after logout issues a working credential', async () => {
    const email = 'relogin@test.local';
    await createUser(email, 'Relogin', 'relogin-password');
    const user = await User.findOne({ email });
    const id = String(user!._id);

    const first = await tokenFor(id);
    await server.request('/api/auth/logout', { method: 'POST', token: first });
    assert.equal((await server.request('/api/auth/me', { token: first })).status, 401);

    const login = await server.request('/api/auth/login', {
      method: 'POST',
      body: { email, password: 'relogin-password' },
    });
    assert.equal(login.status, 200);
    assert.ok(login.body.token, 'login returns a fresh credential');

    const me = await server.request('/api/auth/me', { token: login.body.token });
    assert.equal(me.status, 200, 'the freshly issued credential authenticates');

    await User.deleteOne({ _id: user!._id });
  });
});

describe('Auth POST /api/auth/signup and /api/auth/login', () => {
  test('signup issues a credential that authenticates', async () => {
    const email = 'signup@test.local';
    const res = await server.request('/api/auth/signup', {
      method: 'POST',
      body: { email, name: 'Signup User', password: 'signup-password' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.user.email, email);
    assert.ok(res.body.token, 'signup returns a credential');
    assert.ok(!('passwordHash' in res.body.user), 'never returns the password hash');

    const me = await server.request('/api/auth/me', { token: res.body.token });
    assert.equal(me.status, 200, 'the signup credential authenticates');

    await User.deleteOne({ email });
  });

  test('rejects a duplicate signup', async () => {
    const email = 'dupe@test.local';
    const first = await server.request('/api/auth/signup', {
      method: 'POST',
      body: { email, name: 'Dupe', password: 'dupe-password' },
    });
    assert.equal(first.status, 200);

    const second = await server.request('/api/auth/signup', {
      method: 'POST',
      body: { email, name: 'Dupe', password: 'dupe-password' },
    });
    assert.equal(second.status, 400);
    assert.match(second.body.error, /exists/i);
    assert.ok(!second.body.token, 'a rejected signup issues no credential');

    await User.deleteOne({ email });
  });

  test('rejects login with a wrong password and issues nothing', async () => {
    const email = 'wrongpw@test.local';
    await createUser(email, 'WrongPw', 'the-real-password');

    const res = await server.request('/api/auth/login', {
      method: 'POST',
      body: { email, password: 'not-the-password' },
    });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /Invalid credentials/i);
    assert.ok(!res.body.token, 'a failed login issues no credential');

    await User.deleteOne({ email });
  });

  test('does not reveal whether an email is registered', async () => {
    const registered = await server.request('/api/auth/login', {
      method: 'POST',
      body: { email: 'a@test.local', password: 'totally-wrong' },
    });
    const unregistered = await server.request('/api/auth/login', {
      method: 'POST',
      body: { email: 'nobody@nowhere.local', password: 'totally-wrong' },
    });
    assert.equal(registered.status, unregistered.status);
    assert.equal(registered.body.error, unregistered.body.error);
  });
});

describe('Auth POST /api/auth/change-password', () => {
  test('rejects a wrong current password', async () => {
    const res = await server.request('/api/auth/change-password', {
      method: 'POST',
      token: await tokenFor(String(userA._id)),
      body: { currentPassword: 'wrong-password', newPassword: 'a-brand-new-ok-password' },
    });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /Current password is incorrect/i);
  });

  test('rejects a too-short new password', async () => {
    const res = await server.request('/api/auth/change-password', {
      method: 'POST',
      token: await tokenFor(String(userA._id)),
      body: { currentPassword: 'correct-horse', newPassword: 'short' },
    });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /at least 8 characters/i);
  });

  test('rejects a new password identical to the current one', async () => {
    const res = await server.request('/api/auth/change-password', {
      method: 'POST',
      token: await tokenFor(String(userA._id)),
      body: { currentPassword: 'correct-horse', newPassword: 'correct-horse' },
    });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /must differ/i);
  });

  test('rejects unauthenticated requests', async () => {
    const res = await server.request('/api/auth/change-password', {
      method: 'POST',
      body: { currentPassword: 'x', newPassword: 'y' },
    });
    assert.equal(res.status, 401);
  });

  test('changes the password and logs in with the new one', async () => {
    const res = await server.request('/api/auth/change-password', {
      method: 'POST',
      token: await tokenFor(String(userB._id)),
      body: { currentPassword: 'battery-staple', newPassword: 'correct-staple-new' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);

    const oldLogin = await server.request('/api/auth/login', {
      method: 'POST',
      body: { email: 'b@test.local', password: 'battery-staple' },
    });
    assert.equal(oldLogin.status, 400);

    const newLogin = await server.request('/api/auth/login', {
      method: 'POST',
      body: { email: 'b@test.local', password: 'correct-staple-new' },
    });
    assert.equal(newLogin.status, 200);
    assert.equal(newLogin.body.user.email, 'b@test.local');
  });

  test('invalidates the credential that changed the password, and every other one', async () => {
    const user = await createUser('pwchange@test.local', 'PwChange', 'original-password');
    const id = String(user._id);

    const actingDevice = await tokenFor(id);
    const otherDevice = await tokenFor(id);

    const res = await server.request('/api/auth/change-password', {
      method: 'POST',
      token: actingDevice,
      body: { currentPassword: 'original-password', newPassword: 'replacement-password' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.token, 'a replacement credential is issued to the caller');

    // Every credential minted before the change is now worthless, including the
    // one that made the request.
    assert.equal(
      (await server.request('/api/auth/me', { token: actingDevice })).status,
      401,
      'the pre-change credential is dead'
    );
    assert.equal(
      (await server.request('/api/auth/me', { token: otherDevice })).status,
      401,
      'other sessions are signed out too'
    );

    // The replacement credential works, so the caller is not dropped at login.
    const me = await server.request('/api/auth/me', { token: res.body.token });
    assert.equal(me.status, 200, 'the replacement credential authenticates');

    // A pre-Phase-17 credential is invalidated by the same bump.
    const legacy = legacyTokenFor(id);
    assert.equal(
      (await server.request('/api/auth/me', { token: legacy })).status,
      401,
      'a credential issued before the counter existed is also invalidated'
    );

    await User.deleteOne({ _id: user._id });
  });

  test('a failed password change does not invalidate existing credentials', async () => {
    const user = await createUser('pwfail@test.local', 'PwFail', 'original-password');
    const id = String(user._id);
    const token = await tokenFor(id);

    const res = await server.request('/api/auth/change-password', {
      method: 'POST',
      token,
      body: { currentPassword: 'wrong-current', newPassword: 'replacement-password' },
    });
    assert.equal(res.status, 400);

    // Rejection happens before the counter is touched, so a failed attempt must
    // not lock the legitimate user out of their own account.
    const me = await server.request('/api/auth/me', { token });
    assert.equal(me.status, 200, 'a failed change leaves the session intact');

    const stillValid = await server.request('/api/auth/login', {
      method: 'POST',
      body: { email: 'pwfail@test.local', password: 'original-password' },
    });
    assert.equal(stillValid.status, 200, 'the original password is unchanged');

    await User.deleteOne({ _id: user._id });
  });
});

describe('Auth POST /api/auth/export-data', () => {
  test('exports only the requesting user data and never secrets', async () => {
    await cleanExceptUsers();
    await seedOwned(String(userA._id), 'a@test.local');

    const res = await server.request('/api/auth/export-data', {
      method: 'POST',
      token: await tokenFor(String(userA._id)),
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.user.email, 'a@test.local');
    assert.ok(!res.body.user.passwordHash, 'no password hash in export');
    assert.equal(res.body.decisions.length, 1);
    assert.equal(res.body.claims.length, 1);

    assert.equal(res.body.models.length, 1);
    const exportedModel = res.body.models[0];
    assert.ok(!('apiKey' in exportedModel), 'no model apiKey in export');
    assert.ok(!('apiKeyHint' in exportedModel), 'no model apiKeyHint in export');

    const serialized = JSON.stringify(res.body);
    assert.ok(!serialized.includes('sk-test-secret'), 'no model API key in export');
    assert.ok(!serialized.includes('sk-te'), 'no model apiKeyHint in export');
    assert.ok(!serialized.includes('correct-horse'), 'no active password in export');
    assert.ok(!serialized.includes('correct-staple-new'), 'no new password in export');
  });

  test('never includes another user records in the export', async () => {
    await cleanExceptUsers();
    await seedOwned(String(userA._id), 'a@test.local');

    const resB = await server.request('/api/auth/export-data', {
      method: 'POST',
      token: await tokenFor(String(userB._id)),
    });
    assert.equal(resB.status, 200);
    assert.equal(resB.body.user.email, 'b@test.local');
    assert.equal(resB.body.decisions.length, 0, 'user B has no decisions');
    assert.equal(resB.body.agents.length, 0, 'user B has no agents');
    assert.equal(resB.body.models.length, 0, 'user B has no models');
  });

  test('rejects unauthenticated export', async () => {
    const res = await server.request('/api/auth/export-data', { method: 'POST' });
    assert.equal(res.status, 401);
  });
});

describe('Auth DELETE /api/auth/account', () => {
  test('deletes own account and every owned record', async () => {
    await cleanExceptUsers();
    await seedOwned(String(userA._id), 'a@test.local');

    const res = await server.request('/api/auth/account', {
      method: 'DELETE',
      token: await tokenFor(String(userA._id)),
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);

    assert.equal(await User.countDocuments({ _id: userA._id }), 0, 'user deleted');
    assert.equal(await Agent.countDocuments({ userId: userA._id }), 0);
    assert.equal(await Model.countDocuments({ userId: userA._id }), 0);
    assert.equal(await Courtroom.countDocuments({ userId: userA._id }), 0);
    assert.equal(await Message.countDocuments({}), 0, 'courtroom messages removed');
    assert.equal(await Verdict.countDocuments({}), 0, 'courtroom verdicts removed');
    assert.equal(await Decision.countDocuments({ userId: userA._id }), 0);
    assert.equal(await Claim.countDocuments({}), 0, 'claims cascade-removed');
    assert.equal(await Evidence.countDocuments({}), 0, 'evidence cascade-removed');
    assert.equal(await EvidenceRelationship.countDocuments({}), 0, 'evidence graph cascade-removed');
    assert.equal(await Execution.countDocuments({}), 0, 'executions cascade-removed');
    assert.equal(await Task.countDocuments({}), 0, 'tasks cascade-removed');
    assert.equal(await ExecutionEvent.countDocuments({}), 0, 'execution events cascade-removed');
    assert.equal(await DecisionPlan.countDocuments({}), 0, 'plans cascade-removed');
    assert.equal(await VerificationResult.countDocuments({}), 0, 'verifications cascade-removed');
    assert.equal(await RedTeamFinding.countDocuments({}), 0, 'red team findings cascade-removed');
    assert.equal(await ReconciliationResult.countDocuments({}), 0, 'reconciliation cascade-removed');
    assert.equal(await DecisionMemory.countDocuments({ userId: userA._id }), 0);
    assert.equal(await Outcome.countDocuments({ userId: userA._id }), 0);
    assert.equal(await DecisionLesson.countDocuments({ userId: userA._id }), 0);
    assert.equal(await Benchmark.countDocuments({ userId: userA._id }), 0);
    assert.equal(await BenchmarkCase.countDocuments({}), 0, 'benchmark cases cascade-removed');
    assert.equal(await Rubric.countDocuments({ userId: userA._id }), 0);
    assert.equal(await EvaluationRun.countDocuments({ userId: userA._id }), 0);
    assert.equal(await EvaluationCaseResult.countDocuments({}), 0, 'run results cascade-removed');
    assert.equal(await Baseline.countDocuments({ userId: userA._id }), 0);
    assert.equal(await EvaluationComparison.countDocuments({}), 0, 'comparisons cascade-removed');
  });

  test('does not delete another user records', async () => {
    // The preceding test deleted this account, so it has to be recreated before
    // it can act as the attacker. Previously this ran on a token naming a user
    // that no longer existed — `requireAuth` accepted it, which is exactly the
    // ghost-account behaviour this suite now forbids.
    userA = await ensureUser('a@test.local', 'Alice', 'correct-horse');
    await cleanExceptUsers();
    await seedOwned(String(userA._id), 'a@test.local');
    await seedOwned(String(userB._id), 'b@test.local');

    const res = await server.request('/api/auth/account', {
      method: 'DELETE',
      token: await tokenFor(String(userA._id)),
    });
    assert.equal(res.status, 200);

    assert.equal(await User.countDocuments({ _id: userB._id }), 1, 'user B still exists');
    assert.equal(await Decision.countDocuments({ userId: userB._id }), 1, 'user B decisions intact');
    assert.equal(await Agent.countDocuments({ userId: userB._id }), 1, 'user B agents intact');
    assert.equal(await Courtroom.countDocuments({ userId: userB._id }), 1, 'user B courtrooms intact');

    const userBString = String(userB._id);
    const userAString = String(userA._id);
    const userBDecision = await Decision.findOne({ userId: userB._id });
    const userBExecution = await Execution.findOne({ decisionId: userBDecision?._id });
    const userBDecisionId = userBDecision?._id ? String(userBDecision._id) : undefined;
    const userBExecutionId = userBExecution?._id ? String(userBExecution._id) : undefined;
    assert.ok(userBDecisionId, 'user B decision exists');
    assert.ok(userBExecutionId, 'user B execution exists');

    assert.equal(
      await ExecutionEvent.countDocuments({ executionId: userBExecutionId }),
      1,
      'user B executionId-scoped event remains'
    );
    assert.equal(
      await ExecutionEvent.countDocuments({ decisionId: userBDecisionId, executionId: { $exists: false } }),
      1,
      'user B decisionId-only (memory.created) event remains'
    );
    assert.equal(
      await ExecutionEvent.countDocuments({ 'data.userId': userBString }),
      1,
      'user B data.userId-scoped (evaluation.run.started) event remains'
    );

    assert.equal(
      await ExecutionEvent.countDocuments({ 'data.userId': userAString }),
      0,
      'no user A data.userId-scoped event remains'
    );
  });

  test('rejects unauthenticated account deletion', async () => {
    const res = await server.request('/api/auth/account', { method: 'DELETE' });
    assert.equal(res.status, 401);
  });

  test('a credential minted before deletion stops authenticating', async () => {
    const user = await createUser('deleted@test.local', 'Deleted', 'deleted-password');
    const id = String(user._id);
    const token = await tokenFor(id);

    assert.equal((await server.request('/api/auth/me', { token })).status, 200);

    const res = await server.request('/api/auth/account', { method: 'DELETE', token });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);

    // The signature is still valid and the token has not expired. It must fail
    // anyway, because the user document it names no longer exists — this is the
    // case that previously let a deleted account keep writing rows.
    assert.equal(await User.countDocuments({ _id: user._id }), 0, 'the user is gone');

    for (const [path, opts] of [
      ['/api/auth/me', {}],
      ['/api/auth/export-data', { method: 'POST' }],
      ['/api/auth/change-password', { method: 'POST', body: { currentPassword: 'deleted-password', newPassword: 'whatever-password' } }],
      ['/api/auth/logout', { method: 'POST' }],
      ['/api/auth/account', { method: 'DELETE' }],
    ] as const) {
      const after = await server.request(path, { token, ...opts });
      assert.equal(after.status, 401, `a deleted account must not authenticate on ${path}`);
    }

    const login = await server.request('/api/auth/login', {
      method: 'POST',
      body: { email: 'deleted@test.local', password: 'deleted-password' },
    });
    assert.equal(login.status, 400, 'a deleted account cannot sign in again');
  });

  test('deleting one account does not invalidate another account', async () => {
    const survivor = await createUser('survivor@test.local', 'Survivor', 'survivor-password');
    const victim = await createUser('victim@test.local', 'Victim', 'victim-password');
    const survivorToken = await tokenFor(String(survivor._id));

    await server.request('/api/auth/account', {
      method: 'DELETE',
      token: await tokenFor(String(victim._id)),
    });

    const me = await server.request('/api/auth/me', { token: survivorToken });
    assert.equal(me.status, 200, 'invalidation is scoped to the deleted account');

    await User.deleteOne({ _id: survivor._id });
  });
});

describe('Auth POST /api/auth/signup and /api/auth/login input validation', () => {
  test('signup rejects a non-string password instead of throwing a 500', async () => {
    const res = await server.request('/api/auth/signup', {
      method: 'POST',
      body: { email: 'nonstring@test.local', name: 'Non String', password: { $gt: '' } },
    });
    assert.equal(res.status, 400, 'a malformed credential is a client error, not a server fault');
    assert.ok(!res.body.token, 'no credential is issued');
    assert.equal(await User.countDocuments({ email: 'nonstring@test.local' }), 0);
  });

  test('signup rejects a password shorter than the change-password policy', async () => {
    const res = await server.request('/api/auth/signup', {
      method: 'POST',
      body: { email: 'shortpw@test.local', name: 'Short', password: 'short' },
    });
    assert.equal(res.status, 400);
    assert.ok(!res.body.token, 'no credential is issued');
    assert.equal(await User.countDocuments({ email: 'shortpw@test.local' }), 0);
  });

  test('login rejects a non-string password instead of throwing a 500', async () => {
    await createUser('numpw@test.local', 'NumPw', 'correct-horse-battery');
    const res = await server.request('/api/auth/login', {
      method: 'POST',
      body: { email: 'numpw@test.local', password: 12345 },
    });
    assert.equal(res.status, 400);
    assert.ok(!res.body.token, 'no credential is issued');
    await User.deleteOne({ email: 'numpw@test.local' });
  });

  test('login cannot be turned into an operator-injection auth bypass', async () => {
    await createUser('victim@test.local', 'Victim', 'correct-horse-battery');
    const res = await server.request('/api/auth/login', {
      method: 'POST',
      // Without a runtime type check this object reaches `User.findOne` as
      // `{ email: { $gt: '' } }`, which matches the first account in the
      // collection and would authenticate with any password.
      body: { email: { $gt: '' }, password: 'correct-horse-battery' },
    });
    assert.equal(res.status, 400, 'a non-string email is rejected, not matched');
    assert.ok(!res.body.token, 'operator injection issues no credential');
    await User.deleteOne({ email: 'victim@test.local' });
  });
});