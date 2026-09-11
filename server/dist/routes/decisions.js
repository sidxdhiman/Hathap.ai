"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const Decision_1 = __importDefault(require("../models/Decision"));
const Execution_1 = __importDefault(require("../models/Execution"));
const Task_1 = __importDefault(require("../models/Task"));
const Claim_1 = __importDefault(require("../models/Claim"));
const Evidence_1 = __importDefault(require("../models/Evidence"));
const EvidenceRelationship_1 = __importDefault(require("../models/EvidenceRelationship"));
const VerificationResult_1 = __importDefault(require("../models/VerificationResult"));
const RedTeamFinding_1 = __importDefault(require("../models/RedTeamFinding"));
const ReconciliationResult_1 = __importDefault(require("../models/ReconciliationResult"));
const DecisionMemory_1 = __importDefault(require("../models/DecisionMemory"));
const Outcome_1 = __importDefault(require("../models/Outcome"));
const DecisionFeedback_1 = __importDefault(require("../models/DecisionFeedback"));
const DecisionLesson_1 = __importDefault(require("../models/DecisionLesson"));
const authMiddleware_1 = require("../middleware/authMiddleware");
const orchestrator_1 = require("../decision/orchestrator");
const stateMachine_1 = require("../decision/stateMachine");
const evidenceGraphService_1 = require("../decision/evidenceGraphService");
const planner_1 = require("../planning/planner");
const DecisionPlan_1 = __importDefault(require("../models/DecisionPlan"));
const routing_1 = require("../routing");
const eventBus_1 = require("../decision/eventBus");
const decisionMemoryService_1 = require("../memory/decisionMemoryService");
const decisionRetrievalService_1 = require("../memory/decisionRetrievalService");
const outcomeService_1 = require("../memory/outcomeService");
const feedbackService_1 = require("../memory/feedbackService");
const lessonService_1 = require("../memory/lessonService");
const router = express_1.default.Router();
router.get('/', authMiddleware_1.requireAuth, async (req, res) => {
    try {
        const items = await Decision_1.default.find({ userId: req.userId }).sort({ createdAt: -1 });
        res.json(items);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
router.get('/states', authMiddleware_1.requireAuth, async (_req, res) => {
    res.json({
        decisions: stateMachine_1.StateMachine.allDecisionTransitions(),
        executions: stateMachine_1.StateMachine.allExecutionTransitions(),
        tasks: stateMachine_1.StateMachine.allTaskTransitions(),
    });
});
router.post('/', authMiddleware_1.requireAuth, async (req, res) => {
    try {
        const { title, objective, context, configuration, participants, assumptions, metadata } = req.body;
        if (!title || !objective) {
            return res.status(400).json({ error: 'Title and objective are required.' });
        }
        const decision = await orchestrator_1.decisionOrchestrator.createDecision({
            userId: req.userId,
            title,
            objective,
            context,
            configuration,
            participants,
            assumptions,
            metadata,
        });
        res.status(201).json(decision);
    }
    catch (error) {
        console.error('[Decisions POST]', error);
        res.status(500).json({ error: error.message });
    }
});
router.get('/:id', authMiddleware_1.requireAuth, async (req, res) => {
    try {
        const decision = await Decision_1.default.findOne({ _id: req.params.id, userId: req.userId });
        if (!decision)
            return res.status(404).json({ error: 'Decision not found.' });
        res.json(decision);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
router.put('/:id', authMiddleware_1.requireAuth, async (req, res) => {
    try {
        const { _id, id: bodyId, ...updates } = req.body;
        const updated = await Decision_1.default.findOneAndUpdate({ _id: req.params.id, userId: req.userId }, updates, { new: true });
        if (!updated)
            return res.status(404).json({ error: 'Decision not found.' });
        res.json(updated);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
router.delete('/:id', authMiddleware_1.requireAuth, async (req, res) => {
    try {
        await Decision_1.default.deleteOne({ _id: req.params.id, userId: req.userId });
        await Execution_1.default.deleteMany({ decisionId: req.params.id });
        await Task_1.default.deleteMany({ executionId: { $in: (await Execution_1.default.find({ decisionId: req.params.id })).map((e) => e._id) } });
        await Claim_1.default.deleteMany({ decisionId: req.params.id });
        await Evidence_1.default.deleteMany({ decisionId: req.params.id });
        await EvidenceRelationship_1.default.deleteMany({ decisionId: req.params.id });
        await VerificationResult_1.default.deleteMany({ decisionId: req.params.id });
        await RedTeamFinding_1.default.deleteMany({ decisionId: req.params.id });
        await ReconciliationResult_1.default.deleteMany({ decisionId: req.params.id });
        await DecisionPlan_1.default.deleteMany({ decisionId: req.params.id });
        // Phase 8: memory/outcome records are derived user data; deleting the
        // decision must not leave inaccessible orphans behind.
        await DecisionMemory_1.default.deleteMany({ decisionId: req.params.id });
        await Outcome_1.default.deleteMany({ decisionId: req.params.id });
        await DecisionFeedback_1.default.deleteMany({ decisionId: req.params.id });
        await DecisionLesson_1.default.deleteMany({ decisionId: req.params.id });
        res.json({ ok: true });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
router.post('/:id/start', authMiddleware_1.requireAuth, async (req, res) => {
    try {
        const researchQueries = Array.isArray(req.body?.researchQueries)
            ? req.body.researchQueries
                .filter((q) => q && typeof q.query === 'string' && q.query.trim())
                .map((q) => ({ query: q.query.trim(), purpose: q.purpose, maxResults: q.maxResults }))
            : [];
        const planningMode = req.body?.planningMode === 'intelligent' ? 'intelligent' : 'fixed';
        const routingMode = req.body?.routingMode === 'manual' ? 'manual' : 'auto';
        const routingModelId = typeof req.body?.routingModelId === 'string' ? req.body.routingModelId : undefined;
        const execution = await orchestrator_1.decisionOrchestrator.startDecision(req.params.id, req.userId, {
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
    }
    catch (error) {
        console.error('[Decisions start]', error);
        res.status(400).json({ error: error.message });
    }
});
/**
 * POST /api/decisions/:id/plan — generate (or reuse) an intelligent plan for
 * the decision's execution. Planning is idempotent per execution: a decision
 * that already has a compiled plan returns it instead of regenerating.
 */
router.post('/:id/plan', authMiddleware_1.requireAuth, async (req, res) => {
    try {
        const decision = await Decision_1.default.findOne({ _id: req.params.id, userId: req.userId });
        if (!decision)
            return res.status(404).json({ error: 'Decision not found.' });
        const requestedExecutionId = req.body?.executionId;
        let execution = requestedExecutionId
            ? await Execution_1.default.findOne({ _id: requestedExecutionId, decisionId: decision._id })
            : null;
        if (requestedExecutionId && !execution) {
            return res.status(404).json({ error: 'Execution not found.' });
        }
        if (!execution) {
            // Create a fresh planning execution. It stays `pending`/`planning` — the
            // Worker ignores it until `/start` or the caller queues it.
            execution = await Execution_1.default.create({
                decisionId: decision._id,
                status: 'pending',
                startedAt: new Date(),
                currentPhase: 'debating',
                progress: 0,
                planningStatus: 'planning',
                planningMode: 'intelligent',
            });
        }
        const result = await planner_1.decisionPlanner.planExecution({
            executionId: execution._id.toString(),
            userId: req.userId,
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
    }
    catch (error) {
        console.error('[Decisions plan]', error);
        res.status(400).json({ error: error.message });
    }
});
/** GET /api/decisions/:id/plans — all plans for a decision (ownership-checked). */
router.get('/:id/plans', authMiddleware_1.requireAuth, async (req, res) => {
    try {
        const decision = await Decision_1.default.findOne({ _id: req.params.id, userId: req.userId });
        if (!decision)
            return res.status(404).json({ error: 'Decision not found.' });
        const plans = await DecisionPlan_1.default.find({ decisionId: decision._id }).sort({ createdAt: -1 });
        res.json(plans);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
/** GET /api/decisions/:id/plans/:planId — a single owned plan. */
router.get('/:id/plans/:planId', authMiddleware_1.requireAuth, async (req, res) => {
    try {
        const decision = await Decision_1.default.findOne({ _id: req.params.id, userId: req.userId });
        if (!decision)
            return res.status(404).json({ error: 'Decision not found.' });
        const plan = await DecisionPlan_1.default.findOne({
            _id: req.params.planId,
            decisionId: decision._id,
        });
        if (!plan)
            return res.status(404).json({ error: 'Plan not found.' });
        res.json(plan);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
/** GET /api/decisions/:id/plans/:planId/routing-preview — dry-run planned
 *  routing. Computed with the live policy but never persisted and never emits
 *  events; the UI labels this as "Estimated / planned routing". */
router.get('/:id/plans/:planId/routing-preview', authMiddleware_1.requireAuth, async (req, res) => {
    try {
        const decision = await Decision_1.default.findOne({ _id: req.params.id, userId: req.userId });
        if (!decision)
            return res.status(404).json({ error: 'Decision not found.' });
        const plan = await DecisionPlan_1.default.findOne({
            _id: req.params.planId,
            decisionId: decision._id,
        });
        if (!plan)
            return res.status(404).json({ error: 'Plan not found.' });
        const preview = [];
        for (const plannedTask of plan.tasks || []) {
            const taskType = plannedTask.type;
            const requirements = plannedTask.requirements || [];
            const result = await routing_1.routeTaskRouter.routeTask({
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
                    : { status: result.status, reason: 'message' in result ? result.message : result.reason }),
            });
        }
        res.json({
            planningMode: plan.planningMode,
            policyVersion: routing_1.routeTaskRouter.policyVersion(),
            estimated: true,
            tasks: preview,
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
router.post('/:id/pause', authMiddleware_1.requireAuth, async (req, res) => {
    try {
        await orchestrator_1.decisionOrchestrator.pauseDecision(req.params.id, req.userId);
        res.json({ success: true });
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
router.post('/:id/resume', authMiddleware_1.requireAuth, async (req, res) => {
    try {
        await orchestrator_1.decisionOrchestrator.resumeDecision(req.params.id, req.userId);
        res.json({ success: true });
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
router.post('/:id/cancel', authMiddleware_1.requireAuth, async (req, res) => {
    try {
        await orchestrator_1.decisionOrchestrator.cancelDecision(req.params.id, req.userId);
        res.json({ success: true });
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
router.get('/:id/executions', authMiddleware_1.requireAuth, async (req, res) => {
    try {
        const decision = await Decision_1.default.findOne({ _id: req.params.id, userId: req.userId });
        if (!decision)
            return res.status(404).json({ error: 'Decision not found.' });
        const executions = await Execution_1.default.find({ decisionId: req.params.id }).sort({ createdAt: -1 });
        res.json(executions);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
router.get('/:id/executions/:executionId', authMiddleware_1.requireAuth, async (req, res) => {
    try {
        const decision = await Decision_1.default.findOne({ _id: req.params.id, userId: req.userId });
        if (!decision)
            return res.status(404).json({ error: 'Decision not found.' });
        const execution = await Execution_1.default.findOne({
            _id: req.params.executionId,
            decisionId: decision._id,
        });
        if (!execution)
            return res.status(404).json({ error: 'Execution not found.' });
        res.json(execution);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
router.get('/:id/tasks', authMiddleware_1.requireAuth, async (req, res) => {
    try {
        const decision = await Decision_1.default.findOne({ _id: req.params.id, userId: req.userId });
        if (!decision)
            return res.status(404).json({ error: 'Decision not found.' });
        const executions = await Execution_1.default.find({ decisionId: req.params.id });
        const ids = executions.map((e) => e._id);
        const tasks = await Task_1.default.find({ executionId: { $in: ids } }).sort({ priority: 1, createdAt: 1 });
        res.json(tasks);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
router.get('/:id/tasks/:taskId', authMiddleware_1.requireAuth, async (req, res) => {
    try {
        const decision = await Decision_1.default.findOne({ _id: req.params.id, userId: req.userId });
        if (!decision)
            return res.status(404).json({ error: 'Decision not found.' });
        const executions = await Execution_1.default.find({ decisionId: req.params.id });
        const ids = executions.map((e) => e._id);
        const task = await Task_1.default.findOne({ _id: req.params.taskId, executionId: { $in: ids } });
        if (!task)
            return res.status(404).json({ error: 'Task not found.' });
        res.json(task);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
router.get('/:id/claims', authMiddleware_1.requireAuth, async (req, res) => {
    try {
        const decision = await Decision_1.default.findOne({ _id: req.params.id, userId: req.userId });
        if (!decision)
            return res.status(404).json({ error: 'Decision not found.' });
        const claims = await Claim_1.default.find({ decisionId: req.params.id });
        res.json(claims);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
router.get('/:id/evidence', authMiddleware_1.requireAuth, async (req, res) => {
    try {
        const decision = await Decision_1.default.findOne({ _id: req.params.id, userId: req.userId });
        if (!decision)
            return res.status(404).json({ error: 'Decision not found.' });
        const evidence = await Evidence_1.default.find({ decisionId: req.params.id });
        res.json(evidence);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
router.get('/:id/research', authMiddleware_1.requireAuth, async (req, res) => {
    try {
        const decision = await Decision_1.default.findOne({ _id: req.params.id, userId: req.userId });
        if (!decision)
            return res.status(404).json({ error: 'Decision not found.' });
        const executions = await Execution_1.default.find({ decisionId: req.params.id });
        const ids = executions.map((e) => e._id);
        const researchTasks = await Task_1.default.find({
            executionId: { $in: ids },
            type: 'research',
        }).sort({ createdAt: 1 });
        const result = await Promise.all(researchTasks.map(async (t) => {
            const linked = await Evidence_1.default.find({
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
        }));
        res.json(result);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
router.get('/:id/evidence/:evidenceId', authMiddleware_1.requireAuth, async (req, res) => {
    try {
        const decision = await Decision_1.default.findOne({ _id: req.params.id, userId: req.userId });
        if (!decision)
            return res.status(404).json({ error: 'Decision not found.' });
        const evidence = await Evidence_1.default.findOne({
            _id: req.params.evidenceId,
            decisionId: decision._id,
        });
        if (!evidence)
            return res.status(404).json({ error: 'Evidence not found.' });
        res.json(evidence);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
router.get('/:id/claims/:claimId', authMiddleware_1.requireAuth, async (req, res) => {
    try {
        const decision = await Decision_1.default.findOne({ _id: req.params.id, userId: req.userId });
        if (!decision)
            return res.status(404).json({ error: 'Decision not found.' });
        const claim = await Claim_1.default.findOne({
            _id: req.params.claimId,
            decisionId: decision._id,
        });
        if (!claim)
            return res.status(404).json({ error: 'Claim not found.' });
        // Populate the evidence relationships documented for Phase 3.
        const [supporting, contradicting] = await Promise.all([
            Evidence_1.default.find({ _id: { $in: claim.supportingEvidenceIds || [] } }),
            Evidence_1.default.find({ _id: { $in: claim.contradictingEvidenceIds || [] } }),
        ]);
        // Phase 4: explicit evidence graph relationships
        const relationships = await evidenceGraphService_1.evidenceGraphService.getRelationshipsForClaim(claim._id.toString());
        const relatedEvidenceIds = relationsToEvidenceIds(relationships.related);
        const [relatedEvidence, verification] = await Promise.all([
            Evidence_1.default.find({ _id: { $in: relatedEvidenceIds } }),
            VerificationResult_1.default.findOne({ claimId: claim._id.toString() }),
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
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
router.get('/:id/snapshot', authMiddleware_1.requireAuth, async (req, res) => {
    try {
        const decision = await Decision_1.default.findOne({ _id: req.params.id, userId: req.userId });
        if (!decision)
            return res.status(404).json({ error: 'Decision not found.' });
        const snapshot = await orchestrator_1.decisionOrchestrator.getSnapshot(req.params.id, req.userId);
        res.json(snapshot);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// ---- Phase 4 endpoints ----
/** GET /api/decisions/:id/verifications — all verification results for a decision */
router.get('/:id/verifications', authMiddleware_1.requireAuth, async (req, res) => {
    try {
        const decision = await Decision_1.default.findOne({ _id: req.params.id, userId: req.userId });
        if (!decision)
            return res.status(404).json({ error: 'Decision not found.' });
        const verifications = await VerificationResult_1.default.find({ decisionId: decision._id })
            .sort({ createdAt: 1 });
        res.json(verifications);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
/** GET /api/decisions/:id/verifications/:claimId — verification for a specific claim */
router.get('/:id/verifications/:claimId', authMiddleware_1.requireAuth, async (req, res) => {
    try {
        const decision = await Decision_1.default.findOne({ _id: req.params.id, userId: req.userId });
        if (!decision)
            return res.status(404).json({ error: 'Decision not found.' });
        const claim = await Claim_1.default.findOne({ _id: req.params.claimId, decisionId: decision._id });
        if (!claim)
            return res.status(404).json({ error: 'Claim not found.' });
        const verification = await VerificationResult_1.default.findOne({ claimId: claim._id.toString() });
        if (!verification)
            return res.status(404).json({ error: 'Verification not found.' });
        res.json(verification);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
/** GET /api/decisions/:id/red-team — all red-team findings for a decision */
router.get('/:id/red-team', authMiddleware_1.requireAuth, async (req, res) => {
    try {
        const decision = await Decision_1.default.findOne({ _id: req.params.id, userId: req.userId });
        if (!decision)
            return res.status(404).json({ error: 'Decision not found.' });
        const findings = await RedTeamFinding_1.default.find({ decisionId: decision._id })
            .sort({ createdAt: 1 });
        res.json(findings);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
/** GET /api/decisions/:id/reconciliation — the reconciliation result for a decision */
router.get('/:id/reconciliation', authMiddleware_1.requireAuth, async (req, res) => {
    try {
        const decision = await Decision_1.default.findOne({ _id: req.params.id, userId: req.userId });
        if (!decision)
            return res.status(404).json({ error: 'Decision not found.' });
        const reconciliation = await ReconciliationResult_1.default.findOne({ decisionId: decision._id });
        if (!reconciliation)
            return res.status(404).json({ error: 'Reconciliation not found.' });
        res.json(reconciliation);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
/** GET /api/decisions/:id/evidence-graph — all evidence relationships for a decision */
router.get('/:id/evidence-graph', authMiddleware_1.requireAuth, async (req, res) => {
    try {
        const decision = await Decision_1.default.findOne({ _id: req.params.id, userId: req.userId });
        if (!decision)
            return res.status(404).json({ error: 'Decision not found.' });
        const relationships = await evidenceGraphService_1.evidenceGraphService.getRelationshipsForDecision(decision._id.toString());
        res.json(relationships);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
/** GET /api/decisions/:id/claims/:claimId/evidence — the claim's explicit evidence graph */
router.get('/:id/claims/:claimId/evidence', authMiddleware_1.requireAuth, async (req, res) => {
    try {
        const decision = await Decision_1.default.findOne({ _id: req.params.id, userId: req.userId });
        if (!decision)
            return res.status(404).json({ error: 'Decision not found.' });
        const claim = await Claim_1.default.findOne({ _id: req.params.claimId, decisionId: decision._id });
        if (!claim)
            return res.status(404).json({ error: 'Claim not found.' });
        const relationships = await evidenceGraphService_1.evidenceGraphService.getRelationshipsForClaim(claim._id.toString());
        const [supporting, contradicting, related] = await Promise.all([
            Evidence_1.default.find({ _id: { $in: relationsToEvidenceIds(relationships.supports) } }),
            Evidence_1.default.find({ _id: { $in: relationsToEvidenceIds(relationships.contradicts) } }),
            Evidence_1.default.find({ _id: { $in: relationsToEvidenceIds(relationships.related) } }),
        ]);
        res.json({
            claimId: claim._id.toString(),
            claimText: claim.text,
            supports: supporting,
            contradicts: contradicting,
            related,
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// ---- Phase 7: Observability endpoints ----
/** GET /api/decisions/:id/events — ordered execution events for the decision timeline */
router.get('/:id/events', authMiddleware_1.requireAuth, async (req, res) => {
    try {
        const decision = await Decision_1.default.findOne({ _id: req.params.id, userId: req.userId });
        if (!decision)
            return res.status(404).json({ error: 'Decision not found.' });
        const events = await eventBus_1.executionEventBus.listByDecision(decision._id.toString());
        res.json(events);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
function relationsToEvidenceIds(rels) {
    return rels.map((r) => r.evidenceId);
}
// ---- Phase 8: Decision Memory & Outcomes ----
const memoryMeta = (decision) => ({
    category: typeof decision.metadata?.category === 'string' ? decision.metadata.category : undefined,
    domain: typeof decision.metadata?.domain === 'string' ? decision.metadata.domain : undefined,
    problemType: typeof decision.metadata?.problemType === 'string' ? decision.metadata.problemType : undefined,
    tags: Array.isArray(decision.metadata?.tags) ? decision.metadata.tags.filter((t) => typeof t === 'string') : undefined,
    entities: Array.isArray(decision.metadata?.entities) ? decision.metadata.entities.filter((e) => typeof e === 'string') : undefined,
});
/** GET /api/decisions/:id/memory — the decision's memory view (memory + outcomes
 *  + feedback + lessons + quality signals). Memory is built on-demand for
 *  terminal decisions that completed before Phase 8. */
router.get('/:id/memory', authMiddleware_1.requireAuth, async (req, res) => {
    try {
        const decision = await Decision_1.default.findOne({ _id: req.params.id, userId: req.userId });
        if (!decision)
            return res.status(404).json({ error: 'Decision not found.' });
        const decisionId = decision._id.toString();
        const [memory, outcomes, feedback, lessons, quality] = await Promise.all([
            decisionMemoryService_1.decisionMemoryService.ensureMemory(decisionId, req.userId),
            outcomeService_1.outcomeService.list(req.userId, decisionId),
            feedbackService_1.feedbackService.get(req.userId, decisionId),
            lessonService_1.lessonsService.list(req.userId, decisionId),
            decisionMemoryService_1.decisionMemoryService.getDecisionQuality(decisionId, req.userId),
        ]);
        res.json({ memory, outcomes, feedback, lessons, quality });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
/** GET /api/decisions/:id/related — explainable related historical decisions
 *  owned by the same user (current decision excluded). */
router.get('/:id/related', authMiddleware_1.requireAuth, async (req, res) => {
    try {
        const decision = await Decision_1.default.findOne({ _id: req.params.id, userId: req.userId });
        if (!decision)
            return res.status(404).json({ error: 'Decision not found.' });
        const meta = memoryMeta(decision);
        const result = await decisionRetrievalService_1.decisionRetrievalService.retrieve({
            userId: req.userId,
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
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
/** GET /api/decisions/:id/outcomes — all outcomes plus the expected-vs-actual summary. */
router.get('/:id/outcomes', authMiddleware_1.requireAuth, async (req, res) => {
    try {
        const decision = await Decision_1.default.findOne({ _id: req.params.id, userId: req.userId });
        if (!decision)
            return res.status(404).json({ error: 'Decision not found.' });
        const [outcomes, expectedVsActual] = await Promise.all([
            outcomeService_1.outcomeService.list(req.userId, decision._id.toString()),
            outcomeService_1.outcomeService.expectedVsActual(req.userId, decision._id.toString()),
        ]);
        res.json({ outcomes, expectedVsActual });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
/** POST /api/decisions/:id/outcomes — record an expected or actual outcome. */
router.post('/:id/outcomes', authMiddleware_1.requireAuth, async (req, res) => {
    try {
        const decision = await Decision_1.default.findOne({ _id: req.params.id, userId: req.userId });
        if (!decision)
            return res.status(404).json({ error: 'Decision not found.' });
        const kind = req.body?.kind === 'expected' ? 'expected' : 'actual';
        const input = (0, outcomeService_1.cleanOutcomeInput)(req.body, kind, kind === 'expected' ? 'pending' : 'unknown');
        const created = await outcomeService_1.outcomeService.create(req.userId, decision._id.toString(), input);
        res.status(201).json(created);
    }
    catch (error) {
        if (error?.name === 'OutcomeValidationError') {
            return res.status(400).json({ error: error.message });
        }
        res.status(500).json({ error: error.message });
    }
});
/** PATCH /api/decisions/:id/outcomes/:outcomeId — update an outcome over time. */
router.patch('/:id/outcomes/:outcomeId', authMiddleware_1.requireAuth, async (req, res) => {
    try {
        const decision = await Decision_1.default.findOne({ _id: req.params.id, userId: req.userId });
        if (!decision)
            return res.status(404).json({ error: 'Decision not found.' });
        const patch = (0, outcomeService_1.cleanOutcomePatch)(req.body);
        const updated = await outcomeService_1.outcomeService.update(req.userId, decision._id.toString(), req.params.outcomeId, patch);
        if (!updated)
            return res.status(404).json({ error: 'Outcome not found.' });
        res.json(updated);
    }
    catch (error) {
        if (error?.name === 'OutcomeValidationError') {
            return res.status(400).json({ error: error.message });
        }
        res.status(500).json({ error: error.message });
    }
});
/** GET /api/decisions/:id/feedback — the decision's human feedback (or null). */
router.get('/:id/feedback', authMiddleware_1.requireAuth, async (req, res) => {
    try {
        const decision = await Decision_1.default.findOne({ _id: req.params.id, userId: req.userId });
        if (!decision)
            return res.status(404).json({ error: 'Decision not found.' });
        const feedback = await feedbackService_1.feedbackService.get(req.userId, decision._id.toString());
        res.json(feedback);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
/** POST /api/decisions/:id/feedback — submit (or update) human feedback. */
router.post('/:id/feedback', authMiddleware_1.requireAuth, async (req, res) => {
    try {
        const decision = await Decision_1.default.findOne({ _id: req.params.id, userId: req.userId });
        if (!decision)
            return res.status(404).json({ error: 'Decision not found.' });
        const input = (0, feedbackService_1.cleanFeedbackInput)(req.body);
        const saved = await feedbackService_1.feedbackService.upsert(req.userId, decision._id.toString(), input);
        res.status(201).json(saved);
    }
    catch (error) {
        if (error?.name === 'FeedbackValidationError') {
            return res.status(400).json({ error: error.message });
        }
        res.status(500).json({ error: error.message });
    }
});
/** GET /api/decisions/:id/lessons — lessons learned for the decision. */
router.get('/:id/lessons', authMiddleware_1.requireAuth, async (req, res) => {
    try {
        const decision = await Decision_1.default.findOne({ _id: req.params.id, userId: req.userId });
        if (!decision)
            return res.status(404).json({ error: 'Decision not found.' });
        const lessons = await lessonService_1.lessonsService.list(req.userId, decision._id.toString());
        res.json(lessons);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
/** POST /api/decisions/:id/lessons — record a human lesson or an unconfirmed
 *  LLM suggestion (never confirmed at creation). */
router.post('/:id/lessons', authMiddleware_1.requireAuth, async (req, res) => {
    try {
        const decision = await Decision_1.default.findOne({ _id: req.params.id, userId: req.userId });
        if (!decision)
            return res.status(404).json({ error: 'Decision not found.' });
        const input = (0, lessonService_1.cleanLessonInput)(req.body);
        const created = await lessonService_1.lessonsService.create(req.userId, decision._id.toString(), input);
        res.status(201).json(created);
    }
    catch (error) {
        if (error?.name === 'LessonValidationError') {
            return res.status(400).json({ error: error.message });
        }
        res.status(500).json({ error: error.message });
    }
});
/** PATCH /api/decisions/:id/lessons/:lessonId — update a lesson (e.g. a human
 *  confirms an LLM suggestion). */
router.patch('/:id/lessons/:lessonId', authMiddleware_1.requireAuth, async (req, res) => {
    try {
        const decision = await Decision_1.default.findOne({ _id: req.params.id, userId: req.userId });
        if (!decision)
            return res.status(404).json({ error: 'Decision not found.' });
        const current = await DecisionLesson_1.default.findOne({ _id: req.params.lessonId, decisionId: decision._id });
        if (!current)
            return res.status(404).json({ error: 'Lesson not found.' });
        const patch = {};
        if (typeof req.body?.text === 'string' && req.body.text.trim())
            patch.text = req.body.text.trim();
        if (req.body?.status === 'confirmed' || req.body?.status === 'unconfirmed')
            patch.status = req.body.status;
        if (typeof req.body?.metricName === 'string')
            patch.metricName = req.body.metricName;
        if (Array.isArray(req.body?.evidenceIds)) {
            patch.evidenceIds = req.body.evidenceIds.filter((e) => typeof e === 'string');
        }
        const updated = await lessonService_1.lessonsService.update(req.userId, decision._id.toString(), req.params.lessonId, patch);
        if (!updated)
            return res.status(404).json({ error: 'Lesson not found.' });
        res.json(updated);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
exports.default = router;
