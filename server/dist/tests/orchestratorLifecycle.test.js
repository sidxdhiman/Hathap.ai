"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const mongoose_1 = __importDefault(require("mongoose"));
const stateMachine_1 = require("../decision/stateMachine");
const orchestrator_1 = require("../decision/orchestrator");
const Decision_1 = __importDefault(require("../models/Decision"));
const Execution_1 = __importDefault(require("../models/Execution"));
const Task_1 = __importDefault(require("../models/Task"));
const Claim_1 = __importDefault(require("../models/Claim"));
const Evidence_1 = __importDefault(require("../models/Evidence"));
const TEST_URI = process.env.MONGODB_URI_TEST || 'mongodb://localhost:27017/hathap_test';
let userId;
let decisionId;
(0, node_test_1.before)(async () => {
    if (mongoose_1.default.connection.readyState === 0) {
        await mongoose_1.default.connect(TEST_URI);
    }
    await Promise.all([
        Decision_1.default.deleteMany({}),
        Execution_1.default.deleteMany({}),
        Task_1.default.deleteMany({}),
        Claim_1.default.deleteMany({}),
        Evidence_1.default.deleteMany({}),
    ]);
    userId = new mongoose_1.default.Types.ObjectId().toString();
});
(0, node_test_1.after)(async () => {
    await Promise.all([
        Decision_1.default.deleteMany({}),
        Execution_1.default.deleteMany({}),
        Task_1.default.deleteMany({}),
        Claim_1.default.deleteMany({}),
        Evidence_1.default.deleteMany({}),
    ]);
    await mongoose_1.default.connection.close();
});
(0, node_test_1.describe)('Decision lifecycle (persistent)', () => {
    (0, node_test_1.test)('createDecision persists a draft decision with evidence', async () => {
        const decision = await orchestrator_1.decisionOrchestrator.createDecision({
            userId,
            title: 'Test Decision',
            objective: 'Should we adopt microservices?',
            context: 'Evaluating architecture.',
            configuration: { strategy: 'consensus', maxRounds: 2 },
        });
        strict_1.default.ok(decision._id, 'decision should have an id');
        strict_1.default.equal(decision.status, 'draft');
        strict_1.default.equal(decision.configuration?.strategy, 'consensus');
        decisionId = decision._id.toString();
        const saved = await Decision_1.default.findById(decisionId);
        strict_1.default.ok(saved, 'decision should be persisted');
        strict_1.default.equal(saved.status, 'draft');
        const evidence = await Evidence_1.default.find({ decisionId });
        strict_1.default.equal(evidence.length, 1, 'objective evidence should be recorded');
        strict_1.default.equal(evidence[0].sourceType, 'user_input');
    });
    (0, node_test_1.test)('startDecision transitions to debating and persists execution', async () => {
        // Note: without agents/models configured, startDebate will fail.
        // This tests that a failed execution is persisted and decision marked failed,
        // demonstrating recoverable partial failure.
        await strict_1.default.rejects(() => orchestrator_1.decisionOrchestrator.startDecision(decisionId, userId), /No valid agent participants|No models configured/);
        const decision = await Decision_1.default.findById(decisionId);
        strict_1.default.ok(decision, 'decision should exist');
        strict_1.default.equal(decision.status, 'failed', 'decision marked failed after failed run');
        const executions = await Execution_1.default.find({ decisionId });
        strict_1.default.ok(executions.length >= 1, 'an execution record should exist');
        const exec = executions[0];
        strict_1.default.equal(exec.status, 'failed');
        strict_1.default.ok(exec.error, 'execution should carry error info');
        strict_1.default.equal(exec.error.code, 'AGENT_FAILURE');
    });
    (0, node_test_1.test)('getSnapshot returns full decision state', async () => {
        const snapshot = await orchestrator_1.decisionOrchestrator.getSnapshot(decisionId, userId);
        strict_1.default.equal(snapshot.id, decisionId);
        strict_1.default.ok(Array.isArray(snapshot.executions));
        strict_1.default.ok(Array.isArray(snapshot.tasks));
        strict_1.default.ok(Array.isArray(snapshot.claims));
        strict_1.default.ok(Array.isArray(snapshot.evidence));
    });
    (0, node_test_1.test)('decision state machine prevents invalid transitions', () => {
        strict_1.default.throws(() => stateMachine_1.StateMachine.transitionDecision('completed', 'debating'), /Invalid state transition/);
    });
});
(0, node_test_1.describe)('Task lifecycle helpers', () => {
    (0, node_test_1.test)('execution can represent partial results', async () => {
        const exec = await Execution_1.default.create({
            decisionId,
            status: 'partial',
            startedAt: new Date(),
            currentPhase: 'debating',
            progress: 50,
        });
        strict_1.default.equal(exec.status, 'partial');
        strict_1.default.equal(exec.progress, 50);
        await exec.deleteOne();
    });
});
