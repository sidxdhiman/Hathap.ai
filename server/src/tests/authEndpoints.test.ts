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

const TEST_URI = process.env.MONGODB_URI_TEST_AUTH || 'mongodb://localhost:27017/hathap_test_auth';
const JWT_SECRET = process.env.JWT_SECRET || 'secret';

function tokenFor(id: string): string {
  return jwt.sign({ id }, JWT_SECRET);
}

async function makeServer(): Promise<{
  server: http.Server;
  port: number;
  request: (
    path: string,
    opts?: { method?: string; token?: string; body?: any }
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
      if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
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
    const res = await server.request('/api/auth/me', { token: tokenFor(String(userA._id)) });
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

  test('returns 404 for an unknown token user', async () => {
    const res = await server.request('/api/auth/me', { token: tokenFor(new mongoose.Types.ObjectId().toString()) });
    assert.equal(res.status, 404);
  });
});

describe('Auth POST /api/auth/change-password', () => {
  test('rejects a wrong current password', async () => {
    const res = await server.request('/api/auth/change-password', {
      method: 'POST',
      token: tokenFor(String(userA._id)),
      body: { currentPassword: 'wrong-password', newPassword: 'a-brand-new-ok-password' },
    });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /Current password is incorrect/i);
  });

  test('rejects a too-short new password', async () => {
    const res = await server.request('/api/auth/change-password', {
      method: 'POST',
      token: tokenFor(String(userA._id)),
      body: { currentPassword: 'correct-horse', newPassword: 'short' },
    });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /at least 8 characters/i);
  });

  test('rejects a new password identical to the current one', async () => {
    const res = await server.request('/api/auth/change-password', {
      method: 'POST',
      token: tokenFor(String(userA._id)),
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
      token: tokenFor(String(userB._id)),
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
});

describe('Auth POST /api/auth/export-data', () => {
  test('exports only the requesting user data and never secrets', async () => {
    await cleanExceptUsers();
    await seedOwned(String(userA._id), 'a@test.local');

    const res = await server.request('/api/auth/export-data', {
      method: 'POST',
      token: tokenFor(String(userA._id)),
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
      token: tokenFor(String(userB._id)),
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
      token: tokenFor(String(userA._id)),
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
    await cleanExceptUsers();
    await seedOwned(String(userA._id), 'a@test.local');
    await seedOwned(String(userB._id), 'b@test.local');

    const res = await server.request('/api/auth/account', {
      method: 'DELETE',
      token: tokenFor(String(userA._id)),
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
});