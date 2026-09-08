import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Decision from '../models/Decision';
import Execution from '../models/Execution';
import Task from '../models/Task';
import Claim from '../models/Claim';
import Evidence from '../models/Evidence';
import ExecutionPlan from '../models/DecisionPlan';
import { DecisionPlanner } from '../planning/planner';
import { planCompiler } from '../planning/planCompiler';
import { buildFallbackPlan, buildSimplifiedPlan } from '../planning/fallbackPlanner';
import { validatePlan } from '../planning/planValidator';
import { makePlanningPolicy } from '../planning/planningPolicy';
import { DecisionPlan as PlanShape, PlanCallFunction } from '../planning/planTypes';

const TEST_URI = process.env.MONGODB_URI_TEST || 'mongodb://localhost:27017/hathap_test_plan';

function fullPlan(): PlanShape {
  return {
    version: '1.0',
    source: 'intelligent',
    tasks: [
      {
        tempId: 'research-1',
        type: 'research',
        purpose: 'Market research.',
        input: { query: 'market size for ai agents', purpose: 'market_research', maxResults: 3 },
        dependsOn: [],
        priority: 10,
        requirements: ['research'],
      },
      {
        tempId: 'research-2',
        type: 'research',
        purpose: 'Technical research.',
        input: { query: 'best practices for microservices', purpose: 'technical_research', maxResults: 3 },
        dependsOn: [],
        priority: 10,
        requirements: ['technical_analysis'],
      },
      {
        tempId: 'debate',
        type: 'debate',
        purpose: 'Weigh evidence and produce a candidate decision.',
        input: { strategy: 'consensus', description: 'Weigh the evidence.' },
        dependsOn: ['research-1', 'research-2'],
        priority: 1,
      },
    ],
    termination: { requiresVerification: true, requiresRedTeam: true, requiresReconciliation: true },
    rationale: {
      summary: 'Research both dimensions then debate.',
      research: 'two research tasks for market + technical evidence',
      debate: 'one debate',
      verification: 'on',
      redTeam: 'on',
    },
    estimates: { estimatedTasks: 3, estimatedResearchTasks: 2, estimatedLLMTasks: 1 },
  };
}

function simplePlan(): PlanShape {
  return {
    version: '1.0',
    source: 'intelligent',
    tasks: [
      {
        tempId: 'debate',
        type: 'debate',
        purpose: 'Weigh evidence and produce a candidate decision.',
        input: { strategy: 'judge', description: 'Small decision: debate it.' },
        dependsOn: [],
        priority: 1,
      },
    ],
    termination: { requiresVerification: false, requiresRedTeam: false, requiresReconciliation: true },
    rationale: {
      summary: 'Simple decision — debate only.',
      research: 'none',
      debate: 'one debate',
      verification: 'off',
      redTeam: 'off',
    },
    estimates: { estimatedTasks: 1, estimatedResearchTasks: 0, estimatedLLMTasks: 1 },
  };
}

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
    title: 'Planning Test',
    objective: 'Should we adopt microservices?',
    context: 'Small team.',
    status: 'debating',
    configuration: { strategy: 'consensus', maxRounds: 2 },
  });
  decisionId = decision._id.toString();

  await Evidence.create({
    decisionId,
    title: 'Existing report',
    content: 'Existing content.',
    sourceType: 'user_input',
  });
  await Claim.create({
    decisionId,
    text: 'Microservices reduce downtime.',
    type: 'fact',
    evidenceIds: [],
  });
});

after(async () => {
  await clean();
  await mongoose.connection.close();
});

async function clean(): Promise<void> {
  await Promise.all([
    Decision.deleteMany({}),
    Execution.deleteMany({}),
    Task.deleteMany({}),
    Claim.deleteMany({}),
    Evidence.deleteMany({}),
    ExecutionPlan.deleteMany({}),
  ]);
}

async function makeExecution(planningMode: 'fixed' | 'intelligent' = 'intelligent') {
  const exec = await Execution.create({
    decisionId,
    status: 'pending',
    startedAt: new Date(),
    currentPhase: 'debating',
    progress: 0,
    planningStatus: 'planning',
    planningMode,
  });
  return exec;
}

