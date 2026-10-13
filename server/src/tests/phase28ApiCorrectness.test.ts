import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'http';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import type { AddressInfo } from 'net';
import User from '../models/User';
import Agent from '../models/Agent';
import Model from '../models/Model';
import Courtroom from '../models/Courtroom';
import agentsRouter from '../routes/agents';
import modelsRouter from '../routes/models';
import courtroomsRouter from '../routes/courtrooms';
import decisionsRouter from '../routes/decisions';
import authRouter from '../routes/auth';
import { signToken } from '../utils/authToken';

/**
 * Phase 28 — API correctness & input-validation regressions.
 *
 * Three defects are pinned here:
 *
 *  1. `PUT /api/{agents,courtrooms}/:id` called `findOneAndUpdate` scoped to the
 *     caller and serialized the result directly. A valid-but-foreign id (or one
 *     that simply does not exist) matches nothing, so the handler answered
 *     `200 null` — a success body the client applied optimistically and never
 *     resynced, leaving the UI claiming an edit the server never persisted. The
 *     model router already guarded this; agents and courtrooms did not.
 *  2. `DELETE` on all three routers answered an unconditional `{ ok: true }`,
 *     so a caller was told a delete succeeded even when it matched nothing.
 *     Both a foreign id and an already-removed id now return the same 404 the
 *     update path returns, which also keeps the response from disclosing
 *     whether a foreign resource exists.
 *  3. `POST /api/models/:id/test` had no malformed-id guard, and its catch
 *     block re-queried the same raw id: a malformed id raised a CastError in
 *     the handler, the catch raised another outside any handler, and the caller
 *     was left with no response at all. `POST /api/courtrooms/:id/start`
 *     likewise surfaced a malformed id as a 500 from `validateDebateReady`.
 *
 * Input validation: a non-string `currentPassword` reached `bcrypt.compare`,
 * which throws and turned a malformed request into a 500; a structurally
 * invalid signup email created an unusable account. Both are now controlled
 * 400s. Every case also proves the process is still serving afterwards, so a
 * rejected request can neither crash the server nor poison unrelated work.
 */
const TEST_URI =
  process.env.MONGODB_URI_TEST_PHASE28 || 'mongodb://localhost:27017/hathap_test_phase28_api';

const MALFORMED = 'not-an-object-id';
// Validly formatted, but guaranteed to match no document.
const NONEXISTENT = new mongoose.Types.ObjectId().toString();

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
  healthy: () => Promise<boolean>;
}> {
  const app = express();
  app.use(express.json());
  app.use('/api/agents', agentsRouter);
  app.use('/api/models', modelsRouter);
  app.use('/api/courtrooms', courtroomsRouter);
  app.use('/api/decisions', decisionsRouter);
  app.use('/api/auth', authRouter);
  app.get('/health', (_req, res) => res.json({ ok: true }));
  const server = await new Promise<http.Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const port = (server.address() as AddressInfo).port;
  const request = async (
    path: string,
    opts: { method?: string; token?: string; body?: any } = {}
  ) => {
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
  };
  return {
    server,
    request,
    healthy: async () => (await request('/health')).status === 200,
  };
}

async function clean(): Promise<void> {
  await Promise.all([Agent.deleteMany({}), Model.deleteMany({}), Courtroom.deleteMany({})]);
}

/**
 * Temporarily replaces one of a Mongoose model's statics with a rejecting
 * function so a route's database-failure path can be exercised, restoring the
 * original afterwards. Safe because the suite runs serially
 * (`--test-concurrency=1`), so nothing else touches the model meanwhile.
 */
