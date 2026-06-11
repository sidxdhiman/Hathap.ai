import express from 'express';
import Agent from '../models/Agent';
import { requireAuth, AuthRequest } from '../middleware/authMiddleware';

const router = express.Router();

router.get('/', requireAuth, async (req: AuthRequest, res) => {
  const items = await Agent.find({ userId: req.userId });
  res.json(items);
});

router.post('/', requireAuth, async (req: AuthRequest, res) => {
  const item = new Agent({ ...req.body, userId: req.userId });
  await item.save();
  res.json(item);
});

router.put('/:id', requireAuth, async (req: AuthRequest, res) => {
  const { id } = req.params;
  const updated = await Agent.findOneAndUpdate({ _id: id, userId: req.userId }, req.body, { new: true });
  res.json(updated);
});

router.delete('/:id', requireAuth, async (req: AuthRequest, res) => {
  const { id } = req.params;
  await Agent.deleteOne({ _id: id, userId: req.userId });
  res.json({ ok: true });
});

export default router;