function makePlanner(planCall: PlanCallFunction, overrides: Record<string, number> = {}) {
  return new DecisionPlanner({ planCall, policy: makePlanningPolicy(overrides) });
}

const callWith = (plan: unknown, attempts = 1): PlanCallFunction => {
  let calls = 0;
  return async () => {
    calls++;
    if (calls <= attempts) return { ok: true, text: JSON.stringify(plan) };
    throw new Error('unexpected extra call');
  };
};

describe('fallback planner', () => {
  test('produces a valid conservative plan (research + debate)', () => {
    const plan = buildFallbackPlan(
      { decisionId, objective: 'Should we adopt microservices?', existingEvidence: [] },
      { policy: makePlanningPolicy() }
    );
    const r = validatePlan(plan);
    assert.equal(r.valid, true, r.errors.join('; '));
    assert.ok(plan.tasks.some((t) => t.type === 'research'));
    assert.ok(plan.tasks.some((t) => t.type === 'debate'));
    assert.equal(plan.termination.requiresVerification, true);
  });

  test('simplified plan skips research and verification', () => {
    const plan = buildSimplifiedPlan(
      { decisionId, objective: 'Should we adopt microservices?', existingEvidence: [] },
      { policy: makePlanningPolicy() }
    );
    const r = validatePlan(plan);
    assert.equal(r.valid, true, r.errors.join('; '));
    assert.equal(plan.tasks.length, 1);
    assert.equal(plan.tasks[0].type, 'debate');
    assert.equal(plan.termination.requiresVerification, false);
    assert.equal(plan.termination.requiresRedTeam, false);
  });

  test('respects research limits deterministically', () => {
    const policy = makePlanningPolicy({ maxResearchTasks: 1, maxResultsPerResearchTask: 4, maxTotalResearchResults: 4 });
    const plan = buildFallbackPlan(
      { decisionId, objective: 'Should we adopt microservices?', existingEvidence: [] },
      { researchQueries: ['q one', 'q two', 'q three'], policy }
    );
    const research = plan.tasks.filter((t) => t.type === 'research');
    assert.equal(research.length, 1);
    const budget = research.reduce((s, t) => s + (t.input.maxResults as number), 0);
    assert.ok(budget <= 4);
    const r = validatePlan(plan, { policy });
    assert.equal(r.valid, true, r.errors.join('; '));
  });
});

