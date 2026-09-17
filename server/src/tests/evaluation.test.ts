import { test, describe, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import type { AddressInfo } from 'net';
import Benchmark from '../models/Benchmark';
import BenchmarkCase from '../models/BenchmarkCase';
import Rubric from '../models/Rubric';
import EvaluationRun from '../models/EvaluationRun';
import EvaluationCaseResult from '../models/EvaluationCaseResult';
import Baseline from '../models/Baseline';
import EvaluationComparison from '../models/EvaluationComparison';
import Decision from '../models/Decision';
import Execution from '../models/Execution';
import Task from '../models/Task';
import Evidence from '../models/Evidence';
import Outcome from '../models/Outcome';
import ReconciliationResult from '../models/ReconciliationResult';
import Claim from '../models/Claim';
import ExecutionEvent from '../models/ExecutionEvent';
import DecisionMemory from '../models/DecisionMemory';
import evaluationsRouter from '../routes/evaluations';
import { benchmarkService } from '../evaluation/benchmarkService';
import { rubricService } from '../evaluation/rubricService';
import { makeEvaluationPolicy, EVALUATION_POLICY_VERSION } from '../evaluation/evaluationPolicy';

const TEST_URI =
  process.env.MONGODB_URI_TEST_EVALUATION || 'mongodb://localhost:27017/hathap_test_evaluation';

const JWT_SECRET = process.env.JWT_SECRET || 'secret';

function tokenFor(id: string): string {
  return jwt.sign({ id }, JWT_SECRET);
}

async function makeServer(): Promise<{
  server: http.Server;
  request: (path: string, opts?: { method?: string; token?: string; body?: unknown }) => Promise<{ status: number; body: any }>;
}> {
  const app = express();
  app.use(express.json());
  app.use('/api/evaluations', evaluationsRouter);
  const server = await new Promise<http.Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const port = (server.address() as AddressInfo).port;
  return {
    server,
    request: async (path, opts = {}) => {
      const headers: Record<string, string> = {};
      if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
      headers['Content-Type'] = 'application/json';
      const res = await fetch(`http://127.0.0.1:${port}${path}`, {
        method: opts.method || 'GET',
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      });
      const text = await res.text();
      let json: any = {};
      try {
        json = text ? JSON.parse(text) : {};
      } catch {
        json = { raw: text };
      }
      return { status: res.status, body: json };
    },
  };
}

async function nullify(): Promise<void> {
  await Promise.all([
    Benchmark.deleteMany({}),
    BenchmarkCase.deleteMany({}),
    Rubric.deleteMany({}),
    EvaluationRun.deleteMany({}),
    EvaluationCaseResult.deleteMany({}),
    Baseline.deleteMany({}),
    EvaluationComparison.deleteMany({}),
    ExecutionEvent.deleteMany({}),
    DecisionMemory.deleteMany({}),
    Outcome.deleteMany({}),
    ReconciliationResult.deleteMany({}),
    Claim.deleteMany({}),
    Evidence.deleteMany({}),
    Task.deleteMany({}),
    Execution.deleteMany({}),
    Decision.deleteMany({}),
  ]);
}

let userA: string;
let userB: string;
let server: Awaited<ReturnType<typeof makeServer>>;
const reqA = (path: string, opts?: { method?: string; body?: unknown }) =>
  server.request(`/api/evaluations${path}`, { token: tokenFor(userA), ...opts });
const reqB = (path: string, opts?: { method?: string; body?: unknown }) =>
  server.request(`/api/evaluations${path}`, { token: tokenFor(userB), ...opts });

const GOOD_ANSWER = {
  answerText:
    'We should migrate to the new authentication platform because it offers a measurable security improvement. ' +
    'It supports claim-based authorization, audit logging, and multi-tenant isolation out of the box.',
  recommendation: 'Migrate the authentication service to the new platform over two sprints.',
  rationale:
    'The new platform reduces login latency, centralizes policy configuration, and is fully compatible with our existing identity provider.',
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

before(async () => {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(TEST_URI);
  }
  await nullify();
  userA = new mongoose.Types.ObjectId().toString();
  userB = new mongoose.Types.ObjectId().toString();
  server = await makeServer();
});

afterEach(async () => {
  // keep cross-test state explicit; each describe seeds its own data
});

after(async () => {
  await nullify();
  await new Promise<void>((resolve) => server.server.close(() => resolve()));
  await mongoose.connection.close();
});

function expectStatus(res: { status: number; body: any }, expected: number, where: string) {
  assert.equal(
    res.status,
    expected,
    `[${where}] expected ${expected}, got ${res.status}: ${JSON.stringify(res.body).slice(0, 300)}`
  );
}

describe('Phase 9 - seed & benchmarks', () => {
  let benchmarkId: string;

  test('seed is idempotent', async () => {
    const first = await reqA('/seed', { method: 'POST' });
    expectStatus(first, 201, 'seed-first');
    assert.ok(first.body.benchmarkId);
    assert.equal(first.body.created, true);
    const second = await reqA('/seed', { method: 'POST' });
    expectStatus(second, 200, 'seed-second');
    assert.equal(second.body.benchmarkId, first.body.benchmarkId);
    assert.equal(second.body.created, false);
    assert.ok(second.body.caseCount >= 1);
    benchmarkId = second.body.benchmarkId;
  });

  test('benchmark read exposes case count', async () => {
    const res = await reqA(`/benchmarks/${benchmarkId}`);
    expectStatus(res, 200, 'benchmark-get');
    assert.ok(Number.isInteger(res.body.caseCount) && res.body.caseCount > 0);
  });

  test('benchmark ownership isolation (userB gets 404)', async () => {
    const res = await reqB(`/benchmarks/${benchmarkId}`);
    expectStatus(res, 404, 'benchmark-isolation');
  });

  test('case CRUD on a custom benchmark', async () => {
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
    assert.equal(cases.body.length, 2);

    const patched = await reqA(`/cases/${good.body._id}`, {
      method: 'PATCH',
      body: { title: 'Good static case (v2)' },
    });
    expectStatus(patched, 200, 'case-patch');

    const deleted = await reqA(`/cases/${noAnswer.body._id}`, { method: 'DELETE' });
    expectStatus(deleted, 200, 'case-delete');
  });

  test('rubric versioning bumps on update', async () => {
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
    assert.equal(rubric.body.version, 1);

    const updated = await reqA(`/rubrics/${rubric.body._id}`, {
      method: 'PATCH',
      body: { name: 'Syntax rubric (strict)' },
    });
    expectStatus(updated, 200, 'rubric-patch');
    assert.equal(updated.body.version, 2);
    assert.equal(updated.body.versions.length, 1);
  });
});

describe('Phase 9 - static evaluation runs', () => {
  let benchmarkId: string;
  let goodCaseId: string;
  let noAnswerCaseId: string;
  let runId: string;

  before(async () => {
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

  test('create run selects active cases deterministically', async () => {
    const created = await reqA('/runs', {
      method: 'POST',
      body: {
        name: 'Static pass',
        benchmarkId,
        systemUnderTest: { kind: 'static', label: 'Static artifact' },
      },
    });
    expectStatus(created, 201, 'run-create');
    assert.equal(created.body.status, 'draft');
    assert.equal(created.body.selectedCaseIds.length, 2);
    assert.equal(created.body.passThreshold, 0.6);
    assert.ok(created.body.limits.maxCasesPerRun > 0);
    runId = created.body._id;
  });

  test('execute run synchronously evaluates all cases', async () => {
    const res = await reqA(`/runs/${runId}/execute`, { method: 'POST' });
    expectStatus(res, 200, 'run-execute');
    // One case passes; the artifact-less case errors → the run finishes partial.
    assert.equal(res.body.status, 'partial');
    assert.equal(res.body.progress.total, 2);
    assert.equal(res.body.progress.completed, 1);
    assert.equal(res.body.progress.error, 1);
  });

  test('good static case passes; no-artifact case errors honestly', async () => {
    const results = await reqA(`/runs/${runId}/results`);
    expectStatus(results, 200, 'run-results');
    assert.equal(results.body.length, 2);

    const good = results.body.find((r: any) => r.caseId === goodCaseId);
    assert.ok(good, 'expected result for good case');
    assert.equal(good.status, 'passed');
    assert.ok(good.metrics.score >= 0.6, `good case scored ${good.metrics.score}`);

    const noAnswer = results.body.find((r: any) => r.caseId === noAnswerCaseId);
    assert.ok(noAnswer, 'expected result for no-artifact case');
    assert.equal(noAnswer.status, 'error');
    assert.ok(noAnswer.error && noAnswer.error.message.length > 0);
    assert.ok(/no artifact/i.test(noAnswer.error.message), noAnswer.error.message);
  });

  test('re-executing a completed run is a no-op (idempotent)', async () => {
    const res = await reqA(`/runs/${runId}/execute`, { method: 'POST' });
    expectStatus(res, 200, 'run-reexecute');
    assert.equal(res.body.status, 'partial');
    const results = await reqA(`/runs/${runId}/results`);
    assert.equal(results.body.length, 2);
  });

  test('aggregate endpoint returns mean composite', async () => {
    const res = await reqA(`/runs/${runId}/aggregate`);
    expectStatus(res, 200, 'run-aggregate');
    assert.ok(Number.isInteger(res.body.cases));
    assert.ok(res.body.included >= 1);
  });

  test('run ownership isolation', async () => {
    const res = await reqB(`/runs/${runId}`);
    expectStatus(res, 404, 'run-isolation-get');
    const results = await reqB(`/runs/${runId}/results`);
    expectStatus(results, 400, 'run-isolation-results');
    const execute = await reqB(`/runs/${runId}/execute`, { method: 'POST' });
    expectStatus(execute, 400, 'run-isolation-execute');
  });

  test('cancel draft run and delete run', async () => {
    const created = await reqA('/runs', {
      method: 'POST',
      body: { name: 'Draft to cancel', benchmarkId, systemUnderTest: { kind: 'static' } },
    });
    expectStatus(created, 201, 'cancel-create');
    const cancelled = await reqA(`/runs/${created.body._id}/cancel`, { method: 'POST' });
    expectStatus(cancelled, 200, 'cancel');
    assert.equal(cancelled.body.status, 'cancelled');

    const deleted = await reqA(`/runs/${created.body._id}`, { method: 'DELETE' });
    expectStatus(deleted, 200, 'run-delete');
    const gone = await reqA(`/runs/${created.body._id}`);
    expectStatus(gone, 404, 'run-delete-check');
  });
});

describe('Phase 9 - baselines & regression detection', () => {
  let benchmarkId: string;
  let caseId: string;
  let runAId: string;
  let runBId: string;
  let baselineId: string;

  before(async () => {
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

  test('run A is the reference and passes', async () => {
    const run = await reqA('/runs', {
      method: 'POST',
      body: { name: 'Reference run', benchmarkId, systemUnderTest: { kind: 'static' } },
    });
    runAId = run.body._id;
    const res = await reqA(`/runs/${runAId}/execute`, { method: 'POST' });
    assert.equal(res.body.status, 'completed');
    const results = await reqA(`/runs/${runAId}/results`);
    assert.equal(results.body[0].status, 'passed');
  });

  test('baseline can be created from the reference run', async () => {
    const res = await reqA('/baselines', {
      method: 'POST',
      body: { name: 'Reference baseline', strategy: 'priorRun', runId: runAId },
    });
    expectStatus(res, 201, 'baseline-create');
    assert.equal(res.body.strategy, 'priorRun');
    baselineId = res.body._id;
  });

  test('run B with a weak answer triggers a regression', async () => {
    const update = await reqA(`/cases/${caseId}`, {
      method: 'PATCH',
      body: { providedAnswer: WEAK_ANSWER },
    });
    assert.equal(update.status, 200);

    const run = await reqA('/runs', {
      method: 'POST',
      body: { name: 'Regression run', benchmarkId, systemUnderTest: { kind: 'static' } },
    });
    runBId = run.body._id;
    const res = await reqA(`/runs/${runBId}/execute`, { method: 'POST' });
    assert.equal(res.body.status, 'completed');
  });

  test('run-vs-run comparison flags the regression', async () => {
    const res = await reqA('/compare-runs', {
      method: 'POST',
      body: { runAId, runBId, name: 'reference vs regression' },
    });
    expectStatus(res, 200, 'compare-runs');
    assert.equal(res.body.type, 'run_vs_run');
    assert.ok(res.body.summary.regressions >= 1, JSON.stringify(res.body.summary));
    assert.equal(res.body.summary.regressionDetected, true);
    assert.ok(res.body.summary.aggregateB < res.body.summary.aggregateA);
  });

  test('run-vs-baseline comparison flags the regression too', async () => {
    const res = await reqA('/compare-baseline', {
      method: 'POST',
      body: { runId: runBId, baselineId },
    });
    expectStatus(res, 200, 'compare-baseline');
    assert.ok(res.body.summary.regressions >= 1, JSON.stringify(res.body.summary));
  });

  test('comparisons are listed and isolated by owner', async () => {
    const list = await reqA('/comparisons');
    expectStatus(list, 200, 'comparisons-list');
    assert.ok(list.body.length >= 2);
    const mine = list.body[0];
    const other = await reqB(`/comparisons/${mine._id}`);
    expectStatus(other, 404, 'comparison-isolation');
  });
});

describe('Phase 9 - ablation runs', () => {
  test('ablation requires a parentRunId', async () => {
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
    assert.equal(parent.status, 201);

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
    assert.equal(ablation.body.kind, 'ablation');
    assert.equal(ablation.body.ablation.variantLabel, 'strict-rubric');
  });
});

describe('Phase 9 - bounded decision-engine path (no provider needed)', () => {
  test('times out honestly when no worker completes the decision', async () => {
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
    assert.equal(res.body.status, 'failed');

    const results = await reqA(`/runs/${runId}/results`);
    assert.equal(results.body.length, 1);
    const result = results.body[0];
    assert.equal(result.caseId, caseId);
    assert.equal(result.status, 'error');
    assert.ok(/budget/i.test(result.error?.message || ''), result.error?.message);

    // The experimental decision must be cancelled, never left as if it were a
    // successful real decision.
    const decisions = await Decision.find({ 'metadata.evaluationRunId': runId });
    assert.equal(decisions.length, 1);
    assert.equal(decisions[0].status, 'cancelled');
  });
});

describe('Phase 9 - direct decision evaluation endpoint', () => {
  test('rejects a missing decisionId', async () => {
    const res = await reqA('/evaluate-decision', {
      method: 'POST',
      body: {},
    });
    expectStatus(res, 400, 'evaluate-decision-missing');
  });

  test('reports 422 for decisions without evaluable artifacts', async () => {
    const decision = await Decision.create({
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

  test('evaluates a reconciled decision artifact', async () => {
    const decision = await Decision.create({
      userId: userA,
      title: 'Finished',
      objective: 'Should we migrate the auth service now?',
      status: 'completed',
      currentPhase: 'executed',
      completedAt: new Date(),
      assumptions: ['Stable API contract.'],
      confidence: 85,
    });
    await ReconciliationResult.create({
      decisionId: decision._id.toString(),
      recommendation: 'Migrate the auth service.',
      rationale: 'It improves security and reduces latency.',
    });

    const res = await reqA('/evaluate-decision', {
      method: 'POST',
      body: { decisionId: decision._id.toString() },
    });
    expectStatus(res, 200, 'evaluate-decision-ok');
    assert.ok(res.body.analysis);
    assert.ok(res.body.analysis.structural);
    assert.equal(res.body.analysis.structural.applicable, true);
    assert.ok(res.body.analysis.quality);
    assert.ok(res.body.analysis.evidence);
  });
});

describe('Phase 9 - unit-level sanity via services', () => {
  test('makeEvaluationPolicy merges tiny overrides for determinism', () => {
    const policy = makeEvaluationPolicy({ maxDecisionWaitMs: 300 });
    assert.equal(policy.version, EVALUATION_POLICY_VERSION);
    assert.equal(policy.limits.maxDecisionWaitMs, 300);
    assert.equal(policy.limits.maxCasesPerRun, 20);
    assert.equal(policy.regressionEpsilon, 0.05);
  });

  test('rubric snapshot pins a version', async () => {
    const rubric = new Rubric({
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
    const snap = await rubricService.getRubricSnapshot(userA, rubric._id.toString());
    assert.ok(snap);
    assert.equal(snap.version, 1);
    assert.equal(snap.criteria.length, 2);
  });

  test('deleting a benchmark removes only that benchmark', async () => {
    const bm = await benchmarkService.createBenchmark(userA, { name: 'Deletable' });
    const bm2 = await benchmarkService.createBenchmark(userA, { name: 'Keepable' });
    const removed = await benchmarkService.deleteBenchmark(userA, bm._id.toString());
    assert.equal(removed, true);
    const kept = await benchmarkService.getBenchmark(userA, bm2._id.toString());
    assert.ok(kept);
  });
});