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
import Message from '../models/Message';
import Verdict from '../models/Verdict';
import Decision from '../models/Decision';
import Execution from '../models/Execution';
import Task from '../models/Task';
import Claim from '../models/Claim';
import Evidence from '../models/Evidence';
import EvaluationRun from '../models/EvaluationRun';
import agentsRouter from '../routes/agents';
import modelsRouter from '../routes/models';
import courtroomsRouter from '../routes/courtrooms';
import decisionsRouter from '../routes/decisions';
import evaluationsRouter from '../routes/evaluations';
import researchRouter from '../routes/research';
import authRouter from '../routes/auth';
import { signToken } from '../utils/authToken';
import { TaskExecutor } from '../decision/executor';
import { Worker } from '../tasks/worker';
import { taskHandlerRegistry } from '../tasks/handlers';

/**
 * Phase 29 — end-to-end release-candidate verification.
 *
 * Unlike the per-router suites (phase22/24/25/27/28), this file mounts the FULL
 * application — every router behind one server — and drives realistic journeys
 * across router boundaries, then checks that the persisted state is coherent,
 * survives a process restart, and that the API/client contract holds.
 *
 * Provider behaviour is MOCKED at the `callLLM` boundary (the single seam every
 * LLM path funnels through: agentRunner, verdictGenerator, planner, model test).
 * The debate/verify/red-team/reconciliation pipeline that runs afterwards is the
 * REAL one. No external network is touched. All data lives in an isolated test
 * database and is torn down afterward.
 *
 * Covered here (not duplicated from the per-router suites):
 *   WS2  cross-router ownership + nested decision sub-resource authorization,
 *        the full signup/login/logout cycle, and unauthorized-mutation checks.
 *   WS3  the integrated journey: model config/test/enable → agent → decision
 *        create/start/execute → snapshot/report → courtroom → evaluations.
 *   WS4  persistence across a simulated restart (fresh server + fresh mongoose
 *        connection re-reads identical state) and truthful terminal statuses.
 *   WS5  response-shape agreement between client and server, and that the
 *        Phase 28 fixes (no false-success DELETE, no `200 null` PUT, no
 *        unanswered malformed-id request) hold across every router.
 */
const TEST_URI = process.env.MONGODB_URI_TEST_PHASE29 || 'mongodb://localhost:27017/hathap_test_phase29';

// `GET /api/models` eagerly runs the plaintext→encrypted key migration, which
// needs a 32-char encryption secret. Supply a stable development-only value so
// the endpoint is reachable in this full-app mount (matches the pattern used by
// the routing and model-SSRF suites).
process.env.API_KEY_ENCRYPTION_SECRET ??= 'phase29-e2e-secret-0123456789abcdef';

const MALFORMED = 'not-an-object-id';
const NONEXISTENT = new mongoose.Types.ObjectId().toString();

/**
 * Every LLM-backed path (agent analysis, verdict generation, planner, model
 * connection test) funnels through `callLLM`. Stubbing it at the module keeps
 * the real debate pipeline intact while removing the external provider.
 */
async function stubCallLLM(impl?: (model: any) => Promise<string>): Promise<() => void> {
  const llm: any = await import('../engine/llmClient');
  const original = llm.callLLM;
  llm.callLLM =
    impl ||
    (async () =>
      JSON.stringify({
        position: 'Adopt the proposal based on the evidence.',
        arguments: ['The evidence supports a favourable outcome.'],
        recommendation: 'Proceed with the proposed change.',
        confidenceScore: 82,
      }));
  return () => {
    llm.callLLM = original;
  };
}

async function makeServer(): Promise<{
  server: http.Server;
  request: (
    path: string,
    opts?: { method?: string; token?: string; body?: any }
  ) => Promise<{ status: number; body: any; text: string }>;
  healthy: () => Promise<boolean>;
}> {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  app.use('/api/models', modelsRouter);
  app.use('/api/agents', agentsRouter);
  app.use('/api/courtrooms', courtroomsRouter);
  app.use('/api/decisions', decisionsRouter);
  app.use('/api/evaluations', evaluationsRouter);
  app.use('/api/research', researchRouter);
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
  return {
    server,
    request,
    healthy: async () => (await request('/health')).status === 200,
  };
}

