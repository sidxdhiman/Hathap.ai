import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import http from 'http';
import mongoose from 'mongoose';
import type { AddressInfo } from 'net';
import { v4 as uuidv4 } from 'uuid';
import User from '../models/User';
import Agent from '../models/Agent';
import Courtroom from '../models/Courtroom';
import { setupA2A } from '../a2a/setupA2A';
import { normalizeDebateRequest } from '../a2a/messageParser';
import { signToken } from '../utils/authToken';

/**
 * Phase 24 — A2A task authentication and authorization.
 *
 * The A2A surface was audited end to end and every task-scoped operation in the
 * SDK's `DefaultRequestHandler` was found to ignore the call context
 * completely: `tasks/get`, `tasks/cancel`, `tasks/resubscribe`,
 * `message/send` with a `taskId`, `referenceTaskIds` and the push-notification
 * configuration routes all resolved whatever identifier the caller supplied
 * against a bare `Map`. `HathapDebateExecutor` refused to *execute* without an
 * identity, but reads, cancels, resumes and live subscriptions were open to any
 * caller who could name a task, and no transport checked authentication before
 * dispatching.
 *
 * These tests drive the real Express wiring from `setupA2A` over HTTP — the
 * `/a2a/jsonrpc` and `/a2a/rest` routers, the authentication middleware in
 * front of them, and the ownership-enforcing task store behind them — against
 * a real Mongo instance. Nothing about the guard is mocked, so a regression
 * that dropped the store, the middleware or the ownership comparison fails
 * here rather than passing against a stubbed helper.
 */
const TEST_URI =
  process.env.MONGODB_URI_TEST_PHASE24 || 'mongodb://localhost:27017/hathap_test_phase24_a2a';

const AGENT_CARD_PATH = '/.well-known/agent-card.json';

interface CallResult {
  status: number;
  body: any;
  text: string;
}

interface HttpHarness {
  server: http.Server;
  call: (
    path: string,
    opts?: { method?: string; token?: string; body?: unknown }
  ) => Promise<CallResult>;
  rpc: (method: string, params: unknown, token?: string) => Promise<CallResult>;
}

let tokenA: string;
let tokenB: string;
let harness: HttpHarness;

/** A message payload that runs the `run-debate` skill. */
function userMessage(text: string): Record<string, unknown> {
  return {
    kind: 'message',
    messageId: uuidv4(),
    role: 'user',
    parts: [{ kind: 'text', text }],
  };
}

async function makeServer(): Promise<HttpHarness> {
  const app = express();
  app.use(express.json());
  setupA2A(app);
  // Mirrors the app-level handler in `index.ts` so an unexpected throw is a
  // controlled 5xx instead of an HTML stack page.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[phase24 test error]', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  const server = await new Promise<http.Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const port = (server.address() as AddressInfo).port;

  const call: HttpHarness['call'] = async (path, opts = {}) => {
    const headers: Record<string, string> = {};
    if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: opts.method || 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    const text = await res.text();
    let json: any = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { raw: text };
    }
    return { status: res.status, body: json, text };
  };

  const rpc: HttpHarness['rpc'] = (method, params, token) =>
    call('/a2a/jsonrpc', {
      method: 'POST',
      token,
      body: { jsonrpc: '2.0', id: 1, method, params },
    });

  return { server, call, rpc };
}

/**
 * Create a real task over the real route.
 *
 * The fixture users own no agent templates, so `resolveCourtroomForDebate`
 * fails immediately with "No agents available" and the task is stored in a
 * terminal `failed` state. That keeps the fixture deterministic and fast while
 * still producing a fully persisted, owner-bound task with history and
 * artifacts — exactly what an attacker would be after.
 */
async function createTask(token: string, text?: string): Promise<{
  id: string;
  status: { state: string };
  history?: any[];
  artifacts?: any[];
}> {
  const res = await harness.rpc(
    'message/send',
    { message: userMessage(text ?? 'Should we migrate from monolith to microservices?') },
    token
  );
  assert.equal(res.status, 200, `message/send should answer over HTTP 200: ${res.text}`);
  assert.ok(res.body?.result, `expected a task result: ${res.text}`);
  assert.equal(res.body.result.kind, 'task', `expected a task, got ${res.text}`);
  assert.equal(
    res.body.result.status?.state,
    'failed',
    `precondition: the fixture task settles immediately: ${res.text}`
  );
  return res.body.result;
}

async function clean(): Promise<void> {
  await Promise.all([Agent.deleteMany({}), Courtroom.deleteMany({})]);
}

