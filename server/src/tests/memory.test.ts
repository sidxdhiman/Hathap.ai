import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import type { AddressInfo } from 'net';
import Decision from '../models/Decision';
import Claim from '../models/Claim';
import Evidence from '../models/Evidence';
import ReconciliationResult from '../models/ReconciliationResult';
import ExecutionEvent from '../models/ExecutionEvent';
import DecisionMemory from '../models/DecisionMemory';
import Outcome from '../models/Outcome';
import DecisionFeedback from '../models/DecisionFeedback';
import DecisionLesson from '../models/DecisionLesson';
import decisionsRouter from '../routes/decisions';
import { decisionMemoryService } from '../memory/decisionMemoryService';
import { decisionRetrievalService } from '../memory/decisionRetrievalService';
import { memoryContextBuilder } from '../memory/memoryContextBuilder';
import { makeMemoryPolicy } from '../memory/memoryPolicy';

const TEST_URI =
  process.env.MONGODB_URI_TEST_MEMORY || 'mongodb://localhost:27017/hathap_test_memory';

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
  app.use('/api/decisions', decisionsRouter);
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

async function waitFor(
  predicate: () => Promise<boolean>,
  timeoutMs = 4000
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error('waitFor timed out');
}

async function nullify(): Promise<void> {
  await Promise.all([
    DecisionMemory.deleteMany({}),
    Outcome.deleteMany({}),
    DecisionFeedback.deleteMany({}),
    DecisionLesson.deleteMany({}),
    ExecutionEvent.deleteMany({}),
    ReconciliationResult.deleteMany({}),
    Claim.deleteMany({}),
    Evidence.deleteMany({}),
    Decision.deleteMany({}),
  ]);
}

let userA: string;
let userB: string;
let server: Awaited<ReturnType<typeof makeServer>>;
let currentAId: string;
let histA1Id: string;
let histA2Id: string;
let histA3Id: string;
let freshCompletedId: string;
let freshDraftId: string;
let deleteMeId: string;
let histB1Id: string;

const meta = (category: string, tags: string[]) => ({
  category,
  domain: 'software',
  problemType: 'adoption',
  tags,
  entities: ['payments-svc'],
});

