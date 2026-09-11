"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const express_1 = __importDefault(require("express"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const mongoose_1 = __importDefault(require("mongoose"));
const Decision_1 = __importDefault(require("../models/Decision"));
const Execution_1 = __importDefault(require("../models/Execution"));
const Task_1 = __importDefault(require("../models/Task"));
const ExecutionEvent_1 = __importDefault(require("../models/ExecutionEvent"));
const decisions_1 = __importDefault(require("../routes/decisions"));
const eventBus_1 = require("../decision/eventBus");
const TEST_URI = process.env.MONGODB_URI_TEST_INTELLIGENCE || 'mongodb://localhost:27017/hathap_test_intelligence';
const JWT_SECRET = process.env.JWT_SECRET || 'secret';
function tokenFor(id) {
    return jsonwebtoken_1.default.sign({ id }, JWT_SECRET);
}
async function makeServer() {
    const app = (0, express_1.default)();
    app.use(express_1.default.json());
    app.use('/api/decisions', decisions_1.default);
    const server = await new Promise((resolve) => {
        const s = app.listen(0, () => resolve(s));
    });
    const port = server.address().port;
    return {
        server,
        request: async (path, opts = {}) => {
            const headers = {};
            if (opts.token)
                headers.Authorization = `Bearer ${opts.token}`;
            const res = await fetch(`http://127.0.0.1:${port}${path}`, {
                method: opts.method || 'GET',
                headers,
            });
            const text = await res.text();
            let json = {};
            try {
                json = text ? JSON.parse(text) : {};
            }
            catch {
                json = { raw: text };
            }
            return { status: res.status, body: json };
        },
    };
}
async function waitFor(predicate, timeoutMs = 4000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        if (await predicate())
            return;
        await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error('waitFor timed out');
}
let userA;
let userB;
let server;
let ownedDecisionId;
let ownedExecutionId;
let otherDecisionId;
(0, node_test_1.before)(async () => {
    if (mongoose_1.default.connection.readyState === 0) {
        await mongoose_1.default.connect(TEST_URI);
    }
    await Promise.all([
        ExecutionEvent_1.default.deleteMany({}),
        Task_1.default.deleteMany({}),
        Execution_1.default.deleteMany({}),
        Decision_1.default.deleteMany({}),
    ]);
    userA = new mongoose_1.default.Types.ObjectId().toString();
    userB = new mongoose_1.default.Types.ObjectId().toString();
    const ownedDecision = await Decision_1.default.create({
        userId: userA,
        title: 'Intelligence view',
        objective: 'Understand the decision',
        status: 'debating',
        currentPhase: 'debating',
        configuration: { strategy: 'consensus' },
    });
    ownedDecisionId = ownedDecision._id.toString();
    const execution = await Execution_1.default.create({
        decisionId: ownedDecisionId,
        status: 'running',
        progress: 40,
        currentPhase: 'debating',
    });
    ownedExecutionId = execution._id.toString();
    const otherDecision = await Decision_1.default.create({
        userId: userB,
        title: 'Other user decision',
        objective: 'Should not leak',
        status: 'draft',
        configuration: { strategy: 'consensus' },
    });
    otherDecisionId = otherDecision._id.toString();
    server = await makeServer();
});
(0, node_test_1.after)(async () => {
    server.server.close();
    await Promise.all([
        ExecutionEvent_1.default.deleteMany({}),
        Task_1.default.deleteMany({}),
        Execution_1.default.deleteMany({}),
        Decision_1.default.deleteMany({}),
    ]);
    await mongoose_1.default.connection.close();
});
(0, node_test_1.describe)('GET /api/decisions/:id/events (decision intelligence timeline)', () => {
    (0, node_test_1.test)('returns orderable, structured events for the owned decision', async () => {
        eventBus_1.executionEventBus.emit({
            type: 'execution.started',
            decisionId: ownedDecisionId,
            executionId: ownedExecutionId,
            data: { phase: 'debating' },
        });
        eventBus_1.executionEventBus.emit({
            type: 'task.completed',
            decisionId: ownedDecisionId,
            executionId: ownedExecutionId,
            taskId: '507f1f77bcf86cd799439011',
            data: { phase: 'debating' },
        });
        eventBus_1.executionEventBus.emit({
            type: 'research.completed',
            decisionId: ownedDecisionId,
            executionId: ownedExecutionId,
            data: { phase: 'investigating' },
        });
        await waitFor(async () => {
            const count = await ExecutionEvent_1.default.countDocuments({ decisionId: ownedDecisionId });
            return count >= 3;
        });
        const res = await server.request(`/api/decisions/${ownedDecisionId}/events`, {
            token: tokenFor(userA),
        });
        strict_1.default.equal(res.status, 200);
        strict_1.default.ok(Array.isArray(res.body), 'events should be an array');
        strict_1.default.ok(res.body.length >= 3, 'should contain emitted events');
        const executionStarted = res.body.find((e) => e.type === 'execution.started');
        strict_1.default.ok(executionStarted, 'execution.started event present');
        strict_1.default.equal(executionStarted.decisionId, ownedDecisionId);
        strict_1.default.equal(executionStarted.executionId, ownedExecutionId);
        strict_1.default.ok(!('apiKey' in (executionStarted.data || {})) &&
            !('api_key' in (executionStarted.data || {})), 'no credentials leak through event data');
        // Deterministic ordering by timestamp.
        const timestamps = res.body.map((e) => new Date(e.createdAt).getTime());
        const sorted = [...timestamps].sort((a, b) => a - b);
        strict_1.default.deepEqual(timestamps, sorted, 'events must be returned in timestamp order');
    });
    (0, node_test_1.test)('rejects cross-user access with 404', async () => {
        const res = await server.request(`/api/decisions/${ownedDecisionId}/events`, {
            token: tokenFor(userB),
        });
        strict_1.default.equal(res.status, 404);
    });
    (0, node_test_1.test)('returns 404 for nonexistent decision', async () => {
        const res = await server.request(`/api/decisions/${new mongoose_1.default.Types.ObjectId().toString()}/events`, { token: tokenFor(userA) });
        strict_1.default.equal(res.status, 404);
    });
    (0, node_test_1.test)('other user cannot read events belonging to a different decision', async () => {
        const res = await server.request(`/api/decisions/${otherDecisionId}/events`, {
            token: tokenFor(userA),
        });
        strict_1.default.equal(res.status, 404);
    });
});
