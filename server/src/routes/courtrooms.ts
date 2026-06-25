import express from 'express';
import Courtroom from '../models/Courtroom';
import Message from '../models/Message';
import Verdict from '../models/Verdict';
import { debateEngine } from '../engine/debateEngine';
import { requireAuth, AuthRequest } from '../middleware/authMiddleware';
import { validateDebateReady } from '../services/debateValidation';

const router = express.Router();

router.get('/', requireAuth, async (req: AuthRequest, res) => {
  const items = await Courtroom.find({ userId: req.userId });
  res.json(items);
});

router.post('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { _id, id: bodyId, ...rest } = req.body;
    const item = new Courtroom({ ...rest, userId: req.userId });
    await item.save();
    res.json(item);
  } catch (error: any) {
    console.error('[Courtrooms POST]', error);
    res.status(500).json({ error: error.message || 'Failed to create courtroom.' });
  }
});

router.put('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { _id, id: bodyId, ...updates } = req.body;
    const updated = await Courtroom.findOneAndUpdate(
      { _id: id, userId: req.userId },
      updates,
      { new: true }
    );
    res.json(updated);
  } catch (error: any) {
    console.error('[Courtrooms PUT]', error);
    res.status(500).json({ error: error.message || 'Failed to update courtroom.' });
  }
});

router.delete('/:id', requireAuth, async (req: AuthRequest, res) => {
  const { id } = req.params;
  await Courtroom.deleteOne({ _id: id, userId: req.userId });
  res.json({ ok: true });
});

router.post('/:id/start', requireAuth, async (req: AuthRequest, res) => {
  const { id } = req.params;
  try {
    const validation = await validateDebateReady(id, req.userId!);
    if (!validation.ok) {
      return res.status(400).json({ error: validation.errors.join(' '), errors: validation.errors });
    }

    const result = await debateEngine.runDebate(id, req.userId!);
    res.json({ success: true, result });
  } catch (error: any) {
    console.error(`[Start Debate API Error]`, error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id/messages', requireAuth, async (req: AuthRequest, res) => {
  const { id } = req.params;
  try {
    const messages = await Message.find({ courtroomId: id }).sort({ createdAt: 1 });
    res.json(messages);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id/verdict', requireAuth, async (req: AuthRequest, res) => {
  const { id } = req.params;
  try {
    const verdict = await Verdict.findOne({ courtroomId: id });
    res.json(verdict);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
