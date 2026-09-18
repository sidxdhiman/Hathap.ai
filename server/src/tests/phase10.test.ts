import { test, describe, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import type { AddressInfo } from 'net';
import Decision from '../models/Decision';
import Execution from '../models/Execution';
import Task from '../models/Task';
import Claim from '../models/Claim';
import Evidence from '../models/Evidence';
import VerificationResult from '../models/VerificationResult';
import RedTeamFinding from '../models/RedTeamFinding';
import ReconciliationResult from '../models/ReconciliationResult';
import EvidenceRelationship from '../models/EvidenceRelationship';
import ExecutionEvent from '../models/ExecutionEvent';
import decisionsRouter from '../routes/decisions';
import { executionEventBus } from '../decision/eventBus';

const TEST_URI =
  process.env.MONGODB_URI_TEST_PHASE10 || 'mongodb://localhost:27017/hathap_test_phase10';

const JWT_SECRET = process.env.JWT_SECRET || 'secret';

function tokenFor(id: string): string {
  return jwt.sign({ id }, JWT_SECRET);
}

async function makeServer(): Promise<{
  server: http.Server;
  port: number;
  request: (
    path: string,
    opts?: { method?: string; token?: string; body?: unknown }
  ) => Promise<{ status: number; body: any; text?: string }>;
}> {
  const app = express();
  app.use(express.json());
  app.use('/api/decisions', decisionsRouter);
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
      headers['Content-Type'] = 'application/json';
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
    },
  };
}

async function nullify(): Promise<void> {
  await Promise.all([
    ExecutionEvent.deleteMany({}),
    EvidenceRelationship.deleteMany({}),
    ReconciliationResult.deleteMany({}),
    RedTeamFinding.deleteMany({}),
    VerificationResult.deleteMany({}),
    Claim.deleteMany({}),
    Evidence.deleteMany({}),
    Task.deleteMany({}),
    Execution.deleteMany({}),
    Decision.deleteMany({}),
  ]);
}

let userA: string;
let userB: string;
let server: Awaited<ReturnType<typeof makeServer>>;
const reqA = (path: string, opts?: { method?: string; body?: unknown }) =>
  server.request(`/api/decisions${path}`, { token: tokenFor(userA), ...opts });
const reqB = (path: string, opts?: { method?: string; body?: unknown }) =>
  server.request(`/api/decisions${path}`, { token: tokenFor(userB), ...opts });

async function createDecisionFor(userId: string, title = 'SSE decision'): Promise<string> {
  const res = await server.request('/api/decisions', {
    method: 'POST',
    token: tokenFor(userId),
    body: {
      title,
      objective: 'Should we adopt a phased rollout?',
      context: 'Internal rollout planning.',
    },
  });
  assert.equal(res.status, 201, `create decision failed: ${JSON.stringify(res.body)}`);
  return String((res.body as any)._id || (res.body as any).id);
}

/**
 * Read an SSE stream until each matcher (a predicate over a raw line) matches,
 * or the timeout fires. Returns the captured raw lines and whether the stream
 * closed on its own.
 */
async function readStreamUntil(
  url: string,
  token: string,
  matchers: Array<(line: string) => boolean>,
  timeoutMs: number,
  extraHeaders: Record<string, string> = {}
): Promise<{ lines: string[]; closed: boolean }> {
  return new Promise((resolve) => {
    const controller = new AbortController();
    const captured: string[] = [];
    const matched = new Array(matchers.length).fill(false);
    let buffer = '';
    let settled = false;

    const finish = (closed: boolean) => {
      if (settled) return;
      settled = true;
      controller.abort();
      resolve({ lines: captured, closed });
    };

    const timer = setTimeout(() => finish(false), timeoutMs);

    void (async () => {
      let res: Response;
      try {
        res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream', ...extraHeaders },
          signal: controller.signal,
        });
      } catch {
        clearTimeout(timer);
        finish(false);
        return;
      }
      if (!res.body) {
        clearTimeout(timer);
        finish(false);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const chunk = await reader.read().catch(() => ({ done: true, value: undefined as Uint8Array | undefined }));
        if (chunk.done) {
          clearTimeout(timer);
          finish(true);
          return;
        }
        buffer += decoder.decode(chunk.value, { stream: true }).replace(/\r\n/g, '\n');
        captured.push(buffer);
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          for (let i = 0; i < matchers.length; i++) {
            if (!matched[i] && matchers[i](line)) matched[i] = true;
          }
        }
        if (matched.every(Boolean)) {
          clearTimeout(timer);
          finish(false);
          return;
        }
      }
    })();
  });
}

before(async () => {
  await mongoose.connect(TEST_URI);
  server = await makeServer();
  userA = new mongoose.Types.ObjectId().toString();
  userB = new mongoose.Types.ObjectId().toString();
});

afterEach(async () => {
  await nullify();
});

after(async () => {
  await server.server.close();
  await mongoose.connection.close();
});

