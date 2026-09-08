import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { validatePlan, validateDependencies } from '../planning/planValidator';
import { makePlanningPolicy } from '../planning/planningPolicy';
import { DecisionPlan } from '../planning/planTypes';

function validPlan(overrides: Partial<DecisionPlan> = {}): DecisionPlan {
  return {
    version: '1.0',
    source: 'intelligent',
    tasks: [
      {
        tempId: 'research-1',
        type: 'research',
        purpose: 'Gather market evidence.',
        input: { query: 'market size', purpose: 'market_research', maxResults: 3 },
        dependsOn: [],
        priority: 10,
        requirements: ['research'],
      },
      {
        tempId: 'debate',
        type: 'debate',
        purpose: 'Weigh the evidence.',
        input: { strategy: 'consensus', description: 'Weigh the evidence.' },
        dependsOn: ['research-1'],
        priority: 1,
      },
    ],
    termination: { requiresVerification: true, requiresRedTeam: true, requiresReconciliation: true },
    rationale: {
      summary: 'Research then debate.',
      research: 'one research task',
      debate: 'one debate',
      verification: 'on',
      redTeam: 'on',
    },
    estimates: { estimatedTasks: 2, estimatedResearchTasks: 1, estimatedLLMTasks: 1 },
    ...overrides,
  };
}

