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
const authMiddleware_1 = require("../middleware/authMiddleware");
const orchestrator_1 = require("../decision/orchestrator");
const stateMachine_1 = require("../decision/stateMachine");
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
        const execution = await orchestrator_1.decisionOrchestrator.startDecision(req.params.id, req.userId, {
            researchQueries: researchQueries.slice(0, 5),
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
        });
    }
    catch (error) {
        console.error('[Decisions start]', error);
        res.status(400).json({ error: error.message });
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
        res.json({
            ...(claim.toObject ? claim.toObject() : claim),
            supportingEvidence: supporting,
            contradictingEvidence: contradicting,
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
exports.default = router;
