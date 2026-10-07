import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'http';
import mongoose from 'mongoose';
import type { AddressInfo } from 'net';
import User from '../models/User';
import Agent from '../models/Agent';
import Courtroom from '../models/Courtroom';
import Message from '../models/Message';
import Verdict from '../models/Verdict';
import Decision from '../models/Decision';
import Claim from '../models/Claim';
import Evidence from '../models/Evidence';
import Execution from '../models/Execution';
import Task from '../models/Task';
import DecisionMemory from '../models/DecisionMemory';
import Outcome from '../models/Outcome';
import Model from '../models/Model';
import decisionsRouter from '../routes/decisions';
import courtroomsRouter from '../routes/courtrooms';
import modelsRouter from '../routes/models';
import agentsRouter from '../routes/agents';
import { signToken } from '../utils/authToken';

/**
 * Phase 22 — authorization and input-boundary regressions.
 *
 * These tests drive the real routers over HTTP against a real Mongo instance.
 * They exist to pin the three ownership/validation holes closed in this phase:
 *   1. courtroom messages/verdict had no parent-ownership check (BOLA);
 *   2. deleting a decision cascaded into children by `decisionId` alone, so a
 *      foreign decision id could destroy another user's rows;
 *   3. generic update endpoints spread the raw body into the model, so a caller
 *      could rewrite ownership/lifecycle fields (mass assignment).
 */
const TEST_URI =
  process.env.MONGODB_URI_TEST_PHASE22 || 'mongodb://localhost:27017/hathap_test_phase22_authz';

async function tokenFor(id: string): Promise<string> {
  const user = await User.findById(id);
  assert.ok(user, `tokenFor() expected an existing user, got ${id}`);
  return signToken(user);
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
  app.use('/api/decisions', decisionsRouter);
  app.use('/api/courtrooms', courtroomsRouter);
  app.use('/api/models', modelsRouter);
  app.use('/api/agents', agentsRouter);
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
    Decision.deleteMany({}),
    Claim.deleteMany({}),
    Evidence.deleteMany({}),
    Execution.deleteMany({}),
    Task.deleteMany({}),
    DecisionMemory.deleteMany({}),
    Outcome.deleteMany({}),
    Courtroom.deleteMany({}),
    Message.deleteMany({}),
    Verdict.deleteMany({}),
    Model.deleteMany({}),
    Agent.deleteMany({}),
  ]);
}

async function seedCourtroom(ownerId: string): Promise<string> {
  const courtroom = await Courtroom.create({ userId: ownerId, name: 'Owned Court', mode: 'consensus' });
  await Message.create({
    courtroomId: courtroom._id,
    content: 'owner-only message',
    agentName: 'agent',
    role: 'debater',
    roundNumber: 1,
  });
  await Verdict.create({
    courtroomId: courtroom._id,
    summary: 'summary',
    recommendation: 'recommendation',
    confidenceScore: 70,
  });
  return String(courtroom._id);
}

async function seedDecisionWithChildren(ownerId: string): Promise<string> {
  const decision = await Decision.create({
    userId: ownerId,
    title: 'Owner decision',
    objective: 'Owned objective',
    status: 'draft',
  });
  const decisionId = String(decision._id);
  const execution = await Execution.create({
    decisionId,
    status: 'completed',
    progress: 100,
    currentPhase: 'completed',
  });
  await Task.create({ executionId: String(execution._id), type: 'debate', status: 'completed' });
  await Claim.create({ decisionId, text: 'claim', type: 'fact', status: 'proposed' });
  await Evidence.create({ decisionId, title: 'evidence', content: 'content', sourceType: 'user_input' });
  await DecisionMemory.create({
    userId: ownerId,
    decisionId,
    title: 'Owner decision',
    objective: 'Owned objective',
    summary: 'memory',
    quality: 'high',
  });
  await Outcome.create({
    userId: ownerId,
    decisionId,
    kind: 'expected',
    status: 'pending',
    description: 'outcome',
  });
  return decisionId;
}