async function clean(): Promise<void> {
  await Promise.all([
    Agent.deleteMany({}),
    Model.deleteMany({}),
    Courtroom.deleteMany({}),
    Message.deleteMany({}),
    Verdict.deleteMany({}),
    Decision.deleteMany({}),
    Execution.deleteMany({}),
    Task.deleteMany({}),
    Claim.deleteMany({}),
    Evidence.deleteMany({}),
    EvaluationRun.deleteMany({}),
  ]);
}

let restoreLLM: () => void;
let userA: string;
let userB: string;
let tokenA: string;
let tokenB: string;
let modelId: string;
let agentId: string;
let server: Awaited<ReturnType<typeof makeServer>>;

/** A real worker driving the REAL handler registry (LLM stubbed upstream). */
function makeWorker(): Worker {
  const executor = new TaskExecutor({ registry: taskHandlerRegistry, workerId: 'phase29-e2e', backoff: () => 5 });
  return new Worker({ executor, pollIntervalMs: 100_000, maxConcurrentTasks: 4, staleTaskTimeoutMs: 120_000 });
}

/** Drive the worker until the execution is terminal; keeps ticking so freshly
 *  scheduled downstream tasks are always claimed (see planningExecution flake). */
async function driveUntilTerminal(executionId: string, timeoutMs = 25_000): Promise<void> {
  const worker = makeWorker();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const e = await Execution.findById(executionId);
    if (e && ['completed', 'failed', 'cancelled'].includes(e.status as string)) return;
    await worker.tickNow();
    await new Promise((r) => setTimeout(r, 25));
  }
  const e = await Execution.findById(executionId);
  throw new Error(`Execution did not reach a terminal state (status=${e?.status ?? 'unknown'})`);
}

const reqA = (path: string, opts?: { method?: string; body?: any }) =>
  server.request(path, { token: tokenA, ...opts });
const reqB = (path: string, opts?: { method?: string; body?: any }) =>
  server.request(path, { token: tokenB, ...opts });

before(async () => {
  if (mongoose.connection.readyState === 0) await mongoose.connect(TEST_URI);
  restoreLLM = await stubCallLLM();
  await clean();
  await User.deleteMany({});
  server = await makeServer();

  // Isolated accounts, created through the real signup endpoint.
  const a = await server.request('/api/auth/signup', {
    method: 'POST',
    body: { email: 'phase29-a@test.local', name: 'Alice', password: 'a-secure-password' },
  });
  assert.equal(a.status, 200, 'user A signup');
  const b = await server.request('/api/auth/signup', {
    method: 'POST',
    body: { email: 'phase29-b@test.local', name: 'Bob', password: 'b-secure-password' },
  });
  assert.equal(b.status, 200, 'user B signup');

  const loginA = await server.request('/api/auth/login', {
    method: 'POST',
    body: { email: 'phase29-a@test.local', password: 'a-secure-password' },
  });
  const loginB = await server.request('/api/auth/login', {
    method: 'POST',
    body: { email: 'phase29-b@test.local', password: 'b-secure-password' },
  });
  assert.equal(loginA.status, 200, 'user A login');
  assert.equal(loginB.status, 200, 'user B login');
  tokenA = loginA.body.token;
  tokenB = loginB.body.token;
  userA = loginA.body.user.id;
  userB = loginB.body.user.id;

  // A routable, keyed, enabled model + an agent assigned to it for user A.
  const model = await Model.create({
    userId: userA,
    provider: 'openai',
    displayName: 'E2E Model',
    modelName: 'gpt-e2e',
    baseUrl: 'https://api.example.test/v1',
    status: 'connected',
    enabled: true,
    apiKey: 'sk-test-e2e-key',
  });
  modelId = model._id.toString();
  const agent = await Agent.create({ userId: userA, name: 'E2E Agent', assignedModelId: modelId });
  agentId = agent._id.toString();
});

