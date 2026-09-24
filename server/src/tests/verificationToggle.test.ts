import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Decision from '../models/Decision';
import Execution from '../models/Execution';
import ExecutionPlan from '../models/DecisionPlan';
import Task from '../models/Task';
import { resolvePlanTermination } from '../tasks/handlers/debateHandler';

const TEST_URI = process.env.MONGODB_URI_TEST || 'mongodb://localhost:27017/hathap_test_verify_toggle';

let decisionId: string;
let userId: string;

before(async () => {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(TEST_URI);
  }
  await clean();
  userId = new mongoose.Types.ObjectId().toString();
  const decision = await Decision.create({
    userId,
    title: 'Verify toggle',
    objective: 'Objective',
    status: 'debating',
    configuration: { strategy: 'consensus', maxRounds: 2 },
  });
  decisionId = decision._id.toString();
});

after(async () => {
  await clean();
  await mongoose.connection.close();
});

async function clean(): Promise<void> {
  await Promise.all([
    Decision.deleteMany({}),
    Execution.deleteMany({}),
    ExecutionPlan.deleteMany({}),
    Task.deleteMany({}),
  ]);
}

async function makeExecution(): Promise<string> {
  const exec = await Execution.create({
    decisionId,
    status: 'queued',
    currentPhase: 'debating',
    progress: 0,
  });
  return exec._id.toString();
}

describe('verificationEnabled toggle — fixed mode (no plan)', () => {
  test('verification runs when the toggle is true', async () => {
    const executionId = await makeExecution();
    const term = await resolvePlanTermination(executionId, true);
    assert.equal(term.verify, true);
    assert.equal(term.redTeam, true);
    assert.equal(term.reconciliation, true);
    await Execution.deleteOne({ _id: executionId });
  });

  test('verification is skipped when the toggle is false', async () => {
    const executionId = await makeExecution();
    const term = await resolvePlanTermination(executionId, false);
    assert.equal(term.verify, false);
    assert.equal(term.redTeam, true, 'red team still runs');
    assert.equal(term.reconciliation, true, 'reconciliation still runs');
    await Execution.deleteOne({ _id: executionId });
  });

  test('verification defaults to on for decisions without the flag', async () => {
    const executionId = await makeExecution();
    const term = await resolvePlanTermination(executionId, undefined);
    assert.equal(term.verify, true);
    await Execution.deleteOne({ _id: executionId });
  });
});

describe('verificationEnabled toggle — intelligent mode (plan present)', () => {
  test('the plan termination flags remain authoritative', async () => {
    const executionId = await makeExecution();
    const plan = await ExecutionPlan.create({
      decisionId,
      executionId,
      version: '1.0',
      source: 'intelligent',
      planningMode: 'intelligent',
      status: 'compiled',
      tasks: [],
      termination: { requiresVerification: false, requiresRedTeam: true, requiresReconciliation: true },
    });
    await Execution.updateOne({ _id: executionId }, { $set: { planId: plan._id.toString() } });

    const term = await resolvePlanTermination(executionId, true);
    assert.equal(term.verify, false, 'plan disables verification regardless of the toggle');
    assert.equal(term.redTeam, true);

    await ExecutionPlan.deleteOne({ _id: plan._id });
    await Execution.deleteOne({ _id: executionId });
  });
});