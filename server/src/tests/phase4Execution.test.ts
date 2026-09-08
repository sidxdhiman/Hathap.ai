import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Decision from '../models/Decision';
import Execution from '../models/Execution';
import Task from '../models/Task';
import Claim from '../models/Claim';
import Evidence from '../models/Evidence';
import VerificationResult from '../models/VerificationResult';
import RedTeamFinding from '../models/RedTeamFinding';
import ReconciliationResult from '../models/ReconciliationResult';
import EvidenceRelationship from '../models/EvidenceRelationship';
import { TaskExecutor } from '../decision/executor';
import { Worker } from '../tasks/worker';
import { DefaultTaskHandlerRegistry } from '../tasks/handlers';
import { verifyClaimHandler } from '../tasks/handlers/verifyClaimHandler';
import { redTeamHandler } from '../tasks/handlers/redTeamHandler';
import { reconciliationHandler } from '../tasks/handlers/reconciliationHandler';
import {
  TaskHandler,
  TaskHandlerRegistry,
  TaskHandlerContext,
  TaskType,
} from '../decision/types';

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
class FakeDebateHandler implements TaskHandler {
  type: TaskType = 'debate';
  canHandle(type: TaskType) {
    return type === 'debate';
  }
  async execute(task: any, context: TaskHandlerContext) {
    const selectedClaims = await Claim.find({ decisionId: context.decisionId }).sort({
      createdAt: 1,
    });
    const evidenceDocs = await Evidence.find({ decisionId: context.decisionId });
    const allEvidenceIds = evidenceDocs.map((e) => e._id.toString());

    const verifyTaskIds: string[] = [];
    for (const claim of selectedClaims) {
      const vc = await Task.create({
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

    const rt = await Task.create({
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

    const rc = await Task.create({
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

function makeRegistry(): TaskHandlerRegistry {
  return new DefaultTaskHandlerRegistry([
    new FakeDebateHandler(),
    verifyClaimHandler,
    redTeamHandler,
    reconciliationHandler,
  ]);
}

function makeWorker() {
  const executor = new TaskExecutor({
    registry: makeRegistry(),
    workerId: 'test-worker',
    backoff: () => 5,
  });
  return new Worker({
    executor,
    pollIntervalMs: 100_000,
    maxConcurrentTasks: 6,
    staleTaskTimeoutMs: 120_000,
  });
}

async function clean(): Promise<void> {
  await Promise.all([
    Decision.deleteMany({}),
    Execution.deleteMany({}),
    Task.deleteMany({}),
    Claim.deleteMany({}),
    Evidence.deleteMany({}),
    VerificationResult.deleteMany({}),
    RedTeamFinding.deleteMany({}),
    ReconciliationResult.deleteMany({}),
    EvidenceRelationship.deleteMany({}),
  ]);
}

async function waitUntil(fn: () => Promise<boolean>, timeoutMs = 8000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 30));
  }
  throw new Error('Timed out waiting for condition');
}

let decisionId: string;
let executionId: string;

before(async () => {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(TEST_URI);
  }
  await clean();
  const user = new mongoose.Types.ObjectId().toString();
  const decision = await Decision.create({
    userId: user,
    title: 'Phase 4 Graph',
    objective: 'Should we adopt microservices?',
    context: 'Test full graph.',
    status: 'debating',
    currentPhase: 'debating',
    configuration: { strategy: 'consensus', maxRounds: 2 },
  });
  decisionId = decision._id.toString();

  const exec = await Execution.create({
    decisionId,
    status: 'queued',
    currentPhase: 'debating',
    progress: 0,
  });
  executionId = exec._id.toString();

  // Debated claims + evidence to feed the downstream graph.
  await Claim.create({
    decisionId,
    text: 'Microservices reduce downtime.',
    type: 'fact',
    evidenceIds: [],
  });
  await Claim.create({
    decisionId,
    text: 'Team has SRE expertise.',
    type: 'assumption',
    evidenceIds: [],
  });
  const ev = await Evidence.create({
    decisionId,
    title: 'Evidence 1',
    content: 'Supports microservices.',
    sourceType: 'user_input',
  });
  const ev2 = await Evidence.create({
    decisionId,
    title: 'Evidence 2',
    content: 'Contradicts microservices.',
    sourceType: 'user_input',
  });

  // Give the first claim explicit contradictory evidence so verification has
  // real signal and red team has a contradiction to flag.
  const firstClaim = await Claim.findOne({ decisionId, text: 'Microservices reduce downtime.' });
  assert.ok(firstClaim, 'first claim should exist');
  await evidenceGraphServiceLink(firstClaim._id.toString(), ev2._id.toString());
});

async function evidenceGraphServiceLink(claimId: string, evidenceId: string) {
  const { evidenceGraphService } = await import('../decision/evidenceGraphService');
  await evidenceGraphService.upsertRelationship({
    claimId,
    evidenceId,
    relationship: 'contradicts',
    source: 'research',
    decisionId,
  });
}

after(async () => {
  await clean();
  await mongoose.connection.close();
});

describe('Phase 4 full execution graph (persistent, real task IDs)', () => {
  test('debate → verify + red_team (parallel) → reconciliation completes', async () => {
    // Seed the debate task that starts the graph.
    await Task.create({
      executionId,
      type: 'debate',
      status: 'pending',
      priority: 10,
      input: { strategy: 'consensus' },
      dependencies: [],
    });

    const worker = makeWorker();
    for (let i = 0; i < 40 && (await Execution.findById(executionId))?.status !== 'completed'; i++) {
      await worker.tickNow();
      await new Promise((r) => setTimeout(r, 30));
    }

    await waitUntil(async () => {
      const e = await Execution.findById(executionId);
      return !!e && e.status === 'completed';
    });

    const tasks = await Task.find({ executionId }).sort({ type: 1 });
    const byType: Record<string, number> = {};
    for (const t of tasks) byType[t.type] = (byType[t.type] || 0) + 1;

    assert.ok(byType['debate'] >= 1, 'debate task ran');
    assert.ok(byType['verify_claim'] >= 1, 'verify_claim tasks ran');
    assert.ok(byType['red_team'] === 1, 'red_team task ran exactly once');
    assert.ok(byType['reconciliation'] === 1, 'reconciliation task ran exactly once');

    // Parent debate + downstream tasks complete.
    for (const t of tasks) {
      assert.equal(t.status, 'completed', `task ${t.type} should complete`);
    }

    // Verification results persisted.
    const verifications = await VerificationResult.find({ decisionId });
    assert.ok(verifications.length >= 1, 'verification results persisted');

    // Red team findings persisted.
    const findings = await RedTeamFinding.find({ decisionId });
    assert.ok(findings.length >= 1, 'red team findings persisted');

    // Reconciliation result persisted and reflects deterministic semantics.
    const recon = await ReconciliationResult.findOne({ decisionId });
    assert.ok(recon, 'reconciliation result persisted');
    assert.ok(recon.recommendation, 'reconciliation carries a recommendation');
    assert.ok(Array.isArray(recon.survivingClaimIds));
    assert.ok(Array.isArray(recon.rejectedClaimIds));
  });

  test('contradicted claim is rejected, not merely unsupported', async () => {
    const recon = await ReconciliationResult.findOne({ decisionId });
    assert.ok(recon, 'reconciliation exists');
    const contradictedClaim = await Claim.findOne({
      decisionId,
      text: 'Microservices reduce downtime.',
    });
    const claimId = contradictedClaim!._id.toString();
    assert.ok(
      recon!.rejectedClaimIds.includes(claimId),
      'contradicted claim should be rejected'
    );
    assert.ok(
      !recon!.survivingClaimIds.includes(claimId),
      'contradicted claim should NOT survive'
    );
  });

  test('reconciliation flags needsMoreResearch due to contradictions', async () => {
    const recon = await ReconciliationResult.findOne({ decisionId });
    assert.equal(recon!.needsMoreResearch, true);
    assert.ok(Array.isArray(recon!.researchQuestions));
  });

  test('reconciliation is terminal and does not reschedule research', async () => {
    // No verify/red_team/reconciliation tasks should remain pending after completion.
    const pending = await Task.find({ executionId, status: { $in: ['pending', 'ready', 'running'] } });
    assert.equal(pending.length, 0, 'no tasks left running after completion');
    // And no research tasks were spawned by the graph.
    const researchTasks = await Task.find({ executionId, type: 'research' });
    assert.equal(researchTasks.length, 0, 'no research recursion from the Phase 4 graph');
  });
});
