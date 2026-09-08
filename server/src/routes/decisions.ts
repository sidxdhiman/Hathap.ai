import express from 'express';
import Decision from '../models/Decision';
import Execution from '../models/Execution';
import Task from '../models/Task';
import Claim from '../models/Claim';
import Evidence from '../models/Evidence';
import EvidenceRelationship from '../models/EvidenceRelationship';
import VerificationResult from '../models/VerificationResult';
import RedTeamFinding from '../models/RedTeamFinding';
import ReconciliationResult from '../models/ReconciliationResult';
import { requireAuth, AuthRequest } from '../middleware/authMiddleware';
import { decisionOrchestrator } from '../decision/orchestrator';
import { StateMachine } from '../decision/stateMachine';
import { evidenceGraphService } from '../decision/evidenceGraphService';
import { decisionPlanner } from '../planning/planner';
import DecisionPlan from '../models/DecisionPlan';

const router = express.Router();

router.get('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const items = await Decision.find({ userId: req.userId }).sort({ createdAt: -1 });
    res.json(items);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/states', requireAuth, async (_req: AuthRequest, res) => {
  res.json({
    decisions: StateMachine.allDecisionTransitions(),
    executions: StateMachine.allExecutionTransitions(),
    tasks: StateMachine.allTaskTransitions(),
  });
});

