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
const router = express_1.default.Router();
router.get('/', authMiddleware_1.requireAuth, async (req, res) => {
    const items = await Courtroom_1.default.find({ userId: req.userId });
    res.json(items);
});
router.post('/', authMiddleware_1.requireAuth, async (req, res) => {
    const item = new Courtroom_1.default({ ...req.body, userId: req.userId });
    await item.save();
    res.json(item);
});
router.put('/:id', authMiddleware_1.requireAuth, async (req, res) => {
    const { id } = req.params;
    const updated = await Courtroom_1.default.findOneAndUpdate({ _id: id, userId: req.userId }, req.body, { new: true });
    res.json(updated);
});
router.delete('/:id', authMiddleware_1.requireAuth, async (req, res) => {
    const { id } = req.params;
    await Courtroom_1.default.deleteOne({ _id: id, userId: req.userId });
    res.json({ ok: true });
});
router.post('/:id/start', authMiddleware_1.requireAuth, async (req, res) => {
    const { id } = req.params;
    try {
        const validation = await (0, debateValidation_1.validateDebateReady)(id, req.userId);
        if (!validation.ok) {
            return res.status(400).json({ error: validation.errors.join(' '), errors: validation.errors });
        }
        const result = await debateEngine_1.debateEngine.runDebate(id, req.userId);
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
