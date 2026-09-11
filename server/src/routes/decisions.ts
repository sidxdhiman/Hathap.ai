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
import DecisionMemory from '../models/DecisionMemory';
import Outcome from '../models/Outcome';
import DecisionFeedback from '../models/DecisionFeedback';
import DecisionLesson from '../models/DecisionLesson';
import { requireAuth, AuthRequest } from '../middleware/authMiddleware';
import { decisionOrchestrator } from '../decision/orchestrator';
import { StateMachine } from '../decision/stateMachine';
import { evidenceGraphService } from '../decision/evidenceGraphService';
import { decisionPlanner } from '../planning/planner';
import DecisionPlan from '../models/DecisionPlan';
import { routeTaskRouter } from '../routing';
import { TaskType } from '../decision/types';
import { executionEventBus } from '../decision/eventBus';
import { decisionMemoryService } from '../memory/decisionMemoryService';
import { decisionRetrievalService } from '../memory/decisionRetrievalService';
import { outcomeService, cleanOutcomeInput, cleanOutcomePatch } from '../memory/outcomeService';
import { feedbackService, cleanFeedbackInput } from '../memory/feedbackService';
import { lessonsService, cleanLessonInput, LessonInput } from '../memory/lessonService';

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
    await DecisionPlan.deleteMany({ decisionId: req.params.id });
    // Phase 8: memory/outcome records are derived user data; deleting the
    // decision must not leave inaccessible orphans behind.
    await DecisionMemory.deleteMany({ decisionId: req.params.id });
    await Outcome.deleteMany({ decisionId: req.params.id });
    await DecisionFeedback.deleteMany({ decisionId: req.params.id });
    await DecisionLesson.deleteMany({ decisionId: req.params.id });
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
    const routingMode = req.body?.routingMode === 'manual' ? 'manual' : 'auto';
    const routingModelId = typeof req.body?.routingModelId === 'string' ? req.body.routingModelId : undefined;
    const execution = await decisionOrchestrator.startDecision(req.params.id, req.userId!, {
      researchQueries: researchQueries.slice(0, 5),
      planningMode,
      routingMode,
      routingModelId,
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
      routingMode,
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

/** GET /api/decisions/:id/plans/:planId/routing-preview — dry-run planned
 *  routing. Computed with the live policy but never persisted and never emits
 *  events; the UI labels this as "Estimated / planned routing". */
router.get('/:id/plans/:planId/routing-preview', requireAuth, async (req: AuthRequest, res) => {
  try {
    const decision = await Decision.findOne({ _id: req.params.id, userId: req.userId });
    if (!decision) return res.status(404).json({ error: 'Decision not found.' });
    const plan = await DecisionPlan.findOne({
      _id: req.params.planId,
      decisionId: decision._id,
    });
    if (!plan) return res.status(404).json({ error: 'Plan not found.' });

    const preview = [];
    for (const plannedTask of (plan.tasks as Array<Record<string, unknown>>) || []) {
      const taskType = plannedTask.type as TaskType;
      const requirements = (plannedTask.requirements as string[] | undefined) || [];
      const result = await routeTaskRouter.routeTask({
        userId: String(req.userId),
        decisionId: decision._id.toString(),
        executionId: String(plan.executionId),
        taskType,
        requirements,
        emitEvents: false,
      });
      preview.push({
        type: taskType,
        tempId: plannedTask.tempId,
        purpose: plannedTask.purpose,
        requirements,
        ...(result.status === 'selected'
          ? {
              status: 'selected',
              agent: result.agent ? { id: result.agent.id, name: result.agent.name } : null,
              model: {
                id: result.model.id,
                modelName: result.model.modelName,
                provider: result.model.provider,
                displayName: result.model.displayName,
              },
              score: result.score.total,
              estimatedCost: result.estimate.estimatedCost,
              pricingKnown: result.estimate.pricingKnown,
              reasons: result.reasons,
              favoredBy: result.score.factors.filter((f) => f.weight > 0).map((f) => ({
                name: f.name,
                value: f.value,
                weight: f.weight,
              })),
            }
          : { status: result.status, reason: 'message' in result ? result.message : (result as { reason: string }).reason }),
      });
    }

    res.json({
      planningMode: plan.planningMode,
      policyVersion: routeTaskRouter.policyVersion(),
      estimated: true,
      tasks: preview,
    });
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

// ---- Phase 7: Observability endpoints ----

/** GET /api/decisions/:id/events — ordered execution events for the decision timeline */
router.get('/:id/events', requireAuth, async (req: AuthRequest, res) => {
  try {
    const decision = await Decision.findOne({ _id: req.params.id, userId: req.userId });
    if (!decision) return res.status(404).json({ error: 'Decision not found.' });
    const events = await executionEventBus.listByDecision(decision._id.toString());
    res.json(events);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

function relationsToEvidenceIds(rels: Array<{ evidenceId: string }>): string[] {
  return rels.map((r) => r.evidenceId);
}

// ---- Phase 8: Decision Memory & Outcomes ----

const memoryMeta = (decision: any) => ({
  category: typeof decision.metadata?.category === 'string' ? decision.metadata.category : undefined,
  domain: typeof decision.metadata?.domain === 'string' ? decision.metadata.domain : undefined,
  problemType: typeof decision.metadata?.problemType === 'string' ? decision.metadata.problemType : undefined,
  tags: Array.isArray(decision.metadata?.tags) ? decision.metadata.tags.filter((t: unknown) => typeof t === 'string') : undefined,
  entities: Array.isArray(decision.metadata?.entities) ? decision.metadata.entities.filter((e: unknown) => typeof e === 'string') : undefined,
});

/** GET /api/decisions/:id/memory — the decision's memory view (memory + outcomes
 *  + feedback + lessons + quality signals). Memory is built on-demand for
 *  terminal decisions that completed before Phase 8. */
router.get('/:id/memory', requireAuth, async (req: AuthRequest, res) => {
  try {
    const decision = await Decision.findOne({ _id: req.params.id, userId: req.userId });
    if (!decision) return res.status(404).json({ error: 'Decision not found.' });
    const decisionId = decision._id.toString();
    const [memory, outcomes, feedback, lessons, quality] = await Promise.all([
      decisionMemoryService.ensureMemory(decisionId, req.userId!),
      outcomeService.list(req.userId!, decisionId),
      feedbackService.get(req.userId!, decisionId),
      lessonsService.list(req.userId!, decisionId),
      decisionMemoryService.getDecisionQuality(decisionId, req.userId!),
    ]);
    res.json({ memory, outcomes, feedback, lessons, quality });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/** GET /api/decisions/:id/related — explainable related historical decisions
 *  owned by the same user (current decision excluded). */
router.get('/:id/related', requireAuth, async (req: AuthRequest, res) => {
  try {
    const decision = await Decision.findOne({ _id: req.params.id, userId: req.userId });
    if (!decision) return res.status(404).json({ error: 'Decision not found.' });
    const meta = memoryMeta(decision);
    const result = await decisionRetrievalService.retrieve({
      userId: req.userId!,
      excludeDecisionId: decision._id.toString(),
      title: decision.title,
      objective: decision.objective,
      description: decision.context,
      category: meta.category,
      domain: meta.domain,
      problemType: meta.problemType,
      tags: meta.tags,
      entities: meta.entities,
    });
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/** GET /api/decisions/:id/outcomes — all outcomes plus the expected-vs-actual summary. */
router.get('/:id/outcomes', requireAuth, async (req: AuthRequest, res) => {
  try {
    const decision = await Decision.findOne({ _id: req.params.id, userId: req.userId });
    if (!decision) return res.status(404).json({ error: 'Decision not found.' });
    const [outcomes, expectedVsActual] = await Promise.all([
      outcomeService.list(req.userId!, decision._id.toString()),
      outcomeService.expectedVsActual(req.userId!, decision._id.toString()),
    ]);
    res.json({ outcomes, expectedVsActual });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/** POST /api/decisions/:id/outcomes — record an expected or actual outcome. */
router.post('/:id/outcomes', requireAuth, async (req: AuthRequest, res) => {
  try {
    const decision = await Decision.findOne({ _id: req.params.id, userId: req.userId });
    if (!decision) return res.status(404).json({ error: 'Decision not found.' });
    const kind = req.body?.kind === 'expected' ? 'expected' : 'actual';
    const input = cleanOutcomeInput(req.body, kind, kind === 'expected' ? 'pending' : 'unknown');
    const created = await outcomeService.create(req.userId!, decision._id.toString(), input);
    res.status(201).json(created);
  } catch (error: any) {
    if (error?.name === 'OutcomeValidationError') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

/** PATCH /api/decisions/:id/outcomes/:outcomeId — update an outcome over time. */
router.patch('/:id/outcomes/:outcomeId', requireAuth, async (req: AuthRequest, res) => {
  try {
    const decision = await Decision.findOne({ _id: req.params.id, userId: req.userId });
    if (!decision) return res.status(404).json({ error: 'Decision not found.' });
    const patch = cleanOutcomePatch(req.body);
    const updated = await outcomeService.update(
      req.userId!,
      decision._id.toString(),
      req.params.outcomeId,
      patch
    );
    if (!updated) return res.status(404).json({ error: 'Outcome not found.' });
    res.json(updated);
  } catch (error: any) {
    if (error?.name === 'OutcomeValidationError') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

/** GET /api/decisions/:id/feedback — the decision's human feedback (or null). */
router.get('/:id/feedback', requireAuth, async (req: AuthRequest, res) => {
  try {
    const decision = await Decision.findOne({ _id: req.params.id, userId: req.userId });
    if (!decision) return res.status(404).json({ error: 'Decision not found.' });
    const feedback = await feedbackService.get(req.userId!, decision._id.toString());
    res.json(feedback);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/** POST /api/decisions/:id/feedback — submit (or update) human feedback. */
router.post('/:id/feedback', requireAuth, async (req: AuthRequest, res) => {
  try {
    const decision = await Decision.findOne({ _id: req.params.id, userId: req.userId });
    if (!decision) return res.status(404).json({ error: 'Decision not found.' });
    const input = cleanFeedbackInput(req.body);
    const saved = await feedbackService.upsert(req.userId!, decision._id.toString(), input);
    res.status(201).json(saved);
  } catch (error: any) {
    if (error?.name === 'FeedbackValidationError') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

/** GET /api/decisions/:id/lessons — lessons learned for the decision. */
router.get('/:id/lessons', requireAuth, async (req: AuthRequest, res) => {
  try {
    const decision = await Decision.findOne({ _id: req.params.id, userId: req.userId });
    if (!decision) return res.status(404).json({ error: 'Decision not found.' });
    const lessons = await lessonsService.list(req.userId!, decision._id.toString());
    res.json(lessons);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/** POST /api/decisions/:id/lessons — record a human lesson or an unconfirmed
 *  LLM suggestion (never confirmed at creation). */
router.post('/:id/lessons', requireAuth, async (req: AuthRequest, res) => {
  try {
    const decision = await Decision.findOne({ _id: req.params.id, userId: req.userId });
    if (!decision) return res.status(404).json({ error: 'Decision not found.' });
    const input = cleanLessonInput(req.body);
    const created = await lessonsService.create(req.userId!, decision._id.toString(), input);
    res.status(201).json(created);
  } catch (error: any) {
    if (error?.name === 'LessonValidationError') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

/** PATCH /api/decisions/:id/lessons/:lessonId — update a lesson (e.g. a human
 *  confirms an LLM suggestion). */
router.patch('/:id/lessons/:lessonId', requireAuth, async (req: AuthRequest, res) => {
  try {
    const decision = await Decision.findOne({ _id: req.params.id, userId: req.userId });
    if (!decision) return res.status(404).json({ error: 'Decision not found.' });
    const current = await DecisionLesson.findOne({ _id: req.params.lessonId, decisionId: decision._id });
    if (!current) return res.status(404).json({ error: 'Lesson not found.' });

    const patch: Partial<LessonInput> = {};
    if (typeof req.body?.text === 'string' && req.body.text.trim()) patch.text = req.body.text.trim();
    if (req.body?.status === 'confirmed' || req.body?.status === 'unconfirmed') patch.status = req.body.status;
    if (typeof req.body?.metricName === 'string') patch.metricName = req.body.metricName;
    if (Array.isArray(req.body?.evidenceIds)) {
      patch.evidenceIds = req.body.evidenceIds.filter((e: unknown): e is string => typeof e === 'string');
    }

    const updated = await lessonsService.update(
      req.userId!,
      decision._id.toString(),
      req.params.lessonId,
      patch
    );
    if (!updated) return res.status(404).json({ error: 'Lesson not found.' });
    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
