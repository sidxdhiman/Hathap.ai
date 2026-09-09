import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Decision from '../models/Decision';
import Execution from '../models/Execution';
import Task from '../models/Task';
import Claim from '../models/Claim';
import Evidence from '../models/Evidence';
import ExecutionPlan from '../models/DecisionPlan';
import Agent from '../models/Agent';
import Model from '../models/Model';
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
import { RouteTaskRouter, makeRoutingPolicy } from '../routing';
import { resolveCandidates } from '../routing/candidateResolver';
import { encryptApiKey } from '../utils/encryption';
import { TaskRoutingSelection, TaskRoutingFailure, TaskRoutingSkipped } from '../routing';

// Isolation: node:test runs each file in its own process, so seeding a stable
// test-only encryption secret here cannot affect other suites. The real
// encryption path (scrypt + AES-256-GCM) is fully exercised.
process.env.API_KEY_ENCRYPTION_SECRET ??= 'test-routing-secret-0123456789abcdef';

const TEST_URI = process.env.MONGODB_URI_TEST || 'mongodb://localhost:27017/hathap_test_routing';

import { DefaultTaskHandlerRegistry } from '../tasks/handlers';
import { TaskRoutingContext } from '../decision/types';

async function clean(): Promise<void> {
  await Promise.all([
    Decision.deleteMany({}),
    Execution.deleteMany({}),
    Task.deleteMany({}),
    Claim.deleteMany({}),
    Evidence.deleteMany({}),
    ExecutionPlan.deleteMany({}),
    Agent.deleteMany({}),
    Model.deleteMany({}),
  ]);
}

function isSelected(r: unknown): asserts r is TaskRoutingSelection {
  assert.ok(r && (r as TaskRoutingSelection).status === 'selected', `expected selected, got ${JSON.stringify(r)}`);
}

/** Exercises a routing result and returns a compact model/agent identity pair. */
function picked(r: unknown): { model: string; agent: string } {
  isSelected(r);
  return { model: (r as TaskRoutingSelection).model.id, agent: (r as TaskRoutingSelection).agent?.id || '' };
}

