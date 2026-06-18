import express from 'express';
import Courtroom from '../models/Courtroom';
import Message from '../models/Message';
import Verdict from '../models/Verdict';
import { debateEngine } from '../engine/debateEngine';
import { requireAuth, AuthRequest } from '../middleware/authMiddleware';

const router = express.Router();

router.get('/', requireAuth, async (req: AuthRequest, res) => {
  const items = await Courtroom.find({ userId: req.userId });
  res.json(items);
});

router.post('/', requireAuth, async (req: AuthRequest, res) => {
  const item = new Courtroom({ ...req.body, userId: req.userId });
  await item.save();
  res.json(item);
});

router.put('/:id', requireAuth, async (req: AuthRequest, res) => {
  const { id } = req.params;
  const updated = await Courtroom.findOneAndUpdate({ _id: id, userId: req.userId }, req.body, { new: true });
  res.json(updated);
});

router.delete('/:id', requireAuth, async (req: AuthRequest, res) => {
  const { id } = req.params;
  await Courtroom.deleteOne({ _id: id, userId: req.userId });
  res.json({ ok: true });
});

router.post('/:id/start', requireAuth, async (req: AuthRequest, res) => {
  const { id } = req.params;
  try {
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
