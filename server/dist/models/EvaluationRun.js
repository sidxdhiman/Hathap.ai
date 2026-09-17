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
const BaselineRefSchema = new mongoose_1.Schema({
    baselineId: { type: String },
    thresholds: {
        composite: { type: Number },
        byCriterion: { type: mongoose_1.Schema.Types.Mixed },
    },
}, { _id: false });
const AblationSchema = new mongoose_1.Schema({
    parentRunId: { type: String },
    variantLabel: { type: String },
    configPatch: { type: mongoose_1.Schema.Types.Mixed },
}, { _id: false });
const LimitsSchema = new mongoose_1.Schema({
    maxCasesPerRun: { type: Number, required: true },
    maxDurationMs: { type: Number, required: true },
    maxSliceMs: { type: Number, required: true },
    maxDecisionWaitMs: { type: Number, required: true },
    maxLlmCallsPerCase: { type: Number, required: true },
    maxTokenBudgetPerCase: { type: Number, required: true },
    maxResultBytes: { type: Number, required: true },
}, { _id: false });
const EvaluationRunSchema = new mongoose_1.Schema({
    userId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    benchmarkId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Benchmark', required: true, index: true },
    rubricId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Rubric' },
    rubricVersion: { type: Number },
    name: { type: String, required: true },
    description: { type: String },
    kind: {
        type: String,
        enum: ['standard', 'baseline', 'ablation'],
        default: 'standard',
        index: true,
    },
    status: {
        type: String,
        enum: ['draft', 'queued', 'running', 'completed', 'failed', 'partial', 'cancelled'],
        default: 'draft',
        index: true,
    },
    systemUnderTest: {
        kind: { type: String, enum: ['static', 'decision-engine', 'external'], required: true },
        label: { type: String, required: true },
        description: { type: String },
        decisionSettings: { type: mongoose_1.Schema.Types.Mixed },
    },
    baseline: { type: BaselineRefSchema },
    ablation: { type: AblationSchema },
    selectedCaseIds: [{ type: String }],
    limits: { type: LimitsSchema, required: true },
    passThreshold: { type: Number },
    progress: {
        total: { type: Number, default: 0 },
        completed: { type: Number, default: 0 },
        failed: { type: Number, default: 0 },
        error: { type: Number, default: 0 },
    },
    error: {
        message: { type: String },
    },
    lockedAt: { type: Date },
    lockedBy: { type: String },
    startedAt: { type: Date },
    completedAt: { type: Date },
    cancelledAt: { type: Date },
}, { timestamps: true });
EvaluationRunSchema.index({ userId: 1, status: 1, createdAt: -1 });
exports.default = mongoose_1.default.model('EvaluationRun', EvaluationRunSchema);