async function withDbFailure(collection: any, method: string, fn: () => Promise<void>): Promise<void> {
  const original = collection[method];
  collection[method] = () => Promise.reject(new Error('simulated database failure'));
  try {
    await fn();
  } finally {
    collection[method] = original;
  }
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
  const a = await User.create({ email: 'phase28-a@test.local', name: 'A', passwordHash: 'x' });
  const b = await User.create({ email: 'phase28-b@test.local', name: 'B', passwordHash: 'x' });
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

/** Per-resource configuration so the PUT/DELETE matrix stays readable. */
interface ResourceCase {
  label: string;
  collection: any;
  seed: (userId: string) => Promise<{ _id: any }>;
  apiBase: string;
  putBody: Record<string, unknown>;
  assertPutApplied: (doc: any) => void;
  assertSeedUnchanged: (doc: any) => void;
  dbFailPut: string;
  dbFailDelete: string;
}

const resources: ResourceCase[] = [
  {
    label: 'agent',
    collection: Agent,
    seed: (userId) => Agent.create({ userId, name: 'seed' }),
    apiBase: '/api/agents',
    putBody: { name: 'renamed' },
    assertPutApplied: (doc) => assert.equal(doc.name, 'renamed'),
    assertSeedUnchanged: (doc) => assert.equal(doc.name, 'seed'),
    dbFailPut: 'findOneAndUpdate',
    dbFailDelete: 'deleteOne',
  },
  {
    label: 'model',
    collection: Model,
    seed: (userId) =>
      Model.create({
        userId,
        provider: 'openai',
        displayName: 'seed',
        modelName: 'gpt-test',
        status: 'untested',
        enabled: true,
      }),
    apiBase: '/api/models',
    putBody: { displayName: 'renamed' },
    assertPutApplied: (doc) => assert.equal(doc.displayName, 'renamed'),
    assertSeedUnchanged: (doc) => assert.equal(doc.displayName, 'seed'),
    dbFailPut: 'findOne',
    dbFailDelete: 'deleteOne',
  },
  {
    label: 'courtroom',
    collection: Courtroom,
    seed: (userId) => Courtroom.create({ userId, name: 'seed', mode: 'consensus' }),
    apiBase: '/api/courtrooms',
    putBody: { name: 'renamed' },
    assertPutApplied: (doc) => assert.equal(doc.name, 'renamed'),
    assertSeedUnchanged: (doc) => assert.equal(doc.name, 'seed'),
    dbFailPut: 'findOneAndUpdate',
    dbFailDelete: 'deleteOne',
  },
];

describe('Phase 28 - PUT resolves to the caller-owned document or a controlled 404', () => {
  for (const r of resources) {
    test(`${r.label}: the owner can update their own resource (200)`, async () => {
      const token = await tokenFor(userA);
      const created = await r.seed(userA);
      const res = await server.request(`${r.apiBase}/${created._id}`, {
        method: 'PUT',
        token,
        body: r.putBody,
      });
      assert.equal(res.status, 200);
      assert.notEqual(res.body, null, 'the updated document is returned, never null');
      r.assertPutApplied(await r.collection.findById(created._id));
    });

    test(`${r.label}: a valid-but-foreign id is a 404 and changes nothing`, async () => {
      const intruderToken = await tokenFor(userB);
      const created = await r.seed(userA);
      const res = await server.request(`${r.apiBase}/${created._id}`, {
        method: 'PUT',
        token: intruderToken,
        body: r.putBody,
      });
      assert.equal(res.status, 404, 'a foreign resource must not be reported as updated');
      r.assertSeedUnchanged(await r.collection.findById(created._id));
      assert.equal(
        await r.collection.countDocuments({ userId: userB }),
        0,
        'the update never lands in the intruder workspace'
      );
    });

    test(`${r.label}: a well-formed but nonexistent id is a 404`, async () => {
      const token = await tokenFor(userA);
      const res = await server.request(`${r.apiBase}/${NONEXISTENT}`, {
        method: 'PUT',
        token,
        body: r.putBody,
      });
      assert.equal(res.status, 404);
      assert.notEqual(res.body, null);
    });

    test(`${r.label}: a malformed id is a 404, not a crash`, async () => {
      const token = await tokenFor(userA);
      const res = await server.request(`${r.apiBase}/${MALFORMED}`, {
        method: 'PUT',
        token,
        body: r.putBody,
      });
      assert.equal(res.status, 404);
      assert.ok(await server.healthy(), 'server still serving after a malformed PUT');
    });

    test(`${r.label}: a database failure is a controlled 500, not a hang`, async () => {
      const token = await tokenFor(userA);
      const created = await r.seed(userA);
      await withDbFailure(r.collection, r.dbFailPut, async () => {
        const res = await server.request(`${r.apiBase}/${created._id}`, {
          method: 'PUT',
          token,
          body: r.putBody,
        });
        assert.equal(res.status, 500);
      });
      assert.ok(await server.healthy(), 'server still serving after a database fault');
    });
  }
});

describe('Phase 28 - DELETE reports what it actually removed', () => {
  for (const r of resources) {
    test(`${r.label}: the owner can delete their own resource (200)`, async () => {
      const token = await tokenFor(userA);
      const created = await r.seed(userA);
      const res = await server.request(`${r.apiBase}/${created._id}`, { method: 'DELETE', token });
      assert.equal(res.status, 200);
      assert.equal(await r.collection.findById(created._id), null);
    });

    test(`${r.label}: a foreign delete is refused (404) and destroys nothing`, async () => {
      const intruderToken = await tokenFor(userB);
      const created = await r.seed(userA);
      const res = await server.request(`${r.apiBase}/${created._id}`, {
        method: 'DELETE',
        token: intruderToken,
      });
      assert.equal(res.status, 404);
      assert.ok(await r.collection.findById(created._id), 'the owner resource survives');
    });

    test(`${r.label}: a nonexistent id is a 404`, async () => {
      const token = await tokenFor(userA);
      const res = await server.request(`${r.apiBase}/${NONEXISTENT}`, { method: 'DELETE', token });
      assert.equal(res.status, 404);
    });

    test(`${r.label}: a malformed id is a 404, not a crash`, async () => {
      const token = await tokenFor(userA);
      const res = await server.request(`${r.apiBase}/${MALFORMED}`, { method: 'DELETE', token });
      assert.equal(res.status, 404);
      assert.ok(await server.healthy(), 'server still serving after a malformed DELETE');
    });

    test(`${r.label}: a database failure is a controlled 500, not a hang`, async () => {
      const token = await tokenFor(userA);
      const created = await r.seed(userA);
      await withDbFailure(r.collection, r.dbFailDelete, async () => {
        const res = await server.request(`${r.apiBase}/${created._id}`, {
          method: 'DELETE',
          token,
        });
        assert.equal(res.status, 500);
      });
      assert.ok(await server.healthy(), 'server still serving after a database fault');
      assert.ok(await r.collection.findById(created._id), 'a failed delete removes nothing');
    });
  }
});

describe('Phase 28 - remaining malformed-id paths answer instead of hanging', () => {
  test('POST /api/models/:id/test rejects a malformed id with 404 and keeps serving', async () => {
    const token = await tokenFor(userA);
    const res = await server.request(`/api/models/${MALFORMED}/test`, { method: 'POST', token });
    assert.equal(res.status, 404, 'a malformed test id must be answered, not left hanging');
    assert.ok(await server.healthy(), 'server still serving after a malformed model test');
  });

  test('POST /api/models/:id/test still reports a connection failure as a 400', async () => {
    const token = await tokenFor(userA);
    const model = await Model.create({
      userId: userA,
      provider: 'openai',
      displayName: 'm',
      modelName: 'gpt-test',
      status: 'untested',
      enabled: true,
      apiKey: 'sk-test-key',
    });
    // A model with a key reaches `callLLM`; stub it at the source module so the
    // connection-test failure path (a 400, not a hang) is exercised.
    const llm: any = await import('../engine/llmClient');
    const original = llm.callLLM;
    llm.callLLM = () => Promise.reject(new Error('provider unreachable'));
    try {
      const res = await server.request(`/api/models/${model._id}/test`, { method: 'POST', token });
      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.ok(await server.healthy(), 'server still serving after a failed connection test');
    } finally {
      llm.callLLM = original;
    }
  });

  test('POST /api/courtrooms/:id/start rejects a malformed id with 404, not a 500', async () => {
    const token = await tokenFor(userA);
    const res = await server.request(`/api/courtrooms/${MALFORMED}/start`, {
      method: 'POST',
      token,
    });
    assert.equal(res.status, 404, 'a malformed courtroom id is a controlled 404');
    assert.ok(await server.healthy(), 'server still serving after a malformed start');
  });
});

describe('Phase 28 - request validation returns controlled 4xx', () => {
  test('change-password rejects a non-string current password with 400, not 500', async () => {
    const token = await tokenFor(userA);
    const res = await server.request('/api/auth/change-password', {
      method: 'POST',
      token,
      body: { currentPassword: { $gt: '' }, newPassword: 'a-valid-long-password' },
    });
    assert.equal(res.status, 400, 'a malformed credential type is a client error, not a server fault');
    assert.ok(res.body.error, 'a controlled error message is returned');
    assert.ok(await server.healthy(), 'server still serving after a malformed password change');
  });

  test('change-password still accepts a correct current password', async () => {
    const user = await User.create({
      email: 'phase28-pw@test.local',
      name: 'PW',
      passwordHash: await bcrypt.hash('the-current-password', 10),
    });
    const token = await signToken(user);
    const res = await server.request('/api/auth/change-password', {
      method: 'POST',
      token,
      body: { currentPassword: 'the-current-password', newPassword: 'a-brand-new-password' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
  });

  test('signup rejects a structurally invalid email with 400 and creates no account', async () => {
    const res = await server.request('/api/auth/signup', {
      method: 'POST',
      body: { email: 'not-an-email', name: 'Junk', password: 'a-valid-long-password' },
    });
    assert.equal(res.status, 400);
    assert.equal(await User.countDocuments({ email: 'not-an-email' }), 0);
  });

  test('signup still accepts a valid email and rejects a duplicate with "exists"', async () => {
    const ok = await server.request('/api/auth/signup', {
      method: 'POST',
      body: { email: 'phase28-signup@test.local', name: 'S', password: 'a-valid-long-password' },
    });
    assert.equal(ok.status, 200);
    const dupe = await server.request('/api/auth/signup', {
      method: 'POST',
      body: { email: 'phase28-signup@test.local', name: 'S', password: 'a-valid-long-password' },
    });
    assert.equal(dupe.status, 400);
    assert.match(dupe.body.error, /exists/i, 'the tested account-existence contract is preserved');
  });
});

describe('Phase 28 - decision lifecycle handles a malformed id as a controlled 4xx', () => {
  test('POST /api/decisions/:id/start answers a malformed id instead of leaking a cast error', async () => {
    const token = await tokenFor(userA);
    const res = await server.request(`/api/decisions/${MALFORMED}/start`, {
      method: 'POST',
      token,
      body: {},
    });
    assert.ok(res.status >= 400 && res.status < 500, `expected a controlled 4xx, got ${res.status}`);
    assert.ok(await server.healthy(), 'server still serving after a malformed decision start');
  });
});
