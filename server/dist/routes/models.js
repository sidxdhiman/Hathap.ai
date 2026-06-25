"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const Model_1 = __importDefault(require("../models/Model"));
const authMiddleware_1 = require("../middleware/authMiddleware");
const modelSerializer_1 = require("../utils/modelSerializer");
const modelService_1 = require("../services/modelService");
const llmClient_1 = require("../engine/llmClient");
const router = express_1.default.Router();
router.get('/', authMiddleware_1.requireAuth, async (req, res) => {
    await (0, modelService_1.migratePlainTextApiKeys)(req.userId);
    const models = await Model_1.default.find({ userId: req.userId });
    res.json((0, modelSerializer_1.serializeModels)(models));
});
router.post('/', authMiddleware_1.requireAuth, async (req, res) => {
    try {
        const { apiKey, ...rest } = req.body;
        if (!apiKey || apiKey.includes('•')) {
            return res.status(400).json({ error: 'A valid API key is required when adding a model.' });
        }
        const model = new Model_1.default({
            ...rest,
            userId: req.userId,
            status: 'untested',
            enabled: rest.enabled !== false,
        });
        (0, modelService_1.applyApiKeyToModel)(model, apiKey);
        await model.save();
        const assignedCount = await (0, modelService_1.assignModelToUnassignedAgents)(req.userId, model._id.toString());
        res.json({
            ...(0, modelSerializer_1.serializeModel)(model),
            agentsAssigned: assignedCount,
        });
    }
    catch (error) {
        console.error('[Models POST]', error);
        res.status(500).json({ error: error.message || 'Failed to create model.' });
    }
});
router.put('/:id', authMiddleware_1.requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const model = await Model_1.default.findOne({ _id: id, userId: req.userId });
        if (!model) {
            return res.status(404).json({ error: 'Model not found.' });
        }
        const { apiKey, apiKeyHint, hasApiKey, _id, id: bodyId, ...updates } = req.body;
        Object.assign(model, updates);
        (0, modelService_1.applyApiKeyToModel)(model, apiKey);
        await model.save();
        res.json((0, modelSerializer_1.serializeModel)(model));
    }
    catch (error) {
        console.error('[Models PUT]', error);
        res.status(500).json({ error: error.message || 'Failed to update model.' });
    }
});
router.delete('/:id', authMiddleware_1.requireAuth, async (req, res) => {
    const { id } = req.params;
    await Model_1.default.deleteOne({ _id: id, userId: req.userId });
    res.json({ ok: true });
});
router.post('/:id/test', authMiddleware_1.requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const model = await Model_1.default.findOne({ _id: id, userId: req.userId });
        if (!model) {
            return res.status(404).json({ error: 'Model not found.' });
        }
        if (!model.apiKey) {
            return res.status(400).json({ success: false, error: 'No API key configured for this model.' });
        }
        await (0, llmClient_1.callLLM)((0, modelService_1.modelForLlmCall)(model), [{ role: 'user', content: 'Reply with exactly: OK' }], { maxTokens: 16 });
        model.status = 'connected';
        await model.save();
        res.json({ success: true, model: (0, modelSerializer_1.serializeModel)(model) });
    }
    catch (error) {
        const model = await Model_1.default.findOne({ _id: req.params.id, userId: req.userId });
        if (model) {
            model.status = 'error';
            await model.save();
        }
        res.status(400).json({
            success: false,
            error: error.message || 'Connection test failed.',
            model: model ? (0, modelSerializer_1.serializeModel)(model) : undefined,
        });
    }
});
router.post('/assign-default-agents', authMiddleware_1.requireAuth, async (req, res) => {
    const latestModel = await Model_1.default.findOne({ userId: req.userId }).sort({ createdAt: -1 });
    if (!latestModel) {
        return res.status(400).json({ error: 'Add a model before assigning agents.' });
    }
    const assignedCount = await (0, modelService_1.assignModelToUnassignedAgents)(req.userId, latestModel._id.toString());
    res.json({
        success: true,
        assignedCount,
        modelId: latestModel._id.toString(),
    });
});
exports.default = router;
