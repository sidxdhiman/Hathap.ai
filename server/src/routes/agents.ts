import express from 'express';
import mongoose from 'mongoose';
import { serverErrorMessage } from '../utils/httpError';
import Agent from '../models/Agent';
import { requireAuth, AuthRequest } from '../middleware/authMiddleware';

const router = express.Router();

router.get('/', requireAuth, async (req: AuthRequest, res) => {
  const items = await Agent.find({ userId: req.userId });
  res.json(items);
});

router.post('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { _id, id: bodyId, createdAt, ...rest } = req.body;
    const item = new Agent({ ...rest, userId: req.userId });
    await item.save();
    res.json(item);
  } catch (error: any) {
    console.error('[Agents POST]', error);
    res.status(500).json({ error: serverErrorMessage(error, 'Failed to create agent.') });
  }
});

/**
 * Fields a client may change through the generic update endpoint. `userId`
 * (ownership) and `createdAt` are server-managed. Spreading the raw body let a
 * caller rewrite `userId`, which moves the agent into another user's workspace:
 * the attacker keeps the document id and the victim's roster silently gains an
 * attacker-authored `systemPrompt` that runs inside their debates.
 */
const AGENT_UPDATABLE_FIELDS = [
  'name',
  'description',
  'systemPrompt',
  'assignedModelId',
  'avatar',
  'colorTag',
  'logo',
  'capabilities',
  'tools',
  'constraints',
] as const;

function pickAgentUpdates(body: any): Record<string, unknown> {
  const updates: Record<string, unknown> = {};
  for (const field of AGENT_UPDATABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, field)) updates[field] = body[field];
  }
  return updates;
}

router.put('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    // A malformed id must be a controlled 404, never a Mongoose CastError: this
    // handler is async and Express 4 does not forward its rejections, so an
    // unhandled cast would take the process down.
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ error: 'Agent not found.' });
    }
    const updated = await Agent.findOneAndUpdate(
      { _id: id, userId: req.userId },
      pickAgentUpdates(req.body || {}),
      { new: true }
    );
    res.json(updated);
  } catch (error: any) {
    console.error('[Agents PUT]', error);
    res.status(500).json({ error: serverErrorMessage(error, 'Failed to update agent.') });
  }
});

router.delete('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ error: 'Agent not found.' });
    }
    await Agent.deleteOne({ _id: id, userId: req.userId });
    res.json({ ok: true });
  } catch (error: any) {
    console.error('[Agents DELETE]', error);
    res.status(500).json({ error: serverErrorMessage(error, 'Failed to delete agent.') });
  }
});

export default router;
