import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Decision from '../models/Decision';
import Execution from '../models/Execution';
import Task from '../models/Task';
import Claim from '../models/Claim';
import Evidence from '../models/Evidence';
import ExecutionPlan from '../models/DecisionPlan';
import ExecutionEvent from '../models/ExecutionEvent';
import DecisionMemory from '../models/DecisionMemory';
import ReconciliationResult from '../models/ReconciliationResult';
import { TaskExecutor } from '../decision/executor';
import { Worker } from '../tasks/worker';
import { verifyClaimHandler } from '../tasks/handlers/verifyClaimHandler';
import { redTeamHandler } from '../tasks/handlers/redTeamHandler';
import { reconciliationHandler } from '../tasks/handlers/reconciliationHandler';
import { DecisionPlanner } from '../planning/planner';
import { makePlanningPolicy } from '../planning/planningPolicy';
import {
  TaskHandler,
  TaskHandlerRegistry,
  TaskHandlerContext,
  TaskType,
} from '../decision/types';
import { DecisionPlan as PlanShape, PlanCallFunction } from '../planning/planTypes';
import { DecisionOrchestrator } from '../decision/orchestrator';
import { decisionMemoryService } from '../memory/decisionMemoryService';
import { DefaultTaskHandlerRegistry } from '../tasks/handlers';

const TEST_URI =
  process.env.MONGODB_URI_TEST_MEMORY_E2E || 'mongodb://localhost:27017/hathap_test_memory_e2e';

async function clean(): Promise<void> {
  await Promise.all([
    DecisionMemory.deleteMany({}),
    ExecutionEvent.deleteMany({}),
    ReconciliationResult.deleteMany({}),
    Claim.deleteMany({}),
    Evidence.deleteMany({}),
    Task.deleteMany({}),
    Execution.deleteMany({}),
    ExecutionPlan.deleteMany({}),
    Decision.deleteMany({}),
  ]);
}

function simplePlan(): PlanShape {
  return {
    version: '1.0',
    source: 'intelligent',
    tasks: [
      {
        tempId: 'debate',
        type: 'debate',
        purpose: 'Debate this decision.',
        input: { strategy: 'judge', description: 'Simple decision.' },
        dependsOn: [],
        priority: 1,
        requirements: ['reasoning'],
      },
    ],
    termination: {
      requiresVerification: false,
      requiresRedTeam: false,
      requiresReconciliation: true,
    },
    rationale: {
      summary: 'simple',
      research: 'none',
      debate: '1',
      verification: 'off',
      redTeam: 'off',
    },
    estimates: {
      estimatedTasks: 1,
      estimatedResearchTasks: 0,
      estimatedLLMTasks: 1,
    },
  };
}

const planCallFor = (plan: unknown): PlanCallFunction =>
  async () => ({ ok: true as const, text: JSON.stringify(plan) });

class FakeDebateHandler implements TaskHandler {
  type: TaskType = 'debate';
  canHandle(type: TaskType) {
    return type === 'debate';
  }
  async execute(_task: any, context: TaskHandlerContext) {
    await Claim.create({
      decisionId: context.decisionId,
      executionId: context.executionId,
      taskId: context.taskId,
      text: 'Phased adoption reduces risk.',
      type: 'fact',
      status: 'accepted',
      evidenceIds: [],
      supportingEvidenceIds: [],
      provenanceKind: 'inferred',
    });
    return {
      output: {
        verdict: { recommendation: 'Proceed with phased adoption.', confidenceScore: 0.75 },
        messages: [],
        strategy: 'consensus',
      },
    };
  }
}

function makeRegistry(): TaskHandlerRegistry {
  return new DefaultTaskHandlerRegistry([
    new FakeDebateHandler(),
    verifyClaimHandler,
    redTeamHandler,
    reconciliationHandler,
  ]);
}

