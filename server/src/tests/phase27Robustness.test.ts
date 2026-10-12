import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'http';
import mongoose from 'mongoose';
import type { AddressInfo } from 'net';
import User from '../models/User';
import Agent from '../models/Agent';
import Model from '../models/Model';
import Courtroom from '../models/Courtroom';
import agentsRouter from '../routes/agents';
import modelsRouter from '../routes/models';
import courtroomsRouter from '../routes/courtrooms';
import { signToken } from '../utils/authToken';

/**
 * Phase 27 — input-boundary / availability regressions.
 *
 * The generic delete endpoints for agents, models and courtrooms were async
 * handlers with no id validation and no try/catch. A malformed id made Mongoose
 * cast the filter to an ObjectId, which rejects the handler's promise; Express 4
 * does not forward that rejection, so it became an unhandled rejection and Node
 * terminated the whole process — every in-flight connection reset. Any
 * authenticated caller could trigger it with a single request.
 *
 * These tests pin the routes to a controlled 404 and prove the process keeps
 * serving afterwards.
 */
const TEST_URI =
  process.env.MONGODB_URI_TEST_PHASE27 || 'mongodb://localhost:27017/hathap_test_phase27_robustness';

async function tokenFor(id: string): Promise<string> {
  const user = await User.findById(id);
  assert.ok(user, `tokenFor() expected an existing user, got ${id}`);
  return signToken(user);
}

async function makeServer(): Promise<{
  server: http.Server;
  request: (
    path: string,
    opts?: { method?: string; token?: string; body?: any }
  ) => Promise<{ status: number; body: any }>;
}> {
  const app = express();
  app.use(express.json());
  app.use('/api/agents', agentsRouter);
  app.use('/api/models', modelsRouter);
  app.use('/api/courtrooms', courtroomsRouter);
  app.get('/health', (_req, res) => res.json({ ok: true }));
  const server = await new Promise<http.Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const port = (server.address() as AddressInfo).port;
  return {
    server,
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
  await Promise.all([Agent.deleteMany({}), Model.deleteMany({}), Courtroom.deleteMany({})]);
}

let userA: string;
let userB: string;
let server: Awaited<ReturnType<typeof makeServer>>;

const MALFORMED = 'not-an-object-id';

before(async () => {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(TEST_URI);
  }
  await clean();
  await User.deleteMany({});
  const a = await User.create({ email: 'phase27-a@test.local', name: 'A', passwordHash: 'x' });
  const b = await User.create({ email: 'phase27-b@test.local', name: 'B', passwordHash: 'x' });
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

describe('Phase 27 - malformed id on generic delete is a controlled response', () => {
  test('DELETE /api/agents/:id rejects a malformed id with 404 and keeps serving', async () => {
    const token = await tokenFor(userA);
    const res = await server.request(`/api/agents/${MALFORMED}`, { method: 'DELETE', token });
    assert.equal(res.status, 404, 'malformed agent id must not crash the process');

    const health = await server.request('/health');
    assert.equal(health.status, 200, 'server is still serving after a malformed delete');
  });

  test('DELETE /api/models/:id rejects a malformed id with 404 and keeps serving', async () => {
    const token = await tokenFor(userA);
    const res = await server.request(`/api/models/${MALFORMED}`, { method: 'DELETE', token });
    assert.equal(res.status, 404, 'malformed model id must not crash the process');

    const health = await server.request('/health');
    assert.equal(health.status, 200, 'server is still serving after a malformed delete');
  });

  test('DELETE /api/courtrooms/:id rejects a malformed id with 404 and keeps serving', async () => {
    const token = await tokenFor(userA);
    const res = await server.request(`/api/courtrooms/${MALFORMED}`, { method: 'DELETE', token });
    assert.equal(res.status, 404, 'malformed courtroom id must not crash the process');

    const health = await server.request('/health');
    assert.equal(health.status, 200, 'server is still serving after a malformed delete');
  });

  test('PUT with a malformed id is a controlled 404, not a 500', async () => {
    const token = await tokenFor(userA);
    const agent = await server.request(`/api/agents/${MALFORMED}`, {
      method: 'PUT',
      token,
      body: { name: 'x' },
    });
    assert.equal(agent.status, 404);
    const model = await server.request(`/api/models/${MALFORMED}`, {
      method: 'PUT',
      token,
      body: { displayName: 'x' },
    });
    assert.equal(model.status, 404);
    const courtroom = await server.request(`/api/courtrooms/${MALFORMED}`, {
      method: 'PUT',
      token,
      body: { name: 'x' },
    });
    assert.equal(courtroom.status, 404);
  });
});

describe('Phase 27 - a foreign delete removes nothing', () => {
  test('another user deleting an agent/model/courtroom leaves the owner data intact', async () => {
    const agent = await Agent.create({ userId: userA, name: 'Owned agent' });
    const model = await Model.create({
      userId: userA,
      provider: 'openai',
      displayName: 'Owned model',
      modelName: 'gpt-test',
      status: 'untested',
      enabled: true,
    });
    const courtroom = await Courtroom.create({ userId: userA, name: 'Owned court', mode: 'consensus' });

    const token = await tokenFor(userB);
    await server.request(`/api/agents/${agent._id}`, { method: 'DELETE', token });
    await server.request(`/api/models/${model._id}`, { method: 'DELETE', token });
    await server.request(`/api/courtrooms/${courtroom._id}`, { method: 'DELETE', token });

    assert.ok(await Agent.findById(agent._id), 'foreign delete must not remove the agent');
    assert.ok(await Model.findById(model._id), 'foreign delete must not remove the model');
    assert.ok(await Courtroom.findById(courtroom._id), 'foreign delete must not remove the courtroom');
  });
});
