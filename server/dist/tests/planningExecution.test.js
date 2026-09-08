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
const VerificationResult_1 = __importDefault(require("../models/VerificationResult"));
const RedTeamFinding_1 = __importDefault(require("../models/RedTeamFinding"));
const ReconciliationResult_1 = __importDefault(require("../models/ReconciliationResult"));
const EvidenceRelationship_1 = __importDefault(require("../models/EvidenceRelationship"));
const DecisionPlan_1 = __importDefault(require("../models/DecisionPlan"));
const executor_1 = require("../decision/executor");
const worker_1 = require("../tasks/worker");
const handlers_1 = require("../tasks/handlers");
const verifyClaimHandler_1 = require("../tasks/handlers/verifyClaimHandler");
const redTeamHandler_1 = require("../tasks/handlers/redTeamHandler");
const reconciliationHandler_1 = require("../tasks/handlers/reconciliationHandler");
const debateHandler_1 = require("../tasks/handlers/debateHandler");
const planner_1 = require("../planning/planner");
const planningPolicy_1 = require("../planning/planningPolicy");
const TEST_URI = process.env.MONGODB_URI_TEST || 'mongodb://localhost:27017/hathap_test_plan_exec';
/**
 * Fake research handler — creates local evidence without touching any provider.
 */
class FakeResearchHandler {
    constructor() {
        this.type = 'research';
    }
    canHandle(type) {
        return type === 'research';
    }
    async execute(task, context) {
        const query = String(task.input?.query || 'research');
        const evidence = await Evidence_1.default.create({
            decisionId: context.decisionId,
            executionId: context.executionId,
            taskId: context.taskId,
            type: 'research',
            title: `Evidence for "${query.slice(0, 60)}"`,
            content: `Content gathered for: ${query}`,
            sourceType: 'web',
            sourceName: 'fake-provider',
            provenanceKind: 'retrieved',
            retrievedAt: new Date(),
            query,
        });
        await Claim_1.default.create({
            decisionId: context.decisionId,
            executionId: context.executionId,
            taskId: context.taskId,
            text: `Source asserts: about "${query}"`,
            type: 'fact',
            status: 'proposed',
            evidenceIds: [evidence._id.toString()],
            supportingEvidenceIds: [evidence._id.toString()],
            provenanceKind: 'retrieved',
        });
        return {
            output: { query, provider: 'fake', resultCount: 1, empty: false, evidenceIds: [evidence._id.toString()] },
        };
    }
}
/**
 * Fake debate handler — produces a candidate verdict + claims, then drives the
 * REAL Phase 4 downstream scheduling honoring the plan's termination flags.
 */
