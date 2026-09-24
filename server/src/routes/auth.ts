import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User';
import Agent from '../models/Agent';
import Model from '../models/Model';
import Courtroom from '../models/Courtroom';
import Message from '../models/Message';
import Verdict from '../models/Verdict';
import Decision from '../models/Decision';
import Claim from '../models/Claim';
import Evidence from '../models/Evidence';
import EvidenceRelationship from '../models/EvidenceRelationship';
import Execution from '../models/Execution';
import ExecutionEvent from '../models/ExecutionEvent';
import Task from '../models/Task';
import DecisionPlan from '../models/DecisionPlan';
import VerificationResult from '../models/VerificationResult';
import RedTeamFinding from '../models/RedTeamFinding';
import ReconciliationResult from '../models/ReconciliationResult';
import DecisionMemory from '../models/DecisionMemory';
import Outcome from '../models/Outcome';
import DecisionFeedback from '../models/DecisionFeedback';
import DecisionLesson from '../models/DecisionLesson';
import Benchmark from '../models/Benchmark';
import BenchmarkCase from '../models/BenchmarkCase';
import Rubric from '../models/Rubric';
import EvaluationRun from '../models/EvaluationRun';
import EvaluationCaseResult from '../models/EvaluationCaseResult';
import Baseline from '../models/Baseline';
import EvaluationComparison from '../models/EvaluationComparison';
import { requireAuth, AuthRequest } from '../middleware/authMiddleware';
import { defaultAgents } from '../utils/defaultAgents';
import { getJwtSecret } from '../config/security';

const router = express.Router();

router.post('/signup', async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password || !name) return res.status(400).json({ error: 'Missing fields' });
  try {
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ error: 'User exists' });
    const hash = await bcrypt.hash(password, 10);
    const user = new User({ email, name, passwordHash: hash });
    await user.save();

    // Automatically create 10 pre-built AI agents for the newly signed up user
    try {
      const agentsToCreate = defaultAgents.map(agent => ({
        ...agent,
        userId: user._id
      }));
      await Agent.insertMany(agentsToCreate);
    } catch (err) {
      console.error('Failed to create default agents on signup:', err);
    }

    const token = jwt.sign({ id: user._id }, getJwtSecret(), { expiresIn: '7d' });
    res.json({ token, user: { id: user._id, email: user.email, name: user.name } });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Missing fields' });
  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(400).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ id: user._id }, getJwtSecret(), { expiresIn: '7d' });
    res.json({ token, user: { id: user._id, email: user.email, name: user.name } });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