describe('planner service — intelligent accept path', () => {
  test('accepts a valid proposal, compiles real tasks with real IDs', async () => {
    const execution = await makeExecution();
    const planner = makePlanner(callWith(fullPlan()));
    const result = await planner.planExecution({
      executionId: execution._id.toString(),
      userId,
      planningMode: 'intelligent',
    });

    assert.equal(result.planSource, 'intelligent');
    assert.equal(result.retriesUsed, 0);
    assert.equal(result.compiled.reusedExistingTasks, false);

    const tasks = await Task.find({ executionId: execution._id.toString() });
    assert.equal(tasks.length, 3);
    assert.equal(tasks.filter((t) => t.type === 'research').length, 2);
    assert.equal(tasks.filter((t) => t.type === 'debate').length, 1);

    // Part of the fulfilled AMBIGUITY-2 (tempId → persisted ID): the debate
    // task's dependencies reference the REAL research task _ids, never tempIds.
    const debate = tasks.find((t) => t.type === 'debate')!;
    const research = tasks.filter((t) => t.type === 'research').map((t) => t._id.toString());
    assert.deepEqual(
      new Set(debate.dependencies!.map((d: any) => d.toString())),
      new Set(research)
    );

    const exec = await Execution.findById(execution._id);
    assert.equal(exec!.planningStatus, 'planned');
    assert.ok(exec!.planId);

    const planDoc = await ExecutionPlan.findOne({ executionId: execution._id.toString() });
    assert.ok(planDoc);
    assert.equal(planDoc!.status, 'compiled');
    assert.equal(planDoc!.plannerModel || '', ''); // client-provided provenance
    const termination = planDoc!.termination as any;
    assert.equal(termination.requiresVerification, true);
    assert.equal(termination.requiresRedTeam, true);
    assert.equal(termination.requiresReconciliation, true);
  });

  test('planning is idempotent — a second call reuses the compiled plan', async () => {
    const execution = await makeExecution();
    const planner = makePlanner(callWith(simplePlan()));
    const first = await planner.planExecution({
      executionId: execution._id.toString(),
      userId,
      planningMode: 'intelligent',
    });
    const second = await planner.planExecution({
      executionId: execution._id.toString(),
      userId,
      planningMode: 'intelligent',
    });

    assert.equal(second.reusedExisting, true);
    const tasks = await Task.find({ executionId: execution._id.toString() });
    assert.equal(tasks.length, 1, 'no duplicate task graph');
    const plans = await ExecutionPlan.find({ executionId: execution._id.toString() });
    assert.equal(plans.length, 1, 'one plan per execution');
    assert.equal(first.compiled.persistedPlan._id.toString(), second.compiled.persistedPlan._id.toString());
  });

  test('bounded context sent to the planner contains no secrets or userId', async () => {
    let captured: any = null;
    const planCall: PlanCallFunction = async (input) => {
      captured = input.context;
      return { ok: true, text: JSON.stringify(simplePlan()) };
    };
    const execution = await makeExecution();
    await makePlanner(planCall).planExecution({
      executionId: execution._id.toString(),
      userId,
      planningMode: 'intelligent',
    });
    assert.ok(captured);
    assert.equal(captured.decisionId, decisionId.toString());
    assert.ok(captured.objective.length > 0);
    assert.ok(Array.isArray(captured.existingEvidence));
    assert.equal(captured.userId, undefined);
    assert.equal(captured.apiKey, undefined);
    assert.equal(JSON.stringify(captured).includes('Bearer'), false);
  });
});

describe('planner service — fallback chain', () => {
  test('malformed JSON falls back to the deterministic baseline (still valid)', async () => {
    const execution = await makeExecution();
    const planner = makePlanner(async () => ({ ok: true, text: 'not json at all {{{' }));
    const result = await planner.planExecution({
      executionId: execution._id.toString(),
      userId,
      planningMode: 'intelligent',
    });
    assert.ok(['fallback','baseline'].includes(result.planSource));
    assert.ok(result.compiled.taskIds.length >= 1);
    const exec = await Execution.findById(execution._id);
    assert.equal(exec!.planningStatus, 'planned');
  });

  test('provider failure falls back to the deterministic baseline', async () => {
    const execution = await makeExecution();
    const planner = makePlanner(async () => ({ ok: false, error: 'timeout', retryable: false }));
    const result = await planner.planExecution({
      executionId: execution._id.toString(),
      userId,
      planningMode: 'intelligent',
    });
    assert.ok(['fallback','baseline'].includes(result.planSource));
  });

  test('a rejected proposal is retried (bounded) then falls back', async () => {
    const execution = await makeExecution();
    let calls = 0;
    const planCall: PlanCallFunction = async () => {
      calls++;
      // Always propose a dangerous plan → always rejected.
      return {
        ok: true,
        text: JSON.stringify({
          version: '1.0',
          tasks: [{ tempId: 'hack', type: 'rm -rf', purpose: 'x', input: { tool: 'shell' }, dependsOn: [] }],
          termination: { requiresVerification: false, requiresRedTeam: false, requiresReconciliation: false },
        }),
      };
    };
    const planner = makePlanner(planCall, { maxPlanningRetries: 2 });
    const result = await planner.planExecution({
      executionId: execution._id.toString(),
      userId,
      planningMode: 'intelligent',
    });
    assert.ok(calls >= 2, 'bounded retries attempted');
    assert.ok(['fallback','baseline'].includes(result.planSource));
    assert.ok(result.compiled.taskIds.length >= 1);
    // The dangerous task type was never compiled.
    const tasks = await Task.find({ executionId: execution._id.toString() });
    assert.ok(tasks.every((t) => ['research', 'debate'].includes(t.type as any)));
  });

  test('intelligent mode without any model call still baseline-plans (no hang)', async () => {
    const execution = await makeExecution();
    const planner = new DecisionPlanner({ policy: makePlanningPolicy() });
    const result = await planner.planExecution({
      executionId: execution._id.toString(),
      userId: new mongoose.Types.ObjectId().toString(), // user with no models
      planningMode: 'intelligent',
    });
    assert.equal(result.planSource, 'baseline');
    assert.ok(result.compiled.persistedPlan);
  });
});

