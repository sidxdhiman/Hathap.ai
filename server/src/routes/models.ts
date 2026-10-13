import express from 'express';
import mongoose from 'mongoose';
import { serverErrorMessage } from '../utils/httpError';
import Model from '../models/Model';
import { requireAuth, AuthRequest } from '../middleware/authMiddleware';
import { serializeModel, serializeModels } from '../utils/modelSerializer';
import {
  applyApiKeyToModel,
  assignModelToUnassignedAgents,
  migratePlainTextApiKeys,
  modelForLlmCall,
} from '../services/modelService';
import { callLLM } from '../engine/llmClient';
import { isBlockedModelUrlError, validateModelBaseUrl } from '../security/modelUrlGuard';

const router = express.Router();

router.get('/', requireAuth, async (req: AuthRequest, res) => {
  // Guard the async work so a database fault answers the request instead of
  // leaving it unanswered (Express 4 does not forward rejected async handlers).
  try {
    await migratePlainTextApiKeys(req.userId!);
    const models = await Model.find({ userId: req.userId });
    res.json(serializeModels(models));
  } catch (error: any) {
    console.error('[Models GET]', error);
    res.status(500).json({ error: serverErrorMessage(error, 'Failed to load models.') });
  }
});

router.post('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { apiKey, _id, id: bodyId, ...rest } = req.body;

    if (!apiKey || apiKey.includes('•')) {
      return res.status(400).json({ error: 'A valid API key is required when adding a model.' });
    }

    // `baseUrl` names a network destination the server itself will dial, so it
    // is guarded on the write path (fast, DNS-free) as well as at request time.
    if (Object.prototype.hasOwnProperty.call(rest, 'baseUrl')) {
      rest.baseUrl = validateModelBaseUrl(rest.baseUrl);
    }

    const model = new Model({
      ...rest,
      userId: req.userId,
      status: 'untested',
      enabled: rest.enabled !== false,
    });

    applyApiKeyToModel(model, apiKey);
    await model.save();

    const assignedCount = await assignModelToUnassignedAgents(
      req.userId!,
      model._id.toString()
    );

    res.json({
      ...serializeModel(model),
      agentsAssigned: assignedCount,
    });
  } catch (error: any) {
    if (isBlockedModelUrlError(error)) {
      return res.status(400).json({ error: error.message });
    }
    console.error('[Models POST]', error);
    res.status(500).json({ error: serverErrorMessage(error, 'Failed to create model.') });
  }
});

/**
 * Fields a client may change through the generic update endpoint. `userId`
 * (ownership) and `status` (set by the connection test) are server-managed and
 * must not be writable through a raw body spread (mass assignment). The API key
 * is applied separately so it is encrypted rather than stored verbatim.
 */
const MODEL_UPDATABLE_FIELDS = ['provider', 'displayName', 'modelName', 'baseUrl', 'enabled'] as const;

router.put('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    // A malformed id must be a controlled 404, never a Mongoose CastError (an
    // async rejection Express 4 would not catch).
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ error: 'Model not found.' });
    }
    const model = await Model.findOne({ _id: id, userId: req.userId });
    if (!model) {
      return res.status(404).json({ error: 'Model not found.' });
    }

    const { apiKey } = req.body || {};
    for (const field of MODEL_UPDATABLE_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        (model as any)[field] =
          field === 'baseUrl' ? validateModelBaseUrl(req.body[field]) : req.body[field];
      }
    }
    applyApiKeyToModel(model, apiKey);
    await model.save();

    res.json(serializeModel(model));
  } catch (error: any) {
    if (isBlockedModelUrlError(error)) {
      return res.status(400).json({ error: error.message });
    }
    console.error('[Models PUT]', error);
    res.status(500).json({ error: serverErrorMessage(error, 'Failed to update model.') });
  }
});

router.delete('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ error: 'Model not found.' });
    }
    const result = await Model.deleteOne({ _id: id, userId: req.userId });
    // A delete that matched nothing (foreign or already removed) is a 404,
    // consistent with the update path and the decision router, instead of an
    // unconditional `{ ok: true }`. Foreign and nonexistent are the same 404,
    // so the response still does not disclose whether a foreign model exists.
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Model not found.' });
    }
    res.json({ ok: true });
  } catch (error: any) {
    console.error('[Models DELETE]', error);
    res.status(500).json({ error: serverErrorMessage(error, 'Failed to delete model.') });
  }
});

router.post('/:id/test', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    // Reject a malformed id before it reaches Mongoose. A CastError raised here
    // would land in the catch below, whose own re-query on the same id rejects
    // again outside any handler — an unhandled rejection that leaves the caller
    // with no response at all (the failure Phase 27's process-level net only
    // logs, it does not answer).
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ error: 'Model not found.' });
    }
    const model = await Model.findOne({ _id: id, userId: req.userId });
    if (!model) {
      return res.status(404).json({ error: 'Model not found.' });
    }

    if (!model.apiKey) {
      return res.status(400).json({ success: false, error: 'No API key configured for this model.' });
    }

    // Single-shot test — no retries, cheapest possible request (16 tokens).
    // Retries on a test endpoint make the user wait and don't help diagnose anything.
    await callLLM(
      modelForLlmCall(model),
      [{ role: 'user', content: 'Reply with exactly: OK' }],
      { maxTokens: 16, _test: true } as any
    );

    model.status = 'connected';
    await model.save();

    res.json({ success: true, model: serializeModel(model) });
  } catch (error: any) {
    // Record the failure, but never let bookkeeping replace the response: a
    // second database fault while flipping the status must not leave the caller
    // without an answer. The connection-test message stays verbatim because it
    // is the reason the user ran the test (an expected diagnostic, not an
    // internal fault).
    let model: any = null;
    try {
      model = await Model.findOne({ _id: req.params.id, userId: req.userId });
      if (model) {
        model.status = 'error';
        await model.save();
      }
    } catch (statusError) {
      console.error('[Models test] failed to record error status', statusError);
    }
    res.status(400).json({
      success: false,
      error: error.message || 'Connection test failed.',
      model: model ? serializeModel(model) : undefined,
    });
  }
});

router.post('/assign-default-agents', requireAuth, async (req: AuthRequest, res) => {
  const latestModel = await Model.findOne({ userId: req.userId }).sort({ createdAt: -1 });
  if (!latestModel) {
    return res.status(400).json({ error: 'Add a model before assigning agents.' });
  }

  const assignedCount = await assignModelToUnassignedAgents(
    req.userId!,
    latestModel._id.toString()
  );

  res.json({
    success: true,
    assignedCount,
    modelId: latestModel._id.toString(),
  });
});

export default router;