describe('Phase 6 — routing unit: availability, scoring, fallback', () => {
  let userId: string;
  let otherUserId: string;
  let budgetUser: string;
  let gpt4oId: string;
  let claudeId: string;
  let untestedId: string;
  let brokenId: string;
  let keylessId: string;
  let unknownPriceId: string;
  let researchAgentId: string;
  let genericAgentId: string;
  let budgetGptId: string;
  let budgetClaudeId: string;

  const input = (extra?: Partial<{ userId: string; taskType: TaskType; requirements: string[]; taskId: string; routingMode: 'auto' | 'manual'; manualModelId: string; primaryProvider: string; excludeModelIds: string[] }>) => ({
    userId: userId || '',
    decisionId: 'd1',
    executionId: 'e1',
    taskId: 't1',
    taskType: 'debate' as TaskType,
    routingMode: 'auto' as const,
    ...extra,
  });

  before(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(TEST_URI);
    }
    await clean();

    userId = new mongoose.Types.ObjectId().toString();
    otherUserId = new mongoose.Types.ObjectId().toString();
    budgetUser = new mongoose.Types.ObjectId().toString();

    // Models for the main user, in deterministic creation order.
    const modelsDef = [
      { provider: 'openai', displayName: 'GPT-4o', modelName: 'gpt-4o', status: 'connected', apiKey: encryptApiKey('sk-test-openai') },
      { provider: 'anthropic', displayName: 'Claude 3.5 Sonnet', modelName: 'claude-3-5-sonnet', status: 'connected', apiKey: encryptApiKey('sk-test-anthropic') },
      { provider: 'mock', displayName: 'Custom Model', modelName: 'my-custom-model', status: 'connected', apiKey: encryptApiKey('sk-test-custom') },
      { provider: 'openai', displayName: 'GPT-4 Turbo (untested)', modelName: 'gpt-4-turbo', status: 'untested', apiKey: encryptApiKey('sk-test-turbo') },
      { provider: 'openai', displayName: 'Broken model', modelName: 'claude-3-opus', status: 'error', apiKey: encryptApiKey('sk-test-broken') },
      { provider: 'openai', displayName: 'Keyless model', modelName: 'gpt-3.5-turbo', status: 'connected' },
    ];
    const created = [];
    for (const def of modelsDef) {
      const m = await Model.create({ ...def, userId });
      created.push(m);
    }
    [gpt4oId, claudeId, unknownPriceId, untestedId, brokenId, keylessId] = created.map((m) => m._id.toString());

    const agentsDef = [
      { name: 'Researcher', capabilities: ['research', 'reasoning'] },
      { name: 'Fact Checker', capabilities: ['fact_checking', 'reasoning'] },
      { name: 'Generic', capabilities: [] },
    ];
    const agentsCreated = [];
    for (const def of agentsDef) {
      const a = await Agent.create({ ...def, userId });
      agentsCreated.push(a);
    }
    [researchAgentId, , genericAgentId] = agentsCreated.map((a) => a._id.toString());

    // A second user with nothing at all (ownership isolation).
    const budgetGpt = await Model.create({
      provider: 'openai', displayName: 'GPT-4o', modelName: 'gpt-4o', status: 'connected',
      apiKey: encryptApiKey('sk-test-budget-1'), userId: budgetUser,
    });
    const budgetClaude = await Model.create({
      provider: 'anthropic', displayName: 'Claude 3.5 Sonnet', modelName: 'claude-3-5-sonnet', status: 'connected',
      apiKey: encryptApiKey('sk-test-budget-2'), userId: budgetUser,
    });
    budgetGptId = budgetGpt._id.toString();
    budgetClaudeId = budgetClaude._id.toString();
    await Agent.create({ name: 'Budget Agent', capabilities: ['reasoning'], userId: budgetUser });
  });

  after(async () => {
    await clean();
    await mongoose.connection.close();
  });

  describe('availability & ownership', () => {
    test('disabled/errored/keyless models are not routable; keyed models become candidates', async () => {
      const { candidates, modelCount, agentCount } = await resolveCandidates({
        userId,
        taskType: 'debate',
        requirements: [],
        policy: makeRoutingPolicy(),
      });
      assert.equal(agentCount, 3);
      assert.equal(modelCount, 4); // gpt-4o, claude, unknown price, untested
      const modelIds = new Set(candidates.map((c) => String(c.model._id)));
      assert.ok(modelIds.has(gpt4oId));
      assert.ok(modelIds.has(claudeId));
      assert.ok(modelIds.has(untestedId));
      assert.ok(modelIds.has(unknownPriceId));
      assert.ok(!modelIds.has(brokenId), 'errored model excluded');
      assert.ok(!modelIds.has(keylessId), 'keyless model excluded');
    });

    test('a user with no models or agents gets a skip (backward-compat, never a failure)', async () => {
      const result = await RouteTaskRouter.buildForTest().routeTask(input({ userId: otherUserId }));
      assert.equal(result.status, 'skipped');
      assert.match((result as TaskRoutingSkipped).reason, /routing skipped/);
    });

    test('manual mode with an unavailable or missing model is a hard failure', async () => {
      const router = RouteTaskRouter.buildForTest();
      const broken = await router.routeTask(input({ routingMode: 'manual', manualModelId: brokenId }));
      assert.equal((broken as TaskRoutingFailure).status, 'failed');
      assert.equal((broken as TaskRoutingFailure).code, 'MANUAL_MODEL_UNAVAILABLE');

      const missing = await router.routeTask(input({ routingMode: 'manual' }));
      assert.equal((missing as TaskRoutingFailure).code, 'MANUAL_MODEL_UNAVAILABLE');

      const ok = await router.routeTask(input({ routingMode: 'manual', manualModelId: claudeId }));
      isSelected(ok);
      assert.equal(ok.model.id, claudeId);
      assert.equal(ok.mode, 'manual');
    });

    test('budget gate fails when every pricing-known candidate exceeds the per-task budget', async () => {
      const router = RouteTaskRouter.buildForTest({ maxEstimatedCostPerTask: 1e-9 });
      const result = await router.routeTask(input({ userId: budgetUser }));
      assert.equal((result as TaskRoutingFailure).status, 'failed');
      assert.equal((result as TaskRoutingFailure).code, 'NO_CANDIDATE_WITHIN_BUDGET');
    });

    test('manual pins cannot bypass the budget gate', async () => {
      const router = RouteTaskRouter.buildForTest({ maxEstimatedCostPerTask: 1e-9 });
      const result = await router.routeTask(input({ userId: budgetUser, routingMode: 'manual', manualModelId: budgetGptId }));
      assert.equal((result as TaskRoutingFailure).status, 'failed');
      assert.equal((result as TaskRoutingFailure).code, 'NO_CANDIDATE_WITHIN_BUDGET');
    });
  });

  describe('deterministic scoring', () => {
    test('when all else is equal, the cheapest known-price model wins', async () => {
      const r = await RouteTaskRouter.buildForTest().routeTask(input());
      isSelected(r);
      assert.equal(r.model.id, claudeId, 'claude-3-5-sonnet is the cheapest routable model');
      assert.ok(r.agent?.capabilities.includes('reasoning'), 'selected agent covers the debate soft requirement');
      assert.ok(r.estimate.pricingKnown);
      const cost = r.score.factors.find((f) => f.name === 'cost');
      assert.equal(cost?.value, 1, 'cheapest model scores max on the cost factor');
    });

    test('quality override dominates cost', async () => {
      const router = RouteTaskRouter.buildForTest({
        qualityOverrides: { 'gpt-4o': 1, 'claude-3-5-sonnet': 0 },
      });
      const r = await router.routeTask(input());
      isSelected(r);
      assert.equal(r.model.id, gpt4oId);
    });

    test('reliability status prior drives selection when it is the only weight', async () => {
      const router = RouteTaskRouter.buildForTest({ weights: { reliability: 1 } });
      const r = await router.routeTask(input());
      isSelected(r);
      assert.equal(r.model.status, 'connected', 'connected beats untested under pure reliability weighting');
      const reliability = r.score.factors.find((f) => f.name === 'reliability');
      assert.ok(reliability?.note?.includes('connected'));
    });

    test('capability soft preference favors an agent that covers the task soft requirements', async () => {
      const router = RouteTaskRouter.buildForTest({ weights: { capability: 1 } });
      const r = await router.routeTask(input());
      isSelected(r);
      const capability = r.score.factors.find((f) => f.name === 'capability');
      assert.equal(capability?.value, 1);
      assert.notEqual(r.agent?.id, genericAgentId, 'winner is not the agent with zero soft coverage');
      assert.ok(r.agent?.capabilities.includes('reasoning'), 'winner beats agents with no coverage');
    });

    test('hard requirements gate out agents that do not cover them (relaxable by policy)', async () => {
      const router = RouteTaskRouter.buildForTest();
      const relaxed = await router.routeTask(input({ requirements: ['security_review'] }));
      isSelected(relaxed);
      assert.equal(relaxed.capabilityGateRelaxed, true);
      assert.ok(relaxed.reasons.some((x) => x.includes('gate relaxed')));

      const strict = RouteTaskRouter.buildForTest({ allowCapabilityGateRelaxation: false });
      const failed = await strict.routeTask(input({ requirements: ['security_review'] }));
      assert.equal((failed as TaskRoutingFailure).status, 'failed');
      assert.equal((failed as TaskRoutingFailure).code, 'NO_AGENT_COVERS_REQUIREMENTS');
    });

    test('verify_claim applies a soft diversity bonus for a provider different from the debate', async () => {
      const router = RouteTaskRouter.buildForTest({ weights: { cost: 0 } });
      const r1 = await router.routeTask(input({
        taskType: 'verify_claim',
        requirements: ['fact_checking'],
        primaryProvider: 'openai',
      }));
      isSelected(r1);
      assert.notEqual(r1.model.provider, 'openai', 'a non-openai provider differs from the openai primary');
      assert.ok(r1.reasons.some((x) => x.includes('diversity')));

      const r2 = await router.routeTask(input({
        taskType: 'verify_claim',
        requirements: ['fact_checking'],
        primaryProvider: 'anthropic',
      }));
      isSelected(r2);
      assert.notEqual(r2.model.provider, 'anthropic', 'a non-anthropic provider differs from the anthropic primary');
      assert.ok(r2.reasons.some((x) => x.includes('diversity')));
    });

    test('selection is deterministic across repeated invocations', async () => {
      const router = RouteTaskRouter.buildForTest();
      const a = await router.routeTask(input());
      const b = await router.routeTask(input());
      isSelected(a);
      isSelected(b);
      assert.deepEqual(picked(a), picked(b));
      assert.equal(a.score.total, b.score.total);
      assert.deepEqual(a.reasons, b.reasons);
      assert.equal(a.policyVersion, 'routing-v1');
    });
  });

  describe('fallback (bounded reselection)', () => {
    test('retry fallback excludes the failed model and marks the reselection fallbackUsed', async () => {
      const router = RouteTaskRouter.buildForTest();
      const first = await router.routeTask(input());
      isSelected(first);
      assert.equal(first.model.id, claudeId); // cheapest, as established above

      const fallback = await router.routeFallbackForRetry(input({ excludeModelIds: [claudeId] }));
      isSelected(fallback);
      assert.equal(fallback.fallbackUsed, true);
      assert.equal(fallback.fallbackFrom?.modelId, claudeId);
      assert.notEqual(fallback.model.id, claudeId);
      assert.equal(fallback.model.id, gpt4oId, 'gpt-4o is the next best after excluding claude');
    });

    test('excluding every routable model skips (no alternative keeps retries bounded)', async () => {
      const result = await RouteTaskRouter.buildForTest().routeTask(input({
        userId: budgetUser,
        excludeModelIds: [budgetGptId, budgetClaudeId],
      }));
      assert.equal((result as TaskRoutingSkipped).status, 'skipped');
    });

    test('fallback never re-picks an excluded (failed) model', async () => {
      const router = RouteTaskRouter.buildForTest();
      const excluded = [claudeId, gpt4oId];
      const fallback = await router.routeFallbackForRetry(input({ excludeModelIds: excluded }));
      isSelected(fallback);
      assert.ok(!excluded.includes(fallback.model.id), 'failed model is not re-picked');
      assert.notEqual(fallback.model.status, 'error', 'fallback target is routable');
      assert.equal(fallback.fallbackUsed, true);
      assert.equal(fallback.fallbackFrom?.modelId, gpt4oId, 'fallback records the most recently failed model');

      // Excluding every routable model leaves no alternative: the router skips
      // rather than retrying the failed model (keeps runtime fallback bounded).
      const exhausted = await router.routeTask(input({ excludeModelIds: [claudeId, gpt4oId, unknownPriceId, untestedId] }));
      assert.equal((exhausted as TaskRoutingSkipped).status, 'skipped');
    });
  });
});