before(async () => {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(TEST_URI);
  }
  await nullify();
  userA = new mongoose.Types.ObjectId().toString();
  userB = new mongoose.Types.ObjectId().toString();

  const currentA = await Decision.create({
    userId: userA,
    title: 'Current decision',
    objective: 'Should we adopt microservices now?',
    context: 'The current decision being acted on.',
    status: 'completed',
    completedAt: new Date(),
    metadata: meta('technology', ['microservices']),
  });
  currentAId = currentA._id.toString();

  const a1 = await Decision.create({
    userId: userA,
    title: 'Past microservices adoption',
    objective: 'Should we adopt microservices?',
    context: 'Historical decision about microservices.',
    status: 'completed',
    completedAt: new Date(),
    metadata: meta('technology', ['microservices']),
  });
  histA1Id = a1._id.toString();

  const claim = await Claim.create({
    decisionId: histA1Id,
    executionId: new mongoose.Types.ObjectId(),
    taskId: new mongoose.Types.ObjectId(),
    text: 'Microservices reduce deployment coupling.',
    type: 'fact',
    status: 'accepted',
    evidenceIds: [],
    supportingEvidenceIds: [],
    provenanceKind: 'inferred',
  });
  const evidence = await Evidence.create({
    decisionId: histA1Id,
    executionId: new mongoose.Types.ObjectId(),
    taskId: new mongoose.Types.ObjectId(),
    type: 'text',
    title: 'Deployment coupling study',
    content: 'Study of coupling across teams.',
    sourceUrl: 'https://example.com/study',
    sourceType: 'user_input',
    relevanceScore: 0.9,
    sourceReliability: 'high',
    provenanceKind: 'inferred',
  });
  await ReconciliationResult.create({
    decisionId: histA1Id,
    executionId: new mongoose.Types.ObjectId(),
    status: 'completed',
    recommendation: 'Adopt incrementally.',
    survivingClaimIds: [claim._id.toString()],
    rejectedClaimIds: [],
    uncertainClaimIds: [],
    redTeamFindingIds: [],
    needsMoreResearch: false,
    rationale: 'Evidence supports incremental adoption.',
  });
  await Outcome.create({
    userId: userA,
    decisionId: histA1Id,
    kind: 'actual',
    status: 'success',
    description: 'Adopted for two services first.',
    source: 'human',
    observedAt: new Date(),
  });
  await DecisionFeedback.create({
    userId: userA,
    decisionId: histA1Id,
    recommendationStatus: 'accepted',
    reason: 'Followed the recommendation.',
  });
  await DecisionLesson.create({
    userId: userA,
    decisionId: histA1Id,
    text: 'Start with two services.',
    source: 'human',
    status: 'confirmed',
    metricName: 'time-to-deploy',
    evidenceIds: [evidence._id.toString()],
  });

  const a2 = await Decision.create({
    userId: userA,
    title: 'Past cloud migration',
    objective: 'Should we migrate to cloud?',
    context: 'Historical decision about cloud.',
    status: 'completed',
    completedAt: new Date(),
    metadata: meta('technology', ['cloud']),
  });
  histA2Id = a2._id.toString();

  const a3 = await Decision.create({
    userId: userA,
    title: 'In-flight microservices topic',
    objective: 'In-flight decision - must never surface as history.',
    status: 'draft',
    metadata: meta('technology', ['microservices']),
  });
  histA3Id = a3._id.toString();

  const fresh = await Decision.create({
    userId: userA,
    title: 'Fresh completed decision',
    objective: 'Should we keep batch jobs?',
    status: 'completed',
    completedAt: new Date(),
    metadata: meta('data-engineering', ['batch']),
  });
  freshCompletedId = fresh._id.toString();
  const freshDraft = await Decision.create({
    userId: userA,
    title: 'Fresh draft decision',
    objective: 'Draft - never gets memory fabricated.',
    status: 'draft',
    metadata: meta('data-engineering', ['batch']),
  });
  freshDraftId = freshDraft._id.toString();

  const b1 = await Decision.create({
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
  const b2 = await Decision.create({
    userId: userB,
    title: "Other user's secondary plan",
    objective: 'Secondary private decision.',
    status: 'completed',
    completedAt: new Date(),
    metadata: meta('technology', ['cloud']),
  });
  await decisionMemoryService.createForDecision(b2._id.toString(), userB, { via: 'completion' });

  const deleteMe = await Decision.create({
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
    await decisionMemoryService.createForDecision(id, owner, { via: 'completion' });
  }

  server = await makeServer();
});

after(async () => {
  server.server.close();
  await nullify();
  await mongoose.connection.close();
});

describe('DecisionMemoryService - index building', () => {
  test('createForDecision is idempotent and copies references, never content', async () => {
    const again = await decisionMemoryService.createForDecision(histA1Id, userA, { via: 'completion' });
    assert.ok(again);
    assert.equal(await DecisionMemory.countDocuments({ decisionId: histA1Id }), 1);

    await waitFor(async () =>
      (await ExecutionEvent.countDocuments({ type: 'memory.created', decisionId: histA1Id })) === 1
    );

    const memory = await DecisionMemory.findOne({ decisionId: histA1Id });
    assert.ok(memory);
    assert.equal(memory.status, 'completed');
    assert.equal(memory.createdVia, 'completion');
    assert.equal(String(memory.finalRecommendation), 'Adopt incrementally.');
    assert.equal(memory.recommendationSource, 'reconciliation');
    assert.deepEqual(memory.tags, ['microservices']);
    assert.equal(memory.category, 'technology');
    assert.equal(memory.importantClaimIds.length, 1);
    assert.ok(memory.importantEvidenceIds.length > 0, 'key evidence referenced');
    assert.ok(memory.completedAt instanceof Date);
    assert.ok(memory.finalRecommendation!.length > 10, 'recommendation text retained');
  });

  test('ensureMemory returns null for in-flight decisions (no fabricated history)', async () => {
    assert.equal(await decisionMemoryService.ensureMemory(histA3Id, userA), null);
    assert.equal(await decisionMemoryService.ensureMemory(freshDraftId, userA), null);
  });

  test('ensureMemory builds on-demand memory for a terminal decision that predates Phase 8', async () => {
    assert.equal(await DecisionMemory.countDocuments({ decisionId: freshCompletedId }), 0);
    const built = await decisionMemoryService.ensureMemory(freshCompletedId, userA);
    assert.ok(built, 'memory built on-demand');
    assert.equal(built.status, 'completed');
    assert.equal(built.createdVia, 'on-demand');
    assert.equal(await DecisionMemory.countDocuments({ decisionId: freshCompletedId }), 1);
  });

  test('ownership: another user cannot see or build a memory they do not own', async () => {
    assert.equal(await decisionMemoryService.find(histA1Id, userB), null);
    assert.equal(await decisionMemoryService.createForDecision(currentAId, userB, { via: 'on-demand' }), null);
  });
});

describe('GET /api/decisions/:id/memory', () => {
  test('returns memory, outcomes, feedback, lessons and quality for an owned decision', async () => {
    const res = await server.request(`/api/decisions/${currentAId}/memory`, { token: tokenFor(userA) });
    assert.equal(res.status, 200);
    assert.ok(res.body.memory, 'memory record present');
    assert.equal(res.body.memory.status, 'completed');
    assert.ok(res.body.quality, 'quality signals present');
  });

  test('enriches a rich history with confirmed outcome + accepted feedback + lesson', async () => {
    const res = await server.request(`/api/decisions/${histA1Id}/memory`, { token: tokenFor(userA) });
    assert.equal(res.status, 200);
    assert.equal(res.body.outcomes.length, 1);
    assert.equal(res.body.outcomes[0].status, 'success');
    assert.equal(res.body.outcomes[0].source, 'human');
    assert.equal(res.body.feedback.recommendationStatus, 'accepted');
    assert.equal(res.body.lessons.length, 1);
    assert.equal(res.body.lessons[0].status, 'confirmed');
    const q = res.body.quality;
    assert.equal(q.recommendationAccepted, true);
    assert.equal(q.outcomeAchieved, true);
    assert.equal(q.outcomeConfirmed, true);
    assert.equal(q.hasHumanFeedback, true);
    assert.equal(q.expectedVsActualComputed, false);
  });

  test('rejects cross-user and nonexistent access with 404', async () => {
    const cross = await server.request(`/api/decisions/${currentAId}/memory`, { token: tokenFor(userB) });
    assert.equal(cross.status, 404);
    const missing = await server.request(`/api/decisions/${new mongoose.Types.ObjectId().toString()}/memory`, {
      token: tokenFor(userA),
    });
    assert.equal(missing.status, 404);
  });
});

describe('Outcomes API', () => {
  test('POST expected defaults to pending; actual defaults to unknown', async () => {
    const exp = await server.request(`/api/decisions/${currentAId}/outcomes`, {
      method: 'POST',
      token: tokenFor(userA),
      body: { kind: 'expected', description: 'Migration completes in one quarter.' },
    });
    assert.equal(exp.status, 201);
    assert.equal(exp.body.kind, 'expected');
    assert.equal(exp.body.status, 'pending');
    assert.equal(exp.body.source, 'human');

    const act = await server.request(`/api/decisions/${currentAId}/outcomes`, {
      method: 'POST',
      token: tokenFor(userA),
      body: { kind: 'actual', description: 'Two services migrated in one quarter.' },
    });
    assert.equal(act.status, 201);
    assert.equal(act.body.kind, 'actual');
    assert.equal(act.body.status, 'unknown');
  });

  test('POST validates payload and status values', async () => {
    const noDesc = await server.request(`/api/decisions/${currentAId}/outcomes`, {
      method: 'POST',
      token: tokenFor(userA),
      body: { kind: 'expected' },
    });
    assert.equal(noDesc.status, 400);

    const badStatus = await server.request(`/api/decisions/${currentAId}/outcomes`, {
      method: 'POST',
      token: tokenFor(userA),
      body: { kind: 'actual', description: 'x', status: 'definitely' },
    });
    assert.equal(badStatus.status, 400);
  });

  test('PATCH records a later status transition (success is explicit, never assumed)', async () => {
    const list = await server.request(`/api/decisions/${currentAId}/outcomes`, { token: tokenFor(userA) });
    const actual = list.body.outcomes.find((o: any) => o.kind === 'actual');
    assert.ok(actual, 'actual outcome exists');

    const patched = await server.request(`/api/decisions/${currentAId}/outcomes/${actual._id}`, {
      method: 'PATCH',
      token: tokenFor(userA),
      body: { status: 'success' },
    });
    assert.equal(patched.status, 200);
    assert.equal(patched.body.status, 'success');
  });

  test('expected-vs-actual computes variance and achieved state from paired metrics', async () => {
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
    assert.equal(actualRes.status, 201);

    const list = await server.request(`/api/decisions/${currentAId}/outcomes`, { token: tokenFor(userA) });
    const cmp = list.body.expectedVsActual.metricComparisons.find((c: any) => c.metricName === 'cost');
    assert.ok(cmp, 'cost comparison produced');
    assert.equal(cmp.meaningful, true);
    assert.equal(cmp.variance, -20);
    assert.equal(cmp.variancePct, -20);
    assert.equal(cmp.achieved, true, 'decrease target under-run counts as achieved');
    assert.equal(list.body.expectedVsActual.qualityComputed, true);
  });

  test('cross-user outcome access is a 404; list is ownership-scoped', async () => {
    const list = await server.request(`/api/decisions/${currentAId}/outcomes`, { token: tokenFor(userB) });
    assert.equal(list.status, 404);
    const own = await server.request(`/api/decisions/${currentAId}/outcomes`, { token: tokenFor(userA) });
    assert.ok(Array.isArray(own.body.outcomes));
    assert.ok(own.body.outcomes.length >= 3, 'all recorded outcomes returned');
  });
});

describe('Feedback API', () => {
  test('POST creates feedback; a second POST upserts the single record', async () => {
    const first = await server.request(`/api/decisions/${currentAId}/feedback`, {
      method: 'POST',
      token: tokenFor(userA),
      body: { recommendationStatus: 'modified', reason: 'Adjusted scope.' },
    });
    assert.equal(first.status, 201);
    assert.equal(first.body.recommendationStatus, 'modified');

    const second = await server.request(`/api/decisions/${currentAId}/feedback`, {
      method: 'POST',
      token: tokenFor(userA),
      body: { recommendationStatus: 'accepted', comment: 'Go.' },
    });
    assert.equal(second.status, 201);
    assert.equal(second.body.recommendationStatus, 'accepted');
    assert.equal(second.body._id, first.body._id, 'same feedback record, upserted');
    assert.equal(await DecisionFeedback.countDocuments({ decisionId: currentAId }), 1);

    const get = await server.request(`/api/decisions/${currentAId}/feedback`, { token: tokenFor(userA) });
    assert.equal(get.body.recommendationStatus, 'accepted');
  });

  test('a rejected decision is a human statement, not an automatic model-failure', async () => {
    const before = await Decision.findOne({ _id: currentAId });
    const rejected = await server.request(`/api/decisions/${currentAId}/feedback`, {
      method: 'POST',
      token: tokenFor(userA),
      body: { recommendationStatus: 'rejected', reason: 'Budget priority shifted.' },
    });
    assert.equal(rejected.status, 201);
    assert.equal(rejected.body.recommendationStatus, 'rejected');
    const after = await Decision.findOne({ _id: currentAId });
    assert.equal(after!.status, 'completed', 'decision status untouched by rejection');
    void before;
  });

  test('invalid recommendationStatus is rejected', async () => {
    const res = await server.request(`/api/decisions/${currentAId}/feedback`, {
      method: 'POST',
      token: tokenFor(userA),
      body: { recommendationStatus: 'nope' },
    });
    assert.equal(res.status, 400);
  });

  test('cross-user feedback submission is a 404', async () => {
    const res = await server.request(`/api/decisions/${currentAId}/feedback`, {
      method: 'POST',
      token: tokenFor(userB),
      body: { recommendationStatus: 'accepted' },
    });
    assert.equal(res.status, 404);
  });
});

describe('Lessons API', () => {
  test('a human lesson is created already confirmed (the act of writing confirms it)', async () => {
    const res = await server.request(`/api/decisions/${currentAId}/lessons`, {
      method: 'POST',
      token: tokenFor(userA),
      body: { text: 'Validate cost estimates earlier.', source: 'human' },
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.source, 'human');
    assert.equal(res.body.status, 'confirmed');
  });

  test('an LLM suggestion can never be created as confirmed', async () => {
    const res = await server.request(`/api/decisions/${currentAId}/lessons`, {
      method: 'POST',
      token: tokenFor(userA),
      body: { text: 'Always document rollback plans.', source: 'llm_suggestion', status: 'confirmed' },
    });
    assert.equal(res.status, 400);
  });

  test('an LLM suggestion starts unconfirmed and a human PATCH later confirms it', async () => {
    const created = await server.request(`/api/decisions/${currentAId}/lessons`, {
      method: 'POST',
      token: tokenFor(userA),
      body: { text: 'Document rollback plans.', source: 'llm_suggestion' },
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.source, 'llm_suggestion');
    assert.equal(created.body.status, 'unconfirmed', 'suggestion starts unconfirmed');

    const patched = await server.request(`/api/decisions/${currentAId}/lessons/${created.body._id}`, {
      method: 'PATCH',
      token: tokenFor(userA),
      body: { status: 'confirmed' },
    });
    assert.equal(patched.status, 200);
    assert.equal(patched.body.status, 'confirmed', 'human confirmation via PATCH is the documented path');
  });

  test('invalid lesson payload is rejected', async () => {
    const res = await server.request(`/api/decisions/${currentAId}/lessons`, {
      method: 'POST',
      token: tokenFor(userA),
      body: { text: '' },
    });
    assert.equal(res.status, 400);
  });

  test('cross-user lesson writes are a 404', async () => {
    const res = await server.request(`/api/decisions/${currentAId}/lessons`, {
      method: 'POST',
      token: tokenFor(userB),
      body: { text: 'nope', source: 'human' },
    });
    assert.equal(res.status, 404);
  });
});

describe('Retrieval (related decisions)', () => {
  test('returns only terminal, same-user, non-current decisions, sorted by relevance', async () => {
    const res = await server.request(`/api/decisions/${currentAId}/related`, { token: tokenFor(userA) });
    assert.equal(res.status, 200);
    const titles = res.body.memories.map((m: any) => m.title);

    assert.ok(titles.includes('Past microservices adoption'), 'strong match by tags + category');
    assert.ok(titles.includes('Past cloud migration'), 'category-only match above minimum relevance');
    assert.ok(!titles.includes('In-flight microservices topic'), 'draft/in-flight decisions never surface');
    assert.ok(!titles.includes("Other user's private microservices plan"), 'never leaks another user');
    assert.ok(!titles.includes('Current decision'), 'current decision is excluded');

    for (const m of res.body.memories) {
      assert.ok(m.relevance >= 0.08, `relevance above minimum (got ${m.relevance})`);
      assert.ok(Array.isArray(m.relatedBecause) && m.relatedBecause.length > 0, 'explainable reasons present');
      assert.ok(m.relatedBecause.every((r: string) => typeof r === 'string' && r.length > 0));
    }

    assert.equal(res.body.memories[0].title, 'Past microservices adoption', 'most relevant first');
    assert.equal(res.body.policyVersion, 'memory-policy-v1');
    assert.equal(res.body.provider, 'structured');
  });

  test('outcome/lesson/feedback metadata is surfaced so consumers can judge reliability', async () => {
    const res = await server.request(`/api/decisions/${currentAId}/related`, { token: tokenFor(userA) });
    const a1 = res.body.memories.find((m: any) => m.title === 'Past microservices adoption');
    assert.ok(a1, 'rich memory returned');
    assert.ok(a1.outcome, 'outcome envelope present');
    assert.equal(a1.outcome.status, 'success');
    assert.equal(a1.outcome.humanConfirmed, true);
    assert.equal(a1.outcome.source, 'human');
    assert.equal(a1.lessonCount, 1);
    assert.equal(a1.feedbackPresent, true);
  });

  test('outputType filtering narrows retrieval to a recorded outcome status', async () => {
    const result = await decisionRetrievalService.retrieve(
      {
        userId: userA,
        excludeDecisionId: currentAId,
        category: 'technology',
        tags: ['microservices'],
        outputType: 'success',
      },
      { emitEvent: false }
    );
    assert.ok(result.memories.some((m) => m.title === 'Past microservices adoption'));
    for (const m of result.memories) {
      assert.equal(m.outcome?.status, 'success');
    }
  });

  test('policy caps the result set and reports truncation', async () => {
    const result = await decisionRetrievalService.retrieve(
      {
        userId: userA,
        excludeDecisionId: currentAId,
        category: 'technology',
      },
      { policy: makeMemoryPolicy({ maxMemories: 1 }), emitEvent: false }
    );
    assert.equal(result.memories.length, 1);
    assert.equal(result.truncated, true);
    assert.ok(result.memories[0].relevance >= 0.08);
  });
});

describe('MemoryContextBuilder (planner input)', () => {
  test('builds a bounded, UNTRUSTED reference block that never leaks other users', async () => {
    const ctx = await memoryContextBuilder.buildForPlanning({
      userId: userA,
      decisionId: currentAId,
      category: 'technology',
      tags: ['microservices'],
    });

    assert.equal(ctx.enabled, true);
    assert.ok(ctx.contextSize > 0);
    assert.ok(ctx.contextSize <= 3000, `context within policy cap (${ctx.contextSize})`);
    assert.match(ctx.contextText, /<historical_decision_memory>/);
    assert.match(ctx.contextText, /UNTRUSTED REFERENCE DATA/);
    assert.match(ctx.contextText, /Past microservices adoption/);
    assert.ok(!ctx.contextText.includes('Current decision'), 'current decision excluded from its own context');
    assert.ok(!ctx.contextText.includes("Other user's private"), 'no cross-user leakage');
    assert.ok(!ctx.contextText.includes('In-flight microservices topic'), 'in-flight decisions excluded');
    assert.equal(ctx.retrieval.policyVersion, 'memory-policy-v1');
  });

  test('planner-path retrieval emits no memory.retrieved events', async () => {
    const before = await ExecutionEvent.countDocuments({ type: 'memory.retrieved' });
    await memoryContextBuilder.buildForPlanning({
      userId: userA,
      decisionId: currentAId,
      category: 'technology',
    });
    await new Promise((r) => setTimeout(r, 100));
    const after = await ExecutionEvent.countDocuments({ type: 'memory.retrieved' });
    assert.equal(after, before, 'no retrieval event persisted on the silent planner path');
  });

  test('a disabled policy yields an empty, inert context', async () => {
    const ctx = await memoryContextBuilder.buildForPlanning({
      userId: userA,
      decisionId: currentAId,
      category: 'technology',
      policy: makeMemoryPolicy({ enabled: false }),
    });
    assert.equal(ctx.enabled, false);
    assert.equal(ctx.contextText, '');
    assert.equal(ctx.memories.length, 0);
  });
});

describe('Other-user memory never surfaces', () => {
  test('userB sees only their own related decisions', async () => {
    const res = await server.request(`/api/decisions/${histB1Id}/related`, { token: tokenFor(userB) });
    assert.equal(res.status, 200);
    const titles = res.body.memories.map((m: any) => m.title);
    assert.ok(titles.includes("Other user's secondary plan"), 'own secondary history returned');
    assert.ok(!titles.includes('Past microservices adoption'), 'userA history never leaks');
    assert.ok(!titles.includes('Past cloud migration'), 'userA history never leaks');
  });
});

describe('DELETE purge', () => {
  test('deleting a decision removes its memory, outcomes, feedback and lessons', async () => {
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
    assert.equal(before.status, 200);
    assert.equal(before.body.outcomes.length, 1);
    assert.ok(before.body.feedback);
    assert.equal(before.body.lessons.length, 1);

    const del = await server.request(`/api/decisions/${deleteMeId}`, {
      method: 'DELETE',
      token: tokenFor(userA),
    });
    assert.equal(del.status, 200);
    assert.equal(del.body.ok, true);

    assert.equal(await DecisionMemory.countDocuments({ decisionId: deleteMeId }), 0);
    assert.equal(await Outcome.countDocuments({ decisionId: deleteMeId }), 0);
    assert.equal(await DecisionFeedback.countDocuments({ decisionId: deleteMeId }), 0);
    assert.equal(await DecisionLesson.countDocuments({ decisionId: deleteMeId }), 0);
    assert.equal(await Decision.countDocuments({ _id: deleteMeId }), 0);
  });
});