describe('Phase 10 — decision reports', () => {
  test('generates a markdown report for an owned decision', async () => {
    const decisionId = await createDecisionFor(userA, 'Report my rollout');

    await Evidence.create({
      decisionId,
      type: 'web',
      title: 'Industry survey',
      content: 'A majority of teams found staged rollouts reduced outages.',
      sourceType: 'web',
      sourceName: 'ExampleCorp Research',
      sourceReliability: 'medium',
      relevanceScore: 0.8,
      retrievedAt: new Date(),
    });
    await Claim.create({
      decisionId,
      agentId: 'analyst',
      text: 'Phased rollout reduces operational risk.',
      type: 'fact',
      status: 'proposed',
      evidenceIds: [],
    });
    await ReconciliationResult.create({
      decisionId,
      recommendation: 'Proceed with a phased rollout over six weeks.',
      rationale: 'Compound evidence and low regression risk favor phased adoption.',
      survivingClaimIds: ['c1'],
      rejectedClaimIds: [],
      uncertainClaimIds: [],
      unresolvedConflictIds: [],
      redTeamFindingIds: [],
      needsMoreResearch: false,
      createdAt: new Date(),
    });

    const res = await reqA(`/${decisionId}/report`);
    assert.equal(res.status, 200);
    assert.match(res.text || '', /^# Decision Report$/m);
    assert.match(res.text || '', /## 1\. Problem/m);
    assert.match(res.text || '', /## 2\. Recommendation/m);
    assert.match(res.text || '', /## 3\. Executive Summary/m);
    assert.match(res.text || '', /## 4\. Evidence/m);
    assert.match(res.text || '', /## 5\. Claims/m);
    assert.match(res.text || '', /## 6\. Verification/m);
    assert.match(res.text || '', /## 7\. Red Team Findings/m);
    assert.match(res.text || '', /## 8\. Reconciliation/m);
    assert.match(res.text || '', /## 9\. Models & Routing/m);
    assert.match(res.text || '', /## 10\. Cost & Usage/m);
    assert.match(res.text || '', /## 11\. Evaluation/m);
    assert.match(res.text || '', /## 12\. Provenance/m);
    assert.match(res.text || '', /Report my rollout/m);
    assert.match(res.text || '', /Proceed with a phased rollout over six weeks\./m);
    assert.match(res.text || '', /Phased rollout reduces operational risk\./m);
  });

  test('report is ownership-scoped (other user gets 404)', async () => {
    const decisionId = await createDecisionFor(userA);
    const res = await reqB(`/${decisionId}/report`);
    assert.equal(res.status, 404);
  });

  test('report never leaks secrets even when present in source documents', async () => {
    const decisionId = await createDecisionFor(userA, 'Secret-safe decision');

    await Evidence.create({
      decisionId,
      type: 'web',
      title: 'Source with embedded key',
      content: 'The service uses apiKey=sk-ABCDEF234567890123456789 and refresh_token 9f8e7d6c5b4a3829103847564758392019384756 directly.',
      sourceType: 'web',
      retrievedAt: new Date(),
    });
    await ExecutionEvent.create({
      type: 'agent.completed',
      decisionId,
      taskId: 't1',
      data: { apiKey: 'sk-ABCDEF234567890123456789', Authorization: 'Bearer 9f8e7d6c5b4a3829103847564758392019384756' },
    });
    const execution = await Execution.create({
      decisionId,
      status: 'completed',
      startedAt: new Date(),
      completedAt: new Date(),
      currentPhase: 'completed',
      progress: 100,
      totalTasks: 1,
      completedTasks: 1,
      tokenUsage: { totalTokens: 1200, model: 'gpt-4o', provider: 'openai' },
      estimatedCost: 0.012,
      actualCost: 0.012,
    });
    await Task.create({
      executionId: execution._id,
      type: 'debate',
      status: 'completed',
      priority: 1,
      metadata: {
        routing: {
          selection: {
            model: { modelName: 'gpt-4o', provider: 'openai' },
            agent: { name: 'debater' },
          },
        },
      },
    });

    const res = await reqA(`/${decisionId}/report`);
    assert.equal(res.status, 200);
    const md = res.text || '';
    assert.equal(md.includes('sk-ABCDEF234567890123456789'), false, 'api key leaked');
    assert.equal(md.includes('9f8e7d6c5b4a3829103847564758392019384756'), false, 'token leaked');
    assert.equal(md.includes('Authorization'), false, 'authorization header leaked');
    // Non-secret model info must still appear.
    assert.match(md, /gpt-4o \(openai\)/m);
  });

  test('report for a draft decision is produced honestly', async () => {
    const decisionId = await createDecisionFor(userA);
    const res = await reqA(`/${decisionId}/report`);
    assert.equal(res.status, 200);
    assert.match(res.text || '', /No recommendation has been produced yet/m);
    assert.match(res.text || '', /No execution has been run for this decision yet/m);
  });

  test('report prompts a download when ?download=1', async () => {
    const decisionId = await createDecisionFor(userA);
    const headers = { Authorization: `Bearer ${tokenFor(userA)}`, 'Content-Type': 'application/json' };
    const res = await fetch(`http://127.0.0.1:${server.port}/api/decisions/${decisionId}/report?download=1`, {
      headers,
    });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') || '', /text\/markdown/);
    assert.match(res.headers.get('content-disposition') || '', /attachment/);
  });
});

describe('Phase 10 — SSE execution event stream', () => {
  test('rejects unauthenticated connections', async () => {
    const decisionId = await createDecisionFor(userA);
    const res = await server.request(`/api/decisions/${decisionId}/events/stream`);
    assert.equal(res.status, 401);
  });

  test('rejects connections to another user\'s decision (404)', async () => {
    const decisionId = await createDecisionFor(userA);
    const res = await server.request(`/api/decisions/${decisionId}/events/stream`, {
      token: tokenFor(userB),
    });
    assert.equal(res.status, 404);
  });

  test('streams connected handshake then live execution events to the owner', async () => {
    const decisionId = await createDecisionFor(userA);

    const stream = readStreamUntil(
      `http://127.0.0.1:${server.port}/api/decisions/${decisionId}/events/stream`,
      tokenFor(userA),
      [
        (l) => l.startsWith('event: stream.connected'),
        (l) => l.startsWith('event: execution-event'),
      ],
      8000
    );

    // Wait briefly for the connected handshake to be flushed before emitting.
    await new Promise((r) => setTimeout(r, 400));
    executionEventBus.emit({
      type: 'execution.queued',
      decisionId,
      executionId: new mongoose.Types.ObjectId().toString(),
    });

    const { lines } = await stream;
    assert.ok(
      lines.some((l) => l.includes('"type":"execution.queued"')),
      'expected live execution.queued event to be streamed'
    );
    assert.ok(
      lines.some((l) => l.includes('"replayCount"')),
      'expected stream.connected payload with replayCount'
    );
  });

  test('reconnects resume from Last-Event-ID (no duplicate replay)', async () => {
    const decisionId = await createDecisionFor(userA);
    const base = `http://127.0.0.1:${server.port}/api/decisions/${decisionId}/events/stream`;

    executionEventBus.emit({ type: 'execution.queued', decisionId });
    // Let the async persistence land so the first stream replays it.
    await new Promise((r) => setTimeout(r, 300));

    const first = await readStreamUntil(
      base,
      tokenFor(userA),
      [(l) => l.includes('"type":"execution.queued"')],
      6000
    );

    // Extract the SSE event id of the replayed event from the first stream.
    const idLine = first.lines
      .flatMap((b) => b.split('\n'))
      .find((l) => /^id: /.test(l));
    const lastEventId = Number(idLine ? idLine.replace('id: ', '') : 0);
    assert.ok(lastEventId > 0);

    executionEventBus.emit({ type: 'task.created', taskId: 't-after-reconnect', decisionId });
    await new Promise((r) => setTimeout(r, 300));

    // Reconnect with Last-Event-ID: the older event must NOT be re-replayed,
    // but the newer one is.
    const second = await readStreamUntil(
      base,
      tokenFor(userA),
      [(l) => l.includes('"type":"task.created"')],
      6000,
      { 'last-event-id': String(lastEventId) }
    );
    const secondRaw = second.lines.join('\n');
    assert.ok(secondRaw.includes('"type":"task.created"'), 'expected the newer event after resume');
    assert.equal(
      secondRaw.includes('"type":"execution.queued"'),
      false,
      'older event should be skipped by Last-Event-ID resume'
    );
  });

  test('keeps the stream alive with heartbeats', async () => {
    const decisionId = await createDecisionFor(userA);
    const { lines, closed } = await readStreamUntil(
      `http://127.0.0.1:${server.port}/api/decisions/${decisionId}/events/stream`,
      tokenFor(userA),
      [(l) => l === ': keepalive'],
      20000
    );
    assert.equal(closed, false, 'stream should still be open when keepalive arrives');
    assert.ok(lines.some((l) => l.includes(': keepalive')), 'expected keepalive comment');
  });

  test('server keeps working after a stream is closed (listener cleanup)', async () => {
    const decisionId = await createDecisionFor(userA);
    const base = `http://127.0.0.1:${server.port}/api/decisions/${decisionId}/events/stream`;

    const controller = new AbortController();
    const res = await fetch(base, {
      headers: { Authorization: `Bearer ${tokenFor(userA)}` },
      signal: controller.signal,
    });
    // Read a bit, then abort (simulates the client navigating away).
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    await reader.read();
    controller.abort();
    await new Promise((r) => setTimeout(r, 200));

    // Emitting after close must not throw and a fresh subscriber still works.
    executionEventBus.emit({ type: 'execution.completed', decisionId });
    await new Promise((r) => setTimeout(r, 300));
    const second = await readStreamUntil(
      base,
      tokenFor(userA),
      [(l) => l.includes('"type":"execution.completed"')],
      6000
    );
    assert.ok(
      second.lines.join('\n').includes('"type":"execution.completed"'),
      'stream should still work after a prior disconnect'
    );
  });
});