"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const planValidator_1 = require("../planning/planValidator");
const planningPolicy_1 = require("../planning/planningPolicy");
function validPlan(overrides = {}) {
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
(0, node_test_1.describe)('plan validator', () => {
    (0, node_test_1.test)('accepts a well-formed plan', () => {
        const r = (0, planValidator_1.validatePlan)(validPlan());
        strict_1.default.equal(r.valid, true);
        strict_1.default.deepEqual(r.errors, []);
        strict_1.default.ok(r.plan);
    });
    (0, node_test_1.test)('rejects a non-object proposal', () => {
        const r = (0, planValidator_1.validatePlan)('nope');
        strict_1.default.equal(r.valid, false);
    });
    (0, node_test_1.test)('rejects missing tasks array', () => {
        const r = (0, planValidator_1.validatePlan)({ version: '1.0', termination: {} });
        strict_1.default.equal(r.valid, false);
    });
    (0, node_test_1.test)('rejects unknown task types', () => {
        const plan = validPlan();
        plan.tasks[0].type = 'rm_database';
        const r = (0, planValidator_1.validatePlan)(plan);
        strict_1.default.equal(r.valid, false);
        strict_1.default.ok(r.errors.some((e) => e.includes('unknown task type')));
    });
    (0, node_test_1.test)('rejects system-generated task types proposed by the planner', () => {
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
        const r = (0, planValidator_1.validatePlan)(plan);
        strict_1.default.equal(r.valid, false);
        strict_1.default.ok(r.errors.some((e) => e.includes('system-generated')));
    });
    (0, node_test_1.test)('rejects research with fabricated claim references', () => {
        const plan = validPlan();
        plan.tasks[0].input.claimId = 'not-real';
        const r = (0, planValidator_1.validatePlan)(plan);
        strict_1.default.equal(r.valid, false);
        strict_1.default.ok(r.errors.some((e) => e.includes('unexpected field')));
    });
    (0, node_test_1.test)('rejects unknown dependency references', () => {
        const plan = validPlan();
        plan.tasks[1].dependsOn = ['research-1', 'ghost-task'];
        const r = (0, planValidator_1.validatePlan)(plan);
        strict_1.default.equal(r.valid, false);
        strict_1.default.ok(r.errors.some((e) => e.includes('unknown tempId')));
    });
    (0, node_test_1.test)('rejects self-dependency', () => {
        const plan = validPlan();
        plan.tasks[0].dependsOn = ['research-1'];
        const r = (0, planValidator_1.validatePlan)(plan);
        strict_1.default.equal(r.valid, false);
        strict_1.default.ok(r.errors.some((e) => e.includes('depends on itself')));
    });
    (0, node_test_1.test)('rejects dependency cycles', () => {
        const plan = validPlan();
        plan.tasks.push({
            tempId: 'debate',
            type: 'debate',
            purpose: 'loop',
            input: { strategy: 'consensus' },
            dependsOn: ['research-1'],
        });
        plan.tasks[0].dependsOn = ['debate'];
        const r = (0, planValidator_1.validatePlan)(plan);
        strict_1.default.equal(r.valid, false);
        strict_1.default.ok(r.errors.some((e) => e.includes('cycle')));
    });
    (0, node_test_1.test)('rejects plans over the task-count limit', () => {
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
        const r = (0, planValidator_1.validatePlan)(plan);
        strict_1.default.equal(r.valid, false);
        strict_1.default.ok(r.errors.some((e) => e.includes('maxTasksPerExecution')));
    });
    (0, node_test_1.test)('rejects plans over the research-task limit', () => {
        const policy = (0, planningPolicy_1.makePlanningPolicy)({ maxResearchTasks: 2 });
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
        const r = (0, planValidator_1.validatePlan)(plan, { policy });
        strict_1.default.equal(r.valid, false);
        strict_1.default.ok(r.errors.some((e) => e.includes('maxResearchTasks')));
    });
    (0, node_test_1.test)('rejects plans over the total research-results budget', () => {
        const policy = (0, planningPolicy_1.makePlanningPolicy)({ maxTotalResearchResults: 10 });
        const plan = validPlan();
        plan.tasks[0].input.maxResults = 8;
        plan.tasks.push({
            tempId: 'r-2',
            type: 'research',
            purpose: 'extra',
            input: { query: 'more', purpose: 'background', maxResults: 8 },
            dependsOn: [],
        });
        const r = (0, planValidator_1.validatePlan)(plan, { policy });
        strict_1.default.equal(r.valid, false);
        strict_1.default.ok(r.errors.some((e) => e.includes('maxTotalResearchResults')));
    });
    (0, node_test_1.test)('rejects plans exceeding maxPlanDepth', () => {
        const policy = (0, planningPolicy_1.makePlanningPolicy)({ maxPlanDepth: 1 });
        const plan = validPlan(); // research -> debate = depth 2
        const r = (0, planValidator_1.validatePlan)(plan, { policy });
        strict_1.default.equal(r.valid, false);
        strict_1.default.ok(r.errors.some((e) => e.includes('maxPlanDepth')));
    });
    (0, node_test_1.test)('rejects invalid research input schema', () => {
        const plan = validPlan();
        plan.tasks[0].input = { purpose: 'background' };
        const r = (0, planValidator_1.validatePlan)(plan);
        strict_1.default.equal(r.valid, false);
        strict_1.default.ok(r.errors.some((e) => e.includes('"query"')));
    });
    (0, node_test_1.test)('rejects non-positive maxResults', () => {
        const plan = validPlan();
        plan.tasks[0].input.maxResults = 0;
        const r = (0, planValidator_1.validatePlan)(plan);
        strict_1.default.equal(r.valid, false);
    });
    (0, node_test_1.test)('rejects unknown capability requirements', () => {
        const plan = validPlan();
        plan.tasks[0].requirements = ['telepathy'];
        const r = (0, planValidator_1.validatePlan)(plan);
        strict_1.default.equal(r.valid, false);
        strict_1.default.ok(r.errors.some((e) => e.includes('unknown capability')));
    });
    (0, node_test_1.test)('accepts known capability requirements', () => {
        const plan = validPlan();
        plan.tasks[0].requirements = ['financial_analysis', 'technical_analysis'];
        const r = (0, planValidator_1.validatePlan)(plan);
        strict_1.default.equal(r.valid, true);
    });
    (0, node_test_1.test)('rejects dangerous payload: arbitrary tool/exec keys', () => {
        const plan = validPlan();
        plan.tasks[1].input.tool = 'run_shell';
        const r = (0, planValidator_1.validatePlan)(plan);
        strict_1.default.equal(r.valid, false);
        strict_1.default.ok(r.errors.some((e) => e.includes('disallowed field "tool"')));
    });
    (0, node_test_1.test)('rejects dangerous payload: URLs', () => {
        const plan = validPlan();
        plan.tasks[1].input.description = 'fetch https://evil.example/data';
        const r = (0, planValidator_1.validatePlan)(plan);
        strict_1.default.equal(r.valid, false);
    });
    (0, node_test_1.test)('rejects dangerous payload: credentials', () => {
        const plan = validPlan();
        plan.tasks[1].input.apiKey = 'sk-secret-123';
        const r = (0, planValidator_1.validatePlan)(plan);
        strict_1.default.equal(r.valid, false);
    });
    (0, node_test_1.test)('rejects dangerous nested payload in research purpose', () => {
        const plan = validPlan();
        plan.tasks[0].input.purpose = 'custom';
        plan.tasks[0].input.nested = { command: 'rm -rf /' };
        const r = (0, planValidator_1.validatePlan)(plan);
        strict_1.default.equal(r.valid, false);
    });
    (0, node_test_1.test)('rejects missing rationale-free plan but still validates structure', () => {
        const plan = validPlan();
        delete plan.rationale;
        const r = (0, planValidator_1.validatePlan)(plan);
        strict_1.default.equal(r.valid, true);
    });
    (0, node_test_1.test)('termination booleans are required', () => {
        const plan = validPlan();
        plan.termination = { requiresVerification: true };
        const r = (0, planValidator_1.validatePlan)(plan);
        strict_1.default.equal(r.valid, false);
    });
});
(0, node_test_1.describe)('validateDependencies (unit)', () => {
    (0, node_test_1.test)('detects a cycle and flags it', () => {
        const tasks = [
            { tempId: 'a', dependsOn: ['b'] },
            { tempId: 'b', dependsOn: ['a'] },
        ];
        const byId = new Map(tasks.map((t) => [t.tempId, t]));
        const r = (0, planValidator_1.validateDependencies)(tasks, byId, (0, planningPolicy_1.makePlanningPolicy)());
        strict_1.default.ok(r.some((e) => e.includes('cycle')));
    });
    (0, node_test_1.test)('accepts a linear chain within depth', () => {
        const tasks = [
            { tempId: 'a', dependsOn: [] },
            { tempId: 'b', dependsOn: ['a'] },
        ];
        const byId = new Map(tasks.map((t) => [t.tempId, t]));
        const r = (0, planValidator_1.validateDependencies)(tasks, byId, (0, planningPolicy_1.makePlanningPolicy)({ maxPlanDepth: 2 }));
        strict_1.default.deepEqual(r, []);
    });
});
