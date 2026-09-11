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
const DecisionMemorySchema = new mongoose_1.Schema({
    userId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    decisionId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Decision', required: true, unique: true, index: true },
    status: {
        type: String,
        enum: ['active', 'completed', 'cancelled', 'failed', 'archived'],
        default: 'active',
        index: true,
    },
    title: { type: String, required: true },
    objective: { type: String, required: true },
    category: { type: String, index: true },
    domain: { type: String, index: true },
    problemType: { type: String, index: true },
    tags: [{ type: String }],
    entities: [{ type: String }],
    finalRecommendation: { type: String },
    recommendationSource: {
        type: String,
        enum: ['reconciliation', 'debate', 'courtroom', 'none'],
        default: 'none',
    },
    selectedPlanId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'DecisionPlan' },
    importantClaimIds: [{ type: String }],
    importantEvidenceIds: [{ type: String }],
    agentsUsed: [{ type: String }],
    modelsUsed: [{ type: String }],
    executionIds: [{ type: String }],
    outcomeIds: [{ type: String }],
    feedbackId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'DecisionFeedback' },
    lessonIds: [{ type: String }],
    completedAt: { type: Date },
    createdVia: { type: String, enum: ['completion', 'cancellation', 'on-demand'] },
    metadata: { type: mongoose_1.Schema.Types.Mixed },
}, { timestamps: true });
// Retrieval-oriented indexes. The unique decisionId index above already covers
// decision lookups; these cover ownership-scoped scans for related decisions.
DecisionMemorySchema.index({ userId: 1, status: 1, createdAt: -1 });
DecisionMemorySchema.index({ userId: 1, category: 1 });
DecisionMemorySchema.index({ userId: 1, domain: 1 });
DecisionMemorySchema.index({ userId: 1, problemType: 1 });
DecisionMemorySchema.index({ userId: 1, tags: 1 });
exports.default = mongoose_1.default.model('DecisionMemory', DecisionMemorySchema);
