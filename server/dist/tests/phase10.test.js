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
const Claim_1 = __importDefault(require("../models/Claim"));
const Evidence_1 = __importDefault(require("../models/Evidence"));
const VerificationResult_1 = __importDefault(require("../models/VerificationResult"));
const RedTeamFinding_1 = __importDefault(require("../models/RedTeamFinding"));
const ReconciliationResult_1 = __importDefault(require("../models/ReconciliationResult"));
const EvidenceRelationship_1 = __importDefault(require("../models/EvidenceRelationship"));
const ExecutionEvent_1 = __importDefault(require("../models/ExecutionEvent"));
const decisions_1 = __importDefault(require("../routes/decisions"));
const eventBus_1 = require("../decision/eventBus");
const TEST_URI = process.env.MONGODB_URI_TEST_PHASE10 || 'mongodb://localhost:27017/hathap_test_phase10';
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
        port,
        request: async (path, opts = {}) => {
            const headers = {};
            if (opts.token)
                headers.Authorization = `Bearer ${opts.token}`;
            headers['Content-Type'] = 'application/json';
            const res = await fetch(`http://127.0.0.1:${port}${path}`, {
                method: opts.method || 'GET',
                headers,
                body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
            });
            const text = await res.text();
            let json = {};
            try {
                json = text ? JSON.parse(text) : {};
            }
            catch {
                json = { raw: text };
            }
            return { status: res.status, body: json, text };
        },
    };
}
async function nullify() {
    await Promise.all([
        ExecutionEvent_1.default.deleteMany({}),
        EvidenceRelationship_1.default.deleteMany({}),
        ReconciliationResult_1.default.deleteMany({}),
        RedTeamFinding_1.default.deleteMany({}),
        VerificationResult_1.default.deleteMany({}),
        Claim_1.default.deleteMany({}),
        Evidence_1.default.deleteMany({}),
        Task_1.default.deleteMany({}),
        Execution_1.default.deleteMany({}),
        Decision_1.default.deleteMany({}),
    ]);
}
let userA;
let userB;
let server;
const reqA = (path, opts) => server.request(`/api/decisions${path}`, { token: tokenFor(userA), ...opts });
const reqB = (path, opts) => server.request(`/api/decisions${path}`, { token: tokenFor(userB), ...opts });
async function createDecisionFor(userId, title = 'SSE decision') {
    const res = await server.request('/api/decisions', {
        method: 'POST',
        token: tokenFor(userId),
        body: {
            title,
            objective: 'Should we adopt a phased rollout?',
            context: 'Internal rollout planning.',
        },
    });
    strict_1.default.equal(res.status, 201, `create decision failed: ${JSON.stringify(res.body)}`);
    return String(res.body._id || res.body.id);
}
/**
 * Read an SSE stream until each matcher (a predicate over a raw line) matches,
 * or the timeout fires. Returns the captured raw lines and whether the stream
 * closed on its own.
 */
