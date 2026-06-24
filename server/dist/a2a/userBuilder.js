"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.hathapUserBuilder = hathapUserBuilder;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const server_1 = require("@a2a-js/sdk/server");
const types_1 = require("./types");
const JWT_SECRET = process.env.JWT_SECRET || 'secret';
async function hathapUserBuilder(req) {
    const auth = req.headers.authorization;
    if (auth?.startsWith('Bearer ')) {
        try {
            const token = auth.split(' ')[1];
            const data = jsonwebtoken_1.default.verify(token, JWT_SECRET);
            return new types_1.HathapUser(data.id, data.email || data.id);
        }
        catch {
            // Fall through to other auth methods
        }
    }
    const apiKey = req.headers['x-a2a-api-key'];
    const configuredKey = process.env.A2A_API_KEY;
    const defaultUserId = process.env.A2A_DEFAULT_USER_ID;
    if (typeof apiKey === 'string' &&
        configuredKey &&
        apiKey === configuredKey &&
        defaultUserId) {
        return new types_1.HathapUser(defaultUserId, 'a2a-service');
    }
    return new server_1.UnauthenticatedUser();
}