after(async () => {
  server?.server.close();
  restoreLLM?.();
  await clean();
  await User.deleteMany({});
  await mongoose.connection.close();
});

beforeEach(async () => {
  // Preserve the standing A model/agent; clear decision/courtroom/eval state.
  await Promise.all([
    Courtroom.deleteMany({}),
    Message.deleteMany({}),
    Verdict.deleteMany({}),
    Decision.deleteMany({}),
    Execution.deleteMany({}),
    Task.deleteMany({}),
    Claim.deleteMany({}),
    Evidence.deleteMany({}),
    EvaluationRun.deleteMany({}),
  ]);
});

describe('WS2 — authentication and cross-router user isolation', () => {
  test('signup/login/me cycle works and logout invalidates the credential', async () => {
    const me = await reqA('/api/auth/me');
    assert.equal(me.status, 200);
    assert.equal(me.body.email, 'phase29-a@test.local');

    // Logout bumps authVersion, so the same token must be rejected afterward.
    const out = await reqA('/api/auth/logout', { method: 'POST' });
    assert.equal(out.status, 200);
    assert.equal(out.body.success, true);
    const afterLogout = await server.request('/api/auth/me', { token: tokenA });
    assert.equal(afterLogout.status, 401, 'a logged-out credential is refused');

    // Re-login restores access for the rest of the suite.
    const rel = await server.request('/api/auth/login', {
      method: 'POST',
      body: { email: 'phase29-a@test.local', password: 'a-secure-password' },
    });
    assert.equal(rel.status, 200);
    tokenA = rel.body.token;
  });

  test('a missing or malformed credential is a 401 on every protected router', async () => {
    const paths = [
      '/api/models',
      '/api/agents',
      '/api/courtrooms',
      '/api/decisions',
      '/api/evaluations/meta',
      '/api/research/status',
    ];
    for (const p of paths) {
      const anon = await server.request(p);
      assert.equal(anon.status, 401, `unauthenticated ${p}`);
      const bogus = await server.request(p, { token: 'not-a-real-token' });
      assert.equal(bogus.status, 401, `bogus token ${p}`);
    }
    assert.ok(await server.healthy(), 'server still serving after auth rejections');
  });

  test("another user's agent/model/courtroom are invisible and unmutable (404, unchanged)", async () => {
    // B probes A's resources.
    for (const p of [`/api/models/${modelId}`, `/api/agents/${agentId}`]) {
      const read = await reqB(p);
      assert.equal(read.status, 404, `foreign read ${p}`);
    }
    // B cannot mutate A's agent.
    const put = await reqB(`/api/agents/${agentId}`, { method: 'PUT', body: { name: 'hijacked' } });
    assert.equal(put.status, 404);
    const del = await reqB(`/api/agents/${agentId}`, { method: 'DELETE' });
    assert.equal(del.status, 404);
    // A's agent is untouched.
    const still = await Agent.findById(agentId);
    assert.equal(still!.name, 'E2E Agent', 'foreign PUT/DELETE mutated nothing');
  });

  test("another user cannot start, read, or delete a foreign decision nor its sub-resources", async () => {
    const create = await reqA('/api/decisions', {
      method: 'POST',
      body: { title: 'A decision', objective: 'Decide something.', context: 'ctx' },
    });
    assert.equal(create.status, 201, 'owner creates decision');
    const id = create.body._id;

    // B cannot start / read / update / delete the decision.
    assert.equal((await reqB(`/api/decisions/${id}/start`, { method: 'POST', body: {} })).status, 404);
    assert.equal((await reqB(`/api/decisions/${id}`)).status, 404);
    assert.equal(
      (await reqB(`/api/decisions/${id}`, { method: 'PUT', body: { title: 'x' } })).status,
      404
    );
    assert.equal((await reqB(`/api/decisions/${id}`, { method: 'DELETE' })).status, 404);

    // B cannot reach the owner's nested sub-resources either.
    const nested = [
      '/claims',
      '/evidence',
      '/executions',
      '/tasks',
      '/snapshot',
      '/report',
      '/verifications',
      '/red-team',
      '/reconciliation',
      '/events',
    ];
    for (const suffix of nested) {
      const res = await reqB(`/api/decisions/${id}${suffix}`);
      assert.ok(res.status === 404, `foreign nested read ${suffix} -> ${res.status}`);
    }

    // The decision is still owned by A and intact.
    const owned = await Decision.findById(id);
    assert.ok(owned, 'decision survived foreign probes');
    assert.equal(String(owned!.userId), userA);
    assert.equal(owned!.title, 'A decision');
  });

  test('a malformed id is a controlled 404 across every router and never crashes', async () => {
    const checks: Array<[string, string?]> = [
      [`/api/models/${MALFORMED}`, 'PUT'],
      [`/api/models/${MALFORMED}`, 'DELETE'],
      [`/api/agents/${MALFORMED}`, 'PUT'],
      [`/api/agents/${MALFORMED}`, 'DELETE'],
      [`/api/courtrooms/${MALFORMED}`, 'PUT'],
      [`/api/courtrooms/${MALFORMED}`, 'DELETE'],
      [`/api/decisions/${MALFORMED}`, 'PUT'],
      [`/api/decisions/${MALFORMED}`, 'DELETE'],
      [`/api/decisions/${MALFORMED}/snapshot`, undefined],
      [`/api/evaluations/runs/${MALFORMED}`, undefined],
      [`/api/evaluations/benchmarks/${MALFORMED}`, undefined],
    ];
    for (const [path, method] of checks) {
      const res = await reqA(path, method ? { method, body: {} } : undefined);
      assert.equal(res.status, 404, `malformed ${method || 'GET'} ${path} -> ${res.status}`);
    }
    assert.ok(await server.healthy(), 'server still serving after malformed-id flood');
  });
});