/** GET /api/auth/me — the authenticated user's own profile data. */
router.get('/me', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.json({ id: user._id, email: user.email, name: user.name });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/** POST /api/auth/change-password — verify the current password, hash the new
 *  one, and persist it. Only ever touches the authenticated user's account. */
router.post('/change-password', requireAuth, async (req: AuthRequest, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new password are required.' });
  }
  if (typeof newPassword !== 'string' || newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters.' });
  }
  if (currentPassword === newPassword) {
    return res.status(400).json({ error: 'New password must differ from the current password.' });
  }
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) return res.status(400).json({ error: 'Current password is incorrect.' });
    const hash = await bcrypt.hash(newPassword, 10);
    user.passwordHash = hash;
    await user.save();
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/** POST /api/auth/export-data — returns the authenticated user's own data.
 *  Never includes the password hash or model API keys, and never data that
 *  belongs to another user. */
router.post('/export-data', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const decisions = await Decision.find({ userId });
    const decisionIds = decisions.map((d) => d._id.toString());
    const executions = await Execution.find({ decisionId: { $in: decisionIds } });
    const executionIds = executions.map((e) => e._id.toString());
    const claims = await Claim.find({ decisionId: { $in: decisionIds } });
    const claimIds = claims.map((c) => c._id.toString());
    const courtrooms = await Courtroom.find({ userId });
    const courtroomIds = courtrooms.map((c) => c._id.toString());

    const [models, agents, messages, verdicts, evidence, evidenceRelationships, tasks, executionEvents, plans, verifications, redTeamFindings, reconciliations, memories, outcomes, feedback, lessons, benchmarks, benchmarkCases, rubrics, runs, caseResults, baselines, comparisons] =
      await Promise.all([
        Model.find({ userId }),
        Agent.find({ userId }),
        Message.find({ courtroomId: { $in: courtroomIds } }),
        Verdict.find({ courtroomId: { $in: courtroomIds } }),
        Evidence.find({ decisionId: { $in: decisionIds } }),
        EvidenceRelationship.find({ claimId: { $in: claimIds } }),
        Task.find({ executionId: { $in: executionIds } }),
        ExecutionEvent.find({ decisionId: { $in: decisionIds } }),
        DecisionPlan.find({ decisionId: { $in: decisionIds } }),
        VerificationResult.find({ decisionId: { $in: decisionIds } }),
        RedTeamFinding.find({ decisionId: { $in: decisionIds } }),
        ReconciliationResult.find({ decisionId: { $in: decisionIds } }),
        DecisionMemory.find({ userId }),
        Outcome.find({ userId }),
        DecisionFeedback.find({ userId }),
        DecisionLesson.find({ userId }),
        Benchmark.find({ userId }),
        BenchmarkCase.find({ userId }),
        Rubric.find({ userId }),
        EvaluationRun.find({ userId }),
        EvaluationCaseResult.find({ userId }),
        Baseline.find({ userId }),
        EvaluationComparison.find({ userId }),
      ]);

    // Strip secrets at the edge: never export password hashes or API keys.
    res.json({
      exportedAt: new Date().toISOString(),
      user: { id: user._id, email: user.email, name: user.name, createdAt: user.createdAt },
      models: models.map((m) => {
        const plain = m.toObject ? m.toObject() : m;
        delete plain.apiKey;
        delete plain.apiKeyHint;
        return plain;
      }),
      agents,
      courtrooms,
      messages,
      verdicts,
      decisions,
      executions,
      claims,
      evidence,
      evidenceRelationships,
      tasks,
      executionEvents,
      plans,
      verifications,
      redTeamFindings,
      reconciliations,
      memories,
      outcomes,
      feedback,
      lessons,
      benchmarks,
      benchmarkCases,
      rubrics,
      runs,
      caseResults,
      baselines,
      comparisons,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/** DELETE /api/auth/account — deletes the authenticated user's account and ALL
 *  of their own data, deepest children first, ending with the User document. */
router.delete('/account', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const decisionIds = (await Decision.find({ userId })).map((d) => d._id.toString());
    const executionIds = (await Execution.find({ decisionId: { $in: decisionIds } })).map((e) =>
      e._id.toString()
    );
    const claimIds = (await Claim.find({ decisionId: { $in: decisionIds } })).map((c) =>
      c._id.toString()
    );
    const courtroomIds = (await Courtroom.find({ userId })).map((c) => c._id.toString());
    const benchmarkIds = (await Benchmark.find({ userId })).map((b) => b._id.toString());
    const runIds = (await EvaluationRun.find({ userId })).map((r) => r._id.toString());
    const baselineIds = (await Baseline.find({ userId })).map((b) => b._id.toString());
    const rubricIds = (await Rubric.find({ userId })).map((r) => r._id.toString());

    // Decision-scoped children.
    await Task.deleteMany({ executionId: { $in: executionIds } });
    // ExecutionEvent rows can be attached to the account through every
    // ownership path the schema supports: an owned execution, an owned
    // decision, or a `data.userId` marker (evaluation/benchmark/baseline
    // producers). Remove each so no orphaned event survives deletion.
    await ExecutionEvent.deleteMany({
      $or: [
        { executionId: { $in: executionIds } },
        { decisionId: { $in: decisionIds } },
        { 'data.userId': userId },
      ],
    });
    await DecisionPlan.deleteMany({ decisionId: { $in: decisionIds } });
    await Evidence.deleteMany({ decisionId: { $in: decisionIds } });
    await Claim.deleteMany({ decisionId: { $in: decisionIds } });
    await EvidenceRelationship.deleteMany({
      claimId: { $in: [...claimIds] },
    });
    await EvidenceRelationship.deleteMany({
      decisionId: { $in: decisionIds },
    });
    await VerificationResult.deleteMany({
      $or: [
        { decisionId: { $in: decisionIds } },
        { claimId: { $in: claimIds } },
      ],
    });
    await RedTeamFinding.deleteMany({ decisionId: { $in: decisionIds } });
    await ReconciliationResult.deleteMany({ decisionId: { $in: decisionIds } });

    // Courtroom-scoped children.
    await Message.deleteMany({ courtroomId: { $in: courtroomIds } });
    await Verdict.deleteMany({ courtroomId: { $in: courtroomIds } });

    // User-scoped rows.
    await DecisionMemory.deleteMany({ userId });
    await Outcome.deleteMany({ userId });
    await DecisionFeedback.deleteMany({ userId });
    await DecisionLesson.deleteMany({ userId });
    await Decision.deleteMany({ userId });
    await Execution.deleteMany({ decisionId: { $in: decisionIds } });
    await Courtroom.deleteMany({ userId });
    await Model.deleteMany({ userId });
    await Agent.deleteMany({ userId });
    await Benchmark.deleteMany({ userId });
    await BenchmarkCase.deleteMany({ benchmarkId: { $in: benchmarkIds } });
    await EvaluationRun.deleteMany({ userId });
    await EvaluationCaseResult.deleteMany({ runId: { $in: runIds } });
    await Baseline.deleteMany({ userId });
    await Rubric.deleteMany({ userId });
    await EvaluationComparison.deleteMany({ userId });

    await User.deleteOne({ _id: userId });

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
