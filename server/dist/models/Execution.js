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
const ExecutionErrorSchema = new mongoose_1.Schema({
    code: String,
    message: { type: String, required: true },
    taskId: String,
    agentId: String,
    retryable: { type: Boolean, default: false },
    retryCount: Number,
    createdAt: { type: Date, default: Date.now },
}, { _id: false });
const TokenUsageSchema = new mongoose_1.Schema({
    inputTokens: { type: Number, default: 0 },
    outputTokens: { type: Number, default: 0 },
    totalTokens: { type: Number, default: 0 },
    estimatedCost: { type: Number, default: 0 },
    model: String,
    provider: String,
    latencyMs: Number,
}, { _id: false });
const ExecutionSchema = new mongoose_1.Schema({
    decisionId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Decision', required: true, index: true },
    status: {
        type: String,
        enum: ['pending', 'queued', 'running', 'paused', 'completed', 'failed', 'partial', 'cancelled'],
        default: 'pending',
        index: true,
    },
    startedAt: { type: Date },
    completedAt: { type: Date },
    cancelledAt: { type: Date },
    currentPhase: { type: String },
    currentTask: { type: String },
    progress: { type: Number, default: 0, min: 0, max: 100 },
    totalTasks: { type: Number, default: 0 },
    completedTasks: { type: Number, default: 0 },
    failedTasks: { type: Number, default: 0 },
    runningTasks: { type: Number, default: 0 },
    pendingTasks: { type: Number, default: 0 },
    readyTasks: { type: Number, default: 0 },
    error: { type: ExecutionErrorSchema },
    retryCount: { type: Number, default: 0 },
    maxRetries: { type: Number, default: 0 },
    tokenUsage: { type: TokenUsageSchema, default: () => ({}) },
    estimatedCost: { type: Number, default: 0 },
    actualCost: { type: Number, default: 0 },
    planningStatus: { type: String, enum: ['pending', 'planning', 'planned', 'failed'], index: true },
    planId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'DecisionPlan' },
    planningMode: { type: String, enum: ['fixed', 'intelligent'] },
    planningStartedAt: { type: Date },
    planningCompletedAt: { type: Date },
    metadata: { type: mongoose_1.Schema.Types.Mixed },
}, { timestamps: true });
exports.default = mongoose_1.default.model('Execution', ExecutionSchema);
