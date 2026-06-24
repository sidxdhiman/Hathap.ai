"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveCourtroomForDebate = resolveCourtroomForDebate;
const Courtroom_1 = __importDefault(require("../models/Courtroom"));
const Agent_1 = __importDefault(require("../models/Agent"));
const DEFAULT_AGENT_COUNT = 5;
async function resolveCourtroomForDebate(userId, request) {
    if (request.courtroomId) {
        const courtroom = await Courtroom_1.default.findOne({ _id: request.courtroomId, userId });
        if (!courtroom) {
            throw new Error('Courtroom not found or access denied.');
        }
        return { courtroomId: courtroom.id, created: false };
    }
    const agents = request.agentIds?.length
        ? await Agent_1.default.find({ _id: { $in: request.agentIds }, userId })
        : await Agent_1.default.find({ userId }).sort({ createdAt: 1 }).limit(DEFAULT_AGENT_COUNT);
    if (agents.length === 0) {
        throw new Error('No agents available. Sign up in Hathap.AI and configure at least one agent template.');
    }
    const objective = request.objective || 'Provide structured multi-agent analysis.';
    const courtroom = new Courtroom_1.default({
        name: `A2A Debate: ${objective.slice(0, 60)}`,
        description: 'Created automatically via A2A protocol',
        objective,
        mode: request.mode || 'consensus',
        participants: agents.map((agent) => ({ agentId: agent._id?.toString() })),
        status: 'draft',
        userId,
    });
    await courtroom.save();
    return { courtroomId: courtroom.id, created: true };
}