before(async () => {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(TEST_URI);
  }
  await clean();
  await User.deleteMany({});
  const a = await User.create({
    email: 'phase24-a@test.local',
    name: 'Phase 24 A',
    passwordHash: 'x',
  });
  const b = await User.create({
    email: 'phase24-b@test.local',
    name: 'Phase 24 B',
    passwordHash: 'x',
  });
  tokenA = signToken(a);
  tokenB = signToken(b);
  harness = await makeServer();
});

after(async () => {
  harness?.server.close();
  await clean();
  await User.deleteMany({});
  await mongoose.connection.close();
});

describe('Phase 24 - A2A task ownership', () => {
  test('the owner can read their own task, history and artifacts', async () => {
    const task = await createTask(tokenA, 'Owner-only objective text');

    const res = await harness.rpc('tasks/get', { id: task.id, historyLength: 10 }, tokenA);
    assert.equal(res.status, 200);
    assert.equal(res.body.result.id, task.id);
    assert.equal(res.body.result.status.state, 'failed');
    assert.equal(res.body.result.history.length, 1, 'the owner sees the message they sent');
    assert.ok(
      JSON.stringify(res.body.result.history[0]).includes('Owner-only objective text'),
      'the owner sees their own objective'
    );
    assert.ok(
      res.body.result.artifacts.some((a: any) => a.name === 'error'),
      'the task carries the artifacts produced during execution'
    );
  });

  test('another authenticated user cannot read the task', async () => {
    const task = await createTask(tokenA, 'Confidential objective for A');

    const res = await harness.rpc('tasks/get', { id: task.id, historyLength: 10 }, tokenB);
    assert.equal(res.status, 200, 'JSON-RPC reports application errors in-band');
    assert.equal(res.body.result, undefined, 'no task payload is returned');
    assert.equal(res.body.error?.code, -32001, 'a foreign task is reported as not found');
    assert.ok(
      !res.text.includes('Confidential objective for A'),
      'the error carries no part of the task it refused to disclose'
    );
  });

  test('the REST read is 404 for a foreign task and 200 for the owner', async () => {
    const task = await createTask(tokenA, 'A REST objective');

    const owner = await harness.call(`/a2a/rest/v1/tasks/${task.id}?historyLength=10`, {
      token: tokenA,
    });
    assert.equal(owner.status, 200);
    assert.equal(owner.body.id, task.id);
    assert.equal(owner.body.history?.length, 1);

    const foreign = await harness.call(`/a2a/rest/v1/tasks/${task.id}?historyLength=10`, {
      token: tokenB,
    });
    assert.equal(foreign.status, 404, 'a foreign task is not disclosed');
    assert.equal(foreign.body.code, -32001);
    assert.ok(!foreign.text.includes('A REST objective'));
  });

  test('a foreign task and an unknown task are indistinguishable', async () => {
    const task = await createTask(tokenA);
    const unknownId = uuidv4();

    const foreign = await harness.call(`/a2a/rest/v1/tasks/${task.id}?historyLength=10`, {
      token: tokenB,
    });
    const unknown = await harness.call(`/a2a/rest/v1/tasks/${unknownId}?historyLength=10`, {
      token: tokenB,
    });

    assert.equal(foreign.status, 404);
    assert.equal(unknown.status, 404);
    // Normalising the identifier out of the message leaves the exact same
    // bytes, so the endpoint cannot be used to confirm that a task exists.
    assert.equal(
      foreign.text.replace(task.id, 'ID'),
      unknown.text.replace(unknownId, 'ID'),
      'the response must not depend on whether the task exists'
    );

    const rpcForeign = await harness.rpc('tasks/get', { id: task.id }, tokenB);
    const rpcUnknown = await harness.rpc('tasks/get', { id: unknownId }, tokenB);
    assert.equal(rpcForeign.body.error?.code, -32001);
    assert.equal(rpcUnknown.body.error?.code, -32001);
    assert.equal(
      rpcForeign.body.error.message.replace(task.id, 'ID'),
      rpcUnknown.body.error.message.replace(unknownId, 'ID')
    );
  });

  test('another authenticated user cannot cancel the task', async () => {
    const task = await createTask(tokenA);

    const rpcCancel = await harness.rpc('tasks/cancel', { id: task.id }, tokenB);
    assert.equal(rpcCancel.body.result, undefined);
    assert.equal(rpcCancel.body.error?.code, -32001, 'a foreign cancel is refused as not found');

    const restCancel = await harness.call(`/a2a/rest/v1/tasks/${task.id}:cancel`, {
      method: 'POST',
      token: tokenB,
    });
    assert.equal(restCancel.status, 404, 'the REST cancel is refused the same way');

    // The owner reaches the state check (the fixture task is already terminal),
    // which proves the ownership gate runs first for the foreign caller.
    const ownerCancel = await harness.call(`/a2a/rest/v1/tasks/${task.id}:cancel`, {
      method: 'POST',
      token: tokenA,
    });
    assert.equal(ownerCancel.status, 409, 'the owner is refused for state reasons, not ownership');

    const after = await harness.rpc('tasks/get', { id: task.id, historyLength: 10 }, tokenA);
    assert.equal(after.body.result.status.state, 'failed', 'the task was not mutated');
    assert.equal(after.body.result.history.length, 1, 'history was not mutated');
  });

  test('another authenticated user cannot resume the task', async () => {
    const task = await createTask(tokenA, 'A objective that must not be appended to');

    const res = await harness.rpc(
      'message/send',
      {
        message: {
          ...userMessage('Injected follow-up from B'),
          taskId: task.id,
        },
      },
      tokenB
    );
    assert.equal(res.body.result, undefined, 'a foreign resume must not produce a task');
    assert.equal(res.body.error?.code, -32001);

    const after = await harness.rpc('tasks/get', { id: task.id, historyLength: 10 }, tokenA);
    assert.equal(after.body.result.history.length, 1, 'no message was appended cross-user');
    assert.ok(!res.text.includes('A objective that must not be appended to'));
  });

  test('a foreign reference task id does not leak the referenced task', async () => {
    const task = await createTask(tokenA, 'Referenced secret objective');

    const res = await harness.rpc(
      'message/send',
      {
        message: userMessage('B objective'),
        referenceTaskIds: [task.id],
      },
      tokenB
    );
    assert.ok(res.body?.result, `B can still start their own task: ${res.text}`);
    assert.equal(res.body.result.kind, 'task');
    assert.notEqual(res.body.result.id, task.id, 'B gets their own task');
    assert.ok(
      !res.text.includes('Referenced secret objective'),
      'the referenced task contributes nothing to the response'
    );
  });

  test('a live subscription to a foreign task is refused', async () => {
    const task = await createTask(tokenA, 'Subscribed secret objective');

    const restSubscribe = await harness.call(
      `/a2a/rest/v1/tasks/${task.id}:subscribe`,
      { method: 'POST', token: tokenB }
    );
    assert.equal(restSubscribe.status, 404, 'a foreign subscription never opens');
    assert.ok(!restSubscribe.text.includes('Subscribed secret objective'));

    const ownerSubscribe = await harness.call(
      `/a2a/rest/v1/tasks/${task.id}:subscribe`,
      { method: 'POST', token: tokenA }
    );
    assert.equal(ownerSubscribe.status, 200, 'the owner can still subscribe');
    assert.ok(
      ownerSubscribe.text.includes(task.id),
      'the owner receives their own task over the stream'
    );
  });

  test('the JSON-RPC subscription to a foreign task yields no task data', async () => {
    const task = await createTask(tokenA, 'Streamed secret objective');

    const foreign = await harness.rpc('tasks/resubscribe', { id: task.id }, tokenB);
    assert.ok(
      foreign.text.includes('-32001'),
      `the stream reports the refusal: ${foreign.text}`
    );
    assert.ok(
      !foreign.text.includes('Streamed secret objective'),
      'the refused stream carries none of the task content'
    );
    assert.ok(!foreign.text.includes('artifacts'), 'no artifacts cross the boundary');

    const owner = await harness.rpc('tasks/resubscribe', { id: task.id }, tokenA);
    assert.ok(owner.text.includes(task.id), 'the owner still receives their own task');
  });
});

