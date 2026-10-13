import express from 'express';
import mongoose from 'mongoose';
import { serverErrorMessage } from '../utils/httpError';
import Courtroom from '../models/Courtroom';
import Message from '../models/Message';
import Verdict from '../models/Verdict';
import { debateEngine } from '../engine/debateEngine';
import { requireAuth, AuthRequest } from '../middleware/authMiddleware';
import { validateDebateReady } from '../services/debateValidation';
import { decisionOrchestrator } from '../decision/orchestrator';
import Execution, { IExecution } from '../models/Execution';
import { TokenUsage } from '../decision/types';
import { aggregateUsage } from '../decision/usage';

const router = express.Router();

router.get('/', requireAuth, async (req: AuthRequest, res) => {
  // Guard the async work so a database fault answers the request instead of
  // leaving it unanswered (Express 4 does not forward rejected async handlers).
  try {
    const items = await Courtroom.find({ userId: req.userId });
    res.json(items);
  } catch (error: any) {
    console.error('[Courtrooms GET]', error);
    res.status(500).json({ error: serverErrorMessage(error, 'Failed to load courtrooms.') });
  }
});

router.post('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { _id, id: bodyId, createdAt, ...rest } = req.body;
    const item = new Courtroom({ ...rest, userId: req.userId });
    await item.save();
    res.json(item);
  } catch (error: any) {
    console.error('[Courtrooms POST]', error);
    res.status(500).json({ error: serverErrorMessage(error, 'Failed to create courtroom.') });
  }
});

/**
 * Fields a client may change through the generic update endpoint. `userId`
 * (ownership) and `createdAt` are server-managed: a raw body spread let a
 * caller rewrite `userId`, planting a courtroom — participants, objective and
 * mode chosen by the caller — inside another user's workspace.
 */
const COURTROOM_UPDATABLE_FIELDS = [
  'name',
  'description',
  'objective',
  'mode',
  'participants',
  'status',
] as const;

function pickCourtroomUpdates(body: any): Record<string, unknown> {
  const updates: Record<string, unknown> = {};
  for (const field of COURTROOM_UPDATABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, field)) updates[field] = body[field];
  }
  return updates;
}

router.put('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    // A malformed id must be a controlled 404, never a Mongoose CastError (an
    // async rejection Express 4 would not catch).
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ error: 'Courtroom not found.' });
    }
    const updated = await Courtroom.findOneAndUpdate(
      { _id: id, userId: req.userId },
      pickCourtroomUpdates(req.body || {}),
      { new: true }
    );
    // null means the id matched nothing the caller owns — a foreign id or a
    // nonexistent one. Returning `200 null` let the client believe an edit was
    // persisted when it was not; the caller gets the same 404 for both cases so
    // a foreign resource's existence is never disclosed.
    if (!updated) {
      return res.status(404).json({ error: 'Courtroom not found.' });
    }
    res.json(updated);
  } catch (error: any) {
    console.error('[Courtrooms PUT]', error);
    res.status(500).json({ error: serverErrorMessage(error, 'Failed to update courtroom.') });
  }
});

router.delete('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ error: 'Courtroom not found.' });
    }
    const result = await Courtroom.deleteOne({ _id: id, userId: req.userId });
    // A delete that matched nothing is a 404, consistent with the update path
    // and the decision router, instead of an unconditional `{ ok: true }`.
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Courtroom not found.' });
    }
    res.json({ ok: true });
  } catch (error: any) {
    console.error('[Courtrooms DELETE]', error);
    res.status(500).json({ error: serverErrorMessage(error, 'Failed to delete courtroom.') });
  }
});

router.post('/:id/start', requireAuth, async (req: AuthRequest, res) => {
  const { id } = req.params;
  const usageRecords: TokenUsage[] = [];
  try {
    // Reject a malformed id before it reaches `validateDebateReady`, which
    // casts `_id` and would otherwise raise a CastError surfaced as a 500.
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ error: 'Courtroom not found.' });
    }
    const validation = await validateDebateReady(id, req.userId!);
    if (!validation.ok) {
      return res.status(400).json({ error: validation.errors.join(' '), errors: validation.errors });
    }

    const courtroom = await Courtroom.findOne({ _id: id, userId: req.userId });

    const result = await debateEngine.runDebate(id, req.userId!);

    // Bridge to Decision architecture: if a Courtroom ran a debate, create/update
    // a corresponding Decision and Execution to record lifecycle and usage.
    if (courtroom) {
      try {
        const execution = await decisionOrchestrator.createCourthouseExecution(
          courtroom._id.toString(),
          req.userId!,
          result,
          usageRecords
        );
        if (execution) {
          res.json({ success: true, result, decisionId: execution.decisionId, executionId: execution._id });
          return;
        }
      } catch (err: any) {
        console.error('[Courtrooms:start] Failed to link decision:', err?.message);
      }
    }

    res.json({ success: true, result });
  } catch (error: any) {
    console.error(`[Start Debate API Error]`, error);
    res.status(500).json({ error: serverErrorMessage(error) });
  }
});

/**
 * Messages and verdicts are keyed only by `courtroomId`, so the courtroom is the
 * ownership boundary that has to be checked first. The same 404 is returned for
 * a well-formed id that belongs to someone else and for one that does not exist,
 * so the response cannot be used to probe which courtroom ids are real.
 */
router.get('/:id/messages', requireAuth, async (req: AuthRequest, res) => {
  const { id } = req.params;
  try {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ error: 'Courtroom not found.' });
    }
    const courtroom = await Courtroom.findOne({ _id: id, userId: req.userId });
    if (!courtroom) return res.status(404).json({ error: 'Courtroom not found.' });
    const messages = await Message.find({ courtroomId: id }).sort({ createdAt: 1 });
    res.json(messages);
  } catch (error: any) {
    res.status(500).json({ error: serverErrorMessage(error) });
  }
});

router.get('/:id/verdict', requireAuth, async (req: AuthRequest, res) => {
  const { id } = req.params;
  try {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ error: 'Courtroom not found.' });
    }
    const courtroom = await Courtroom.findOne({ _id: id, userId: req.userId });
    if (!courtroom) return res.status(404).json({ error: 'Courtroom not found.' });
    const verdict = await Verdict.findOne({ courtroomId: id });
    res.json(verdict);
  } catch (error: any) {
    res.status(500).json({ error: serverErrorMessage(error) });
  }
});

export default router;
