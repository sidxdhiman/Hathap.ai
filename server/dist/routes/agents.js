"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const Agent_1 = __importDefault(require("../models/Agent"));
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = express_1.default.Router();
router.get('/', authMiddleware_1.requireAuth, async (req, res) => {
    const items = await Agent_1.default.find({ userId: req.userId });
    res.json(items);
});
router.post('/', authMiddleware_1.requireAuth, async (req, res) => {
    const item = new Agent_1.default({ ...req.body, userId: req.userId });
    await item.save();
    res.json(item);
});
router.put('/:id', authMiddleware_1.requireAuth, async (req, res) => {
    const { id } = req.params;
    const updated = await Agent_1.default.findOneAndUpdate({ _id: id, userId: req.userId }, req.body, { new: true });
    res.json(updated);
});
router.delete('/:id', authMiddleware_1.requireAuth, async (req, res) => {
    const { id } = req.params;
    await Agent_1.default.deleteOne({ _id: id, userId: req.userId });
    res.json({ ok: true });
});
exports.default = router;