async function childCounts(decisionId: string): Promise<Record<string, number>> {
  const [executions, tasks, claims, evidence, memories, outcomes] = await Promise.all([
    Execution.countDocuments({ decisionId }),
    Task.countDocuments({}),
    Claim.countDocuments({ decisionId }),
    Evidence.countDocuments({ decisionId }),
    DecisionMemory.countDocuments({ decisionId }),
    Outcome.countDocuments({ decisionId }),
  ]);
  return { executions, tasks, claims, evidence, memories, outcomes };
}

let userA: string;
let userB: string;
let server: Awaited<ReturnType<typeof makeServer>>;

before(async () => {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(TEST_URI);
  }
  await clean();
  await User.deleteMany({});
  const a = await User.create({ email: 'phase22-a@test.local', name: 'A', passwordHash: 'x' });
  const b = await User.create({ email: 'phase22-b@test.local', name: 'B', passwordHash: 'x' });
  userA = String(a._id);
  userB = String(b._id);
  server = await makeServer();
});

after(async () => {
  server?.server.close();
  await clean();
  await User.deleteMany({});
  await mongoose.connection.close();
});

beforeEach(async () => {
  await clean();
});

describe('Phase 22 - courtroom messages/verdict ownership', () => {
  test('the owner can read messages and verdict', async () => {
    const courtroomId = await seedCourtroom(userA);
    const token = await tokenFor(userA);

    const messages = await server.request(`/api/courtrooms/${courtroomId}/messages`, { token });
    assert.equal(messages.status, 200);
    assert.equal(messages.body.length, 1, 'owner sees the message');

    const verdict = await server.request(`/api/courtrooms/${courtroomId}/verdict`, { token });
    assert.equal(verdict.status, 200);
    assert.equal(verdict.body.recommendation, 'recommendation');
  });

  test('another authenticated user cannot read a courtroom they do not own', async () => {
    const courtroomId = await seedCourtroom(userA);
    const token = await tokenFor(userB);

    const messages = await server.request(`/api/courtrooms/${courtroomId}/messages`, { token });
    assert.equal(messages.status, 404, 'foreign messages are not disclosed');

    const verdict = await server.request(`/api/courtrooms/${courtroomId}/verdict`, { token });
    assert.equal(verdict.status, 404, 'foreign verdict is not disclosed');
  });

  test('a malformed courtroom id is a controlled 404, not a 500', async () => {
    const token = await tokenFor(userA);
    const messages = await server.request('/api/courtrooms/not-an-object-id/messages', { token });
    assert.equal(messages.status, 404);
    const verdict = await server.request('/api/courtrooms/not-an-object-id/verdict', { token });
    assert.equal(verdict.status, 404);
  });
});

describe('Phase 22 - decision deletion cascade ownership', () => {
  test('deleting another user’s decision is refused and destroys nothing', async () => {
    const decisionId = await seedDecisionWithChildren(userA);
    const before = await childCounts(decisionId);

    const res = await server.request(`/api/decisions/${decisionId}`, {
      method: 'DELETE',
      token: await tokenFor(userB),
    });
    assert.equal(res.status, 404, 'a foreign decision is not deletable');

    assert.ok(await Decision.findById(decisionId), 'the owner’s decision survives');
    assert.deepEqual(await childCounts(decisionId), before, 'no child row was removed cross-tenant');
  });

  test('the owner deleting their own decision cascades to every child', async () => {
    const decisionId = await seedDecisionWithChildren(userA);

    const res = await server.request(`/api/decisions/${decisionId}`, {
      method: 'DELETE',
      token: await tokenFor(userA),
    });
    assert.equal(res.status, 200);

    assert.equal(await Decision.findById(decisionId), null, 'decision removed');
    assert.deepEqual(await childCounts(decisionId), {
      executions: 0,
      tasks: 0,
      claims: 0,
      evidence: 0,
      memories: 0,
      outcomes: 0,
    });
  });

  test('a malformed decision id is a controlled 404', async () => {
    const res = await server.request('/api/decisions/not-an-object-id', {
      method: 'DELETE',
      token: await tokenFor(userA),
    });
    assert.equal(res.status, 404);
  });
});

