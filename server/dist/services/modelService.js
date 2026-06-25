"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.assignModelToUnassignedAgents = assignModelToUnassignedAgents;
exports.isFirstUserModel = isFirstUserModel;
exports.applyApiKeyToModel = applyApiKeyToModel;
exports.migratePlainTextApiKeys = migratePlainTextApiKeys;
exports.getDecryptedApiKey = getDecryptedApiKey;
exports.modelForLlmCall = modelForLlmCall;
const Agent_1 = __importDefault(require("../models/Agent"));
const Model_1 = __importDefault(require("../models/Model"));
const encryption_1 = require("../utils/encryption");
async function assignModelToUnassignedAgents(userId, modelId) {
    const result = await Agent_1.default.updateMany({
        userId,
        $or: [{ assignedModelId: null }, { assignedModelId: { $exists: false } }],
    }, { assignedModelId: modelId });
    return result.modifiedCount || 0;
}
async function isFirstUserModel(userId) {
    const count = await Model_1.default.countDocuments({ userId });
    return count <= 1;
}
function applyApiKeyToModel(model, incomingKey) {
    if (!incomingKey || (0, encryption_1.isMaskedApiKeyValue)(incomingKey)) {
        return;
    }
    model.apiKey = (0, encryption_1.encryptApiKey)(incomingKey);
    model.apiKeyHint = (0, encryption_1.getApiKeyHint)(incomingKey);
}
async function migratePlainTextApiKeys(userId) {
    const models = await Model_1.default.find({ userId });
    for (const model of models) {
        if (model.apiKey && !(0, encryption_1.isEncrypted)(model.apiKey)) {
            const plain = model.apiKey;
            model.apiKey = (0, encryption_1.encryptApiKey)(plain);
            model.apiKeyHint = (0, encryption_1.getApiKeyHint)(plain);
            await model.save();
        }
    }
}
function getDecryptedApiKey(model) {
    return (0, encryption_1.decryptApiKey)(model.apiKey);
}
function modelForLlmCall(model) {
    return {
        ...model.toObject(),
        apiKey: getDecryptedApiKey(model),
    };
}
