"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const User_1 = __importDefault(require("../models/User"));
const Agent_1 = __importDefault(require("../models/Agent"));
const defaultAgents_1 = require("../utils/defaultAgents");
const router = express_1.default.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'secret';
router.post('/signup', async (req, res) => {
    const { email, password, name } = req.body;
    if (!email || !password || !name)
        return res.status(400).json({ error: 'Missing fields' });
    try {
        const existing = await User_1.default.findOne({ email });
        if (existing)
            return res.status(400).json({ error: 'User exists' });
        const hash = await bcryptjs_1.default.hash(password, 10);
        const user = new User_1.default({ email, name, passwordHash: hash });
        await user.save();
        // Automatically create 10 pre-built AI agents for the newly signed up user
        try {
            const agentsToCreate = defaultAgents_1.defaultAgents.map(agent => ({
                ...agent,
                userId: user._id
            }));
            await Agent_1.default.insertMany(agentsToCreate);
        }
        catch (err) {
            console.error('Failed to create default agents on signup:', err);
        }
        const token = jsonwebtoken_1.default.sign({ id: user._id }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, user: { id: user._id, email: user.email, name: user.name } });
    }
    catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
});
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password)
        return res.status(400).json({ error: 'Missing fields' });
    try {
        const user = await User_1.default.findOne({ email });
        if (!user)
            return res.status(400).json({ error: 'Invalid credentials' });
        const ok = await bcryptjs_1.default.compare(password, user.passwordHash);
        if (!ok)
            return res.status(400).json({ error: 'Invalid credentials' });
        const token = jsonwebtoken_1.default.sign({ id: user._id }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, user: { id: user._id, email: user.email, name: user.name } });
    }
    catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
});
exports.default = router;