async function readStreamUntil(url, token, matchers, timeoutMs, extraHeaders = {}) {
    return new Promise((resolve) => {
        const controller = new AbortController();
        const captured = [];
        const matched = new Array(matchers.length).fill(false);
        let buffer = '';
        let settled = false;
        const finish = (closed) => {
            if (settled)
                return;
            settled = true;
            controller.abort();
            resolve({ lines: captured, closed });
        };
        const timer = setTimeout(() => finish(false), timeoutMs);
        void (async () => {
            let res;
            try {
                res = await fetch(url, {
                    headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream', ...extraHeaders },
                    signal: controller.signal,
                });
            }
            catch {
                clearTimeout(timer);
                finish(false);
                return;
            }
            if (!res.body) {
                clearTimeout(timer);
                finish(false);
                return;
            }
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            while (true) {
                const chunk = await reader.read().catch(() => ({ done: true, value: undefined }));
                if (chunk.done) {
                    clearTimeout(timer);
                    finish(true);
                    return;
                }
                buffer += decoder.decode(chunk.value, { stream: true }).replace(/\r\n/g, '\n');
                captured.push(buffer);
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                for (const line of lines) {
                    for (let i = 0; i < matchers.length; i++) {
                        if (!matched[i] && matchers[i](line))
                            matched[i] = true;
                    }
                }
                if (matched.every(Boolean)) {
                    clearTimeout(timer);
                    finish(false);
                    return;
                }
            }
        })();
    });
}
(0, node_test_1.before)(async () => {
    await mongoose_1.default.connect(TEST_URI);
    server = await makeServer();
    userA = new mongoose_1.default.Types.ObjectId().toString();
    userB = new mongoose_1.default.Types.ObjectId().toString();
});
(0, node_test_1.afterEach)(async () => {
    await nullify();
});
(0, node_test_1.after)(async () => {
    await server.server.close();
    await mongoose_1.default.connection.close();
});
(0, node_test_1.describe)('Phase 10 — decision reports', () => {
    (0, node_test_1.test)('generates a markdown report for an owned decision', async () => {
        const decisionId = await createDecisionFor(userA, 'Report my rollout');
        await Evidence_1.default.create({
            decisionId,
            type: 'web',
            title: 'Industry survey',
            content: 'A majority of teams found staged rollouts reduced outages.',
            sourceType: 'web',
            sourceName: 'ExampleCorp Research',
            sourceReliability: 'medium',
            relevanceScore: 0.8,
            retrievedAt: new Date(),
        });
        await Claim_1.default.create({
            decisionId,
            agentId: 'analyst',
            text: 'Phased rollout reduces operational risk.',
            type: 'fact',
            status: 'proposed',
            evidenceIds: [],
        });
        await ReconciliationResult_1.default.create({
            decisionId,
            recommendation: 'Proceed with a phased rollout over six weeks.',
            rationale: 'Compound evidence and low regression risk favor phased adoption.',
            survivingClaimIds: ['c1'],
            rejectedClaimIds: [],
            uncertainClaimIds: [],
            unresolvedConflictIds: [],
            redTeamFindingIds: [],
            needsMoreResearch: false,
            createdAt: new Date(),
        });
        const res = await reqA(`/${decisionId}/report`);
        strict_1.default.equal(res.status, 200);
        strict_1.default.match(res.text || '', /^# Decision Report$/m);
        strict_1.default.match(res.text || '', /## 1\. Problem/m);
        strict_1.default.match(res.text || '', /## 2\. Recommendation/m);
        strict_1.default.match(res.text || '', /## 3\. Executive Summary/m);
        strict_1.default.match(res.text || '', /## 4\. Evidence/m);
        strict_1.default.match(res.text || '', /## 5\. Claims/m);
        strict_1.default.match(res.text || '', /## 6\. Verification/m);
        strict_1.default.match(res.text || '', /## 7\. Red Team Findings/m);
        strict_1.default.match(res.text || '', /## 8\. Reconciliation/m);
        strict_1.default.match(res.text || '', /## 9\. Models & Routing/m);
        strict_1.default.match(res.text || '', /## 10\. Cost & Usage/m);
        strict_1.default.match(res.text || '', /## 11\. Evaluation/m);
        strict_1.default.match(res.text || '', /## 12\. Provenance/m);
        strict_1.default.match(res.text || '', /Report my rollout/m);
        strict_1.default.match(res.text || '', /Proceed with a phased rollout over six weeks\./m);
        strict_1.default.match(res.text || '', /Phased rollout reduces operational risk\./m);
    });
    (0, node_test_1.test)('report is ownership-scoped (other user gets 404)', async () => {
        const decisionId = await createDecisionFor(userA);
        const res = await reqB(`/${decisionId}/report`);
        strict_1.default.equal(res.status, 404);
    });
    (0, node_test_1.test)('report never leaks secrets even when present in source documents', async () => {
        const decisionId = await createDecisionFor(userA, 'Secret-safe decision');
        await Evidence_1.default.create({
            decisionId,
            type: 'web',
            title: 'Source with embedded key',
            content: 'The service uses apiKey=sk-ABCDEF234567890123456789 and refresh_token 9f8e7d6c5b4a3829103847564758392019384756 directly.',
            sourceType: 'web',
            retrievedAt: new Date(),
        });
        await ExecutionEvent_1.default.create({
            type: 'agent.completed',
            decisionId,
            taskId: 't1',
            data: { apiKey: 'sk-ABCDEF234567890123456789', Authorization: 'Bearer 9f8e7d6c5b4a3829103847564758392019384756' },
        });
        const execution = await Execution_1.default.create({
            decisionId,
            status: 'completed',
            startedAt: new Date(),
            completedAt: new Date(),
            currentPhase: 'completed',
            progress: 100,
            totalTasks: 1,
            completedTasks: 1,
            tokenUsage: { totalTokens: 1200, model: 'gpt-4o', provider: 'openai' },
            estimatedCost: 0.012,
            actualCost: 0.012,
        });
        await Task_1.default.create({
            executionId: execution._id,
            type: 'debate',
            status: 'completed',
            priority: 1,
            metadata: {
                routing: {
                    selection: {
                        model: { modelName: 'gpt-4o', provider: 'openai' },
                        agent: { name: 'debater' },
                    },
                },
            },
        });
        const res = await reqA(`/${decisionId}/report`);
        strict_1.default.equal(res.status, 200);
        const md = res.text || '';
        strict_1.default.equal(md.includes('sk-ABCDEF234567890123456789'), false, 'api key leaked');
        strict_1.default.equal(md.includes('9f8e7d6c5b4a3829103847564758392019384756'), false, 'token leaked');
        strict_1.default.equal(md.includes('Authorization'), false, 'authorization header leaked');
        // Non-secret model info must still appear.
        strict_1.default.match(md, /gpt-4o \(openai\)/m);
    });
    (0, node_test_1.test)('report for a draft decision is produced honestly', async () => {
        const decisionId = await createDecisionFor(userA);
        const res = await reqA(`/${decisionId}/report`);
        strict_1.default.equal(res.status, 200);
        strict_1.default.match(res.text || '', /No recommendation has been produced yet/m);
        strict_1.default.match(res.text || '', /No execution has been run for this decision yet/m);
    });
    (0, node_test_1.test)('report prompts a download when ?download=1', async () => {
        const decisionId = await createDecisionFor(userA);
        const headers = { Authorization: `Bearer ${tokenFor(userA)}`, 'Content-Type': 'application/json' };
        const res = await fetch(`http://127.0.0.1:${server.port}/api/decisions/${decisionId}/report?download=1`, {
            headers,
        });
        strict_1.default.equal(res.status, 200);
        strict_1.default.match(res.headers.get('content-type') || '', /text\/markdown/);
        strict_1.default.match(res.headers.get('content-disposition') || '', /attachment/);
    });
});
(0, node_test_1.describe)('Phase 10 — SSE execution event stream', () => {
    (0, node_test_1.test)('rejects unauthenticated connections', async () => {
        const decisionId = await createDecisionFor(userA);
        const res = await server.request(`/api/decisions/${decisionId}/events/stream`);
        strict_1.default.equal(res.status, 401);
    });
    (0, node_test_1.test)('rejects connections to another user\'s decision (404)', async () => {
        const decisionId = await createDecisionFor(userA);
        const res = await server.request(`/api/decisions/${decisionId}/events/stream`, {
            token: tokenFor(userB),
        });
        strict_1.default.equal(res.status, 404);
    });
    (0, node_test_1.test)('streams connected handshake then live execution events to the owner', async () => {
        const decisionId = await createDecisionFor(userA);
        const stream = readStreamUntil(`http://127.0.0.1:${server.port}/api/decisions/${decisionId}/events/stream`, tokenFor(userA), [
            (l) => l.startsWith('event: stream.connected'),
            (l) => l.startsWith('event: execution-event'),
        ], 8000);
        // Wait briefly for the connected handshake to be flushed before emitting.
        await new Promise((r) => setTimeout(r, 400));
        eventBus_1.executionEventBus.emit({
            type: 'execution.queued',
            decisionId,
            executionId: new mongoose_1.default.Types.ObjectId().toString(),
        });
        const { lines } = await stream;
        strict_1.default.ok(lines.some((l) => l.includes('"type":"execution.queued"')), 'expected live execution.queued event to be streamed');
        strict_1.default.ok(lines.some((l) => l.includes('"replayCount"')), 'expected stream.connected payload with replayCount');
    });
    (0, node_test_1.test)('reconnects resume from Last-Event-ID (no duplicate replay)', async () => {
        const decisionId = await createDecisionFor(userA);
        const base = `http://127.0.0.1:${server.port}/api/decisions/${decisionId}/events/stream`;
        eventBus_1.executionEventBus.emit({ type: 'execution.queued', decisionId });
        // Let the async persistence land so the first stream replays it.
        await new Promise((r) => setTimeout(r, 300));
        const first = await readStreamUntil(base, tokenFor(userA), [(l) => l.includes('"type":"execution.queued"')], 6000);
        // Extract the SSE event id of the replayed event from the first stream.
        const idLine = first.lines
            .flatMap((b) => b.split('\n'))
            .find((l) => /^id: /.test(l));
        const lastEventId = Number(idLine ? idLine.replace('id: ', '') : 0);
        strict_1.default.ok(lastEventId > 0);
        eventBus_1.executionEventBus.emit({ type: 'task.created', taskId: 't-after-reconnect', decisionId });
        await new Promise((r) => setTimeout(r, 300));
        // Reconnect with Last-Event-ID: the older event must NOT be re-replayed,
        // but the newer one is.
        const second = await readStreamUntil(base, tokenFor(userA), [(l) => l.includes('"type":"task.created"')], 6000, { 'last-event-id': String(lastEventId) });
        const secondRaw = second.lines.join('\n');
        strict_1.default.ok(secondRaw.includes('"type":"task.created"'), 'expected the newer event after resume');
        strict_1.default.equal(secondRaw.includes('"type":"execution.queued"'), false, 'older event should be skipped by Last-Event-ID resume');
    });
    (0, node_test_1.test)('keeps the stream alive with heartbeats', async () => {
        const decisionId = await createDecisionFor(userA);
        const { lines, closed } = await readStreamUntil(`http://127.0.0.1:${server.port}/api/decisions/${decisionId}/events/stream`, tokenFor(userA), [(l) => l === ': keepalive'], 20000);
        strict_1.default.equal(closed, false, 'stream should still be open when keepalive arrives');
        strict_1.default.ok(lines.some((l) => l.includes(': keepalive')), 'expected keepalive comment');
    });
    (0, node_test_1.test)('server keeps working after a stream is closed (listener cleanup)', async () => {
        const decisionId = await createDecisionFor(userA);
        const base = `http://127.0.0.1:${server.port}/api/decisions/${decisionId}/events/stream`;
        const controller = new AbortController();
        const res = await fetch(base, {
            headers: { Authorization: `Bearer ${tokenFor(userA)}` },
            signal: controller.signal,
        });
        // Read a bit, then abort (simulates the client navigating away).
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        await reader.read();
        controller.abort();
        await new Promise((r) => setTimeout(r, 200));
        // Emitting after close must not throw and a fresh subscriber still works.
        eventBus_1.executionEventBus.emit({ type: 'execution.completed', decisionId });
        await new Promise((r) => setTimeout(r, 300));
        const second = await readStreamUntil(base, tokenFor(userA), [(l) => l.includes('"type":"execution.completed"')], 6000);
        strict_1.default.ok(second.lines.join('\n').includes('"type":"execution.completed"'), 'stream should still work after a prior disconnect');
    });
});