function makeWorker(): Worker {
  const executor = new TaskExecutor({
    registry: makeRegistry(),
    workerId: 'memory-e2e-worker',
    backoff: () => 5,
  });
  return new Worker({
    executor,
    pollIntervalMs: 100_000,
    maxConcurrentTasks: 6,
    staleTaskTimeoutMs: 120_000,
  });
}

async function waitFor(
  predicate: () => Promise<boolean>,
  timeoutMs = 8_000
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error('waitFor timed out');
}

let userId: string;

before(async () => {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(TEST_URI);
  }
  await clean();
  userId = new mongoose.Types.ObjectId().toString();
});

after(async () => {
  await clean();
  await mongoose.connection.close();
});

describe('Phase 8 E2E - Worker completion records decision memory', () => {
  test('a completed decision gets an honest memory index, created via the worker completion hook', async () => {
    const decision = await Decision.create({
      userId,
      title: 'E2E microservices decision',
      objective: 'Should we adopt microservices?',
      context: 'E2E worker memory hook.',
      status: 'debating',
      metadata: { category: 'technology', tags: ['microservices', 'cloud'], entities: ['payments-svc'] },
    });
    const decisionId = decision._id.toString();

    // Seed a reconciliation result so memory has a final recommendation.
    await ReconciliationResult.create({
      decisionId,
      recommendation: 'Proceed with phased adoption.',
      survivingClaimIds: [],
      rejectedClaimIds: [],
      uncertainClaimIds: [],
      redTeamFindingIds: [],
      needsMoreResearch: false,
      rationale: 'Synthetic reconciliation.',
    });

    const execution = await Execution.create({
      decisionId,
      status: 'queued',
      startedAt: new Date(),
      currentPhase: 'debating',
      progress: 0,
      planningStatus: 'planned',
      planningMode: 'intelligent',
    });
    const executionId = execution._id.toString();

    const planner = new DecisionPlanner({ policy: makePlanningPolicy() });
    const result = await planner.planExecution({
      executionId,
      userId,
      planningMode: 'intelligent',
      planCall: planCallFor(simplePlan()),
    });
    assert.equal(result.planSource, 'intelligent');

    const worker = makeWorker();
    await waitFor(async () => {
      await worker.tickNow();
      const e = await Execution.findById(executionId);
      return !!e && e.status === 'completed';
    });

    const updatedDecision = await Decision.findById(decisionId);
    assert.ok(updatedDecision);
    assert.equal(updatedDecision.status, 'completed', 'decision transitions to completed');

    await waitFor(async () =>
      (await DecisionMemory.countDocuments({ decisionId })) === 1
    );

    const memory = await DecisionMemory.findOne({ decisionId });
    assert.ok(memory, 'memory record written by worker completion hook');
    assert.equal(memory.status, 'completed');
    assert.equal(memory.createdVia, 'completion');
    assert.equal(String(memory.finalRecommendation), 'Proceed with phased adoption.');
    assert.equal(memory.recommendationSource, 'reconciliation');
    assert.deepEqual(memory.tags, ['microservices', 'cloud']);
    assert.deepEqual(memory.entities, ['payments-svc']);
    assert.equal(memory.category, 'technology');
    assert.ok(memory.completedAt instanceof Date);
    assert.ok(memory.importantClaimIds.length > 0, 'claim created by handler referenced');
    assert.ok(memory.executionIds.length >= 1, 'execution referenced');
    assert.ok(memory.importantEvidenceIds.length >= 0);

    const memoryEvent = await ExecutionEvent.findOne({ type: 'memory.created', decisionId });
    assert.ok(memoryEvent, 'memory.created event persisted');
    assert.equal(String(memoryEvent.decisionId), decisionId);
  });
});