describe('Phase 24 - A2A task authentication', () => {
  test('an unauthenticated caller reaches no task-scoped operation', async () => {
    const task = await createTask(tokenA);

    const rpcGet = await harness.rpc('tasks/get', { id: task.id, historyLength: 10 });
    assert.equal(rpcGet.status, 401);
    assert.deepEqual(rpcGet.body, { error: 'Unauthorized' });

    const rpcCancel = await harness.rpc('tasks/cancel', { id: task.id });
    assert.equal(rpcCancel.status, 401);

    const rpcSend = await harness.rpc('message/send', { message: userMessage('anonymous') });
    assert.equal(rpcSend.status, 401, 'anonymous execution never reaches the executor');

    const restGet = await harness.call(`/a2a/rest/v1/tasks/${task.id}?historyLength=10`);
    assert.equal(restGet.status, 401);

    const restCancel = await harness.call(`/a2a/rest/v1/tasks/${task.id}:cancel`, {
      method: 'POST',
    });
    assert.equal(restCancel.status, 401);

    const restSend = await harness.call('/a2a/rest/v1/message:send', {
      method: 'POST',
      body: { request: { message: userMessage('anonymous') } },
    });
    assert.equal(restSend.status, 401);

    const restSubscribe = await harness.call(`/a2a/rest/v1/tasks/${task.id}:subscribe`, {
      method: 'POST',
    });
    assert.equal(restSubscribe.status, 401);

    const owner = await harness.rpc('tasks/get', { id: task.id, historyLength: 10 }, tokenA);
    assert.equal(owner.body.result.id, task.id, 'the task itself is untouched');
  });

  test('an invalid credential is refused, not silently downgraded', async () => {
    const task = await createTask(tokenA);

    const res = await harness.call(`/a2a/rest/v1/tasks/${task.id}`, { token: 'not-a-jwt' });
    assert.equal(res.status, 401);
    assert.deepEqual(res.body, { error: 'Unauthorized' });
  });

  test('protocol discovery stays public', async () => {
    const card = await harness.call(AGENT_CARD_PATH);
    assert.equal(card.status, 200);
    assert.equal(card.body.name, 'Hathap.AI Debate Agent');
    assert.ok(card.body.url.includes('/a2a/jsonrpc'), 'the card still advertises the endpoint');

    const jsonRpc = await harness.call('/a2a/jsonrpc', {
      method: 'POST',
      body: { jsonrpc: '2.0', id: 1, method: 'tasks/get', params: { id: uuidv4() } },
    });
    assert.equal(jsonRpc.status, 401, 'the advertised endpoint still demands a principal');
  });

  test('a malformed task id is a controlled 404, not a 500', async () => {
    const rest = await harness.call('/a2a/rest/v1/tasks/not-an-object-id?historyLength=10', {
      token: tokenA,
    });
    assert.equal(rest.status, 404);

    const rpc = await harness.rpc('tasks/get', { id: 'not-an-object-id' }, tokenA);
    assert.equal(rpc.status, 200);
    assert.equal(rpc.body.error?.code, -32001);
  });
});

