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
const ComparisonCaseRowSchema = new mongoose_1.Schema({
    caseId: { type: String, required: true },
    caseTitle: { type: String },
    scoreA: { type: Number },
    scoreB: { type: Number },
    delta: { type: Number },
    direction: { type: String, enum: ['improvement', 'regression', 'unchanged', 'missing'] },
}, { _id: false });
const SummarySchema = new mongoose_1.Schema({
    compared: { type: Number, default: 0 },
    missingA: { type: Number, default: 0 },
    missingB: { type: Number, default: 0 },
    regressions: { type: Number, default: 0 },
    improvements: { type: Number, default: 0 },
    unchanged: { type: Number, default: 0 },
    aggregateA: { type: Number },
    aggregateB: { type: Number },
    aggregateDelta: { type: Number },
    regressionDetected: { type: Boolean, default: false },
    note: { type: String },
}, { _id: false });
const EvaluationComparisonSchema = new mongoose_1.Schema({
    userId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String },
    runAId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'EvaluationRun', required: true },
    runBId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'EvaluationRun' },
    baselineId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Baseline' },
    type: { type: String, enum: ['run_vs_run', 'run_vs_baseline'], required: true },
    summary: { type: SummarySchema, default: () => ({}) },
    perCase: { type: [ComparisonCaseRowSchema], default: [] },
}, { timestamps: true });
EvaluationComparisonSchema.index({ userId: 1, createdAt: -1 });
exports.default = mongoose_1.default.model('EvaluationComparison', EvaluationComparisonSchema);