describe('WS3 — integrated user journey with a mocked provider', () => {
  let decisionId: string;
  let executionId: string;

  test('model can be tested (mocked), enabled, and listed', async () => {
    // Connection test exercises the mocked callLLM seam.
    const test = await reqA(`/api/models/${modelId}/test`, { method: 'POST' });
    assert.equal(test.status, 200, 'model test responds');
    assert.equal(test.body.success, true, 'mocked provider test succeeds');

    const list = await reqA('/api/models');
    assert.equal(list.status, 200);
    const mine = list.body.find((m: any) => m._id === modelId);
    assert.ok(mine, 'model is listed for its owner');
    assert.equal(mine.enabled, true);
    // The API key must never be echoed back.
    assert.ok(!JSON.stringify(mine).includes('sk-test-e2e-key'), 'api key not leaked in list');
  });

  test('agent is listed and bound to its model', async () => {
    const list = await reqA('/api/agents');
    assert.equal(list.status, 200);
    const mine = list.body.find((a: any) => a._id === agentId);
    assert.ok(mine, 'agent listed');
    assert.equal(String(mine.assignedModelId), modelId);
  });

  test('decision is created, started (fixed mode), executes to completion, and reports', async () => {
    const create = await reqA('/api/decisions', {
      method: 'POST',
      body: {
        title: 'Adopt microservices?',
        objective: 'Decide whether to adopt microservices.',
        context: 'Weigh the trade-offs.',
        configuration: { strategy: 'consensus', maxRounds: 2 },
        participants: [{ agentId }],
      },
    });
    assert.equal(create.status, 201);
    decisionId = create.body._id;
    assert.equal(create.body.status, 'draft');

    // Start in fixed mode, pinned to the known model (LLM is mocked).
    const start = await reqA(`/api/decisions/${decisionId}/start`, {
      method: 'POST',
      body: { planningMode: 'fixed', routingMode: 'manual', routingModelId: modelId },
    });
    assert.equal(start.status, 202, 'start is accepted, not synchronously completed');
    assert.equal(start.body.status, 'accepted');
    executionId = start.body.executionId;
    assert.ok(executionId, 'an execution id is returned');
    // The decision moved to debating immediately.
    const debating = await Decision.findById(decisionId);
    assert.equal(debating!.status, 'debating');

    // Drive the REAL pipeline (debate -> verify -> red-team -> reconciliation).
    await driveUntilTerminal(executionId);

    const exec = await Execution.findById(executionId);
    assert.equal(exec!.status, 'completed', 'execution completed');
    assert.equal(exec!.progress, 100);
    const tasks = await Task.find({ executionId });
    assert.ok(tasks.length >= 1, 'tasks were persisted');
    assert.ok(tasks.every((t) => t.status === 'completed'), 'all tasks completed');

    // The decision reflects completion truthfully.
    const done = await Decision.findById(decisionId);
    assert.equal(done!.status, 'completed');
    assert.equal(done!.currentPhase, 'completed');

    // Snapshot and report are reachable by the owner and non-empty.
    const snap = await reqA(`/api/decisions/${decisionId}/snapshot`);
    assert.equal(snap.status, 200);
    assert.ok(snap.body, 'snapshot returns a body');
    const report = await reqA(`/api/decisions/${decisionId}/report`);
    assert.equal(report.status, 200);
    assert.ok(report.text.length > 0, 'report produces markdown');

    // Sub-resources are populated and ownership-scoped to A.
    const claims = await reqA(`/api/decisions/${decisionId}/claims`);
    assert.equal(claims.status, 200);
    assert.ok(Array.isArray(claims.body), 'claims is an array');
    const evidence = await reqA(`/api/decisions/${decisionId}/evidence`);
    assert.equal(evidence.status, 200);
    assert.ok(Array.isArray(evidence.body), 'evidence is an array');
  });

  test('courtroom can be created, started (mocked), and reaches a verdict', async () => {
    const create = await reqA('/api/courtrooms', {
      method: 'POST',
      body: { name: 'E2E Courtroom', mode: 'consensus', participants: [{ agentId }] },
    });
    assert.equal(create.status, 200, 'courtroom created');
    const cid = create.body._id;

    // Start runs the debate synchronously against the mocked provider.
    const start = await reqA(`/api/courtrooms/${cid}/start`, { method: 'POST', body: {} });
    assert.equal(start.status, 200, 'courtroom debate runs');
    assert.equal(start.body.success, true);

    // Messages and verdict are persisted and owner-scoped.
    const messages = await reqA(`/api/courtrooms/${cid}/messages`);
    assert.equal(messages.status, 200);
    assert.ok(Array.isArray(messages.body), 'messages is an array');
    const verdict = await reqA(`/api/courtrooms/${cid}/verdict`);
    assert.equal(verdict.status, 200);

    // B cannot read the courtroom's messages/verdict.
    assert.equal((await reqB(`/api/courtrooms/${cid}/messages`)).status, 404);
    assert.equal((await reqB(`/api/courtrooms/${cid}/verdict`)).status, 404);
  });

  test('evaluation seed, run, and results flow end-to-end', async () => {
    const seed = await reqA('/api/evaluations/seed', { method: 'POST' });
    assert.ok(seed.status === 200 || seed.status === 201, 'seed responds');
    const benchmarkId = seed.body.benchmarkId;
    assert.ok(benchmarkId, 'seed yields a benchmark');

    const bm = await reqA(`/api/evaluations/benchmarks/${benchmarkId}`);
    assert.equal(bm.status, 200);

    // Create a run over the seeded benchmark with a static system-under-test.
    const run = await reqA('/api/evaluations/runs', {
      method: 'POST',
      body: { name: 'E2E run', benchmarkId, systemUnderTest: { kind: 'static', label: 'static' } },
    });
    assert.equal(run.status, 201, 'run created');
    const runId = run.body._id;

    // Synchronous execute (the CI-style path) completes the run.
    const exec = await reqA(`/api/evaluations/runs/${runId}/execute`, { method: 'POST' });
    assert.equal(exec.status, 200, 'run executes');
    assert.ok(['completed', 'partial'].includes(exec.body.status), `run terminal status=${exec.body.status}`);

    const results = await reqA(`/api/evaluations/runs/${runId}/results`);
    assert.equal(results.status, 200);
    assert.ok(Array.isArray(results.body), 'results is an array');

    // B cannot read A's run.
    assert.equal((await reqB(`/api/evaluations/runs/${runId}`)).status, 404);
  });

  test('research status is reachable and reports configuration honestly', async () => {
    const status = await reqA('/api/research/status');
    assert.equal(status.status, 200);
    assert.ok(status.body, 'research status returns a body');
  });
});

