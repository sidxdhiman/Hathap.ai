"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
const executor_1 = require("../decision/executor");
const worker_1 = require("../tasks/worker");
const handlers_1 = require("../tasks/handlers");
const verifyClaimHandler_1 = require("../tasks/handlers/verifyClaimHandler");
const redTeamHandler_1 = require("../tasks/handlers/redTeamHandler");
const reconciliationHandler_1 = require("../tasks/handlers/reconciliationHandler");
const TEST_URI = process.env.MONGODB_URI_TEST || 'mongodb://localhost:27017/hathap_test_p4exec';
/**
 * Fake debate handler. The real debateHandler runs an LLM-driven debate (not
 * feasible headlessly in tests). This fake reproduces the debate handler's
 * Phase 4 downstream-scheduling contract: after a debate "completes", it seeds
 * the evidence graph and creates verify_claim tasks (per selected claim),
 * a red_team task, and a reconciliation task, all as real persisted Task
 * documents with real dependency IDs.
 *
 * It re-implements the scheduling that the real debateHandler performs so the
 * rest of the pipeline (verify_claim / red_team / reconciliation via the real
 * handlers) is exercised end-to-end with real task IDs.
 */
class FakeDebateHandler {
    constructor() {
        this.type = 'debate';
    }
    canHandle(type) {
        return type === 'debate';
    }
    async execute(task, context) {
        const selectedClaims = await Claim_1.default.find({ decisionId: context.decisionId }).sort({
            createdAt: 1,
        });
        const evidenceDocs = await Evidence_1.default.find({ decisionId: context.decisionId });
        const allEvidenceIds = evidenceDocs.map((e) => e._id.toString());
        const verifyTaskIds = [];
        for (const claim of selectedClaims) {
            const vc = await Task_1.default.create({
                executionId: context.executionId,
                type: 'verify_claim',
                status: 'pending',
                priority: 5,
                input: {
                    claimId: claim._id.toString(),
                    claimStatement: claim.text,
                    evidenceIds: (claim.evidenceIds || []).length > 0
                        ? claim.evidenceIds
                        : allEvidenceIds.slice(0, 3),
                    decisionId: context.decisionId,
                    executionId: context.executionId,
                    verificationMode: 'evidence',
                },
                dependencies: [context.taskId],
                metadata: { phase: 'verification', claimId: claim._id.toString() },
            });
            verifyTaskIds.push(vc._id.toString());
        }
        const rt = await Task_1.default.create({
            executionId: context.executionId,
            type: 'red_team',
            status: 'pending',
            priority: 5,
            input: {
                decisionId: context.decisionId,
                candidateRecommendation: 'Adopt microservices.',
                claimIds: selectedClaims.map((c) => c._id.toString()),
                evidenceIds: allEvidenceIds,
                assumptions: [],
            },
            dependencies: [context.taskId],
            metadata: { phase: 'red_team' },
        });
        const rc = await Task_1.default.create({
            executionId: context.executionId,
            type: 'reconciliation',
            status: 'pending',
            priority: 1,
            input: {
                decisionId: context.decisionId,
                candidateRecommendation: 'Adopt microservices.',
                claimIds: selectedClaims.map((c) => c._id.toString()),
                verifyClaimTaskIds: verifyTaskIds,
                redTeamTaskId: rt._id.toString(),
            },
            dependencies: [...verifyTaskIds, rt._id.toString()],
            metadata: { phase: 'reconciliation' },
        });
        return {
            output: {
                strategy: 'consensus',
                verdict: { recommendation: 'Adopt microservices.', confidenceScore: 0.6 },
                claimIds: selectedClaims.map((c) => c._id.toString()),
                phase4: {
                    verificationTaskIds: verifyTaskIds,
                    redTeamTaskId: rt._id.toString(),
                    reconciliationTaskId: rc._id.toString(),
                },
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
        workerId: 'test-worker',
        backoff: () => 5,
    });
    return new worker_1.Worker({
        executor,
        pollIntervalMs: 100000,
        maxConcurrentTasks: 6,
        staleTaskTimeoutMs: 120000,
    });
}
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
    ]);
}
async function waitUntil(fn, timeoutMs = 8000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        if (await fn())
            return;
        await new Promise((r) => setTimeout(r, 30));
    }
    throw new Error('Timed out waiting for condition');
}
let decisionId;
let executionId;
(0, node_test_1.before)(async () => {
    if (mongoose_1.default.connection.readyState === 0) {
        await mongoose_1.default.connect(TEST_URI);
    }
    await clean();
    const user = new mongoose_1.default.Types.ObjectId().toString();
    const decision = await Decision_1.default.create({
        userId: user,
        title: 'Phase 4 Graph',
        objective: 'Should we adopt microservices?',
        context: 'Test full graph.',
        status: 'debating',
        currentPhase: 'debating',
        configuration: { strategy: 'consensus', maxRounds: 2 },
    });
    decisionId = decision._id.toString();
    const exec = await Execution_1.default.create({
        decisionId,
        status: 'queued',
        currentPhase: 'debating',
        progress: 0,
    });
    executionId = exec._id.toString();
    // Debated claims + evidence to feed the downstream graph.
    await Claim_1.default.create({
        decisionId,
        text: 'Microservices reduce downtime.',
        type: 'fact',
        evidenceIds: [],
    });
    await Claim_1.default.create({
        decisionId,
        text: 'Team has SRE expertise.',
        type: 'assumption',
        evidenceIds: [],
    });
    const ev = await Evidence_1.default.create({
        decisionId,
        title: 'Evidence 1',
        content: 'Supports microservices.',
        sourceType: 'user_input',
    });
    const ev2 = await Evidence_1.default.create({
        decisionId,
        title: 'Evidence 2',
        content: 'Contradicts microservices.',
        sourceType: 'user_input',
    });
    // Give the first claim explicit contradictory evidence so verification has
    // real signal and red team has a contradiction to flag.
    const firstClaim = await Claim_1.default.findOne({ decisionId, text: 'Microservices reduce downtime.' });
    strict_1.default.ok(firstClaim, 'first claim should exist');
    await evidenceGraphServiceLink(firstClaim._id.toString(), ev2._id.toString());
});
async function evidenceGraphServiceLink(claimId, evidenceId) {
    const { evidenceGraphService } = await Promise.resolve().then(() => __importStar(require('../decision/evidenceGraphService')));
    await evidenceGraphService.upsertRelationship({
        claimId,
        evidenceId,
        relationship: 'contradicts',
        source: 'research',
        decisionId,
    });
}
(0, node_test_1.after)(async () => {
    await clean();
    await mongoose_1.default.connection.close();
});
(0, node_test_1.describe)('Phase 4 full execution graph (persistent, real task IDs)', () => {
    (0, node_test_1.test)('debate → verify + red_team (parallel) → reconciliation completes', async () => {
        // Seed the debate task that starts the graph.
        await Task_1.default.create({
            executionId,
            type: 'debate',
            status: 'pending',
            priority: 10,
            input: { strategy: 'consensus' },
            dependencies: [],
        });
        const worker = makeWorker();
        for (let i = 0; i < 40 && (await Execution_1.default.findById(executionId))?.status !== 'completed'; i++) {
            await worker.tickNow();
            await new Promise((r) => setTimeout(r, 30));
        }
        await waitUntil(async () => {
            const e = await Execution_1.default.findById(executionId);
            return !!e && e.status === 'completed';
        });
        const tasks = await Task_1.default.find({ executionId }).sort({ type: 1 });
        const byType = {};
        for (const t of tasks)
            byType[t.type] = (byType[t.type] || 0) + 1;
        strict_1.default.ok(byType['debate'] >= 1, 'debate task ran');
        strict_1.default.ok(byType['verify_claim'] >= 1, 'verify_claim tasks ran');
        strict_1.default.ok(byType['red_team'] === 1, 'red_team task ran exactly once');
        strict_1.default.ok(byType['reconciliation'] === 1, 'reconciliation task ran exactly once');
        // Parent debate + downstream tasks complete.
        for (const t of tasks) {
            strict_1.default.equal(t.status, 'completed', `task ${t.type} should complete`);
        }
        // Verification results persisted.
        const verifications = await VerificationResult_1.default.find({ decisionId });
        strict_1.default.ok(verifications.length >= 1, 'verification results persisted');
        // Red team findings persisted.
        const findings = await RedTeamFinding_1.default.find({ decisionId });
        strict_1.default.ok(findings.length >= 1, 'red team findings persisted');
        // Reconciliation result persisted and reflects deterministic semantics.
        const recon = await ReconciliationResult_1.default.findOne({ decisionId });
        strict_1.default.ok(recon, 'reconciliation result persisted');
        strict_1.default.ok(recon.recommendation, 'reconciliation carries a recommendation');
        strict_1.default.ok(Array.isArray(recon.survivingClaimIds));
        strict_1.default.ok(Array.isArray(recon.rejectedClaimIds));
    });
    (0, node_test_1.test)('contradicted claim is rejected, not merely unsupported', async () => {
        const recon = await ReconciliationResult_1.default.findOne({ decisionId });
        strict_1.default.ok(recon, 'reconciliation exists');
        const contradictedClaim = await Claim_1.default.findOne({
            decisionId,
            text: 'Microservices reduce downtime.',
        });
        const claimId = contradictedClaim._id.toString();
        strict_1.default.ok(recon.rejectedClaimIds.includes(claimId), 'contradicted claim should be rejected');
        strict_1.default.ok(!recon.survivingClaimIds.includes(claimId), 'contradicted claim should NOT survive');
    });
    (0, node_test_1.test)('reconciliation flags needsMoreResearch due to contradictions', async () => {
        const recon = await ReconciliationResult_1.default.findOne({ decisionId });
        strict_1.default.equal(recon.needsMoreResearch, true);
        strict_1.default.ok(Array.isArray(recon.researchQuestions));
    });
    (0, node_test_1.test)('reconciliation is terminal and does not reschedule research', async () => {
        // No verify/red_team/reconciliation tasks should remain pending after completion.
        const pending = await Task_1.default.find({ executionId, status: { $in: ['pending', 'ready', 'running'] } });
        strict_1.default.equal(pending.length, 0, 'no tasks left running after completion');
        // And no research tasks were spawned by the graph.
        const researchTasks = await Task_1.default.find({ executionId, type: 'research' });
        strict_1.default.equal(researchTasks.length, 0, 'no research recursion from the Phase 4 graph');
    });
});
