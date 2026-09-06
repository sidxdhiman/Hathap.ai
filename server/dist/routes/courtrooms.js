"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const Courtroom_1 = __importDefault(require("../models/Courtroom"));
const Message_1 = __importDefault(require("../models/Message"));
const Verdict_1 = __importDefault(require("../models/Verdict"));
const debateEngine_1 = require("../engine/debateEngine");
const authMiddleware_1 = require("../middleware/authMiddleware");
const debateValidation_1 = require("../services/debateValidation");
const orchestrator_1 = require("../decision/orchestrator");
const router = express_1.default.Router();
router.get('/', authMiddleware_1.requireAuth, async (req, res) => {
    const items = await Courtroom_1.default.find({ userId: req.userId });
    res.json(items);
});
router.post('/', authMiddleware_1.requireAuth, async (req, res) => {
    try {
        const { _id, id: bodyId, ...rest } = req.body;
        const item = new Courtroom_1.default({ ...rest, userId: req.userId });
        await item.save();
        res.json(item);
    }
    catch (error) {
        console.error('[Courtrooms POST]', error);
        res.status(500).json({ error: error.message || 'Failed to create courtroom.' });
    }
});
router.put('/:id', authMiddleware_1.requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { _id, id: bodyId, ...updates } = req.body;
        const updated = await Courtroom_1.default.findOneAndUpdate({ _id: id, userId: req.userId }, updates, { new: true });
        res.json(updated);
    }
    catch (error) {
        console.error('[Courtrooms PUT]', error);
        res.status(500).json({ error: error.message || 'Failed to update courtroom.' });
    }
});
router.delete('/:id', authMiddleware_1.requireAuth, async (req, res) => {
    const { id } = req.params;
    await Courtroom_1.default.deleteOne({ _id: id, userId: req.userId });
    res.json({ ok: true });
});
router.post('/:id/start', authMiddleware_1.requireAuth, async (req, res) => {
    const { id } = req.params;
    const usageRecords = [];
    try {
        const validation = await (0, debateValidation_1.validateDebateReady)(id, req.userId);
        if (!validation.ok) {
            return res.status(400).json({ error: validation.errors.join(' '), errors: validation.errors });
        }
        const courtroom = await Courtroom_1.default.findOne({ _id: id, userId: req.userId });
        const result = await debateEngine_1.debateEngine.runDebate(id, req.userId);
        // Bridge to Decision architecture: if a Courtroom ran a debate, create/update
        // a corresponding Decision and Execution to record lifecycle and usage.
        if (courtroom) {
            try {
                const execution = await orchestrator_1.decisionOrchestrator.createCourthouseExecution(courtroom._id.toString(), req.userId, result, usageRecords);
                if (execution) {
                    res.json({ success: true, result, decisionId: execution.decisionId, executionId: execution._id });
                    return;
                }
            }
            catch (err) {
                console.error('[Courtrooms:start] Failed to link decision:', err?.message);
            }
        }
        res.json({ success: true, result });
    }
    catch (error) {
        console.error(`[Start Debate API Error]`, error);
        res.status(500).json({ error: error.message });
    }
});
router.get('/:id/messages', authMiddleware_1.requireAuth, async (req, res) => {
    const { id } = req.params;
    try {
        const messages = await Message_1.default.find({ courtroomId: id }).sort({ createdAt: 1 });
        res.json(messages);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
router.get('/:id/verdict', authMiddleware_1.requireAuth, async (req, res) => {
    const { id } = req.params;
    try {
        const verdict = await Verdict_1.default.findOne({ courtroomId: id });
        res.json(verdict);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
exports.default = router;
