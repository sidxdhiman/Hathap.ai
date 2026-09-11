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
const ExecutionEvent_1 = __importDefault(require("../models/ExecutionEvent"));
const DecisionMemory_1 = __importDefault(require("../models/DecisionMemory"));
const ReconciliationResult_1 = __importDefault(require("../models/ReconciliationResult"));
const executor_1 = require("../decision/executor");
const worker_1 = require("../tasks/worker");
const verifyClaimHandler_1 = require("../tasks/handlers/verifyClaimHandler");
const redTeamHandler_1 = require("../tasks/handlers/redTeamHandler");
const reconciliationHandler_1 = require("../tasks/handlers/reconciliationHandler");
const planner_1 = require("../planning/planner");
const planningPolicy_1 = require("../planning/planningPolicy");
const orchestrator_1 = require("../decision/orchestrator");
const decisionMemoryService_1 = require("../memory/decisionMemoryService");
const handlers_1 = require("../tasks/handlers");
const TEST_URI = process.env.MONGODB_URI_TEST_MEMORY_E2E || 'mongodb://localhost:27017/hathap_test_memory_e2e';
async function clean() {
    await Promise.all([
        DecisionMemory_1.default.deleteMany({}),
        ExecutionEvent_1.default.deleteMany({}),
        ReconciliationResult_1.default.deleteMany({}),
        Claim_1.default.deleteMany({}),
        Evidence_1.default.deleteMany({}),
        Task_1.default.deleteMany({}),
        Execution_1.default.deleteMany({}),
        DecisionPlan_1.default.deleteMany({}),
        Decision_1.default.deleteMany({}),
    ]);
}
function simplePlan() {
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
const planCallFor = (plan) => async () => ({ ok: true, text: JSON.stringify(plan) });
class FakeDebateHandler {
    constructor() {
        this.type = 'debate';
    }
    canHandle(type) {
        return type === 'debate';
    }
    async execute(_task, context) {
        await Claim_1.default.create({
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
function makeRegistry() {
    return new handlers_1.DefaultTaskHandlerRegistry([
        new FakeDebateHandler(),
        verifyClaimHandler_1.verifyClaimHandler,
        redTeamHandler_1.redTeamHandler,
        reconciliationHandler_1.reconciliationHandler,
    ]);
}
function makeWorker() {
    const executor = new executor_1.TaskExecutor({
        registry: makeRegistry(),
        workerId: 'memory-e2e-worker',
        backoff: () => 5,
    });
    return new worker_1.Worker({
        executor,
        pollIntervalMs: 100000,
        maxConcurrentTasks: 6,
        staleTaskTimeoutMs: 120000,
    });
}
async function waitFor(predicate, timeoutMs = 8000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        if (await predicate())
            return;
        await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error('waitFor timed out');
}
let userId;
(0, node_test_1.before)(async () => {
    if (mongoose_1.default.connection.readyState === 0) {
        await mongoose_1.default.connect(TEST_URI);
    }
    await clean();
    userId = new mongoose_1.default.Types.ObjectId().toString();
});
(0, node_test_1.after)(async () => {
    await clean();
    await mongoose_1.default.connection.close();
});
(0, node_test_1.describe)('Phase 8 E2E - Worker completion records decision memory', () => {
    (0, node_test_1.test)('a completed decision gets an honest memory index, created via the worker completion hook', async () => {
        const decision = await Decision_1.default.create({
            userId,
            title: 'E2E microservices decision',
            objective: 'Should we adopt microservices?',
            context: 'E2E worker memory hook.',
            status: 'debating',
            metadata: { category: 'technology', tags: ['microservices', 'cloud'], entities: ['payments-svc'] },
        });
        const decisionId = decision._id.toString();
        // Seed a reconciliation result so memory has a final recommendation.
        await ReconciliationResult_1.default.create({
            decisionId,
            recommendation: 'Proceed with phased adoption.',
            survivingClaimIds: [],
            rejectedClaimIds: [],
            uncertainClaimIds: [],
            redTeamFindingIds: [],
            needsMoreResearch: false,
            rationale: 'Synthetic reconciliation.',
        });
        const execution = await Execution_1.default.create({
            decisionId,
            status: 'queued',
            startedAt: new Date(),
            currentPhase: 'debating',
            progress: 0,
            planningStatus: 'planned',
            planningMode: 'intelligent',
        });
        const executionId = execution._id.toString();
        const planner = new planner_1.DecisionPlanner({ policy: (0, planningPolicy_1.makePlanningPolicy)() });
        const result = await planner.planExecution({
            executionId,
            userId,
            planningMode: 'intelligent',
            planCall: planCallFor(simplePlan()),
        });
        strict_1.default.equal(result.planSource, 'intelligent');
        const worker = makeWorker();
        await waitFor(async () => {
            await worker.tickNow();
            const e = await Execution_1.default.findById(executionId);
            return !!e && e.status === 'completed';
        });
        const updatedDecision = await Decision_1.default.findById(decisionId);
        strict_1.default.ok(updatedDecision);
        strict_1.default.equal(updatedDecision.status, 'completed', 'decision transitions to completed');
        await waitFor(async () => (await DecisionMemory_1.default.countDocuments({ decisionId })) === 1);
        const memory = await DecisionMemory_1.default.findOne({ decisionId });
        strict_1.default.ok(memory, 'memory record written by worker completion hook');
        strict_1.default.equal(memory.status, 'completed');
        strict_1.default.equal(memory.createdVia, 'completion');
        strict_1.default.equal(String(memory.finalRecommendation), 'Proceed with phased adoption.');
        strict_1.default.equal(memory.recommendationSource, 'reconciliation');
        strict_1.default.deepEqual(memory.tags, ['microservices', 'cloud']);
        strict_1.default.deepEqual(memory.entities, ['payments-svc']);
        strict_1.default.equal(memory.category, 'technology');
        strict_1.default.ok(memory.completedAt instanceof Date);
        strict_1.default.ok(memory.importantClaimIds.length > 0, 'claim created by handler referenced');
        strict_1.default.ok(memory.executionIds.length >= 1, 'execution referenced');
        strict_1.default.ok(memory.importantEvidenceIds.length >= 0);
        const memoryEvent = await ExecutionEvent_1.default.findOne({ type: 'memory.created', decisionId });
        strict_1.default.ok(memoryEvent, 'memory.created event persisted');
        strict_1.default.equal(String(memoryEvent.decisionId), decisionId);
    });
});
(0, node_test_1.describe)('Phase 8 E2E - Orchestrator cancellation records cancelled memory', () => {
    (0, node_test_1.test)('cancelling a decision writes an honest cancelled memory, never a success', async () => {
        const decision = await Decision_1.default.create({
            userId,
            title: 'E2E cancelled decision',
            objective: 'We will cancel this.',
            status: 'debating',
            metadata: { category: 'operations' },
        });
        const decisionId = decision._id.toString();
        const orchestrator = new orchestrator_1.DecisionOrchestrator();
        await orchestrator.cancelDecision(decisionId, userId);
        const updated = await Decision_1.default.findById(decisionId);
        strict_1.default.ok(updated);
        strict_1.default.equal(updated.status, 'cancelled');
        await waitFor(async () => (await DecisionMemory_1.default.countDocuments({ decisionId })) === 1);
        const memory = await DecisionMemory_1.default.findOne({ decisionId });
        strict_1.default.ok(memory, 'cancelled decision gets memory record');
        strict_1.default.equal(memory.status, 'cancelled');
        strict_1.default.equal(memory.createdVia, 'cancellation');
        strict_1.default.equal(memory.title, 'E2E cancelled decision');
        strict_1.default.equal(memory.recommendationSource, 'none');
        strict_1.default.ok(memory.completedAt instanceof Date, 'completedAt stamped on cancellation');
    });
});
(0, node_test_1.describe)('Phase 8 E2E - Planner integrates historical memory (untrusted, bounded)', () => {
    (0, node_test_1.test)('planCall receives a historicalMemory context that never overrides instructions', async () => {
        // Seed a prior completed decision for the same user with matching metadata.
        const prior = await Decision_1.default.create({
            userId,
            title: 'Prior microservices plan',
            objective: 'Should we adopt microservices earlier?',
            context: 'Earlier decision.',
            status: 'completed',
            completedAt: new Date(),
            metadata: { category: 'technology', tags: ['microservices'] },
        });
        const priorId = prior._id.toString();
        await decisionMemoryService_1.decisionMemoryService.createForDecision(priorId, userId, { via: 'completion' });
        // Current decision with matching category/tags.
        const current = await Decision_1.default.create({
            userId,
            title: 'Current microservices plan',
            objective: 'Should we adopt microservices now?',
            context: 'Current decision.',
            status: 'debating',
            metadata: { category: 'technology', tags: ['microservices'] },
        });
        const currentId = current._id.toString();
        const execution = await Execution_1.default.create({
            decisionId: currentId,
            status: 'queued',
            startedAt: new Date(),
            currentPhase: 'debating',
            progress: 0,
            planningStatus: 'planned',
            planningMode: 'intelligent',
        });
        let capturedContext = null;
        const capturingPlanCall = async ({ context }) => {
            capturedContext = context;
            return { ok: true, text: JSON.stringify(simplePlan()) };
        };
        const beforeRetrieved = await ExecutionEvent_1.default.countDocuments({ type: 'memory.retrieved' });
        const planner = new planner_1.DecisionPlanner({ policy: (0, planningPolicy_1.makePlanningPolicy)() });
        const result = await planner.planExecution({
            executionId: execution._id.toString(),
            userId,
            planningMode: 'intelligent',
            planCall: capturingPlanCall,
        });
        strict_1.default.equal(result.planSource, 'intelligent');
        // Wait for any async event persistence.
        await new Promise((r) => setTimeout(r, 100));
        const afterRetrieved = await ExecutionEvent_1.default.countDocuments({ type: 'memory.retrieved' });
        strict_1.default.equal(afterRetrieved, beforeRetrieved, 'no memory.retrieved event persisted by planner path');
        strict_1.default.ok(capturedContext, 'planCall received a context');
        strict_1.default.ok(capturedContext.historicalMemory, 'historicalMemory attached to planner context');
        const mem = capturedContext.historicalMemory;
        strict_1.default.equal(mem.enabled, true);
        strict_1.default.ok(typeof mem.contextText === 'string' && mem.contextText.length > 0, 'contextText built');
        strict_1.default.match(mem.contextText, /<historical_decision_memory>/);
        strict_1.default.match(mem.contextText, /UNTRUSTED REFERENCE DATA/);
        strict_1.default.match(mem.contextText, /Prior microservices plan/, 'prior decision surfaced');
        strict_1.default.ok(!mem.contextText.includes('Current microservices plan'), 'current decision excluded');
        strict_1.default.ok(!mem.contextText.includes('Should we adopt microservices now?'), 'current objective excluded');
        strict_1.default.ok(mem.contextSize <= 3000, `context within cap (${mem.contextSize})`);
        strict_1.default.ok(mem.memories.length >= 1, 'at least one memory entry');
        strict_1.default.equal(mem.retrieval.policyVersion, 'memory-policy-v1');
    });
});
