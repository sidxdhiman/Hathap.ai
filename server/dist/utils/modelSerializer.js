"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.serializeModel = serializeModel;
exports.serializeModels = serializeModels;
const encryption_1 = require("./encryption");
function serializeModel(model) {
    if (!model)
        return null;
    const doc = model.toObject ? model.toObject() : model;
    return {
        ...doc,
        id: doc._id?.toString() || doc.id,
        apiKey: (0, encryption_1.maskApiKey)(doc.apiKeyHint),
        hasApiKey: Boolean(doc.apiKey),
        apiKeyHint: undefined,
    };
}
function serializeModels(models) {
    return models.map((model) => serializeModel(model));
}
