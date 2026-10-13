import express from 'express';
import mongoose from 'mongoose';
import { serverErrorMessage } from '../utils/httpError';
import Agent from '../models/Agent';
import { requireAuth, AuthRequest } from '../middleware/authMiddleware';

const router = express.Router();

router.get('/', requireAuth, async (req: AuthRequest, res) => {
  // Every other handler on this router guards its own async work: Express 4
  // does not forward a rejected async handler to the error middleware, so a
  // transient database fault here would otherwise leave the request unanswered.
  try {
    const items = await Agent.find({ userId: req.userId });
    res.json(items);
  } catch (error: any) {
    console.error('[Agents GET]', error);
    res.status(500).json({ error: serverErrorMessage(error, 'Failed to load agents.') });
  }
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
    // `findOneAndUpdate` returns null when the id does not match a document the
    // caller owns — a valid-but-foreign id or an id that simply does not exist.
    // Serializing that as `res.json(null)` produced a `200 null` success that
    // the client applied optimistically and never resynced, so the UI claimed an
    // edit the server never persisted. The same 404 for both cases also keeps
    // the response from disclosing whether a foreign resource exists.
    if (!updated) {
      return res.status(404).json({ error: 'Agent not found.' });
    }
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
    const result = await Agent.deleteOne({ _id: id, userId: req.userId });
    // Report honestly: a delete that matched nothing (foreign or already gone)
    // is a 404, mirroring the update path and the decision router. Returning
    // `{ ok: true }` regardless let a caller believe a foreign document was
    // removed. Foreign and nonexistent are indistinguishable, so existence is
    // still not disclosed.
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Agent not found.' });
    }
    res.json({ ok: true });
  } catch (error: any) {
    console.error('[Agents DELETE]', error);
    res.status(500).json({ error: serverErrorMessage(error, 'Failed to delete agent.') });
  }
});

export default router;
