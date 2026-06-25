"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateDebateReady = validateDebateReady;
exports.normalizeDebateMode = normalizeDebateMode;
const Courtroom_1 = __importDefault(require("../models/Courtroom"));
const Agent_1 = __importDefault(require("../models/Agent"));
const Model_1 = __importDefault(require("../models/Model"));
async function validateDebateReady(courtroomId, userId) {
    const errors = [];
    const courtroom = await Courtroom_1.default.findOne({ _id: courtroomId, userId });
    if (!courtroom) {
        return { ok: false, errors: ['Courtroom not found.'] };
    }
    if (!courtroom.participants || courtroom.participants.length === 0) {
        errors.push('Add at least one agent participant before starting the debate.');
    }
    const enabledModels = await Model_1.default.find({ userId, enabled: true });
    if (enabledModels.length === 0) {
        errors.push('Add and enable at least one AI model before starting a debate.');
    }
    const modelsWithKeys = enabledModels.filter((model) => Boolean(model.apiKey));
    if (enabledModels.length > 0 && modelsWithKeys.length === 0) {
        errors.push('Your enabled models are missing API keys. Add keys on the Models page.');
    }
    const agentIds = (courtroom.participants || [])
        .map((participant) => participant.agentId || participant.id || participant._id)
        .filter(Boolean);
    const agents = await Agent_1.default.find({ _id: { $in: agentIds }, userId });
    if (courtroom.participants?.length && agents.length === 0) {
        errors.push('No valid agent participants could be resolved for this courtroom.');
    }
    for (const agent of agents) {
        const assignedModel = enabledModels.find((model) => model._id?.toString() === agent.assignedModelId?.toString() ||
            model.id === agent.assignedModelId?.toString());
        const fallbackModel = enabledModels[0];
        const modelToUse = assignedModel || fallbackModel;
        if (!modelToUse) {
            errors.push(`Agent "${agent.name}" has no enabled model available.`);
            continue;
        }
        if (!modelToUse.apiKey) {
            errors.push(`Agent "${agent.name}" uses model "${modelToUse.displayName}" which has no API key configured.`);
        }
    }
    return { ok: errors.length === 0, errors };
}
function normalizeDebateMode(mode) {
    const normalized = (mode || 'consensus').toLowerCase().trim();
    const modeMap = {
        consensus: 'consensus',
        majority: 'majority vote',
        'majority vote': 'majority vote',
        'devils-advocate': "devil's advocate",
        "devil's advocate": "devil's advocate",
        'devils advocate': "devil's advocate",
        judge: 'judge',
        open: 'open debate',
        'open debate': 'open debate',
    };
    return modeMap[normalized] || normalized;
}