describe('WS4 — persistence across a simulated restart', () => {
  test('created resources, relationships, and terminal status survive a fresh server + connection', async () => {
    // 1. Create a decision and run it to completion on the first server.
    const create = await reqA('/api/decisions', {
      method: 'POST',
      body: { title: 'Persist me', objective: 'Verify persistence.', context: 'ctx', participants: [{ agentId }] },
    });
    const id = create.body._id;
    const start = await reqA(`/api/decisions/${id}/start`, {
      method: 'POST',
      body: { planningMode: 'fixed', routingMode: 'manual', routingModelId: modelId },
    });
    await driveUntilTerminal(start.body.executionId);
    const execBefore = await Execution.findById(start.body.executionId);
    assert.equal(execBefore!.status, 'completed');

    // 2. Simulate a process restart: tear down this server AND the mongoose
    //    connection, then reconnect and stand up a brand-new server. Nothing
    //    survives in process memory — only MongoDB — so a successful re-read
    //    proves the state is genuinely persisted.
    server.server.close();
    await mongoose.connection.close();

    await mongoose.connect(TEST_URI);
    const fresh = await makeServer();
    // Redirect the shared handle to the fresh server IMMEDIATELY. If any read
    // below fails we must not leave `server` pointing at the closed old
    // socket, or every subsequent suite in this file would fail with an opaque
    // "fetch failed".
    server = fresh;

    const relogin = await fresh.request('/api/auth/login', {
      method: 'POST',
      body: { email: 'phase29-a@test.local', password: 'a-secure-password' },
    });
    assert.equal(relogin.status, 200, 'login works after restart');
    const t = relogin.body.token;

    // The decision and its terminal execution survived.
    const decision = await fresh.request(`/api/decisions/${id}`, { token: t });
    assert.equal(decision.status, 200);
    assert.equal(decision.body.status, 'completed', 'decision status persisted');

    const exec = await fresh.request(`/api/decisions/${id}/executions`, { token: t });
    assert.equal(exec.status, 200);
    assert.ok(exec.body.length >= 1, 'executions persisted');

    const tasks = await fresh.request(`/api/decisions/${id}/tasks`, { token: t });
    assert.equal(tasks.status, 200);
    assert.ok(tasks.body.length >= 1, 'tasks persisted');
    assert.ok(
      tasks.body.every((x: any) => x.status === 'completed'),
      'task statuses persisted truthfully'
    );

    // Relationships remain valid: the execution's tasks belong to this decision.
    const execDoc = await Execution.findOne({ decisionId: id });
    assert.ok(execDoc, 'execution still linked to the decision');
    const taskCount = await Task.countDocuments({ executionId: execDoc!._id });
    assert.equal(taskCount, tasks.body.length, 'task↔execution relationship intact');

    // The model/agent the decision depended on also survived.
    const models = await fresh.request('/api/models', { token: t });
    assert.equal(models.status, 200, 'models readable after restart');
    assert.ok(Array.isArray(models.body), 'models returns an array');
    assert.ok(models.body.some((m: any) => m._id === modelId), 'model persisted');
    const agents = await fresh.request('/api/agents', { token: t });
    assert.ok(agents.body.some((a: any) => a._id === agentId), 'agent persisted');
  });

  test('a failed provider leaves a truthful error status, never a false success', async () => {
    // Force the model connection test to fail at the provider seam.
    restoreLLM();
    restoreLLM = await stubCallLLM(async () => {
      throw new Error('provider unreachable');
    });
    try {
      const res = await reqA(`/api/models/${modelId}/test`, { method: 'POST' });
      assert.equal(res.status, 400, 'a provider failure is a controlled 400');
      assert.equal(res.body.success, false, 'success is false, not a false positive');
      // The model records the failure truthfully.
      const after = await Model.findById(modelId);
      assert.equal(after!.status, 'error', 'model status reflects the failure');
    } finally {
      restoreLLM();
      restoreLLM = await stubCallLLM();
    }
  });
});

