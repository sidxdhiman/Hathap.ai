"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importStar(require("mongoose"));
const EvidenceRelationshipSchema = new mongoose_1.Schema({
    claimId: { type: String, required: true, index: true },
    evidenceId: { type: String, required: true, index: true },
    relationship: {
        type: String,
        enum: ['supports', 'contradicts', 'related'],
        required: true,
    },
    strength: { type: Number, min: 0, max: 1 },
    rationale: { type: String },
    source: {
        type: String,
        enum: ['research', 'agent', 'verification'],
        default: 'agent',
    },
    decisionId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Decision', index: true },
    executionId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Execution' },
    taskId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Task' },
    createdAt: { type: Date, default: Date.now },
}, { timestamps: true });
EvidenceRelationshipSchema.index({ decisionId: 1, claimId: 1, evidenceId: 1 }, { unique: true });
exports.default = mongoose_1.default.model('EvidenceRelationship', EvidenceRelationshipSchema);
