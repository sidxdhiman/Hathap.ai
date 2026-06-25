import express from 'express';
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

const router = express.Router();

router.get('/', requireAuth, async (req: AuthRequest, res) => {
  await migratePlainTextApiKeys(req.userId!);
  const models = await Model.find({ userId: req.userId });
  res.json(serializeModels(models));
});

router.post('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { apiKey, _id, id: bodyId, ...rest } = req.body;

    if (!apiKey || apiKey.includes('•')) {
      return res.status(400).json({ error: 'A valid API key is required when adding a model.' });
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
    console.error('[Models POST]', error);
    res.status(500).json({ error: error.message || 'Failed to create model.' });
  }
});

router.put('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const model = await Model.findOne({ _id: id, userId: req.userId });
    if (!model) {
      return res.status(404).json({ error: 'Model not found.' });
    }

    const { apiKey, apiKeyHint, hasApiKey, _id, id: bodyId, ...updates } = req.body;
    Object.assign(model, updates);
    applyApiKeyToModel(model, apiKey);
    await model.save();

    res.json(serializeModel(model));
  } catch (error: any) {
    console.error('[Models PUT]', error);
    res.status(500).json({ error: error.message || 'Failed to update model.' });
  }
});

router.delete('/:id', requireAuth, async (req: AuthRequest, res) => {
  const { id } = req.params;
  await Model.deleteOne({ _id: id, userId: req.userId });
  res.json({ ok: true });
});

router.post('/:id/test', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
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
    const model = await Model.findOne({ _id: req.params.id, userId: req.userId });
    if (model) {
      model.status = 'error';
      await model.save();
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
