import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import type { AddressInfo } from 'net';
import Decision from '../models/Decision';
import Execution from '../models/Execution';
import Task from '../models/Task';
import ExecutionEvent from '../models/ExecutionEvent';
import decisionsRouter from '../routes/decisions';
import { executionEventBus } from '../decision/eventBus';

const TEST_URI =
  process.env.MONGODB_URI_TEST_INTELLIGENCE || 'mongodb://localhost:27017/hathap_test_intelligence';

const JWT_SECRET = process.env.JWT_SECRET || 'secret';

function tokenFor(id: string): string {
  return jwt.sign({ id }, JWT_SECRET);
}

async function makeServer(): Promise<{
  server: http.Server;
  request: (path: string, opts?: { method?: string; token?: string }) => Promise<{ status: number; body: any }>;
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
    request: async (path, opts = {}) => {
      const headers: Record<string, string> = {};
      if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
      const res = await fetch(`http://127.0.0.1:${port}${path}`, {
        method: opts.method || 'GET',
        headers,
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

async function waitFor(
  predicate: () => Promise<boolean>,
  timeoutMs = 4000
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error('waitFor timed out');
}

let userA: string;
let userB: string;
let server: Awaited<ReturnType<typeof makeServer>>;
let ownedDecisionId: string;
let ownedExecutionId: string;
let otherDecisionId: string;

before(async () => {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(TEST_URI);
  }
  await Promise.all([
    ExecutionEvent.deleteMany({}),
    Task.deleteMany({}),
    Execution.deleteMany({}),
    Decision.deleteMany({}),
  ]);
  userA = new mongoose.Types.ObjectId().toString();
  userB = new mongoose.Types.ObjectId().toString();

  const ownedDecision = await Decision.create({
    userId: userA,
    title: 'Intelligence view',
    objective: 'Understand the decision',
    status: 'debating',
    currentPhase: 'debating',
    configuration: { strategy: 'consensus' },
  });
  ownedDecisionId = ownedDecision._id.toString();
  const execution = await Execution.create({
    decisionId: ownedDecisionId,
    status: 'running',
    progress: 40,
    currentPhase: 'debating',
  });
  ownedExecutionId = execution._id.toString();

  const otherDecision = await Decision.create({
    userId: userB,
    title: 'Other user decision',
    objective: 'Should not leak',
    status: 'draft',
    configuration: { strategy: 'consensus' },
  });
  otherDecisionId = otherDecision._id.toString();

  server = await makeServer();
});

after(async () => {
  server.server.close();
  await Promise.all([
    ExecutionEvent.deleteMany({}),
    Task.deleteMany({}),
    Execution.deleteMany({}),
    Decision.deleteMany({}),
  ]);
  await mongoose.connection.close();
});

describe('GET /api/decisions/:id/events (decision intelligence timeline)', () => {
  test('returns orderable, structured events for the owned decision', async () => {
    executionEventBus.emit({
      type: 'execution.started',
      decisionId: ownedDecisionId,
      executionId: ownedExecutionId,
      data: { phase: 'debating' },
    });
    executionEventBus.emit({
      type: 'task.completed',
      decisionId: ownedDecisionId,
      executionId: ownedExecutionId,
      taskId: '507f1f77bcf86cd799439011',
      data: { phase: 'debating' },
    });
    executionEventBus.emit({
      type: 'research.completed',
      decisionId: ownedDecisionId,
      executionId: ownedExecutionId,
      data: { phase: 'investigating' },
    });

    await waitFor(async () => {
      const count = await ExecutionEvent.countDocuments({ decisionId: ownedDecisionId });
      return count >= 3;
    });

    const res = await server.request(`/api/decisions/${ownedDecisionId}/events`, {
      token: tokenFor(userA),
    });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body), 'events should be an array');
    assert.ok(res.body.length >= 3, 'should contain emitted events');

    const executionStarted = res.body.find(
      (e: any) => e.type === 'execution.started'
    );
    assert.ok(executionStarted, 'execution.started event present');
    assert.equal(executionStarted.decisionId, ownedDecisionId);
    assert.equal(executionStarted.executionId, ownedExecutionId);
    assert.ok(
      !('apiKey' in (executionStarted.data || {})) &&
        !('api_key' in (executionStarted.data || {})),
      'no credentials leak through event data'
    );

    // Deterministic ordering by timestamp.
    const timestamps = res.body.map((e: any) =>
      new Date(e.createdAt).getTime()
    );
    const sorted = [...timestamps].sort((a, b) => a - b);
    assert.deepEqual(timestamps, sorted, 'events must be returned in timestamp order');
  });

  test('rejects cross-user access with 404', async () => {
    const res = await server.request(`/api/decisions/${ownedDecisionId}/events`, {
      token: tokenFor(userB),
    });
    assert.equal(res.status, 404);
  });

  test('returns 404 for nonexistent decision', async () => {
    const res = await server.request(
      `/api/decisions/${new mongoose.Types.ObjectId().toString()}/events`,
      { token: tokenFor(userA) }
    );
    assert.equal(res.status, 404);
  });

  test('other user cannot read events belonging to a different decision', async () => {
    const res = await server.request(`/api/decisions/${otherDecisionId}/events`, {
      token: tokenFor(userA),
    });
    assert.equal(res.status, 404);
  });
});