describe('Phase 24 - A2A task payload validation', () => {
  test('a non-string-list agentIds payload fails as a visible parse error', async () => {
    const res = await harness.rpc(
      'message/send',
      {
        message: userMessage(
          JSON.stringify({
            skill: 'run-debate',
            objective: 'Valid objective',
            agentIds: 'not-a-list',
          })
        ),
      },
      tokenA
    );
    assert.ok(res.body?.result, `expected a task: ${res.text}`);
    const task = res.body.result;

    const read = await harness.rpc('tasks/get', { id: task.id, historyLength: 10 }, tokenA);
    const artifacts = JSON.stringify(read.body.result.artifacts ?? []);
    assert.ok(
      artifacts.includes('agentIds must be an array of non-empty strings'),
      `the caller sees why the payload was refused: ${artifacts}`
    );
  });

  test('a payload carrying hostile extra keys still runs and is not applied', async () => {
    const extraKey = `$set-${uuidv4()}`;
    const res = await harness.rpc(
      'message/send',
      {
        message: userMessage(
          JSON.stringify({
            skill: 'run-debate',
            objective: 'Objective with extras',
            status: 'completed',
            userId: uuidv4(),
            [extraKey]: { role: 'admin' },
          })
        ),
      },
      tokenA
    );
    assert.ok(res.body?.result, `expected a task: ${res.text}`);
    const read = await harness.rpc(
      'tasks/get',
      { id: res.body.result.id, historyLength: 10 },
      tokenA
    );
    const artifacts = JSON.stringify(read.body.result.artifacts ?? []);
    assert.ok(!artifacts.includes(extraKey), 'no raw payload key reaches a produced artifact');
    assert.equal(read.body.result.status.state, 'failed', 'the task still runs and fails normally');
  });

  test('normalizeDebateRequest forwards only allow-listed keys', () => {
    const normalized = normalizeDebateRequest({
      skill: 'run-debate',
      objective: 'Keep me',
      mode: 'consensus',
      courtroomId: 'keep-me-too',
      agentIds: ['agent-1'],
      status: 'completed',
      userId: 'someone-else',
      $set: { role: 'admin' },
    } as any);

    assert.deepEqual(Object.keys(normalized).sort(), [
      'agentIds',
      'courtroomId',
      'mode',
      'objective',
      'skill',
    ]);
    assert.equal(normalized.objective, 'Keep me');
    assert.equal((normalized as any).status, undefined, 'unknown keys are dropped');
    assert.equal((normalized as any).userId, undefined, 'ownership is never caller-writable');
    assert.equal((normalized as any).$set, undefined);
  });

  test('normalizeDebateRequest rejects a non-string-list agentIds payload', () => {
    assert.throws(
      () =>
        normalizeDebateRequest({
          skill: 'run-debate',
          objective: 'Valid objective',
          agentIds: 'not-a-list' as any,
        }),
      /agentIds must be an array of non-empty strings/
    );
  });
});