describe('plan validator', () => {
  test('accepts a well-formed plan', () => {
    const r = validatePlan(validPlan());
    assert.equal(r.valid, true);
    assert.deepEqual(r.errors, []);
    assert.ok(r.plan);
  });

  test('rejects a non-object proposal', () => {
    const r = validatePlan('nope');
    assert.equal(r.valid, false);
  });

  test('rejects missing tasks array', () => {
    const r = validatePlan({ version: '1.0', termination: {} });
    assert.equal(r.valid, false);
  });

  test('rejects unknown task types', () => {
    const plan = validPlan();
    (plan.tasks as any)[0].type = 'rm_database';
    const r = validatePlan(plan);
    assert.equal(r.valid, false);
    assert.ok(r.errors.some((e) => e.includes('unknown task type')));
  });

  test('rejects system-generated task types proposed by the planner', () => {
    // A planner must NEVER propose verify_claim/red_team/reconciliation tasks
    // with fabricated claim/candidate IDs.
    const plan = validPlan();
    plan.tasks.push({
      tempId: 'verify-1',
      type: 'verify_claim',
      purpose: 'verify',
      input: { claimId: 'fabricated-claim-id', claimStatement: 'x', evidenceIds: [] },
      dependsOn: ['debate'],
    });
    const r = validatePlan(plan);
    assert.equal(r.valid, false);
    assert.ok(r.errors.some((e) => e.includes('system-generated')));
  });

  test('rejects research with fabricated claim references', () => {
    const plan = validPlan();
    (plan.tasks as any)[0].input.claimId = 'not-real';
    const r = validatePlan(plan);
    assert.equal(r.valid, false);
    assert.ok(r.errors.some((e) => e.includes('unexpected field')));
  });

  test('rejects unknown dependency references', () => {
    const plan = validPlan();
    (plan.tasks as any)[1].dependsOn = ['research-1', 'ghost-task'];
    const r = validatePlan(plan);
    assert.equal(r.valid, false);
    assert.ok(r.errors.some((e) => e.includes('unknown tempId')));
  });

  test('rejects self-dependency', () => {
    const plan = validPlan();
    (plan.tasks as any)[0].dependsOn = ['research-1'];
    const r = validatePlan(plan);
    assert.equal(r.valid, false);
    assert.ok(r.errors.some((e) => e.includes('depends on itself')));
  });

  test('rejects dependency cycles', () => {
    const plan = validPlan();
    plan.tasks.push({
      tempId: 'debate',
      type: 'debate',
      purpose: 'loop',
      input: { strategy: 'consensus' },
      dependsOn: ['research-1'],
    });
    (plan.tasks as any)[0].dependsOn = ['debate'];
    const r = validatePlan(plan);
    assert.equal(r.valid, false);
    assert.ok(r.errors.some((e) => e.includes('cycle')));
  });

  test('rejects plans over the task-count limit', () => {
    const plan = validPlan();
    for (let i = 0; i < 20; i++) {
      plan.tasks.push({
        tempId: `r-${i}`,
        type: 'research',
        purpose: 'extra',
        input: { query: `q${i}`, purpose: 'background', maxResults: 1 },
        dependsOn: [],
      });
    }
    const r = validatePlan(plan);
    assert.equal(r.valid, false);
    assert.ok(r.errors.some((e) => e.includes('maxTasksPerExecution')));
  });

  test('rejects plans over the research-task limit', () => {
    const policy = makePlanningPolicy({ maxResearchTasks: 2 });
    const plan = validPlan();
    for (let i = 0; i < 3; i++) {
      plan.tasks.push({
        tempId: `r-${i}`,
        type: 'research',
        purpose: 'extra',
        input: { query: `q${i}`, purpose: 'background', maxResults: 1 },
        dependsOn: [],
      });
    }
    const r = validatePlan(plan, { policy });
    assert.equal(r.valid, false);
    assert.ok(r.errors.some((e) => e.includes('maxResearchTasks')));
  });

  test('rejects plans over the total research-results budget', () => {
    const policy = makePlanningPolicy({ maxTotalResearchResults: 10 });
    const plan = validPlan();
    (plan.tasks as any)[0].input.maxResults = 8;
    plan.tasks.push({
      tempId: 'r-2',
      type: 'research',
      purpose: 'extra',
      input: { query: 'more', purpose: 'background', maxResults: 8 },
      dependsOn: [],
    });
    const r = validatePlan(plan, { policy });
    assert.equal(r.valid, false);
    assert.ok(r.errors.some((e) => e.includes('maxTotalResearchResults')));
  });

  test('rejects plans exceeding maxPlanDepth', () => {
    const policy = makePlanningPolicy({ maxPlanDepth: 1 });
    const plan = validPlan(); // research -> debate = depth 2
    const r = validatePlan(plan, { policy });
    assert.equal(r.valid, false);
    assert.ok(r.errors.some((e) => e.includes('maxPlanDepth')));
  });

  test('rejects invalid research input schema', () => {
    const plan = validPlan();
    (plan.tasks as any)[0].input = { purpose: 'background' };
    const r = validatePlan(plan);
    assert.equal(r.valid, false);
    assert.ok(r.errors.some((e) => e.includes('"query"')));
  });

  test('rejects non-positive maxResults', () => {
    const plan = validPlan();
    (plan.tasks as any)[0].input.maxResults = 0;
    const r = validatePlan(plan);
    assert.equal(r.valid, false);
  });

  test('rejects unknown capability requirements', () => {
    const plan = validPlan();
    (plan.tasks as any)[0].requirements = ['telepathy'];
    const r = validatePlan(plan);
    assert.equal(r.valid, false);
    assert.ok(r.errors.some((e) => e.includes('unknown capability')));
  });

  test('accepts known capability requirements', () => {
    const plan = validPlan();
    (plan.tasks as any)[0].requirements = ['financial_analysis', 'technical_analysis'];
    const r = validatePlan(plan);
    assert.equal(r.valid, true);
  });

  test('rejects dangerous payload: arbitrary tool/exec keys', () => {
    const plan = validPlan();
    (plan.tasks as any)[1].input.tool = 'run_shell';
    const r = validatePlan(plan);
    assert.equal(r.valid, false);
    assert.ok(r.errors.some((e) => e.includes('disallowed field "tool"')));
  });

  test('rejects dangerous payload: URLs', () => {
    const plan = validPlan();
    (plan.tasks as any)[1].input.description = 'fetch https://evil.example/data';
    const r = validatePlan(plan);
    assert.equal(r.valid, false);
  });

  test('rejects dangerous payload: credentials', () => {
    const plan = validPlan();
    (plan.tasks as any)[1].input.apiKey = 'sk-secret-123';
    const r = validatePlan(plan);
    assert.equal(r.valid, false);
  });

  test('rejects dangerous nested payload in research purpose', () => {
    const plan = validPlan();
    (plan.tasks as any)[0].input.purpose = 'custom';
    (plan.tasks as any)[0].input.nested = { command: 'rm -rf /' };
    const r = validatePlan(plan);
    assert.equal(r.valid, false);
  });

  test('rejects missing rationale-free plan but still validates structure', () => {
    const plan = validPlan();
    delete (plan as any).rationale;
    const r = validatePlan(plan);
    assert.equal(r.valid, true);
  });

  test('termination booleans are required', () => {
    const plan = validPlan();
    (plan as any).termination = { requiresVerification: true };
    const r = validatePlan(plan);
    assert.equal(r.valid, false);
  });
});

describe('validateDependencies (unit)', () => {
  test('detects a cycle and flags it', () => {
    const tasks: any[] = [
      { tempId: 'a', dependsOn: ['b'] },
      { tempId: 'b', dependsOn: ['a'] },
    ];
    const byId = new Map(tasks.map((t) => [t.tempId, t]));
    const r = validateDependencies(tasks, byId as any, makePlanningPolicy());
    assert.ok(r.some((e) => e.includes('cycle')));
  });

  test('accepts a linear chain within depth', () => {
    const tasks: any[] = [
      { tempId: 'a', dependsOn: [] },
      { tempId: 'b', dependsOn: ['a'] },
    ];
    const byId = new Map(tasks.map((t) => [t.tempId, t]));
    const r = validateDependencies(tasks, byId as any, makePlanningPolicy({ maxPlanDepth: 2 }));
    assert.deepEqual(r, []);
  });
});