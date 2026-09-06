import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { StateMachine } from '../decision/stateMachine';
import { decisionOrchestrator } from '../decision/orchestrator';
import Decision from '../models/Decision';
import Execution from '../models/Execution';
import Task from '../models/Task';
import Claim from '../models/Claim';
import Evidence from '../models/Evidence';

const TEST_URI = process.env.MONGODB_URI_TEST || 'mongodb://localhost:27017/hathap_test';

let userId: string;
let decisionId: string;

before(async () => {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(TEST_URI);
  }
  await Promise.all([
    Decision.deleteMany({}),
    Execution.deleteMany({}),
    Task.deleteMany({}),
    Claim.deleteMany({}),
    Evidence.deleteMany({}),
  ]);
  userId = new mongoose.Types.ObjectId().toString();
});

after(async () => {
  await Promise.all([
    Decision.deleteMany({}),
    Execution.deleteMany({}),
    Task.deleteMany({}),
    Claim.deleteMany({}),
    Evidence.deleteMany({}),
  ]);
  await mongoose.connection.close();
});

describe('Decision lifecycle (persistent)', () => {
  test('createDecision persists a draft decision with evidence', async () => {
    const decision = await decisionOrchestrator.createDecision({
      userId,
      title: 'Test Decision',
      objective: 'Should we adopt microservices?',
      context: 'Evaluating architecture.',
      configuration: { strategy: 'consensus', maxRounds: 2 },
    });
    assert.ok(decision._id, 'decision should have an id');
    assert.equal(decision.status, 'draft');
    assert.equal(decision.configuration?.strategy, 'consensus');
    decisionId = decision._id.toString();

    const saved = await Decision.findById(decisionId);
    assert.ok(saved, 'decision should be persisted');
    assert.equal(saved.status, 'draft');

    const evidence = await Evidence.find({ decisionId });
    assert.equal(evidence.length, 1, 'objective evidence should be recorded');
    assert.equal(evidence[0].sourceType, 'user_input');
  });

  test('startDecision transitions to debating and persists execution', async () => {
    // Note: without agents/models configured, startDebate will fail.
    // This tests that a failed execution is persisted and decision marked failed,
    // demonstrating recoverable partial failure.
    await assert.rejects(
      () => decisionOrchestrator.startDecision(decisionId, userId),
      /No valid agent participants|No models configured/
    );

    const decision = await Decision.findById(decisionId);
    assert.ok(decision, 'decision should exist');
    assert.equal(decision.status, 'failed', 'decision marked failed after failed run');

    const executions = await Execution.find({ decisionId });
    assert.ok(executions.length >= 1, 'an execution record should exist');
    const exec = executions[0];
    assert.equal(exec.status, 'failed');
    assert.ok(exec.error, 'execution should carry error info');
    assert.equal(exec.error.code, 'AGENT_FAILURE');
  });

  test('getSnapshot returns full decision state', async () => {
    const snapshot = await decisionOrchestrator.getSnapshot(decisionId, userId);
    assert.equal(snapshot.id, decisionId);
    assert.ok(Array.isArray(snapshot.executions));
    assert.ok(Array.isArray(snapshot.tasks));
    assert.ok(Array.isArray(snapshot.claims));
    assert.ok(Array.isArray(snapshot.evidence));
  });

  test('decision state machine prevents invalid transitions', () => {
    assert.throws(
      () => StateMachine.transitionDecision('completed', 'debating'),
      /Invalid state transition/
    );
  });
});

describe('Task lifecycle helpers', () => {
  test('execution can represent partial results', async () => {
    const exec = await Execution.create({
      decisionId,
      status: 'partial',
      startedAt: new Date(),
      currentPhase: 'debating',
      progress: 50,
    });
    assert.equal(exec.status, 'partial');
    assert.equal(exec.progress, 50);
    await exec.deleteOne();
  });
});
