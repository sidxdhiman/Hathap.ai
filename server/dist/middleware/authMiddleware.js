"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const JWT_SECRET = process.env.JWT_SECRET || 'secret';
const requireAuth = (req, res, next) => {
    const auth = req.headers.authorization;
    if (!auth)
        return res.status(401).json({ error: 'Unauthorized' });
    const token = auth.split(' ')[1];
    try {
        const data = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        req.userId = data.id;
        next();
    }
    catch (e) {
        res.status(401).json({ error: 'Unauthorized' });
    }
};
exports.requireAuth = requireAuth;
