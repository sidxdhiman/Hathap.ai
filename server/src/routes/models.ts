import express from 'express';
import Model from '../models/Model';
import { requireAuth, AuthRequest } from '../middleware/authMiddleware';

const router = express.Router();

router.get('/', requireAuth, async (req: AuthRequest, res) => {
  const models = await Model.find({ userId: req.userId });
  res.json(models);
});

router.post('/', requireAuth, async (req: AuthRequest, res) => {
  const body = req.body;
  const model = new Model({ ...body, userId: req.userId });
  await model.save();
  res.json(model);
});

router.put('/:id', requireAuth, async (req: AuthRequest, res) => {
  const { id } = req.params;
  const updated = await Model.findOneAndUpdate({ _id: id, userId: req.userId }, req.body, { new: true });
  res.json(updated);
});

router.delete('/:id', requireAuth, async (req: AuthRequest, res) => {
  const { id } = req.params;
  await Model.deleteOne({ _id: id, userId: req.userId });
  res.json({ ok: true });
});

export default router;
