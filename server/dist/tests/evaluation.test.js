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
const Benchmark_1 = __importDefault(require("../models/Benchmark"));
const BenchmarkCase_1 = __importDefault(require("../models/BenchmarkCase"));
const Rubric_1 = __importDefault(require("../models/Rubric"));
const EvaluationRun_1 = __importDefault(require("../models/EvaluationRun"));
const EvaluationCaseResult_1 = __importDefault(require("../models/EvaluationCaseResult"));
const Baseline_1 = __importDefault(require("../models/Baseline"));
const EvaluationComparison_1 = __importDefault(require("../models/EvaluationComparison"));
const Decision_1 = __importDefault(require("../models/Decision"));
const Execution_1 = __importDefault(require("../models/Execution"));
const Task_1 = __importDefault(require("../models/Task"));
const Evidence_1 = __importDefault(require("../models/Evidence"));
const Outcome_1 = __importDefault(require("../models/Outcome"));
const ReconciliationResult_1 = __importDefault(require("../models/ReconciliationResult"));
const Claim_1 = __importDefault(require("../models/Claim"));
const ExecutionEvent_1 = __importDefault(require("../models/ExecutionEvent"));
const DecisionMemory_1 = __importDefault(require("../models/DecisionMemory"));
const evaluations_1 = __importDefault(require("../routes/evaluations"));
const benchmarkService_1 = require("../evaluation/benchmarkService");
const rubricService_1 = require("../evaluation/rubricService");
const evaluationPolicy_1 = require("../evaluation/evaluationPolicy");
const TEST_URI = process.env.MONGODB_URI_TEST_EVALUATION || 'mongodb://localhost:27017/hathap_test_evaluation';
const JWT_SECRET = process.env.JWT_SECRET || 'secret';
function tokenFor(id) {
    return jsonwebtoken_1.default.sign({ id }, JWT_SECRET);
}
async function makeServer() {
    const app = (0, express_1.default)();
    app.use(express_1.default.json());
    app.use('/api/evaluations', evaluations_1.default);
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
async function nullify() {
    await Promise.all([
        Benchmark_1.default.deleteMany({}),
        BenchmarkCase_1.default.deleteMany({}),
        Rubric_1.default.deleteMany({}),
        EvaluationRun_1.default.deleteMany({}),
        EvaluationCaseResult_1.default.deleteMany({}),
        Baseline_1.default.deleteMany({}),
        EvaluationComparison_1.default.deleteMany({}),
        ExecutionEvent_1.default.deleteMany({}),
        DecisionMemory_1.default.deleteMany({}),
        Outcome_1.default.deleteMany({}),
        ReconciliationResult_1.default.deleteMany({}),
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
const reqA = (path, opts) => server.request(`/api/evaluations${path}`, { token: tokenFor(userA), ...opts });
const reqB = (path, opts) => server.request(`/api/evaluations${path}`, { token: tokenFor(userB), ...opts });
const GOOD_ANSWER = {
    answerText: 'We should migrate to the new authentication platform because it offers a measurable security improvement. ' +
        'It supports claim-based authorization, audit logging, and multi-tenant isolation out of the box.',
    recommendation: 'Migrate the authentication service to the new platform over two sprints.',
    rationale: 'The new platform reduces login latency, centralizes policy configuration, and is fully compatible with our existing identity provider.',
    assumptions: ['Stable API contract during migration', 'Shared credentials with the identity provider'],
    confidence: 80,
    evidenceRefs: [],
};
const WEAK_ANSWER = {
    answerText: 'ok',
    recommendation: '',
    rationale: '',
    assumptions: [],
    confidence: 0,
    evidenceRefs: [],
};
(0, node_test_1.before)(async () => {
    if (mongoose_1.default.connection.readyState === 0) {
        await mongoose_1.default.connect(TEST_URI);
    }
    await nullify();
    userA = new mongoose_1.default.Types.ObjectId().toString();
    userB = new mongoose_1.default.Types.ObjectId().toString();
    server = await makeServer();
});
(0, node_test_1.afterEach)(async () => {
    // keep cross-test state explicit; each describe seeds its own data
});
(0, node_test_1.after)(async () => {
    await nullify();
    await new Promise((resolve) => server.server.close(() => resolve()));
    await mongoose_1.default.connection.close();
});
function expectStatus(res, expected, where) {
    strict_1.default.equal(res.status, expected, `[${where}] expected ${expected}, got ${res.status}: ${JSON.stringify(res.body).slice(0, 300)}`);
}
(0, node_test_1.describe)('Phase 9 - seed & benchmarks', () => {
    let benchmarkId;
    (0, node_test_1.test)('seed is idempotent', async () => {
        const first = await reqA('/seed', { method: 'POST' });
        expectStatus(first, 201, 'seed-first');
        strict_1.default.ok(first.body.benchmarkId);
        strict_1.default.equal(first.body.created, true);
        const second = await reqA('/seed', { method: 'POST' });
        expectStatus(second, 200, 'seed-second');
        strict_1.default.equal(second.body.benchmarkId, first.body.benchmarkId);
        strict_1.default.equal(second.body.created, false);
        strict_1.default.ok(second.body.caseCount >= 1);
        benchmarkId = second.body.benchmarkId;
    });
    (0, node_test_1.test)('benchmark read exposes case count', async () => {
        const res = await reqA(`/benchmarks/${benchmarkId}`);
        expectStatus(res, 200, 'benchmark-get');
        strict_1.default.ok(Number.isInteger(res.body.caseCount) && res.body.caseCount > 0);
    });
    (0, node_test_1.test)('benchmark ownership isolation (userB gets 404)', async () => {
        const res = await reqB(`/benchmarks/${benchmarkId}`);
        expectStatus(res, 404, 'benchmark-isolation');
    });
    (0, node_test_1.test)('case CRUD on a custom benchmark', async () => {
        const bm = await reqA('/benchmarks', {
            method: 'POST',
            body: { name: 'Custom benchmark', description: 'Syntax + static artifact cases' },
        });
        expectStatus(bm, 201, 'benchmark-create');
        const customBmId = bm.body._id;
        const good = await reqA(`/benchmarks/${customBmId}/cases`, {
            method: 'POST',
            body: {
                title: 'Good static case',
                prompt: 'Migrate the auth service to the new platform. Justify with evidence.',
                expectedStructure: {
                    requiresRecommendation: true,
                    requiresConfidence: true,
                    minAnswerLength: 60,
                    mustMention: ['migrate'],
                },
                providedAnswer: GOOD_ANSWER,
            },
        });
        expectStatus(good, 201, 'case-create-good');
        const noAnswer = await reqA(`/benchmarks/${customBmId}/cases`, {
            method: 'POST',
            body: {
                title: 'Case without artifact',
                prompt: 'Answer this case without an artifact.',
            },
        });
        expectStatus(noAnswer, 201, 'case-create-noanswer');
        const cases = await reqA(`/benchmarks/${customBmId}/cases`);
        expectStatus(cases, 200, 'cases-list');
        strict_1.default.equal(cases.body.length, 2);
        const patched = await reqA(`/cases/${good.body._id}`, {
            method: 'PATCH',
            body: { title: 'Good static case (v2)' },
        });
        expectStatus(patched, 200, 'case-patch');
        const deleted = await reqA(`/cases/${noAnswer.body._id}`, { method: 'DELETE' });
        expectStatus(deleted, 200, 'case-delete');
    });
    (0, node_test_1.test)('rubric versioning bumps on update', async () => {
        const rubric = await reqA('/rubrics', {
            method: 'POST',
            body: {
                name: 'Syntax rubric',
                criteria: [
                    { key: 'structural', weight: 3, enabled: true, label: 'Structure' },
                    { key: 'quality', weight: 2, enabled: true, label: 'Quality' },
                ],
            },
        });
        expectStatus(rubric, 201, 'rubric-create');
        strict_1.default.equal(rubric.body.version, 1);
        const updated = await reqA(`/rubrics/${rubric.body._id}`, {
            method: 'PATCH',
            body: { name: 'Syntax rubric (strict)' },
        });
        expectStatus(updated, 200, 'rubric-patch');
        strict_1.default.equal(updated.body.version, 2);
        strict_1.default.equal(updated.body.versions.length, 1);
    });
});
(0, node_test_1.describe)('Phase 9 - static evaluation runs', () => {
    let benchmarkId;
    let goodCaseId;
    let noAnswerCaseId;
    let runId;
    (0, node_test_1.before)(async () => {
        const bm = await reqA('/benchmarks', {
            method: 'POST',
            body: { name: 'Static run benchmark' },
        });
        benchmarkId = bm.body._id;
        const good = await reqA(`/benchmarks/${benchmarkId}/cases`, {
            method: 'POST',
            body: {
                title: 'Good static case',
                prompt: 'Migrate the auth service to the new platform. Justify with evidence.',
                expectedStructure: {
                    requiresRecommendation: true,
                    requiresConfidence: true,
                    minAnswerLength: 60,
                    mustMention: ['migrate'],
                },
                providedAnswer: GOOD_ANSWER,
            },
        });
        goodCaseId = good.body._id;
        const noAnswer = await reqA(`/benchmarks/${benchmarkId}/cases`, {
            method: 'POST',
            body: {
                title: 'Case without artifact',
                prompt: 'Answer this case without an artifact.',
            },
        });
        noAnswerCaseId = noAnswer.body._id;
    });
    (0, node_test_1.test)('create run selects active cases deterministically', async () => {
        const created = await reqA('/runs', {
            method: 'POST',
            body: {
                name: 'Static pass',
                benchmarkId,
                systemUnderTest: { kind: 'static', label: 'Static artifact' },
            },
        });
        expectStatus(created, 201, 'run-create');
        strict_1.default.equal(created.body.status, 'draft');
        strict_1.default.equal(created.body.selectedCaseIds.length, 2);
        strict_1.default.equal(created.body.passThreshold, 0.6);
        strict_1.default.ok(created.body.limits.maxCasesPerRun > 0);
        runId = created.body._id;
    });
    (0, node_test_1.test)('execute run synchronously evaluates all cases', async () => {
        const res = await reqA(`/runs/${runId}/execute`, { method: 'POST' });
        expectStatus(res, 200, 'run-execute');
        // One case passes; the artifact-less case errors → the run finishes partial.
        strict_1.default.equal(res.body.status, 'partial');
        strict_1.default.equal(res.body.progress.total, 2);
        strict_1.default.equal(res.body.progress.completed, 1);
        strict_1.default.equal(res.body.progress.error, 1);
    });
    (0, node_test_1.test)('good static case passes; no-artifact case errors honestly', async () => {
        const results = await reqA(`/runs/${runId}/results`);
        expectStatus(results, 200, 'run-results');
        strict_1.default.equal(results.body.length, 2);
        const good = results.body.find((r) => r.caseId === goodCaseId);
        strict_1.default.ok(good, 'expected result for good case');
        strict_1.default.equal(good.status, 'passed');
        strict_1.default.ok(good.metrics.score >= 0.6, `good case scored ${good.metrics.score}`);
        const noAnswer = results.body.find((r) => r.caseId === noAnswerCaseId);
        strict_1.default.ok(noAnswer, 'expected result for no-artifact case');
        strict_1.default.equal(noAnswer.status, 'error');
        strict_1.default.ok(noAnswer.error && noAnswer.error.message.length > 0);
        strict_1.default.ok(/no artifact/i.test(noAnswer.error.message), noAnswer.error.message);
    });
    (0, node_test_1.test)('re-executing a completed run is a no-op (idempotent)', async () => {
        const res = await reqA(`/runs/${runId}/execute`, { method: 'POST' });
        expectStatus(res, 200, 'run-reexecute');
        strict_1.default.equal(res.body.status, 'partial');
        const results = await reqA(`/runs/${runId}/results`);
        strict_1.default.equal(results.body.length, 2);
    });
    (0, node_test_1.test)('aggregate endpoint returns mean composite', async () => {
        const res = await reqA(`/runs/${runId}/aggregate`);
        expectStatus(res, 200, 'run-aggregate');
        strict_1.default.ok(Number.isInteger(res.body.cases));
        strict_1.default.ok(res.body.included >= 1);
    });
    (0, node_test_1.test)('run ownership isolation', async () => {
        const res = await reqB(`/runs/${runId}`);
        expectStatus(res, 404, 'run-isolation-get');
        const results = await reqB(`/runs/${runId}/results`);
        expectStatus(results, 400, 'run-isolation-results');
        const execute = await reqB(`/runs/${runId}/execute`, { method: 'POST' });
        expectStatus(execute, 400, 'run-isolation-execute');
    });
    (0, node_test_1.test)('cancel draft run and delete run', async () => {
        const created = await reqA('/runs', {
            method: 'POST',
            body: { name: 'Draft to cancel', benchmarkId, systemUnderTest: { kind: 'static' } },
        });
        expectStatus(created, 201, 'cancel-create');
        const cancelled = await reqA(`/runs/${created.body._id}/cancel`, { method: 'POST' });
        expectStatus(cancelled, 200, 'cancel');
        strict_1.default.equal(cancelled.body.status, 'cancelled');
        const deleted = await reqA(`/runs/${created.body._id}`, { method: 'DELETE' });
        expectStatus(deleted, 200, 'run-delete');
        const gone = await reqA(`/runs/${created.body._id}`);
        expectStatus(gone, 404, 'run-delete-check');
    });
});
(0, node_test_1.describe)('Phase 9 - baselines & regression detection', () => {
    let benchmarkId;
    let caseId;
    let runAId;
    let runBId;
    let baselineId;
    (0, node_test_1.before)(async () => {
        const bm = await reqA('/benchmarks', { method: 'POST', body: { name: 'Comparison benchmark' } });
        benchmarkId = bm.body._id;
        const c = await reqA(`/benchmarks/${benchmarkId}/cases`, {
            method: 'POST',
            body: {
                title: 'Comparison case',
                prompt: 'Migrate the auth service to the new platform. Justify with evidence.',
                expectedStructure: {
                    requiresRecommendation: true,
                    requiresConfidence: true,
                    minAnswerLength: 60,
                    mustMention: ['migrate'],
                },
                providedAnswer: GOOD_ANSWER,
            },
        });
        caseId = c.body._id;
    });
    (0, node_test_1.test)('run A is the reference and passes', async () => {
        const run = await reqA('/runs', {
            method: 'POST',
            body: { name: 'Reference run', benchmarkId, systemUnderTest: { kind: 'static' } },
        });
        runAId = run.body._id;
        const res = await reqA(`/runs/${runAId}/execute`, { method: 'POST' });
        strict_1.default.equal(res.body.status, 'completed');
        const results = await reqA(`/runs/${runAId}/results`);
        strict_1.default.equal(results.body[0].status, 'passed');
    });
    (0, node_test_1.test)('baseline can be created from the reference run', async () => {
        const res = await reqA('/baselines', {
            method: 'POST',
            body: { name: 'Reference baseline', strategy: 'priorRun', runId: runAId },
        });
        expectStatus(res, 201, 'baseline-create');
        strict_1.default.equal(res.body.strategy, 'priorRun');
        baselineId = res.body._id;
    });
    (0, node_test_1.test)('run B with a weak answer triggers a regression', async () => {
        const update = await reqA(`/cases/${caseId}`, {
            method: 'PATCH',
            body: { providedAnswer: WEAK_ANSWER },
        });
        strict_1.default.equal(update.status, 200);
        const run = await reqA('/runs', {
            method: 'POST',
            body: { name: 'Regression run', benchmarkId, systemUnderTest: { kind: 'static' } },
        });
        runBId = run.body._id;
        const res = await reqA(`/runs/${runBId}/execute`, { method: 'POST' });
        strict_1.default.equal(res.body.status, 'completed');
    });
    (0, node_test_1.test)('run-vs-run comparison flags the regression', async () => {
        const res = await reqA('/compare-runs', {
            method: 'POST',
            body: { runAId, runBId, name: 'reference vs regression' },
        });
        expectStatus(res, 200, 'compare-runs');
        strict_1.default.equal(res.body.type, 'run_vs_run');
        strict_1.default.ok(res.body.summary.regressions >= 1, JSON.stringify(res.body.summary));
        strict_1.default.equal(res.body.summary.regressionDetected, true);
        strict_1.default.ok(res.body.summary.aggregateB < res.body.summary.aggregateA);
    });
    (0, node_test_1.test)('run-vs-baseline comparison flags the regression too', async () => {
        const res = await reqA('/compare-baseline', {
            method: 'POST',
            body: { runId: runBId, baselineId },
        });
        expectStatus(res, 200, 'compare-baseline');
        strict_1.default.ok(res.body.summary.regressions >= 1, JSON.stringify(res.body.summary));
    });
    (0, node_test_1.test)('comparisons are listed and isolated by owner', async () => {
        const list = await reqA('/comparisons');
        expectStatus(list, 200, 'comparisons-list');
        strict_1.default.ok(list.body.length >= 2);
        const mine = list.body[0];
        const other = await reqB(`/comparisons/${mine._id}`);
        expectStatus(other, 404, 'comparison-isolation');
    });
});
(0, node_test_1.describe)('Phase 9 - ablation runs', () => {
    (0, node_test_1.test)('ablation requires a parentRunId', async () => {
        const bm = await reqA('/benchmarks', { method: 'POST', body: { name: 'Ablation benchmark' } });
        const benchmarkId = bm.body._id;
        await reqA(`/benchmarks/${benchmarkId}/cases`, {
            method: 'POST',
            body: { title: 'Case', prompt: 'Answer.', providedAnswer: GOOD_ANSWER },
        });
        const missing = await reqA('/runs', {
            method: 'POST',
            body: { name: 'Ablation without parent', benchmarkId, kind: 'ablation', systemUnderTest: { kind: 'static' } },
        });
        expectStatus(missing, 400, 'ablation-no-parent');
        const parent = await reqA('/runs', {
            method: 'POST',
            body: { name: 'Parent run', benchmarkId, systemUnderTest: { kind: 'static' } },
        });
        strict_1.default.equal(parent.status, 201);
        const ablation = await reqA('/runs', {
            method: 'POST',
            body: {
                name: 'Ablation run',
                benchmarkId,
                kind: 'ablation',
                systemUnderTest: { kind: 'static', label: 'Variant A' },
                ablation: { parentRunId: parent.body._id, variantLabel: 'strict-rubric' },
            },
        });
        expectStatus(ablation, 201, 'ablation-create');
        strict_1.default.equal(ablation.body.kind, 'ablation');
        strict_1.default.equal(ablation.body.ablation.variantLabel, 'strict-rubric');
    });
});
(0, node_test_1.describe)('Phase 9 - bounded decision-engine path (no provider needed)', () => {
    (0, node_test_1.test)('times out honestly when no worker completes the decision', async () => {
        const bm = await reqA('/benchmarks', { method: 'POST', body: { name: 'Engine benchmark' } });
        const benchmarkId = bm.body._id;
        const c = await reqA(`/benchmarks/${benchmarkId}/cases`, {
            method: 'POST',
            body: { title: 'Engine case', prompt: 'Decide whether to migrate the auth service.' },
        });
        const caseId = c.body._id;
        const run = await reqA('/runs', {
            method: 'POST',
            body: {
                name: 'Engine run (timeout)',
                benchmarkId,
                systemUnderTest: { kind: 'decision-engine', decisionSettings: { planningMode: 'fixed', routingMode: 'auto' } },
                limits: { maxDecisionWaitMs: 300 },
            },
        });
        expectStatus(run, 201, 'engine-run-create');
        const runId = run.body._id;
        const res = await reqA(`/runs/${runId}/execute`, { method: 'POST' });
        strict_1.default.equal(res.body.status, 'failed');
        const results = await reqA(`/runs/${runId}/results`);
        strict_1.default.equal(results.body.length, 1);
        const result = results.body[0];
        strict_1.default.equal(result.caseId, caseId);
        strict_1.default.equal(result.status, 'error');
        strict_1.default.ok(/budget/i.test(result.error?.message || ''), result.error?.message);
        // The experimental decision must be cancelled, never left as if it were a
        // successful real decision.
        const decisions = await Decision_1.default.find({ 'metadata.evaluationRunId': runId });
        strict_1.default.equal(decisions.length, 1);
        strict_1.default.equal(decisions[0].status, 'cancelled');
    });
});
(0, node_test_1.describe)('Phase 9 - direct decision evaluation endpoint', () => {
    (0, node_test_1.test)('rejects a missing decisionId', async () => {
        const res = await reqA('/evaluate-decision', {
            method: 'POST',
            body: {},
        });
        expectStatus(res, 400, 'evaluate-decision-missing');
    });
    (0, node_test_1.test)('reports 422 for decisions without evaluable artifacts', async () => {
        const decision = await Decision_1.default.create({
            userId: userA,
            title: 'Unfinished',
            objective: 'Should we migrate?',
            status: 'draft',
            currentPhase: 'draft',
        });
        const res = await reqA('/evaluate-decision', {
            method: 'POST',
            body: { decisionId: decision._id.toString() },
        });
        expectStatus(res, 422, 'evaluate-decision-no-artifact');
    });
    (0, node_test_1.test)('evaluates a reconciled decision artifact', async () => {
        const decision = await Decision_1.default.create({
            userId: userA,
            title: 'Finished',
            objective: 'Should we migrate the auth service now?',
            status: 'completed',
            currentPhase: 'executed',
            completedAt: new Date(),
            assumptions: ['Stable API contract.'],
            confidence: 85,
        });
        await ReconciliationResult_1.default.create({
            decisionId: decision._id.toString(),
            recommendation: 'Migrate the auth service.',
            rationale: 'It improves security and reduces latency.',
        });
        const res = await reqA('/evaluate-decision', {
            method: 'POST',
            body: { decisionId: decision._id.toString() },
        });
        expectStatus(res, 200, 'evaluate-decision-ok');
        strict_1.default.ok(res.body.analysis);
        strict_1.default.ok(res.body.analysis.structural);
        strict_1.default.equal(res.body.analysis.structural.applicable, true);
        strict_1.default.ok(res.body.analysis.quality);
        strict_1.default.ok(res.body.analysis.evidence);
    });
});
(0, node_test_1.describe)('Phase 9 - unit-level sanity via services', () => {
    (0, node_test_1.test)('makeEvaluationPolicy merges tiny overrides for determinism', () => {
        const policy = (0, evaluationPolicy_1.makeEvaluationPolicy)({ maxDecisionWaitMs: 300 });
        strict_1.default.equal(policy.version, evaluationPolicy_1.EVALUATION_POLICY_VERSION);
        strict_1.default.equal(policy.limits.maxDecisionWaitMs, 300);
        strict_1.default.equal(policy.limits.maxCasesPerRun, 20);
        strict_1.default.equal(policy.regressionEpsilon, 0.05);
    });
    (0, node_test_1.test)('rubric snapshot pins a version', async () => {
        const rubric = new Rubric_1.default({
            userId: userA,
            name: 'Pinned rubric',
            version: 1,
            status: 'active',
            criteria: [
                { key: 'structural', weight: 2, enabled: true, label: 'Structure' },
                { key: 'quality', weight: 1, enabled: true, label: 'Quality' },
            ],
            versions: [],
        });
        await rubric.save();
        const snap = await rubricService_1.rubricService.getRubricSnapshot(userA, rubric._id.toString());
        strict_1.default.ok(snap);
        strict_1.default.equal(snap.version, 1);
        strict_1.default.equal(snap.criteria.length, 2);
    });
    (0, node_test_1.test)('deleting a benchmark removes only that benchmark', async () => {
        const bm = await benchmarkService_1.benchmarkService.createBenchmark(userA, { name: 'Deletable' });
        const bm2 = await benchmarkService_1.benchmarkService.createBenchmark(userA, { name: 'Keepable' });
        const removed = await benchmarkService_1.benchmarkService.deleteBenchmark(userA, bm._id.toString());
        strict_1.default.equal(removed, true);
        const kept = await benchmarkService_1.benchmarkService.getBenchmark(userA, bm2._id.toString());
        strict_1.default.ok(kept);
    });
});
