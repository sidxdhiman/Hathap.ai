"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const Model_1 = __importDefault(require("../models/Model"));
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = express_1.default.Router();
router.get('/', authMiddleware_1.requireAuth, async (req, res) => {
    const models = await Model_1.default.find({ userId: req.userId });
    res.json(models);
});
router.post('/', authMiddleware_1.requireAuth, async (req, res) => {
    const body = req.body;
    const model = new Model_1.default({ ...body, userId: req.userId });
    await model.save();
    res.json(model);
});
router.put('/:id', authMiddleware_1.requireAuth, async (req, res) => {
    const { id } = req.params;
    const updated = await Model_1.default.findOneAndUpdate({ _id: id, userId: req.userId }, req.body, { new: true });
    res.json(updated);
});
router.delete('/:id', authMiddleware_1.requireAuth, async (req, res) => {
    const { id } = req.params;
    await Model_1.default.deleteOne({ _id: id, userId: req.userId });
    res.json({ ok: true });
});
exports.default = router;