router.post('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { title, objective, context, configuration, participants, assumptions, metadata } = req.body;
    if (!title || !objective) {
      return res.status(400).json({ error: 'Title and objective are required.' });
    }
    const decision = await decisionOrchestrator.createDecision({
      userId: req.userId!,
      title,
      objective,
      context,
      configuration,
      participants,
      assumptions,
      metadata,
    });
    res.status(201).json(decision);
  } catch (error: any) {
    console.error('[Decisions POST]', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const decision = await Decision.findOne({ _id: req.params.id, userId: req.userId });
    if (!decision) return res.status(404).json({ error: 'Decision not found.' });
    res.json(decision);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { _id, id: bodyId, ...updates } = req.body;
    const updated = await Decision.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      updates,
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: 'Decision not found.' });
    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    await Decision.deleteOne({ _id: req.params.id, userId: req.userId });
    await Execution.deleteMany({ decisionId: req.params.id });
    await Task.deleteMany({ executionId: { $in: (await Execution.find({ decisionId: req.params.id })).map((e) => e._id) } });
    await Claim.deleteMany({ decisionId: req.params.id });
    await Evidence.deleteMany({ decisionId: req.params.id });
    await EvidenceRelationship.deleteMany({ decisionId: req.params.id });
    await VerificationResult.deleteMany({ decisionId: req.params.id });
    await RedTeamFinding.deleteMany({ decisionId: req.params.id });
    await ReconciliationResult.deleteMany({ decisionId: req.params.id });
    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/start', requireAuth, async (req: AuthRequest, res) => {
  try {
    const researchQueries: Array<{ query: string; purpose?: string; maxResults?: number }> = Array.isArray(
      req.body?.researchQueries
    )
      ? req.body.researchQueries
          .filter((q: any) => q && typeof q.query === 'string' && q.query.trim())
          .map((q: any) => ({ query: q.query.trim(), purpose: q.purpose, maxResults: q.maxResults }))
      : [];
    const planningMode = req.body?.planningMode === 'intelligent' ? 'intelligent' : 'fixed';
    const execution = await decisionOrchestrator.startDecision(req.params.id, req.userId!, {
      researchQueries: researchQueries.slice(0, 5),
      planningMode,
    });
    // Accepted: the execution was persisted and queued; it runs in the
    // background. We return the Execution identifier immediately rather than
    // pretending the Decision already completed.
    res.status(202).json({
      success: true,
      status: 'accepted',
      executionId: execution._id.toString(),
      execution,
      researchQueries,
      planningMode,
    });
  } catch (error: any) {
    console.error('[Decisions start]', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /api/decisions/:id/plan — generate (or reuse) an intelligent plan for
 * the decision's execution. Planning is idempotent per execution: a decision
 * that already has a compiled plan returns it instead of regenerating.
 */
router.post('/:id/plan', requireAuth, async (req: AuthRequest, res) => {
  try {
    const decision = await Decision.findOne({ _id: req.params.id, userId: req.userId });
    if (!decision) return res.status(404).json({ error: 'Decision not found.' });

    const requestedExecutionId = req.body?.executionId as string | undefined;
    let execution = requestedExecutionId
      ? await Execution.findOne({ _id: requestedExecutionId, decisionId: decision._id })
      : null;
    if (requestedExecutionId && !execution) {
      return res.status(404).json({ error: 'Execution not found.' });
    }

    if (!execution) {
      // Create a fresh planning execution. It stays `pending`/`planning` — the
      // Worker ignores it until `/start` or the caller queues it.
      execution = await Execution.create({
        decisionId: decision._id,
        status: 'pending',
        startedAt: new Date(),
        currentPhase: 'debating',
        progress: 0,
        planningStatus: 'planning',
        planningMode: 'intelligent',
      });
    }

    const result = await decisionPlanner.planExecution({
      executionId: execution._id.toString(),
      userId: req.userId!,
      planningMode: 'intelligent',
      researchQueries: req.body?.researchQueries,
    });

    res.json({
      planId: result.compiled.persistedPlan._id.toString(),
      executionId: result.executionId,
      planningMode: 'intelligent',
      source: result.planSource,
      plannerModel: result.plannerModel,
      plan: result.plan,
    });
  } catch (error: any) {
    console.error('[Decisions plan]', error);
    res.status(400).json({ error: error.message });
  }
});

/** GET /api/decisions/:id/plans — all plans for a decision (ownership-checked). */
router.get('/:id/plans', requireAuth, async (req: AuthRequest, res) => {
  try {
    const decision = await Decision.findOne({ _id: req.params.id, userId: req.userId });
    if (!decision) return res.status(404).json({ error: 'Decision not found.' });
    const plans = await DecisionPlan.find({ decisionId: decision._id }).sort({ createdAt: -1 });
    res.json(plans);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/** GET /api/decisions/:id/plans/:planId — a single owned plan. */
router.get('/:id/plans/:planId', requireAuth, async (req: AuthRequest, res) => {
  try {
    const decision = await Decision.findOne({ _id: req.params.id, userId: req.userId });
    if (!decision) return res.status(404).json({ error: 'Decision not found.' });
    const plan = await DecisionPlan.findOne({
      _id: req.params.planId,
      decisionId: decision._id,
    });
    if (!plan) return res.status(404).json({ error: 'Plan not found.' });
    res.json(plan);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/pause', requireAuth, async (req: AuthRequest, res) => {
  try {
    await decisionOrchestrator.pauseDecision(req.params.id, req.userId!);
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/:id/resume', requireAuth, async (req: AuthRequest, res) => {
  try {
    await decisionOrchestrator.resumeDecision(req.params.id, req.userId!);
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/:id/cancel', requireAuth, async (req: AuthRequest, res) => {
  try {
    await decisionOrchestrator.cancelDecision(req.params.id, req.userId!);
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/:id/executions', requireAuth, async (req: AuthRequest, res) => {
  try {
    const decision = await Decision.findOne({ _id: req.params.id, userId: req.userId });
    if (!decision) return res.status(404).json({ error: 'Decision not found.' });
    const executions = await Execution.find({ decisionId: req.params.id }).sort({ createdAt: -1 });
    res.json(executions);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id/executions/:executionId', requireAuth, async (req: AuthRequest, res) => {
  try {
    const decision = await Decision.findOne({ _id: req.params.id, userId: req.userId });
    if (!decision) return res.status(404).json({ error: 'Decision not found.' });
    const execution = await Execution.findOne({
      _id: req.params.executionId,
      decisionId: decision._id,
    });
    if (!execution) return res.status(404).json({ error: 'Execution not found.' });
    res.json(execution);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id/tasks', requireAuth, async (req: AuthRequest, res) => {
  try {
    const decision = await Decision.findOne({ _id: req.params.id, userId: req.userId });
    if (!decision) return res.status(404).json({ error: 'Decision not found.' });
    const executions = await Execution.find({ decisionId: req.params.id });
    const ids = executions.map((e) => e._id);
    const tasks = await Task.find({ executionId: { $in: ids } }).sort({ priority: 1, createdAt: 1 });
    res.json(tasks);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id/tasks/:taskId', requireAuth, async (req: AuthRequest, res) => {
  try {
    const decision = await Decision.findOne({ _id: req.params.id, userId: req.userId });
    if (!decision) return res.status(404).json({ error: 'Decision not found.' });
    const executions = await Execution.find({ decisionId: req.params.id });
    const ids = executions.map((e) => e._id);
    const task = await Task.findOne({ _id: req.params.taskId, executionId: { $in: ids } });
    if (!task) return res.status(404).json({ error: 'Task not found.' });
    res.json(task);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id/claims', requireAuth, async (req: AuthRequest, res) => {
  try {
    const decision = await Decision.findOne({ _id: req.params.id, userId: req.userId });
    if (!decision) return res.status(404).json({ error: 'Decision not found.' });
    const claims = await Claim.find({ decisionId: req.params.id });
    res.json(claims);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id/evidence', requireAuth, async (req: AuthRequest, res) => {
  try {
    const decision = await Decision.findOne({ _id: req.params.id, userId: req.userId });
    if (!decision) return res.status(404).json({ error: 'Decision not found.' });
    const evidence = await Evidence.find({ decisionId: req.params.id });
    res.json(evidence);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id/research', requireAuth, async (req: AuthRequest, res) => {
  try {
    const decision = await Decision.findOne({ _id: req.params.id, userId: req.userId });
    if (!decision) return res.status(404).json({ error: 'Decision not found.' });
    const executions = await Execution.find({ decisionId: req.params.id });
    const ids = executions.map((e) => e._id);
    const researchTasks = await Task.find({
      executionId: { $in: ids },
      type: 'research',
    }).sort({ createdAt: 1 });
    const result = await Promise.all(
      researchTasks.map(async (t) => {
        const linked = await Evidence.find({
          decisionId: req.params.id,
          taskId: t._id.toString(),
        });
        return {
          taskId: t._id.toString(),
          status: t.status,
          priority: t.priority,
          input: t.input,
          output: t.output,
          error: t.error,
          createdAt: t.createdAt,
          evidence: linked.map((e) => ({
            id: e._id.toString(),
            title: e.title,
            snippet: e.snippet,
            sourceName: e.sourceName,
            sourceUrl: e.sourceUrl,
            provenanceKind: e.provenanceKind,
            sourceReliability: e.sourceReliability,
            relevanceScore: e.relevanceScore,
            retrievedAt: e.retrievedAt,
          })),
        };
      })
    );
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id/evidence/:evidenceId', requireAuth, async (req: AuthRequest, res) => {
  try {
    const decision = await Decision.findOne({ _id: req.params.id, userId: req.userId });
    if (!decision) return res.status(404).json({ error: 'Decision not found.' });
    const evidence = await Evidence.findOne({
      _id: req.params.evidenceId,
      decisionId: decision._id,
    });
    if (!evidence) return res.status(404).json({ error: 'Evidence not found.' });
    res.json(evidence);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id/claims/:claimId', requireAuth, async (req: AuthRequest, res) => {
  try {
    const decision = await Decision.findOne({ _id: req.params.id, userId: req.userId });
    if (!decision) return res.status(404).json({ error: 'Decision not found.' });
    const claim = await Claim.findOne({
      _id: req.params.claimId,
      decisionId: decision._id,
    });
    if (!claim) return res.status(404).json({ error: 'Claim not found.' });

    // Populate the evidence relationships documented for Phase 3.
    const [supporting, contradicting] = await Promise.all([
      Evidence.find({ _id: { $in: claim.supportingEvidenceIds || [] } }),
      Evidence.find({ _id: { $in: claim.contradictingEvidenceIds || [] } }),
    ]);

    // Phase 4: explicit evidence graph relationships
    const relationships = await evidenceGraphService.getRelationshipsForClaim(claim._id.toString());
    const relatedEvidenceIds = relationsToEvidenceIds(relationships.related);
    const [relatedEvidence, verification] = await Promise.all([
      Evidence.find({ _id: { $in: relatedEvidenceIds } }),
      VerificationResult.findOne({ claimId: claim._id.toString() }),
    ]);

    res.json({
      ...(claim.toObject ? claim.toObject() : claim),
      supportingEvidence: supporting,
      contradictingEvidence: contradicting,
      relatedEvidence,
      relationships: {
        supports: relationships.supports,
        contradicts: relationships.contradicts,
        related: relationships.related,
      },
      verification,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id/snapshot', requireAuth, async (req: AuthRequest, res) => {
  try {
    const decision = await Decision.findOne({ _id: req.params.id, userId: req.userId });
    if (!decision) return res.status(404).json({ error: 'Decision not found.' });
    const snapshot = await decisionOrchestrator.getSnapshot(req.params.id, req.userId!);
    res.json(snapshot);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ---- Phase 4 endpoints ----

/** GET /api/decisions/:id/verifications — all verification results for a decision */
router.get('/:id/verifications', requireAuth, async (req: AuthRequest, res) => {
  try {
    const decision = await Decision.findOne({ _id: req.params.id, userId: req.userId });
    if (!decision) return res.status(404).json({ error: 'Decision not found.' });
    const verifications = await VerificationResult.find({ decisionId: decision._id })
      .sort({ createdAt: 1 });
    res.json(verifications);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/** GET /api/decisions/:id/verifications/:claimId — verification for a specific claim */
router.get('/:id/verifications/:claimId', requireAuth, async (req: AuthRequest, res) => {
  try {
    const decision = await Decision.findOne({ _id: req.params.id, userId: req.userId });
    if (!decision) return res.status(404).json({ error: 'Decision not found.' });
    const claim = await Claim.findOne({ _id: req.params.claimId, decisionId: decision._id });
    if (!claim) return res.status(404).json({ error: 'Claim not found.' });
    const verification = await VerificationResult.findOne({ claimId: claim._id.toString() });
    if (!verification) return res.status(404).json({ error: 'Verification not found.' });
    res.json(verification);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/** GET /api/decisions/:id/red-team — all red-team findings for a decision */
router.get('/:id/red-team', requireAuth, async (req: AuthRequest, res) => {
  try {
    const decision = await Decision.findOne({ _id: req.params.id, userId: req.userId });
    if (!decision) return res.status(404).json({ error: 'Decision not found.' });
    const findings = await RedTeamFinding.find({ decisionId: decision._id })
      .sort({ createdAt: 1 });
    res.json(findings);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/** GET /api/decisions/:id/reconciliation — the reconciliation result for a decision */
router.get('/:id/reconciliation', requireAuth, async (req: AuthRequest, res) => {
  try {
    const decision = await Decision.findOne({ _id: req.params.id, userId: req.userId });
    if (!decision) return res.status(404).json({ error: 'Decision not found.' });
    const reconciliation = await ReconciliationResult.findOne({ decisionId: decision._id });
    if (!reconciliation) return res.status(404).json({ error: 'Reconciliation not found.' });
    res.json(reconciliation);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/** GET /api/decisions/:id/evidence-graph — all evidence relationships for a decision */
router.get('/:id/evidence-graph', requireAuth, async (req: AuthRequest, res) => {
  try {
    const decision = await Decision.findOne({ _id: req.params.id, userId: req.userId });
    if (!decision) return res.status(404).json({ error: 'Decision not found.' });
    const relationships = await evidenceGraphService.getRelationshipsForDecision(
      decision._id.toString()
    );
    res.json(relationships);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/** GET /api/decisions/:id/claims/:claimId/evidence — the claim's explicit evidence graph */
router.get('/:id/claims/:claimId/evidence', requireAuth, async (req: AuthRequest, res) => {
  try {
    const decision = await Decision.findOne({ _id: req.params.id, userId: req.userId });
    if (!decision) return res.status(404).json({ error: 'Decision not found.' });
    const claim = await Claim.findOne({ _id: req.params.claimId, decisionId: decision._id });
    if (!claim) return res.status(404).json({ error: 'Claim not found.' });

    const relationships = await evidenceGraphService.getRelationshipsForClaim(
      claim._id.toString()
    );

    const [supporting, contradicting, related] = await Promise.all([
      Evidence.find({ _id: { $in: relationsToEvidenceIds(relationships.supports) } }),
      Evidence.find({ _id: { $in: relationsToEvidenceIds(relationships.contradicts) } }),
      Evidence.find({ _id: { $in: relationsToEvidenceIds(relationships.related) } }),
    ]);

    res.json({
      claimId: claim._id.toString(),
      claimText: claim.text,
      supports: supporting,
      contradicts: contradicting,
      related,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

function relationsToEvidenceIds(rels: Array<{ evidenceId: string }>): string[] {
  return rels.map((r) => r.evidenceId);
}

export default router;