describe('Phase 8 E2E - Orchestrator cancellation records cancelled memory', () => {
  test('cancelling a decision writes an honest cancelled memory, never a success', async () => {
    const decision = await Decision.create({
      userId,
      title: 'E2E cancelled decision',
      objective: 'We will cancel this.',
      status: 'debating',
      metadata: { category: 'operations' },
    });
    const decisionId = decision._id.toString();

    const orchestrator = new DecisionOrchestrator();
    await orchestrator.cancelDecision(decisionId, userId);

    const updated = await Decision.findById(decisionId);
    assert.ok(updated);
    assert.equal(updated.status, 'cancelled');

    await waitFor(async () =>
      (await DecisionMemory.countDocuments({ decisionId })) === 1
    );

    const memory = await DecisionMemory.findOne({ decisionId });
    assert.ok(memory, 'cancelled decision gets memory record');
    assert.equal(memory.status, 'cancelled');
    assert.equal(memory.createdVia, 'cancellation');
    assert.equal(memory.title, 'E2E cancelled decision');
    assert.equal(memory.recommendationSource, 'none');
    assert.ok(memory.completedAt instanceof Date, 'completedAt stamped on cancellation');
  });
});

describe('Phase 8 E2E - Planner integrates historical memory (untrusted, bounded)', () => {
  test('planCall receives a historicalMemory context that never overrides instructions', async () => {
    // Seed a prior completed decision for the same user with matching metadata.
    const prior = await Decision.create({
      userId,
      title: 'Prior microservices plan',
      objective: 'Should we adopt microservices earlier?',
      context: 'Earlier decision.',
      status: 'completed',
      completedAt: new Date(),
      metadata: { category: 'technology', tags: ['microservices'] },
    });
    const priorId = prior._id.toString();
    await decisionMemoryService.createForDecision(priorId, userId, { via: 'completion' });

    // Current decision with matching category/tags.
    const current = await Decision.create({
      userId,
      title: 'Current microservices plan',
      objective: 'Should we adopt microservices now?',
      context: 'Current decision.',
      status: 'debating',
      metadata: { category: 'technology', tags: ['microservices'] },
    });
    const currentId = current._id.toString();

    const execution = await Execution.create({
      decisionId: currentId,
      status: 'queued',
      startedAt: new Date(),
      currentPhase: 'debating',
      progress: 0,
      planningStatus: 'planned',
      planningMode: 'intelligent',
    });

    let capturedContext: any = null;
    const capturingPlanCall: PlanCallFunction = async ({ context }) => {
      capturedContext = context;
      return { ok: true as const, text: JSON.stringify(simplePlan()) };
    };

    const beforeRetrieved = await ExecutionEvent.countDocuments({ type: 'memory.retrieved' });

    const planner = new DecisionPlanner({ policy: makePlanningPolicy() });
    const result = await planner.planExecution({
      executionId: execution._id.toString(),
      userId,
      planningMode: 'intelligent',
      planCall: capturingPlanCall,
    });
    assert.equal(result.planSource, 'intelligent');

    // Wait for any async event persistence.
    await new Promise((r) => setTimeout(r, 100));
    const afterRetrieved = await ExecutionEvent.countDocuments({ type: 'memory.retrieved' });
    assert.equal(afterRetrieved, beforeRetrieved, 'no memory.retrieved event persisted by planner path');

    assert.ok(capturedContext, 'planCall received a context');
    assert.ok(capturedContext.historicalMemory, 'historicalMemory attached to planner context');
    const mem = capturedContext.historicalMemory;
    assert.equal(mem.enabled, true);
    assert.ok(typeof mem.contextText === 'string' && mem.contextText.length > 0, 'contextText built');
    assert.match(mem.contextText, /<historical_decision_memory>/);
    assert.match(mem.contextText, /UNTRUSTED REFERENCE DATA/);
    assert.match(mem.contextText, /Prior microservices plan/, 'prior decision surfaced');
    assert.ok(!mem.contextText.includes('Current microservices plan'), 'current decision excluded');
    assert.ok(!mem.contextText.includes('Should we adopt microservices now?'), 'current objective excluded');
    assert.ok(mem.contextSize <= 3000, `context within cap (${mem.contextSize})`);
    assert.ok(mem.memories.length >= 1, 'at least one memory entry');
    assert.equal(mem.retrieval.policyVersion, 'memory-policy-v1');
  });
});