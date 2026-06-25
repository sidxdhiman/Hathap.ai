import express from 'express';
import Agent from '../models/Agent';
import { requireAuth, AuthRequest } from '../middleware/authMiddleware';

const router = express.Router();

router.get('/', requireAuth, async (req: AuthRequest, res) => {
  const items = await Agent.find({ userId: req.userId });
  res.json(items);
});

router.post('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { _id, id: bodyId, ...rest } = req.body;
    const item = new Agent({ ...rest, userId: req.userId });
    await item.save();
    res.json(item);
  } catch (error: any) {
    console.error('[Agents POST]', error);
    res.status(500).json({ error: error.message || 'Failed to create agent.' });
  }
});

router.put('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { _id, id: bodyId, ...updates } = req.body;
    const updated = await Agent.findOneAndUpdate(
      { _id: id, userId: req.userId },
      updates,
      { new: true }
    );
    res.json(updated);
  } catch (error: any) {
    console.error('[Agents PUT]', error);
    res.status(500).json({ error: error.message || 'Failed to update agent.' });
  }
});

router.delete('/:id', requireAuth, async (req: AuthRequest, res) => {
  const { id } = req.params;
  await Agent.deleteOne({ _id: id, userId: req.userId });
  res.json({ ok: true });
});

export default router;