describe('Phase 22 - mass assignment on generic update endpoints', () => {
  test('update a decision cannot rewrite ownership or lifecycle fields', async () => {
    const decisionId = await seedDecisionWithChildren(userA);

    const res = await server.request(`/api/decisions/${decisionId}`, {
      method: 'PUT',
      token: await tokenFor(userA),
      body: { title: 'New title', userId: userB, status: 'completed', currentPhase: 'completed' },
    });
    assert.equal(res.status, 200);

    const stored = await Decision.findById(decisionId) as any;
    assert.equal(stored.title, 'New title', 'an allowed field is applied');
    assert.equal(String(stored.userId), userA, 'ownership is not reassignable');
    assert.equal(stored.status, 'draft', 'status is not writable through the generic update');
    assert.equal(stored.currentPhase, 'draft', 'currentPhase is not writable through the generic update');
  });

  test('update a decision rejects an empty title', async () => {
    const decisionId = await seedDecisionWithChildren(userA);
    const res = await server.request(`/api/decisions/${decisionId}`, {
      method: 'PUT',
      token: await tokenFor(userA),
      body: { title: '   ' },
    });
    assert.equal(res.status, 400);
  });

  test('update a model cannot rewrite ownership or the server-managed status', async () => {
    const model = await Model.create({
      userId: userA,
      provider: 'openai',
      displayName: 'Old',
      modelName: 'gpt-test',
      baseUrl: 'https://example.test/v1',
      status: 'untested',
      enabled: true,
    });

    const res = await server.request(`/api/models/${model._id}`, {
      method: 'PUT',
      token: await tokenFor(userA),
      body: { displayName: 'New', enabled: false, userId: userB, status: 'connected' },
    });
    assert.equal(res.status, 200);

    const stored = await Model.findById(model._id) as any;
    assert.equal(stored.displayName, 'New', 'an allowed field is applied');
    assert.equal(stored.enabled, false, 'an allowed field is applied');
    assert.equal(String(stored.userId), userA, 'ownership is not reassignable');
    assert.equal(stored.status, 'untested', 'status stays server-managed');
  });

  /**
   * Before this guard a caller could rewrite `userId` on their own agent or
   * courtroom, which does not merely edit the document — it moves it into
   * someone else's workspace. The attacker keeps the id they already know, and
   * the victim's roster silently gains an attacker-authored `systemPrompt` (or
   * courtroom objective/participants) that runs inside their debates.
   */
  test('update an agent cannot rewrite ownership', async () => {
    const agent = await Agent.create({
      userId: userA,
      name: 'Owned agent',
      systemPrompt: 'owner-authored prompt',
    });

    const res = await server.request(`/api/agents/${agent._id}`, {
      method: 'PUT',
      token: await tokenFor(userA),
      body: { name: 'Renamed', userId: userB, createdAt: new Date('2000-01-01') },
    });
    assert.equal(res.status, 200);

    const stored = await Agent.findById(agent._id) as any;
    assert.equal(stored.name, 'Renamed', 'an allowed field is applied');
    assert.equal(String(stored.userId), userA, 'ownership is not reassignable');
    assert.notEqual(stored.createdAt.toISOString(), '2000-01-01T00:00:00.000Z', 'createdAt stays server-managed');

    const inVictim = await Agent.find({ userId: userB });
    assert.equal(inVictim.length, 0, 'the agent never lands in the other user workspace');
  });

  test('update a courtroom cannot rewrite ownership', async () => {
    const courtroomId = await seedCourtroom(userA);

    const res = await server.request(`/api/courtrooms/${courtroomId}`, {
      method: 'PUT',
      token: await tokenFor(userA),
      body: { name: 'Renamed Court', userId: userB },
    });
    assert.equal(res.status, 200);

    const stored = await Courtroom.findById(courtroomId) as any;
    assert.equal(stored.name, 'Renamed Court', 'an allowed field is applied');
    assert.equal(String(stored.userId), userA, 'ownership is not reassignable');

    const inVictim = await Courtroom.find({ userId: userB });
    assert.equal(inVictim.length, 0, 'the courtroom never lands in the other user workspace');
  });
});
