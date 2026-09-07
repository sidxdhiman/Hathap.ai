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
const TaskErrorSchema = new mongoose_1.Schema({
    code: String,
    message: { type: String, required: true },
    taskId: String,
    kind: {
        type: String,
        enum: ['retryable', 'non_retryable', 'dependency_failure', 'cancelled'],
        default: 'retryable',
    },
    attempt: Number,
    createdAt: { type: Date, default: Date.now },
}, { _id: false });
const TaskSchema = new mongoose_1.Schema({
    executionId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Execution', required: true, index: true },
    type: {
        type: String,
        enum: ['research', 'analysis', 'debate', 'challenge', 'verification', 'synthesis', 'human_review'],
        required: true,
        index: true,
    },
    status: {
        type: String,
        enum: ['pending', 'ready', 'running', 'completed', 'failed', 'retrying', 'paused', 'cancelled', 'skipped'],
        default: 'pending',
        index: true,
    },
    priority: { type: Number, default: 0 },
    input: { type: mongoose_1.Schema.Types.Mixed },
    output: { type: mongoose_1.Schema.Types.Mixed },
    result: { type: mongoose_1.Schema.Types.Mixed },
    assignedAgent: { type: String },
    assignedModel: { type: String },
    dependencies: [{ type: String }],
    startedAt: { type: Date },
    completedAt: { type: Date },
    error: { type: TaskErrorSchema },
    maxRetries: { type: Number, default: 2 },
    retryCount: { type: Number, default: 0 },
    nextRetryAt: { type: Date },
    attempts: { type: Number, default: 0 },
    workerId: { type: String },
    leasedAt: { type: Date },
    metadata: { type: mongoose_1.Schema.Types.Mixed },
}, { timestamps: true });
exports.default = mongoose_1.default.model('Task', TaskSchema);