describe('Phase 6 — executor integration: persist, reuse, and complete routed runs', () => {
  let capturedRouting: TaskHandlerContext['routing'];
  let userId: string;
  let decisionId: string;
  let claudeId: string;
  let researchAgentId: string;

  class FakeDebateHandler implements TaskHandler {
    type: TaskType = 'debate';
    canHandle(type: TaskType) {
      return type === 'debate';
    }
    async execute(task: any, context: TaskHandlerContext) {
      capturedRouting = context.routing;
      await Claim.create({
        decisionId: context.decisionId,
        executionId: context.executionId,
        taskId: context.taskId,
        text: 'Routed decision claim.',
        type: 'fact',
        status: 'proposed',
        evidenceIds: [],
        supportingEvidenceIds: [],
        provenanceKind: 'inferred',
      });
      return {
        output: {
          verdict: { recommendation: 'Proceed.', confidenceScore: 0.8 },
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

  function simplePlan(): PlanShape {
    return {
      version: '1.0',
      source: 'intelligent',
      tasks: [
        {
          tempId: 'debate',
          type: 'debate',
          purpose: 'Simple decision: debate it.',
          input: { strategy: 'judge', description: 'Simple decision.' },
          dependsOn: [],
          priority: 1,
          requirements: ['reasoning'],
        },
      ],
      termination: { requiresVerification: false, requiresRedTeam: false, requiresReconciliation: true },
      rationale: { summary: 'simple', research: 'none', debate: '1', verification: 'off', redTeam: 'off' },
      estimates: { estimatedTasks: 1, estimatedResearchTasks: 0, estimatedLLMTasks: 1 },
    };
  }

  const planCallFor = (plan: unknown): PlanCallFunction =>
    async () => ({ ok: true as const, text: JSON.stringify(plan) });

  async function waitUntil(fn: () => Promise<boolean>, timeoutMs = 10_000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (await fn()) return;
      await new Promise((r) => setTimeout(r, 30));
    }
    throw new Error('Timed out waiting for condition');
  }

  async function runRoutedExecution(withMetadataRouting: boolean): Promise<{ executionId: string; task: any }> {
    const execution = await Execution.create({
      decisionId,
      status: 'pending',
      startedAt: new Date(),
      currentPhase: 'debating',
      progress: 0,
      planningStatus: 'planning',
      planningMode: 'intelligent',
      metadata: withMetadataRouting
        ? { routing: { mode: 'auto' } }
        : undefined,
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

    await Execution.updateOne(
      { _id: execution._id },
      { $set: { status: 'queued', planningStatus: 'planned' } }
    );

    const worker = makeWorker();
    for (let i = 0; i < 50 && (await Execution.findById(executionId))?.status !== 'completed'; i++) {
      await worker.tickNow();
      await new Promise((r) => setTimeout(r, 30));
    }
    await waitUntil(async () => {
      const e = await Execution.findById(executionId);
      return !!e && e.status === 'completed';
    });

    const tasks = await Task.find({ executionId });
    assert.equal(tasks.length, 1);
    return { executionId, task: tasks[0] };
  }

  function makeWorker(): Worker {
    const executor = new TaskExecutor({
      registry: makeRegistry(),
      workerId: 'test-routing-worker',
      backoff: () => 5,
      router: RouteTaskRouter.buildForTest(),
    });
    return new Worker({
      executor,
      pollIntervalMs: 100_000,
      maxConcurrentTasks: 6,
      staleTaskTimeoutMs: 120_000,
    });
  }

  before(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(TEST_URI);
    }
    await clean();
    userId = new mongoose.Types.ObjectId().toString();
    const gpt = await Model.create({
      provider: 'openai', displayName: 'GPT-4o', modelName: 'gpt-4o', status: 'connected',
      apiKey: encryptApiKey('sk-test-openai'), userId,
    });
    void gpt;
    const claude = await Model.create({
      provider: 'anthropic', displayName: 'Claude 3.5 Sonnet', modelName: 'claude-3-5-sonnet', status: 'connected',
      apiKey: encryptApiKey('sk-test-anthropic'), userId,
    });
    gpt4oId: void gpt;
    claudeId = claude._id.toString();
    const research = await Agent.create({ name: 'Researcher', capabilities: ['research', 'reasoning'], userId });
    researchAgentId = research._id.toString();

    const decision = await Decision.create({
      userId,
      title: 'Routing E2E',
      objective: 'Should we adopt microservices?',
      context: 'Routed execution.',
      status: 'debating',
      configuration: { strategy: 'consensus', maxRounds: 2 },
      assumptions: [],
    });
    decisionId = decision._id.toString();
  });

  after(async () => {
    await clean();
    await mongoose.connection.close();
  });

  test('an auto-routed execution persists chosen agent/model and hands routing to the handler', async () => {
    capturedRouting = undefined;
    const { task: debate } = await runRoutedExecution(true);

    assert.equal(debate.type, 'debate');
    assert.equal(debate.status, 'completed');

    const routingMeta = debate.metadata?.routing as { mode?: string; selection?: TaskRoutingSelection };
    assert.ok(routingMeta, 'task carries persisted routing metadata');
    assert.equal(routingMeta.mode, 'auto');
    assert.equal(routingMeta.selection?.status, 'selected');
    assert.equal(String(debate.assignedAgent), String(routingMeta.selection?.agent?.id));
    assert.equal(String(debate.assignedModel), String(routingMeta.selection?.model?.id));
    assert.equal(routingMeta.selection?.policyVersion, 'routing-v1');

    // Deterministic outcome for this seed: cheapest connected model + researcher.
    assert.equal(routingMeta.selection?.model.id, claudeId);

    // The handler received routing through the context (never a credential).
    const routingFromHandler = capturedRouting as TaskRoutingContext | undefined;
    assert.ok(routingFromHandler, 'handler received routing context');
    assert.equal(routingFromHandler.modelId, String(debate.assignedModel));
    assert.equal(routingFromHandler.modelName, 'claude-3-5-sonnet');
    assert.equal(routingFromHandler.agentId, researchAgentId);
    assert.equal(routingFromHandler.provider, 'anthropic');
  });

  test('a routed task reuses its persisted selection on re-execution (idempotent, no reselection)', async () => {
    const { executionId, task } = await runRoutedExecution(true);
    const first = task.metadata?.routing as { selection?: TaskRoutingSelection };
    assert.ok(first.selection);
    const firstRoutedAt = first.selection?.routedAt?.toISOString();

    const another = await Task.findById(task._id);
    const exec = await Execution.findById(executionId);
    assert.ok(another && exec);
    await Task.updateOne(
      { _id: another._id },
      { $set: { status: 'pending', error: undefined, completedAt: undefined, workerId: undefined, leasedAt: undefined } }
    );
    const executor = new TaskExecutor({
      registry: makeRegistry(),
      workerId: 'routing-retry-worker',
      backoff: () => 5,
      router: RouteTaskRouter.buildForTest(),
    });
    await executor.execute(userId, exec, another);

    const after = (await Task.findById(another._id))!;
    const second = after.metadata?.routing as { selection?: TaskRoutingSelection };
    assert.equal(second.selection?.model.id, first.selection?.model.id);
    assert.equal(second.selection?.routedAt?.toISOString(), firstRoutedAt, 'selection reused, not recreated');
  });

  test('legacy executions without routing metadata skip routing and still complete', async () => {
    capturedRouting = undefined;
    const { task } = await runRoutedExecution(false);
    assert.equal(task.status, 'completed');
    assert.ok(!task.metadata?.routing, 'no routing metadata written on the legacy path');
    assert.ok(!capturedRouting, 'handler got no routing context on the legacy path');
  });
});