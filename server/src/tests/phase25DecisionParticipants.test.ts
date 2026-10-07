import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../models/User';
import Agent from '../models/Agent';
import Model from '../models/Model';
import Decision from '../models/Decision';
import { decisionOrchestrator } from '../decision/orchestrator';
import { debateEngine } from '../engine/debateEngine';

/**
 * Phase 25 — a Decision created by any shipped flow has no participants.
 *
 * The create form has no participant picker, the evaluation runner and the
 * research demo build a decision directly, and `POST /api/decisions` simply
 * omits the field. The engine treated an empty panel as fatal, so every one of
 * those decisions failed its first task with
 * "No valid agent participants could be resolved for this decision." — and
 * because there is no UI anywhere to add participants, there was no way for a
 * user to get past it.
 *
 * The engine now falls back to the user's own agent roster (capped by the
 * decision's `maxAgents`) and persists the resolved panel, mirroring how the
 * A2A path picks a default panel.
 *
 * The assertions below never reach the network: a model carrying the sentinel
 * key `fake-key` makes `callLLM` throw before any socket is opened, which is
 * exactly what proves the run got past participant resolution and into the
 * agent runner.
 */
const TEST_URI =
  process.env.MONGODB_URI_TEST_PHASE25 || 'mongodb://localhost:27017/hathap_test_phase25_participants';

let userId: string;
let otherUserId: string;

async function seedAgents(count: number, owner: string): Promise<string[]> {
  const created = await Agent.insertMany(
    Array.from({ length: count }, (_, i) => ({
      userId: owner,
      name: `Agent ${i + 1}`,
      description: 'Test persona',
      systemPrompt: 'Answer carefully.',
    }))
  );
  return created.map((a) => String(a._id));
}

async function seedReachableModel(owner: string): Promise<void> {
  await Model.create({
    userId: owner,
    provider: 'openai',
    displayName: 'Sentinel',
    modelName: 'gpt-4o-mini',
    baseUrl: 'https://api.openai.com/v1',
    status: 'untested',
    enabled: true,
    apiKey: 'fake-key',
  });
}

before(async () => {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(TEST_URI);
  }
  await User.deleteMany({});
  const owner = await User.create({ email: 'phase25-owner@test.local', name: 'Owner', passwordHash: 'x' });
  const other = await User.create({ email: 'phase25-other@test.local', name: 'Other', passwordHash: 'x' });
  userId = String(owner._id);
  otherUserId = String(other._id);
});

after(async () => {
  await Promise.all([
    User.deleteMany({}),
    Agent.deleteMany({}),
    Model.deleteMany({}),
    Decision.deleteMany({}),
  ]);
  await mongoose.connection.close();
});

beforeEach(async () => {
  await Promise.all([Agent.deleteMany({}), Model.deleteMany({}), Decision.deleteMany({})]);
});

describe('Phase 25 - decision participants default to the user agent roster', () => {
  test('a decision with no participants resolves the roster and persists it', async () => {
    const agentIds = await seedAgents(3, userId);
    await seedReachableModel(userId);

    const decision = await decisionOrchestrator.createDecision({
      userId,
      title: 'No panel chosen',
      objective: 'Decide something.',
    });
    assert.deepEqual(decision.participants ?? [], [], 'the shipped create flow stores no panel');

    // Fails at the sentinel model, i.e. after participant resolution succeeded.
    await assert.rejects(
      () =>
        debateEngine.executeForDecision({
          decisionId: String(decision._id),
          userId,
          strategy: 'consensus',
          participants: decision.participants,
          objective: decision.objective,
        }),
      /No API key configured for model/,
      'the run reached the agent runner instead of dying on an empty panel'
    );

    const stored = (await Decision.findById(decision._id)) as any;
    const resolved = stored.participants.map((p: any) => String(p.agentId));
    assert.deepEqual(
      resolved.sort(),
      [...agentIds].sort(),
      'the resolved panel is persisted so every downstream task uses the same agents'
    );
  });

  test('the persisted panel is reused instead of being re-resolved', async () => {
    await seedAgents(4, userId);
    await seedReachableModel(userId);

    const decision = await decisionOrchestrator.createDecision({
      userId,
      title: 'Panel chosen',
      objective: 'Decide something.',
      participants: [{ type: 'agent', agentId: (await seedAgents(1, userId))[0] }],
    });
    const before = (decision.participants ?? []).map((p: any) => String(p.agentId));
    assert.equal(before.length, 1);

    await assert.rejects(
      () =>
        debateEngine.executeForDecision({
          decisionId: String(decision._id),
          userId,
          strategy: 'consensus',
          participants: decision.participants,
          objective: decision.objective,
        }),
      /No API key configured for model/
    );

    const stored = (await Decision.findById(decision._id)) as any;
    assert.deepEqual(
      stored.participants.map((p: any) => String(p.agentId)),
      before,
      'an explicitly chosen panel is not overwritten by the roster fallback'
    );
  });

  test('the fallback panel is capped by the decision maxAgents limit', async () => {
    await seedAgents(5, userId);
    await seedReachableModel(userId);

    const decision = await decisionOrchestrator.createDecision({
      userId,
      title: 'Small panel',
      objective: 'Decide something.',
      configuration: { maxAgents: 2 },
    });

    await assert.rejects(
      () =>
        debateEngine.executeForDecision({
          decisionId: String(decision._id),
          userId,
          strategy: 'consensus',
          participants: decision.participants,
          objective: decision.objective,
        }),
      /No API key configured for model/
    );

    const stored = (await Decision.findById(decision._id)) as any;
    assert.equal(stored.participants.length, 2, 'maxAgents caps the default panel');
  });

  test('a user with no agents gets an actionable error, not a stale one', async () => {
    await seedReachableModel(userId);

    const decision = await decisionOrchestrator.createDecision({
      userId,
      title: 'Nobody to ask',
      objective: 'Decide something.',
    });

    await assert.rejects(
      () =>
        debateEngine.executeForDecision({
          decisionId: String(decision._id),
          userId,
          strategy: 'consensus',
          participants: decision.participants,
          objective: decision.objective,
        }),
      /Create at least one agent on the Agents page/,
      'the message tells the user what to do next'
    );
  });

  test('another user roster is never used as a fallback', async () => {
    await seedAgents(3, otherUserId);
    await seedReachableModel(userId);

    const decision = await decisionOrchestrator.createDecision({
      userId,
      title: 'Empty roster',
      objective: 'Decide something.',
    });

    await assert.rejects(
      () =>
        debateEngine.executeForDecision({
          decisionId: String(decision._id),
          userId,
          strategy: 'consensus',
          participants: decision.participants,
          objective: decision.objective,
        }),
      /Create at least one agent on the Agents page/,
      'the fallback stays inside the caller own workspace'
    );

    const stored = (await Decision.findById(decision._id)) as any;
    assert.deepEqual(stored.participants ?? [], [], 'no foreign agent is written onto the decision');
  });
});
