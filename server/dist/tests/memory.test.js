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
const Claim_1 = __importDefault(require("../models/Claim"));
const Evidence_1 = __importDefault(require("../models/Evidence"));
const ReconciliationResult_1 = __importDefault(require("../models/ReconciliationResult"));
const ExecutionEvent_1 = __importDefault(require("../models/ExecutionEvent"));
const DecisionMemory_1 = __importDefault(require("../models/DecisionMemory"));
const Outcome_1 = __importDefault(require("../models/Outcome"));
const DecisionFeedback_1 = __importDefault(require("../models/DecisionFeedback"));
const DecisionLesson_1 = __importDefault(require("../models/DecisionLesson"));
const decisions_1 = __importDefault(require("../routes/decisions"));
const decisionMemoryService_1 = require("../memory/decisionMemoryService");
const decisionRetrievalService_1 = require("../memory/decisionRetrievalService");
const memoryContextBuilder_1 = require("../memory/memoryContextBuilder");
const memoryPolicy_1 = require("../memory/memoryPolicy");
const TEST_URI = process.env.MONGODB_URI_TEST_MEMORY || 'mongodb://localhost:27017/hathap_test_memory';
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
async function nullify() {
    await Promise.all([
        DecisionMemory_1.default.deleteMany({}),
        Outcome_1.default.deleteMany({}),
        DecisionFeedback_1.default.deleteMany({}),
        DecisionLesson_1.default.deleteMany({}),
        ExecutionEvent_1.default.deleteMany({}),
        ReconciliationResult_1.default.deleteMany({}),
        Claim_1.default.deleteMany({}),
        Evidence_1.default.deleteMany({}),
        Decision_1.default.deleteMany({}),
    ]);
}
let userA;
let userB;
let server;
let currentAId;
let histA1Id;
let histA2Id;
let histA3Id;
let freshCompletedId;
let freshDraftId;
let deleteMeId;
let histB1Id;
const meta = (category, tags) => ({
    category,
    domain: 'software',
    problemType: 'adoption',
    tags,
    entities: ['payments-svc'],
});
(0, node_test_1.before)(async () => {
    if (mongoose_1.default.connection.readyState === 0) {
        await mongoose_1.default.connect(TEST_URI);
    }
    await nullify();
    userA = new mongoose_1.default.Types.ObjectId().toString();
    userB = new mongoose_1.default.Types.ObjectId().toString();
    const currentA = await Decision_1.default.create({
        userId: userA,
        title: 'Current decision',
        objective: 'Should we adopt microservices now?',
        context: 'The current decision being acted on.',
        status: 'completed',
        completedAt: new Date(),
        metadata: meta('technology', ['microservices']),
    });
    currentAId = currentA._id.toString();
    const a1 = await Decision_1.default.create({
        userId: userA,
        title: 'Past microservices adoption',
        objective: 'Should we adopt microservices?',
        context: 'Historical decision about microservices.',
        status: 'completed',
        completedAt: new Date(),
        metadata: meta('technology', ['microservices']),
    });
    histA1Id = a1._id.toString();
    const claim = await Claim_1.default.create({
        decisionId: histA1Id,
        executionId: new mongoose_1.default.Types.ObjectId(),
        taskId: new mongoose_1.default.Types.ObjectId(),
        text: 'Microservices reduce deployment coupling.',
        type: 'fact',
        status: 'accepted',
        evidenceIds: [],
        supportingEvidenceIds: [],
        provenanceKind: 'inferred',
    });
    const evidence = await Evidence_1.default.create({
        decisionId: histA1Id,
        executionId: new mongoose_1.default.Types.ObjectId(),
        taskId: new mongoose_1.default.Types.ObjectId(),
        type: 'text',
        title: 'Deployment coupling study',
        content: 'Study of coupling across teams.',
        sourceUrl: 'https://example.com/study',
        sourceType: 'user_input',
        relevanceScore: 0.9,
        sourceReliability: 'high',
        provenanceKind: 'inferred',
    });
    await ReconciliationResult_1.default.create({
        decisionId: histA1Id,
        executionId: new mongoose_1.default.Types.ObjectId(),
        status: 'completed',
        recommendation: 'Adopt incrementally.',
        survivingClaimIds: [claim._id.toString()],
        rejectedClaimIds: [],
        uncertainClaimIds: [],
        redTeamFindingIds: [],
        needsMoreResearch: false,
        rationale: 'Evidence supports incremental adoption.',
    });
    await Outcome_1.default.create({
        userId: userA,
        decisionId: histA1Id,
        kind: 'actual',
        status: 'success',
        description: 'Adopted for two services first.',
        source: 'human',
        observedAt: new Date(),
    });
    await DecisionFeedback_1.default.create({
        userId: userA,
        decisionId: histA1Id,
        recommendationStatus: 'accepted',
        reason: 'Followed the recommendation.',
    });
    await DecisionLesson_1.default.create({
        userId: userA,
        decisionId: histA1Id,
        text: 'Start with two services.',
        source: 'human',
        status: 'confirmed',
        metricName: 'time-to-deploy',
        evidenceIds: [evidence._id.toString()],
    });
    const a2 = await Decision_1.default.create({
        userId: userA,
        title: 'Past cloud migration',
        objective: 'Should we migrate to cloud?',
        context: 'Historical decision about cloud.',
        status: 'completed',
        completedAt: new Date(),
        metadata: meta('technology', ['cloud']),
    });
    histA2Id = a2._id.toString();
    const a3 = await Decision_1.default.create({
        userId: userA,
        title: 'In-flight microservices topic',
        objective: 'In-flight decision - must never surface as history.',
        status: 'draft',
        metadata: meta('technology', ['microservices']),
    });
    histA3Id = a3._id.toString();
    const fresh = await Decision_1.default.create({
        userId: userA,
        title: 'Fresh completed decision',
        objective: 'Should we keep batch jobs?',
        status: 'completed',
        completedAt: new Date(),
        metadata: meta('data-engineering', ['batch']),
    });
    freshCompletedId = fresh._id.toString();
    const freshDraft = await Decision_1.default.create({
        userId: userA,
        title: 'Fresh draft decision',
        objective: 'Draft - never gets memory fabricated.',
        status: 'draft',
        metadata: meta('data-engineering', ['batch']),
    });
    freshDraftId = freshDraft._id.toString();
    const b1 = await Decision_1.default.create({
        userId: userB,
        title: "Other user's private microservices plan",
        objective: 'Private decision.',
        status: 'completed',
        completedAt: new Date(),
        metadata: meta('technology', ['microservices']),
    });
    histB1Id = b1._id.toString();
    // A second completed decision for userB so they have something to retrieve
    // (histB1 is excluded when used as the current decision).
    const b2 = await Decision_1.default.create({
        userId: userB,
        title: "Other user's secondary plan",
        objective: 'Secondary private decision.',
        status: 'completed',
        completedAt: new Date(),
        metadata: meta('technology', ['cloud']),
    });
    await decisionMemoryService_1.decisionMemoryService.createForDecision(b2._id.toString(), userB, { via: 'completion' });
    const deleteMe = await Decision_1.default.create({
        userId: userA,
        title: 'Doomed decision',
        objective: 'This decision will be deleted.',
        status: 'completed',
        completedAt: new Date(),
        metadata: meta('technology', []),
    });
    deleteMeId = deleteMe._id.toString();
    for (const id of [currentAId, histA1Id, histA2Id, histB1Id, deleteMeId]) {
        const owner = id === histB1Id ? userB : userA;
        await decisionMemoryService_1.decisionMemoryService.createForDecision(id, owner, { via: 'completion' });
    }
    server = await makeServer();
});
(0, node_test_1.after)(async () => {
    server.server.close();
    await nullify();
    await mongoose_1.default.connection.close();
});
(0, node_test_1.describe)('DecisionMemoryService - index building', () => {
    (0, node_test_1.test)('createForDecision is idempotent and copies references, never content', async () => {
        const again = await decisionMemoryService_1.decisionMemoryService.createForDecision(histA1Id, userA, { via: 'completion' });
        strict_1.default.ok(again);
        strict_1.default.equal(await DecisionMemory_1.default.countDocuments({ decisionId: histA1Id }), 1);
        await waitFor(async () => (await ExecutionEvent_1.default.countDocuments({ type: 'memory.created', decisionId: histA1Id })) === 1);
        const memory = await DecisionMemory_1.default.findOne({ decisionId: histA1Id });
        strict_1.default.ok(memory);
        strict_1.default.equal(memory.status, 'completed');
        strict_1.default.equal(memory.createdVia, 'completion');
        strict_1.default.equal(String(memory.finalRecommendation), 'Adopt incrementally.');
        strict_1.default.equal(memory.recommendationSource, 'reconciliation');
        strict_1.default.deepEqual(memory.tags, ['microservices']);
        strict_1.default.equal(memory.category, 'technology');
        strict_1.default.equal(memory.importantClaimIds.length, 1);
        strict_1.default.ok(memory.importantEvidenceIds.length > 0, 'key evidence referenced');
        strict_1.default.ok(memory.completedAt instanceof Date);
        strict_1.default.ok(memory.finalRecommendation.length > 10, 'recommendation text retained');
    });
    (0, node_test_1.test)('ensureMemory returns null for in-flight decisions (no fabricated history)', async () => {
        strict_1.default.equal(await decisionMemoryService_1.decisionMemoryService.ensureMemory(histA3Id, userA), null);
        strict_1.default.equal(await decisionMemoryService_1.decisionMemoryService.ensureMemory(freshDraftId, userA), null);
    });
    (0, node_test_1.test)('ensureMemory builds on-demand memory for a terminal decision that predates Phase 8', async () => {
        strict_1.default.equal(await DecisionMemory_1.default.countDocuments({ decisionId: freshCompletedId }), 0);
        const built = await decisionMemoryService_1.decisionMemoryService.ensureMemory(freshCompletedId, userA);
        strict_1.default.ok(built, 'memory built on-demand');
        strict_1.default.equal(built.status, 'completed');
        strict_1.default.equal(built.createdVia, 'on-demand');
        strict_1.default.equal(await DecisionMemory_1.default.countDocuments({ decisionId: freshCompletedId }), 1);
    });
    (0, node_test_1.test)('ownership: another user cannot see or build a memory they do not own', async () => {
        strict_1.default.equal(await decisionMemoryService_1.decisionMemoryService.find(histA1Id, userB), null);
        strict_1.default.equal(await decisionMemoryService_1.decisionMemoryService.createForDecision(currentAId, userB, { via: 'on-demand' }), null);
    });
});
(0, node_test_1.describe)('GET /api/decisions/:id/memory', () => {
    (0, node_test_1.test)('returns memory, outcomes, feedback, lessons and quality for an owned decision', async () => {
        const res = await server.request(`/api/decisions/${currentAId}/memory`, { token: tokenFor(userA) });
        strict_1.default.equal(res.status, 200);
        strict_1.default.ok(res.body.memory, 'memory record present');
        strict_1.default.equal(res.body.memory.status, 'completed');
        strict_1.default.ok(res.body.quality, 'quality signals present');
    });
    (0, node_test_1.test)('enriches a rich history with confirmed outcome + accepted feedback + lesson', async () => {
        const res = await server.request(`/api/decisions/${histA1Id}/memory`, { token: tokenFor(userA) });
        strict_1.default.equal(res.status, 200);
        strict_1.default.equal(res.body.outcomes.length, 1);
        strict_1.default.equal(res.body.outcomes[0].status, 'success');
        strict_1.default.equal(res.body.outcomes[0].source, 'human');
        strict_1.default.equal(res.body.feedback.recommendationStatus, 'accepted');
        strict_1.default.equal(res.body.lessons.length, 1);
        strict_1.default.equal(res.body.lessons[0].status, 'confirmed');
        const q = res.body.quality;
        strict_1.default.equal(q.recommendationAccepted, true);
        strict_1.default.equal(q.outcomeAchieved, true);
        strict_1.default.equal(q.outcomeConfirmed, true);
        strict_1.default.equal(q.hasHumanFeedback, true);
        strict_1.default.equal(q.expectedVsActualComputed, false);
    });
    (0, node_test_1.test)('rejects cross-user and nonexistent access with 404', async () => {
        const cross = await server.request(`/api/decisions/${currentAId}/memory`, { token: tokenFor(userB) });
        strict_1.default.equal(cross.status, 404);
        const missing = await server.request(`/api/decisions/${new mongoose_1.default.Types.ObjectId().toString()}/memory`, {
            token: tokenFor(userA),
        });
        strict_1.default.equal(missing.status, 404);
    });
});
(0, node_test_1.describe)('Outcomes API', () => {
    (0, node_test_1.test)('POST expected defaults to pending; actual defaults to unknown', async () => {
        const exp = await server.request(`/api/decisions/${currentAId}/outcomes`, {
            method: 'POST',
            token: tokenFor(userA),
            body: { kind: 'expected', description: 'Migration completes in one quarter.' },
        });
        strict_1.default.equal(exp.status, 201);
        strict_1.default.equal(exp.body.kind, 'expected');
        strict_1.default.equal(exp.body.status, 'pending');
        strict_1.default.equal(exp.body.source, 'human');
        const act = await server.request(`/api/decisions/${currentAId}/outcomes`, {
            method: 'POST',
            token: tokenFor(userA),
            body: { kind: 'actual', description: 'Two services migrated in one quarter.' },
        });
        strict_1.default.equal(act.status, 201);
        strict_1.default.equal(act.body.kind, 'actual');
        strict_1.default.equal(act.body.status, 'unknown');
    });
    (0, node_test_1.test)('POST validates payload and status values', async () => {
        const noDesc = await server.request(`/api/decisions/${currentAId}/outcomes`, {
            method: 'POST',
            token: tokenFor(userA),
            body: { kind: 'expected' },
        });
        strict_1.default.equal(noDesc.status, 400);
        const badStatus = await server.request(`/api/decisions/${currentAId}/outcomes`, {
            method: 'POST',
            token: tokenFor(userA),
            body: { kind: 'actual', description: 'x', status: 'definitely' },
        });
        strict_1.default.equal(badStatus.status, 400);
    });
    (0, node_test_1.test)('PATCH records a later status transition (success is explicit, never assumed)', async () => {
        const list = await server.request(`/api/decisions/${currentAId}/outcomes`, { token: tokenFor(userA) });
        const actual = list.body.outcomes.find((o) => o.kind === 'actual');
        strict_1.default.ok(actual, 'actual outcome exists');
        const patched = await server.request(`/api/decisions/${currentAId}/outcomes/${actual._id}`, {
            method: 'PATCH',
            token: tokenFor(userA),
            body: { status: 'success' },
        });
        strict_1.default.equal(patched.status, 200);
        strict_1.default.equal(patched.body.status, 'success');
    });
    (0, node_test_1.test)('expected-vs-actual computes variance and achieved state from paired metrics', async () => {
        await server.request(`/api/decisions/${currentAId}/outcomes`, {
            method: 'POST',
            token: tokenFor(userA),
            body: {
                kind: 'expected',
                description: 'Cost below target.',
                metrics: [{ name: 'cost', target: 100, direction: 'decrease' }],
            },
        });
        const actualRes = await server.request(`/api/decisions/${currentAId}/outcomes`, {
            method: 'POST',
            token: tokenFor(userA),
            body: {
                kind: 'actual',
                description: 'Cost came in at 80.',
                metrics: [{ name: 'cost', actual: 80, direction: 'decrease' }],
            },
        });
        strict_1.default.equal(actualRes.status, 201);
        const list = await server.request(`/api/decisions/${currentAId}/outcomes`, { token: tokenFor(userA) });
        const cmp = list.body.expectedVsActual.metricComparisons.find((c) => c.metricName === 'cost');
        strict_1.default.ok(cmp, 'cost comparison produced');
        strict_1.default.equal(cmp.meaningful, true);
        strict_1.default.equal(cmp.variance, -20);
        strict_1.default.equal(cmp.variancePct, -20);
        strict_1.default.equal(cmp.achieved, true, 'decrease target under-run counts as achieved');
        strict_1.default.equal(list.body.expectedVsActual.qualityComputed, true);
    });
    (0, node_test_1.test)('cross-user outcome access is a 404; list is ownership-scoped', async () => {
        const list = await server.request(`/api/decisions/${currentAId}/outcomes`, { token: tokenFor(userB) });
        strict_1.default.equal(list.status, 404);
        const own = await server.request(`/api/decisions/${currentAId}/outcomes`, { token: tokenFor(userA) });
        strict_1.default.ok(Array.isArray(own.body.outcomes));
        strict_1.default.ok(own.body.outcomes.length >= 3, 'all recorded outcomes returned');
    });
});
(0, node_test_1.describe)('Feedback API', () => {
    (0, node_test_1.test)('POST creates feedback; a second POST upserts the single record', async () => {
        const first = await server.request(`/api/decisions/${currentAId}/feedback`, {
            method: 'POST',
            token: tokenFor(userA),
            body: { recommendationStatus: 'modified', reason: 'Adjusted scope.' },
        });
        strict_1.default.equal(first.status, 201);
        strict_1.default.equal(first.body.recommendationStatus, 'modified');
        const second = await server.request(`/api/decisions/${currentAId}/feedback`, {
            method: 'POST',
            token: tokenFor(userA),
            body: { recommendationStatus: 'accepted', comment: 'Go.' },
        });
        strict_1.default.equal(second.status, 201);
        strict_1.default.equal(second.body.recommendationStatus, 'accepted');
        strict_1.default.equal(second.body._id, first.body._id, 'same feedback record, upserted');
        strict_1.default.equal(await DecisionFeedback_1.default.countDocuments({ decisionId: currentAId }), 1);
        const get = await server.request(`/api/decisions/${currentAId}/feedback`, { token: tokenFor(userA) });
        strict_1.default.equal(get.body.recommendationStatus, 'accepted');
    });
    (0, node_test_1.test)('a rejected decision is a human statement, not an automatic model-failure', async () => {
        const before = await Decision_1.default.findOne({ _id: currentAId });
        const rejected = await server.request(`/api/decisions/${currentAId}/feedback`, {
            method: 'POST',
            token: tokenFor(userA),
            body: { recommendationStatus: 'rejected', reason: 'Budget priority shifted.' },
        });
        strict_1.default.equal(rejected.status, 201);
        strict_1.default.equal(rejected.body.recommendationStatus, 'rejected');
        const after = await Decision_1.default.findOne({ _id: currentAId });
        strict_1.default.equal(after.status, 'completed', 'decision status untouched by rejection');
        void before;
    });
    (0, node_test_1.test)('invalid recommendationStatus is rejected', async () => {
        const res = await server.request(`/api/decisions/${currentAId}/feedback`, {
            method: 'POST',
            token: tokenFor(userA),
            body: { recommendationStatus: 'nope' },
        });
        strict_1.default.equal(res.status, 400);
    });
    (0, node_test_1.test)('cross-user feedback submission is a 404', async () => {
        const res = await server.request(`/api/decisions/${currentAId}/feedback`, {
            method: 'POST',
            token: tokenFor(userB),
            body: { recommendationStatus: 'accepted' },
        });
        strict_1.default.equal(res.status, 404);
    });
});
(0, node_test_1.describe)('Lessons API', () => {
    (0, node_test_1.test)('a human lesson is created already confirmed (the act of writing confirms it)', async () => {
        const res = await server.request(`/api/decisions/${currentAId}/lessons`, {
            method: 'POST',
            token: tokenFor(userA),
            body: { text: 'Validate cost estimates earlier.', source: 'human' },
        });
        strict_1.default.equal(res.status, 201);
        strict_1.default.equal(res.body.source, 'human');
        strict_1.default.equal(res.body.status, 'confirmed');
    });
    (0, node_test_1.test)('an LLM suggestion can never be created as confirmed', async () => {
        const res = await server.request(`/api/decisions/${currentAId}/lessons`, {
            method: 'POST',
            token: tokenFor(userA),
            body: { text: 'Always document rollback plans.', source: 'llm_suggestion', status: 'confirmed' },
        });
        strict_1.default.equal(res.status, 400);
    });
    (0, node_test_1.test)('an LLM suggestion starts unconfirmed and a human PATCH later confirms it', async () => {
        const created = await server.request(`/api/decisions/${currentAId}/lessons`, {
            method: 'POST',
            token: tokenFor(userA),
            body: { text: 'Document rollback plans.', source: 'llm_suggestion' },
        });
        strict_1.default.equal(created.status, 201);
        strict_1.default.equal(created.body.source, 'llm_suggestion');
        strict_1.default.equal(created.body.status, 'unconfirmed', 'suggestion starts unconfirmed');
        const patched = await server.request(`/api/decisions/${currentAId}/lessons/${created.body._id}`, {
            method: 'PATCH',
            token: tokenFor(userA),
            body: { status: 'confirmed' },
        });
        strict_1.default.equal(patched.status, 200);
        strict_1.default.equal(patched.body.status, 'confirmed', 'human confirmation via PATCH is the documented path');
    });
    (0, node_test_1.test)('invalid lesson payload is rejected', async () => {
        const res = await server.request(`/api/decisions/${currentAId}/lessons`, {
            method: 'POST',
            token: tokenFor(userA),
            body: { text: '' },
        });
        strict_1.default.equal(res.status, 400);
    });
    (0, node_test_1.test)('cross-user lesson writes are a 404', async () => {
        const res = await server.request(`/api/decisions/${currentAId}/lessons`, {
            method: 'POST',
            token: tokenFor(userB),
            body: { text: 'nope', source: 'human' },
        });
        strict_1.default.equal(res.status, 404);
    });
});
(0, node_test_1.describe)('Retrieval (related decisions)', () => {
    (0, node_test_1.test)('returns only terminal, same-user, non-current decisions, sorted by relevance', async () => {
        const res = await server.request(`/api/decisions/${currentAId}/related`, { token: tokenFor(userA) });
        strict_1.default.equal(res.status, 200);
        const titles = res.body.memories.map((m) => m.title);
        strict_1.default.ok(titles.includes('Past microservices adoption'), 'strong match by tags + category');
        strict_1.default.ok(titles.includes('Past cloud migration'), 'category-only match above minimum relevance');
        strict_1.default.ok(!titles.includes('In-flight microservices topic'), 'draft/in-flight decisions never surface');
        strict_1.default.ok(!titles.includes("Other user's private microservices plan"), 'never leaks another user');
        strict_1.default.ok(!titles.includes('Current decision'), 'current decision is excluded');
        for (const m of res.body.memories) {
            strict_1.default.ok(m.relevance >= 0.08, `relevance above minimum (got ${m.relevance})`);
            strict_1.default.ok(Array.isArray(m.relatedBecause) && m.relatedBecause.length > 0, 'explainable reasons present');
            strict_1.default.ok(m.relatedBecause.every((r) => typeof r === 'string' && r.length > 0));
        }
        strict_1.default.equal(res.body.memories[0].title, 'Past microservices adoption', 'most relevant first');
        strict_1.default.equal(res.body.policyVersion, 'memory-policy-v1');
        strict_1.default.equal(res.body.provider, 'structured');
    });
    (0, node_test_1.test)('outcome/lesson/feedback metadata is surfaced so consumers can judge reliability', async () => {
        const res = await server.request(`/api/decisions/${currentAId}/related`, { token: tokenFor(userA) });
        const a1 = res.body.memories.find((m) => m.title === 'Past microservices adoption');
        strict_1.default.ok(a1, 'rich memory returned');
        strict_1.default.ok(a1.outcome, 'outcome envelope present');
        strict_1.default.equal(a1.outcome.status, 'success');
        strict_1.default.equal(a1.outcome.humanConfirmed, true);
        strict_1.default.equal(a1.outcome.source, 'human');
        strict_1.default.equal(a1.lessonCount, 1);
        strict_1.default.equal(a1.feedbackPresent, true);
    });
    (0, node_test_1.test)('outputType filtering narrows retrieval to a recorded outcome status', async () => {
        const result = await decisionRetrievalService_1.decisionRetrievalService.retrieve({
            userId: userA,
            excludeDecisionId: currentAId,
            category: 'technology',
            tags: ['microservices'],
            outputType: 'success',
        }, { emitEvent: false });
        strict_1.default.ok(result.memories.some((m) => m.title === 'Past microservices adoption'));
        for (const m of result.memories) {
            strict_1.default.equal(m.outcome?.status, 'success');
        }
    });
    (0, node_test_1.test)('policy caps the result set and reports truncation', async () => {
        const result = await decisionRetrievalService_1.decisionRetrievalService.retrieve({
            userId: userA,
            excludeDecisionId: currentAId,
            category: 'technology',
        }, { policy: (0, memoryPolicy_1.makeMemoryPolicy)({ maxMemories: 1 }), emitEvent: false });
        strict_1.default.equal(result.memories.length, 1);
        strict_1.default.equal(result.truncated, true);
        strict_1.default.ok(result.memories[0].relevance >= 0.08);
    });
});
(0, node_test_1.describe)('MemoryContextBuilder (planner input)', () => {
    (0, node_test_1.test)('builds a bounded, UNTRUSTED reference block that never leaks other users', async () => {
        const ctx = await memoryContextBuilder_1.memoryContextBuilder.buildForPlanning({
            userId: userA,
            decisionId: currentAId,
            category: 'technology',
            tags: ['microservices'],
        });
        strict_1.default.equal(ctx.enabled, true);
        strict_1.default.ok(ctx.contextSize > 0);
        strict_1.default.ok(ctx.contextSize <= 3000, `context within policy cap (${ctx.contextSize})`);
        strict_1.default.match(ctx.contextText, /<historical_decision_memory>/);
        strict_1.default.match(ctx.contextText, /UNTRUSTED REFERENCE DATA/);
        strict_1.default.match(ctx.contextText, /Past microservices adoption/);
        strict_1.default.ok(!ctx.contextText.includes('Current decision'), 'current decision excluded from its own context');
        strict_1.default.ok(!ctx.contextText.includes("Other user's private"), 'no cross-user leakage');
        strict_1.default.ok(!ctx.contextText.includes('In-flight microservices topic'), 'in-flight decisions excluded');
        strict_1.default.equal(ctx.retrieval.policyVersion, 'memory-policy-v1');
    });
    (0, node_test_1.test)('planner-path retrieval emits no memory.retrieved events', async () => {
        const before = await ExecutionEvent_1.default.countDocuments({ type: 'memory.retrieved' });
        await memoryContextBuilder_1.memoryContextBuilder.buildForPlanning({
            userId: userA,
            decisionId: currentAId,
            category: 'technology',
        });
        await new Promise((r) => setTimeout(r, 100));
        const after = await ExecutionEvent_1.default.countDocuments({ type: 'memory.retrieved' });
        strict_1.default.equal(after, before, 'no retrieval event persisted on the silent planner path');
    });
    (0, node_test_1.test)('a disabled policy yields an empty, inert context', async () => {
        const ctx = await memoryContextBuilder_1.memoryContextBuilder.buildForPlanning({
            userId: userA,
            decisionId: currentAId,
            category: 'technology',
            policy: (0, memoryPolicy_1.makeMemoryPolicy)({ enabled: false }),
        });
        strict_1.default.equal(ctx.enabled, false);
        strict_1.default.equal(ctx.contextText, '');
        strict_1.default.equal(ctx.memories.length, 0);
    });
});
(0, node_test_1.describe)('Other-user memory never surfaces', () => {
    (0, node_test_1.test)('userB sees only their own related decisions', async () => {
        const res = await server.request(`/api/decisions/${histB1Id}/related`, { token: tokenFor(userB) });
        strict_1.default.equal(res.status, 200);
        const titles = res.body.memories.map((m) => m.title);
        strict_1.default.ok(titles.includes("Other user's secondary plan"), 'own secondary history returned');
        strict_1.default.ok(!titles.includes('Past microservices adoption'), 'userA history never leaks');
        strict_1.default.ok(!titles.includes('Past cloud migration'), 'userA history never leaks');
    });
});
(0, node_test_1.describe)('DELETE purge', () => {
    (0, node_test_1.test)('deleting a decision removes its memory, outcomes, feedback and lessons', async () => {
        await server.request(`/api/decisions/${deleteMeId}/outcomes`, {
            method: 'POST',
            token: tokenFor(userA),
            body: { kind: 'actual', description: 'To be purged.' },
        });
        await server.request(`/api/decisions/${deleteMeId}/feedback`, {
            method: 'POST',
            token: tokenFor(userA),
            body: { recommendationStatus: 'unknown' },
        });
        await server.request(`/api/decisions/${deleteMeId}/lessons`, {
            method: 'POST',
            token: tokenFor(userA),
            body: { text: 'Purge me.', source: 'human' },
        });
        const before = await server.request(`/api/decisions/${deleteMeId}/memory`, { token: tokenFor(userA) });
        strict_1.default.equal(before.status, 200);
        strict_1.default.equal(before.body.outcomes.length, 1);
        strict_1.default.ok(before.body.feedback);
        strict_1.default.equal(before.body.lessons.length, 1);
        const del = await server.request(`/api/decisions/${deleteMeId}`, {
            method: 'DELETE',
            token: tokenFor(userA),
        });
        strict_1.default.equal(del.status, 200);
        strict_1.default.equal(del.body.ok, true);
        strict_1.default.equal(await DecisionMemory_1.default.countDocuments({ decisionId: deleteMeId }), 0);
        strict_1.default.equal(await Outcome_1.default.countDocuments({ decisionId: deleteMeId }), 0);
        strict_1.default.equal(await DecisionFeedback_1.default.countDocuments({ decisionId: deleteMeId }), 0);
        strict_1.default.equal(await DecisionLesson_1.default.countDocuments({ decisionId: deleteMeId }), 0);
        strict_1.default.equal(await Decision_1.default.countDocuments({ _id: deleteMeId }), 0);
    });
});