describe('planner service — structured failure', () => {
  test('an impossible plan fails the execution with a structured PlanningError', async () => {
    const execution = await makeExecution();
    const policy = makePlanningPolicy({ maxPlanningRetries: 0, maxTasksPerExecution: 0 });
    // With maxTasksPerExecution=0 even the deterministic fallback cannot pass
    // validation, so the planner must fail loudly and deterministically.
    const planner = new DecisionPlanner({ policy });
    await assert.rejects(
      () =>
        planner.planExecution({
          executionId: execution._id.toString(),
          userId,
          planningMode: 'intelligent',
        }),
      (err: any) => err.name === 'PlanningError' && /PLAN_NOT_POSSIBLE/.test(err.code)
    );
    const exec = await Execution.findById(execution._id);
    assert.equal(exec!.planningStatus, 'failed');
    assert.equal(exec!.status, 'failed');
    // Never leaves an execution running forever with no plan.
    assert.ok(!['pending', 'running'].includes(exec!.status as any));
  });
});

describe('plan compiler — recovery & idempotency', () => {
  test('compiles deterministic task graph with real dependency IDs', async () => {
    const execution = await makeExecution();
    const plan = fullPlan();
    const compiled = await planCompiler.compile({
      execution,
      plan,
      planningMode: 'intelligent',
      policy: makePlanningPolicy(),
      plannerModel: 'test-model',
    });
    assert.equal(compiled.reusedExistingTasks, false);
    assert.equal(compiled.taskIds.length, 3);
    assert.equal(Object.keys(compiled.persistedPlan.tasks).length, 3);
    const planDoc = await ExecutionPlan.findById(compiled.persistedPlan._id);
    assert.equal(planDoc!.plannerModel, 'test-model');
  });

  test('recovers a crash between plan-persist and task-persist without duplication', async () => {
    const execution = await makeExecution();

    // First compile: plan doc + tasks persist.
    const first = await planCompiler.compile({
      execution,
      plan: simplePlan(),
      planningMode: 'intelligent',
      policy: makePlanningPolicy(),
    });

    // Simulate a crash where the tasks were lost but the plan doc survived.
    await Task.deleteMany({ executionId: execution._id.toString() });
    assert.equal(await Task.countDocuments({ executionId: execution._id.toString() }), 0);

    // Recompile: same execution, same plan → tasks recreated, plan NOT duplicated.
    const second = await planCompiler.compile({
      execution,
      plan: simplePlan(),
      planningMode: 'intelligent',
      policy: makePlanningPolicy(),
    });
    assert.equal(second.reusedExistingTasks, false);
    assert.equal(await Task.countDocuments({ executionId: execution._id.toString() }), 1);
    assert.equal(second.persistedPlan._id.toString(), first.persistedPlan._id.toString());
    const plans = await ExecutionPlan.find({ executionId: execution._id.toString() });
    assert.equal(plans.length, 1, 'no duplicate plan documents');
  });

  test('does not duplicate an already-compiled graph', async () => {
    const execution = await makeExecution();
    await planCompiler.compile({
      execution,
      plan: simplePlan(),
      planningMode: 'intelligent',
      policy: makePlanningPolicy(),
    });
    const again = await planCompiler.compile({
      execution,
      plan: simplePlan(),
      planningMode: 'intelligent',
      policy: makePlanningPolicy(),
    });
    assert.equal(again.reusedExistingTasks, true);
    assert.equal(await Task.countDocuments({ executionId: execution._id.toString() }), 1);
  });
});