class FakeDebateHandler {
    constructor() {
        this.type = 'debate';
    }
    canHandle(type) {
        return type === 'debate';
    }
    async execute(task, context) {
        const evidenceDocs = await Evidence_1.default.find({ decisionId: context.decisionId });
        const evidenceIds = evidenceDocs.map((e) => e._id.toString());
        // The assumption intentionally has NO evidence so the deterministic
        // red-team service flags it (invalid_assumption finding persisted).
        const claimants = [
            { text: 'Microservices reduce deployment downtime.', type: 'fact', evidenceIds: evidenceIds.slice(0, 1) },
            { text: 'The team has SRE expertise.', type: 'assumption', evidenceIds: [] },
        ];
        const persisted = [];
        for (let i = 0; i < claimants.length; i++) {
            const c = claimants[i];
            const doc = await Claim_1.default.create({
                decisionId: context.decisionId,
                executionId: context.executionId,
                taskId: context.taskId,
                text: c.text,
                type: c.type,
                status: 'proposed',
                evidenceIds: c.evidenceIds,
                supportingEvidenceIds: c.evidenceIds,
                provenanceKind: 'inferred',
            });
            persisted.push(doc._id.toString());
        }
        const decision = await Decision_1.default.findById(context.decisionId);
        const result = {
            verdict: { recommendation: 'Adopt microservices.', confidenceScore: 0.61 },
            messages: [],
        };
        // Honor the plan's termination flags exactly like the real debate handler.
        const termination = await resolveTermination(context.executionId);
        const phase4 = await (0, debateHandler_1.schedulePhase4DownstreamTasks)(context, result, decision, termination);
        return {
            output: {
                strategy: 'consensus',
                verdict: result.verdict,
                claimIds: persisted,
                candidateVerdict: result.verdict,
                phase4,
            },
        };
    }
}
async function resolveTermination(executionId) {
    const exec = await Execution_1.default.findById(executionId);
    if (!exec?.planId)
        return { verify: true, redTeam: true, reconciliation: true };
    const plan = await DecisionPlan_1.default.findById(exec.planId);
    if (!plan?.termination)
        return { verify: true, redTeam: true, reconciliation: true };
    return {
        verify: plan.termination.requiresVerification !== false,
        redTeam: plan.termination.requiresRedTeam !== false,
        reconciliation: plan.termination.requiresReconciliation !== false,
    };
}
function makeRegistry() {
    return new handlers_1.DefaultTaskHandlerRegistry([
        new FakeResearchHandler(),
        new FakeDebateHandler(),
        verifyClaimHandler_1.verifyClaimHandler,
        redTeamHandler_1.redTeamHandler,
        reconciliationHandler_1.reconciliationHandler,
    ]);
}
function makeWorker() {
    const executor = new executor_1.TaskExecutor({
        registry: makeRegistry(),
        workerId: 'test-plan-worker',
        backoff: () => 5,
    });
    return new worker_1.Worker({
        executor,
        pollIntervalMs: 100000,
        maxConcurrentTasks: 6,
        staleTaskTimeoutMs: 120000,
    });
}
function fullPlan() {
    return {
        version: '1.0',
        source: 'intelligent',
        tasks: [
            {
                tempId: 'research-1',
                type: 'research',
                purpose: 'Market research.',
                input: { query: 'market size for microservices', purpose: 'market_research', maxResults: 3 },
                dependsOn: [],
                priority: 10,
            },
            {
                tempId: 'research-2',
                type: 'research',
                purpose: 'Technical research.',
                input: { query: 'microservices operational complexity', purpose: 'technical_research', maxResults: 3 },
                dependsOn: [],
                priority: 10,
            },
            {
                tempId: 'debate',
                type: 'debate',
                purpose: 'Weigh the evidence and decide.',
                input: { strategy: 'consensus', description: 'Weigh the evidence.' },
                dependsOn: ['research-1', 'research-2'],
                priority: 1,
            },
        ],
        termination: { requiresVerification: true, requiresRedTeam: true, requiresReconciliation: true },
        rationale: { summary: 'full', research: '2', debate: '1', verification: 'on', redTeam: 'on' },
        estimates: { estimatedTasks: 3, estimatedResearchTasks: 2, estimatedLLMTasks: 1 },
    };
}
function simplifiedPlan() {
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
            },
        ],
        termination: { requiresVerification: false, requiresRedTeam: false, requiresReconciliation: true },
        rationale: { summary: 'simple', research: 'none', debate: '1', verification: 'off', redTeam: 'off' },
        estimates: { estimatedTasks: 1, estimatedResearchTasks: 0, estimatedLLMTasks: 1 },
    };
}
let userId;
let decisionId;
(0, node_test_1.before)(async () => {
    if (mongoose_1.default.connection.readyState === 0) {
        await mongoose_1.default.connect(TEST_URI);
    }
    await clean();
    userId = new mongoose_1.default.Types.ObjectId().toString();
    const decision = await Decision_1.default.create({
        userId,
        title: 'Planning E2E',
        objective: 'Should we adopt microservices?',
        context: 'Full graph.',
        status: 'debating',
        configuration: { strategy: 'consensus', maxRounds: 2 },
        assumptions: ['We can migrate gradually.'],
    });
    decisionId = decision._id.toString();
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
        VerificationResult_1.default.deleteMany({}),
        RedTeamFinding_1.default.deleteMany({}),
        ReconciliationResult_1.default.deleteMany({}),
        EvidenceRelationship_1.default.deleteMany({}),
        DecisionPlan_1.default.deleteMany({}),
    ]);
}
async function waitUntil(fn, timeoutMs = 10000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        if (await fn())
            return;
        await new Promise((r) => setTimeout(r, 30));
    }
    throw new Error('Timed out waiting for condition');
}
const planCallFor = (plan) => async () => ({ ok: true, text: JSON.stringify(plan) });
async function runPlannedExecution(plan) {
    const execution = await Execution_1.default.create({
        decisionId,
        status: 'pending',
        startedAt: new Date(),
        currentPhase: 'debating',
        progress: 0,
        planningStatus: 'planning',
        planningMode: 'intelligent',
    });
    const executionId = execution._id.toString();
    const planner = new planner_1.DecisionPlanner({ policy: (0, planningPolicy_1.makePlanningPolicy)() });
    const result = await planner.planExecution({
        executionId,
        userId,
        planningMode: 'intelligent',
        planCall: planCallFor(plan),
    });
    strict_1.default.equal(result.planSource, 'intelligent');
    // Persisted REAL task IDs from the planner (never tempIds).
    const compiled = result.compiled;
    strict_1.default.ok(compiled.taskIds.length >= 1);
    const tasks = await Task_1.default.find({ executionId });
    strict_1.default.equal(tasks.length, compiled.taskIds.length);
    strict_1.default.ok(tasks.every((t) => !String(t.type).startsWith('rm -rf')), 'no dangerous tasks compiled');
    // Queue the execution, exactly as startDecisionWithPlanning does.
    await Execution_1.default.updateOne({ _id: execution._id }, { $set: { status: 'queued', planningStatus: 'planned' } });
    const worker = makeWorker();
    for (let i = 0; i < 50 && (await Execution_1.default.findById(executionId))?.status !== 'completed'; i++) {
        await worker.tickNow();
        await new Promise((r) => setTimeout(r, 30));
    }
    await waitUntil(async () => {
        const e = await Execution_1.default.findById(executionId);
        return !!e && e.status === 'completed';
    });
    return executionId;
}
(0, node_test_1.describe)('Phase 5 — intelligent planning full execution graph (persistent, real task IDs)', () => {
    (0, node_test_1.test)('Decision → Planner → Validate → Compile → Scheduler → Research → Debate → Verify/RedTeam → Reconciliation → completed', async () => {
        const executionId = await runPlannedExecution(fullPlan());
        const tasks = await Task_1.default.find({ executionId }).sort({ type: 1 });
        const byType = {};
        for (const t of tasks)
            byType[t.type] = (byType[t.type] || 0) + 1;
        strict_1.default.ok(byType['research'] === 2, 'two planned research tasks executed');
        strict_1.default.ok(byType['debate'] === 1, 'planned debate executed');
        strict_1.default.ok(byType['verify_claim'] >= 1, 'verification tasks ran per selected claims');
        strict_1.default.ok(byType['red_team'] === 1, 'red team ran exactly once');
        strict_1.default.ok(byType['reconciliation'] === 1, 'reconciliation ran exactly once');
        for (const t of tasks) {
            strict_1.default.equal(t.status, 'completed', `task ${t.type} should complete`);
        }
        const verifications = await VerificationResult_1.default.find({ decisionId });
        strict_1.default.ok(verifications.length >= 1, 'verification results persisted');
        const findings = await RedTeamFinding_1.default.find({ decisionId });
        strict_1.default.ok(findings.length >= 1, 'red team findings persisted');
        const recon = await ReconciliationResult_1.default.findOne({ decisionId });
        strict_1.default.ok(recon, 'reconciliation persisted');
        strict_1.default.ok(recon.recommendation, 'reconciliation carries the final recommendation');
        const decision = await Decision_1.default.findById(decisionId);
        strict_1.default.equal(decision.status, 'completed', 'decision completed via the planned graph');
        strict_1.default.equal(decision.currentPhase, 'completed');
        const planDoc = await DecisionPlan_1.default.findOne({ executionId });
        strict_1.default.ok(planDoc);
        strict_1.default.equal(planDoc.status, 'compiled');
        strict_1.default.equal(planDoc.termination.requiresVerification, true);
    });
    (0, node_test_1.test)('a simplified plan (no verification/red team) executes fewer tasks end-to-end', async () => {
        const executionId = await runPlannedExecution(simplifiedPlan());
        const tasks = await Task_1.default.find({ executionId }).sort({ type: 1 });
        const types = tasks.map((t) => t.type);
        strict_1.default.ok(types.includes('debate'));
        strict_1.default.ok(!types.includes('research'), 'simplified plan skipped research');
        strict_1.default.ok(!types.includes('verify_claim'), 'simplified plan skipped verification');
        strict_1.default.ok(!types.includes('red_team'), 'simplified plan skipped red team');
        const exec = await Execution_1.default.findById(executionId);
        strict_1.default.equal(exec.status, 'completed');
        strict_1.default.equal(exec.planningStatus, 'planned');
    });
    (0, node_test_1.test)('malformed planner output falls back to a valid baseline and still executes', async () => {
        const execution = await Execution_1.default.create({
            decisionId,
            status: 'pending',
            startedAt: new Date(),
            currentPhase: 'debating',
            progress: 0,
            planningStatus: 'planning',
            planningMode: 'intelligent',
        });
        const executionId = execution._id.toString();
        const planner = new planner_1.DecisionPlanner({ policy: (0, planningPolicy_1.makePlanningPolicy)() });
        const result = await planner.planExecution({
            executionId,
            userId,
            planningMode: 'intelligent',
            planCall: planCallFor('{{{ not json'),
        });
        strict_1.default.equal(result.planSource, 'baseline');
        strict_1.default.ok(result.compiled.taskIds.length >= 1);
        await Execution_1.default.updateOne({ _id: execution._id }, { $set: { status: 'queued', planningStatus: 'planned' } });
        const worker = makeWorker();
        for (let i = 0; i < 50 && (await Execution_1.default.findById(executionId))?.status !== 'completed'; i++) {
            await worker.tickNow();
            await new Promise((r) => setTimeout(r, 30));
        }
        await waitUntil(async () => {
            const e = await Execution_1.default.findById(executionId);
            return !!e && e.status === 'completed';
        });
        strict_1.default.equal((await Execution_1.default.findById(executionId)).status, 'completed');
        const planDoc = await DecisionPlan_1.default.findOne({ executionId });
        strict_1.default.ok(['fallback', 'baseline'].includes(planDoc.source));
    });
});
