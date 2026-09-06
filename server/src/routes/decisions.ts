import express from 'express';
import Decision from '../models/Decision';
import Execution from '../models/Execution';
import Task from '../models/Task';
import Claim from '../models/Claim';
import Evidence from '../models/Evidence';
import { requireAuth, AuthRequest } from '../middleware/authMiddleware';
import { decisionOrchestrator } from '../decision/orchestrator';
import { StateMachine } from '../decision/stateMachine';

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
    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/start', requireAuth, async (req: AuthRequest, res) => {
  try {
    const execution = await decisionOrchestrator.startDecision(req.params.id, req.userId!);
    res.json({ success: true, execution });
  } catch (error: any) {
    console.error('[Decisions start]', error);
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

router.get('/:id/tasks', requireAuth, async (req: AuthRequest, res) => {
  try {
    const decision = await Decision.findOne({ _id: req.params.id, userId: req.userId });
    if (!decision) return res.status(404).json({ error: 'Decision not found.' });
    const executions = await Execution.find({ decisionId: req.params.id });
    const ids = executions.map((e) => e._id);
    const tasks = await Task.find({ executionId: { $in: ids } }).sort({ priority: 1 });
    res.json(tasks);
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

router.get('/:id/snapshot', requireAuth, async (req: AuthRequest, res) => {
  try {
    const snapshot = await decisionOrchestrator.getSnapshot(req.params.id, req.userId!);
    res.json(snapshot);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