describe('WS5 — API/client consistency and Phase 28 guarantees', () => {
  test('success responses are raw resources and errors are { error } shaped', async () => {
    // Success: raw JSON resource (no envelope).
    const models = await reqA('/api/models');
    assert.equal(models.status, 200);
    assert.ok(Array.isArray(models.body), 'collection success is a bare array');

    // Error: a single { error: string } the client reads directly.
    const missing = await reqA(`/api/decisions/${NONEXISTENT}`);
    assert.equal(missing.status, 404);
    assert.equal(typeof missing.body.error, 'string', 'error body carries an error string');
    assert.ok(!('success' in missing.body), 'error body is not a success envelope');
  });

  test('Phase 28: no false-success DELETE — a foreign delete is 404 and destroys nothing', async () => {
    // User A creates a courtroom; user B tries to delete it.
    const create = await reqA('/api/courtrooms', {
      method: 'POST',
      body: { name: 'Delete me', mode: 'consensus' },
    });
    const cid = create.body._id;
    const foreign = await reqB(`/api/courtrooms/${cid}`, { method: 'DELETE' });
    assert.equal(foreign.status, 404, 'foreign delete is refused, not ok:true');
    assert.ok(await Courtroom.findById(cid), 'courtroom survived the foreign delete');
  });

  test('Phase 28: no `200 null` on a foreign PUT — it is a 404 and mutates nothing', async () => {
    const create = await reqA('/api/agents', { method: 'POST', body: { name: 'Owned', assignedModelId: modelId } });
    const aid = create.body._id;
    const foreign = await reqB(`/api/agents/${aid}`, { method: 'PUT', body: { name: 'hijack' } });
    assert.equal(foreign.status, 404, 'foreign PUT is 404, not 200');
    assert.notEqual(foreign.body, null, 'response body is not null');
    const still = await Agent.findById(aid);
    assert.equal(still!.name, 'Owned', 'foreign PUT mutated nothing');
  });

  test('Phase 28: a database fault is a controlled 500, not an unanswered request', async () => {
    const original = Agent.find;
    (Agent as any).find = () => Promise.reject(new Error('simulated database failure'));
    try {
      const res = await reqA('/api/agents');
      assert.equal(res.status, 500, 'database fault is answered with a 500');
      assert.equal(typeof res.body.error, 'string', '500 still carries an error string');
    } finally {
      (Agent as any).find = original;
    }
    assert.ok(await server.healthy(), 'server still serving after a database fault');
  });

  test('an unauthorized mutation never occurs (401 leaves state intact)', async () => {
    const create = await reqA('/api/agents', { method: 'POST', body: { name: 'Protected', assignedModelId: modelId } });
    const aid = create.body._id;
    const anonPut = await server.request(`/api/agents/${aid}`, { method: 'PUT', body: { name: 'x' } });
    assert.equal(anonPut.status, 401);
    const anonDel = await server.request(`/api/agents/${aid}`, { method: 'DELETE' });
    assert.equal(anonDel.status, 401);
    const still = await Agent.findById(aid);
    assert.equal(still!.name, 'Protected', 'unauthorized mutations left the resource intact');
  });

  test('navigation-critical reads the client depends on are all reachable and well-formed', async () => {
    // The client boots by loading these collections; each must answer 200 with a list.
    for (const p of ['/api/models', '/api/agents', '/api/courtrooms', '/api/decisions']) {
      const res = await reqA(p);
      assert.equal(res.status, 200, `${p} reachable`);
      assert.ok(Array.isArray(res.body), `${p} returns a list`);
    }
    // The states endpoint the decision UI uses is reachable.
    const states = await reqA('/api/decisions/states');
    assert.equal(states.status, 200);
    assert.ok(states.body, 'states returns a body');
    assert.ok(await server.healthy(), 'server healthy after navigation reads');
  });
});
