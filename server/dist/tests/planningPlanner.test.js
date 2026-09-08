"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const mongoose_1 = __importDefault(require("mongoose"));
const Decision_1 = __importDefault(require("../models/Decision"));
const Execution_1 = __importDefault(require("../models/Execution"));
const Task_1 = __importDefault(require("../models/Task"));
const Claim_1 = __importDefault(require("../models/Claim"));
const Evidence_1 = __importDefault(require("../models/Evidence"));
const DecisionPlan_1 = __importDefault(require("../models/DecisionPlan"));
const planner_1 = require("../planning/planner");
const planCompiler_1 = require("../planning/planCompiler");
const fallbackPlanner_1 = require("../planning/fallbackPlanner");
const planValidator_1 = require("../planning/planValidator");
const planningPolicy_1 = require("../planning/planningPolicy");
const TEST_URI = process.env.MONGODB_URI_TEST || 'mongodb://localhost:27017/hathap_test_plan';
function fullPlan() {
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
function simplePlan() {
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
let decisionId;
let userId;
(0, node_test_1.before)(async () => {
    if (mongoose_1.default.connection.readyState === 0) {
        await mongoose_1.default.connect(TEST_URI);
    }
    await clean();
    userId = new mongoose_1.default.Types.ObjectId().toString();
    const decision = await Decision_1.default.create({
        userId,
        title: 'Planning Test',
        objective: 'Should we adopt microservices?',
        context: 'Small team.',
        status: 'debating',
        configuration: { strategy: 'consensus', maxRounds: 2 },
    });
    decisionId = decision._id.toString();
    await Evidence_1.default.create({
        decisionId,
        title: 'Existing report',
        content: 'Existing content.',
        sourceType: 'user_input',
    });
    await Claim_1.default.create({
        decisionId,
        text: 'Microservices reduce downtime.',
        type: 'fact',
        evidenceIds: [],
    });
});
(0, node_test_1.after)(async () => {
    await clean();
    await mongoose_1.default.connection.close();
});
async function clean() {
    await Promise.all([
        Decision_1.default.deleteMany({}),
        Execution_1.default.deleteMany({}),
        Task_1.default.deleteMany({}),
        Claim_1.default.deleteMany({}),
        Evidence_1.default.deleteMany({}),
        DecisionPlan_1.default.deleteMany({}),
    ]);
}
async function makeExecution(planningMode = 'intelligent') {
    const exec = await Execution_1.default.create({
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
function makePlanner(planCall, overrides = {}) {
    return new planner_1.DecisionPlanner({ planCall, policy: (0, planningPolicy_1.makePlanningPolicy)(overrides) });
}
const callWith = (plan, attempts = 1) => {
    let calls = 0;
    return async () => {
        calls++;
        if (calls <= attempts)
            return { ok: true, text: JSON.stringify(plan) };
        throw new Error('unexpected extra call');
    };
};
(0, node_test_1.describe)('fallback planner', () => {
    (0, node_test_1.test)('produces a valid conservative plan (research + debate)', () => {
        const plan = (0, fallbackPlanner_1.buildFallbackPlan)({ decisionId, objective: 'Should we adopt microservices?', existingEvidence: [] }, { policy: (0, planningPolicy_1.makePlanningPolicy)() });
        const r = (0, planValidator_1.validatePlan)(plan);
        strict_1.default.equal(r.valid, true, r.errors.join('; '));
        strict_1.default.ok(plan.tasks.some((t) => t.type === 'research'));
        strict_1.default.ok(plan.tasks.some((t) => t.type === 'debate'));
        strict_1.default.equal(plan.termination.requiresVerification, true);
    });
    (0, node_test_1.test)('simplified plan skips research and verification', () => {
        const plan = (0, fallbackPlanner_1.buildSimplifiedPlan)({ decisionId, objective: 'Should we adopt microservices?', existingEvidence: [] }, { policy: (0, planningPolicy_1.makePlanningPolicy)() });
        const r = (0, planValidator_1.validatePlan)(plan);
        strict_1.default.equal(r.valid, true, r.errors.join('; '));
        strict_1.default.equal(plan.tasks.length, 1);
        strict_1.default.equal(plan.tasks[0].type, 'debate');
        strict_1.default.equal(plan.termination.requiresVerification, false);
        strict_1.default.equal(plan.termination.requiresRedTeam, false);
    });
    (0, node_test_1.test)('respects research limits deterministically', () => {
        const policy = (0, planningPolicy_1.makePlanningPolicy)({ maxResearchTasks: 1, maxResultsPerResearchTask: 4, maxTotalResearchResults: 4 });
        const plan = (0, fallbackPlanner_1.buildFallbackPlan)({ decisionId, objective: 'Should we adopt microservices?', existingEvidence: [] }, { researchQueries: ['q one', 'q two', 'q three'], policy });
        const research = plan.tasks.filter((t) => t.type === 'research');
        strict_1.default.equal(research.length, 1);
        const budget = research.reduce((s, t) => s + t.input.maxResults, 0);
        strict_1.default.ok(budget <= 4);
        const r = (0, planValidator_1.validatePlan)(plan, { policy });
        strict_1.default.equal(r.valid, true, r.errors.join('; '));
    });
});
(0, node_test_1.describe)('planner service — intelligent accept path', () => {
    (0, node_test_1.test)('accepts a valid proposal, compiles real tasks with real IDs', async () => {
        const execution = await makeExecution();
        const planner = makePlanner(callWith(fullPlan()));
        const result = await planner.planExecution({
            executionId: execution._id.toString(),
            userId,
            planningMode: 'intelligent',
        });
        strict_1.default.equal(result.planSource, 'intelligent');
        strict_1.default.equal(result.retriesUsed, 0);
        strict_1.default.equal(result.compiled.reusedExistingTasks, false);
        const tasks = await Task_1.default.find({ executionId: execution._id.toString() });
        strict_1.default.equal(tasks.length, 3);
        strict_1.default.equal(tasks.filter((t) => t.type === 'research').length, 2);
        strict_1.default.equal(tasks.filter((t) => t.type === 'debate').length, 1);
        // Part of the fulfilled AMBIGUITY-2 (tempId → persisted ID): the debate
        // task's dependencies reference the REAL research task _ids, never tempIds.
        const debate = tasks.find((t) => t.type === 'debate');
        const research = tasks.filter((t) => t.type === 'research').map((t) => t._id.toString());
        strict_1.default.deepEqual(new Set(debate.dependencies.map((d) => d.toString())), new Set(research));
        const exec = await Execution_1.default.findById(execution._id);
        strict_1.default.equal(exec.planningStatus, 'planned');
        strict_1.default.ok(exec.planId);
        const planDoc = await DecisionPlan_1.default.findOne({ executionId: execution._id.toString() });
        strict_1.default.ok(planDoc);
        strict_1.default.equal(planDoc.status, 'compiled');
        strict_1.default.equal(planDoc.plannerModel || '', ''); // client-provided provenance
        const termination = planDoc.termination;
        strict_1.default.equal(termination.requiresVerification, true);
        strict_1.default.equal(termination.requiresRedTeam, true);
        strict_1.default.equal(termination.requiresReconciliation, true);
    });
    (0, node_test_1.test)('planning is idempotent — a second call reuses the compiled plan', async () => {
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
        strict_1.default.equal(second.reusedExisting, true);
        const tasks = await Task_1.default.find({ executionId: execution._id.toString() });
        strict_1.default.equal(tasks.length, 1, 'no duplicate task graph');
        const plans = await DecisionPlan_1.default.find({ executionId: execution._id.toString() });
        strict_1.default.equal(plans.length, 1, 'one plan per execution');
        strict_1.default.equal(first.compiled.persistedPlan._id.toString(), second.compiled.persistedPlan._id.toString());
    });
    (0, node_test_1.test)('bounded context sent to the planner contains no secrets or userId', async () => {
        let captured = null;
        const planCall = async (input) => {
            captured = input.context;
            return { ok: true, text: JSON.stringify(simplePlan()) };
        };
        const execution = await makeExecution();
        await makePlanner(planCall).planExecution({
            executionId: execution._id.toString(),
            userId,
            planningMode: 'intelligent',
        });
        strict_1.default.ok(captured);
        strict_1.default.equal(captured.decisionId, decisionId.toString());
        strict_1.default.ok(captured.objective.length > 0);
        strict_1.default.ok(Array.isArray(captured.existingEvidence));
        strict_1.default.equal(captured.userId, undefined);
        strict_1.default.equal(captured.apiKey, undefined);
        strict_1.default.equal(JSON.stringify(captured).includes('Bearer'), false);
    });
});
(0, node_test_1.describe)('planner service — fallback chain', () => {
    (0, node_test_1.test)('malformed JSON falls back to the deterministic baseline (still valid)', async () => {
        const execution = await makeExecution();
        const planner = makePlanner(async () => ({ ok: true, text: 'not json at all {{{' }));
        const result = await planner.planExecution({
            executionId: execution._id.toString(),
            userId,
            planningMode: 'intelligent',
        });
        strict_1.default.ok(['fallback', 'baseline'].includes(result.planSource));
        strict_1.default.ok(result.compiled.taskIds.length >= 1);
        const exec = await Execution_1.default.findById(execution._id);
        strict_1.default.equal(exec.planningStatus, 'planned');
    });
    (0, node_test_1.test)('provider failure falls back to the deterministic baseline', async () => {
        const execution = await makeExecution();
        const planner = makePlanner(async () => ({ ok: false, error: 'timeout', retryable: false }));
        const result = await planner.planExecution({
            executionId: execution._id.toString(),
            userId,
            planningMode: 'intelligent',
        });
        strict_1.default.ok(['fallback', 'baseline'].includes(result.planSource));
    });
    (0, node_test_1.test)('a rejected proposal is retried (bounded) then falls back', async () => {
        const execution = await makeExecution();
        let calls = 0;
        const planCall = async () => {
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
        strict_1.default.ok(calls >= 2, 'bounded retries attempted');
        strict_1.default.ok(['fallback', 'baseline'].includes(result.planSource));
        strict_1.default.ok(result.compiled.taskIds.length >= 1);
        // The dangerous task type was never compiled.
        const tasks = await Task_1.default.find({ executionId: execution._id.toString() });
        strict_1.default.ok(tasks.every((t) => ['research', 'debate'].includes(t.type)));
    });
    (0, node_test_1.test)('intelligent mode without any model call still baseline-plans (no hang)', async () => {
        const execution = await makeExecution();
        const planner = new planner_1.DecisionPlanner({ policy: (0, planningPolicy_1.makePlanningPolicy)() });
        const result = await planner.planExecution({
            executionId: execution._id.toString(),
            userId: new mongoose_1.default.Types.ObjectId().toString(), // user with no models
            planningMode: 'intelligent',
        });
        strict_1.default.equal(result.planSource, 'baseline');
        strict_1.default.ok(result.compiled.persistedPlan);
    });
});
(0, node_test_1.describe)('planner service — structured failure', () => {
    (0, node_test_1.test)('an impossible plan fails the execution with a structured PlanningError', async () => {
        const execution = await makeExecution();
        const policy = (0, planningPolicy_1.makePlanningPolicy)({ maxPlanningRetries: 0, maxTasksPerExecution: 0 });
        // With maxTasksPerExecution=0 even the deterministic fallback cannot pass
        // validation, so the planner must fail loudly and deterministically.
        const planner = new planner_1.DecisionPlanner({ policy });
        await strict_1.default.rejects(() => planner.planExecution({
            executionId: execution._id.toString(),
            userId,
            planningMode: 'intelligent',
        }), (err) => err.name === 'PlanningError' && /PLAN_NOT_POSSIBLE/.test(err.code));
        const exec = await Execution_1.default.findById(execution._id);
        strict_1.default.equal(exec.planningStatus, 'failed');
        strict_1.default.equal(exec.status, 'failed');
        // Never leaves an execution running forever with no plan.
        strict_1.default.ok(!['pending', 'running'].includes(exec.status));
    });
});
(0, node_test_1.describe)('plan compiler — recovery & idempotency', () => {
    (0, node_test_1.test)('compiles deterministic task graph with real dependency IDs', async () => {
        const execution = await makeExecution();
        const plan = fullPlan();
        const compiled = await planCompiler_1.planCompiler.compile({
            execution,
            plan,
            planningMode: 'intelligent',
            policy: (0, planningPolicy_1.makePlanningPolicy)(),
            plannerModel: 'test-model',
        });
        strict_1.default.equal(compiled.reusedExistingTasks, false);
        strict_1.default.equal(compiled.taskIds.length, 3);
        strict_1.default.equal(Object.keys(compiled.persistedPlan.tasks).length, 3);
        const planDoc = await DecisionPlan_1.default.findById(compiled.persistedPlan._id);
        strict_1.default.equal(planDoc.plannerModel, 'test-model');
    });
    (0, node_test_1.test)('recovers a crash between plan-persist and task-persist without duplication', async () => {
        const execution = await makeExecution();
        // First compile: plan doc + tasks persist.
        const first = await planCompiler_1.planCompiler.compile({
            execution,
            plan: simplePlan(),
            planningMode: 'intelligent',
            policy: (0, planningPolicy_1.makePlanningPolicy)(),
        });
        // Simulate a crash where the tasks were lost but the plan doc survived.
        await Task_1.default.deleteMany({ executionId: execution._id.toString() });
        strict_1.default.equal(await Task_1.default.countDocuments({ executionId: execution._id.toString() }), 0);
        // Recompile: same execution, same plan → tasks recreated, plan NOT duplicated.
        const second = await planCompiler_1.planCompiler.compile({
            execution,
            plan: simplePlan(),
            planningMode: 'intelligent',
            policy: (0, planningPolicy_1.makePlanningPolicy)(),
        });
        strict_1.default.equal(second.reusedExistingTasks, false);
        strict_1.default.equal(await Task_1.default.countDocuments({ executionId: execution._id.toString() }), 1);
        strict_1.default.equal(second.persistedPlan._id.toString(), first.persistedPlan._id.toString());
        const plans = await DecisionPlan_1.default.find({ executionId: execution._id.toString() });
        strict_1.default.equal(plans.length, 1, 'no duplicate plan documents');
    });
    (0, node_test_1.test)('does not duplicate an already-compiled graph', async () => {
        const execution = await makeExecution();
        await planCompiler_1.planCompiler.compile({
            execution,
            plan: simplePlan(),
            planningMode: 'intelligent',
            policy: (0, planningPolicy_1.makePlanningPolicy)(),
        });
        const again = await planCompiler_1.planCompiler.compile({
            execution,
            plan: simplePlan(),
            planningMode: 'intelligent',
            policy: (0, planningPolicy_1.makePlanningPolicy)(),
        });
        strict_1.default.equal(again.reusedExistingTasks, true);
        strict_1.default.equal(await Task_1.default.countDocuments({ executionId: execution._id.toString() }), 1);
    });
});
