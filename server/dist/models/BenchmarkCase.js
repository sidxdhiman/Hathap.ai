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
const ExpectedStructureSchema = new mongoose_1.Schema({
    requiresRecommendation: { type: Boolean, default: false },
    requiresEvidence: { type: Boolean, default: false },
    requiresAssumptions: { type: Boolean, default: false },
    requiresConfidence: { type: Boolean, default: false },
    minAnswerLength: { type: Number, default: 0 },
    maxAnswerLength: { type: Number },
    mustMention: [{ type: String }],
}, { _id: false });
const ProvidedAnswerSchema = new mongoose_1.Schema({
    answerText: { type: String },
    recommendation: { type: String },
    rationale: { type: String },
    assumptions: [{ type: String }],
    confidence: { type: Number },
    evidenceRefs: [{ type: String }],
}, { _id: false });
const BenchmarkCaseSchema = new mongoose_1.Schema({
    userId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    benchmarkId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Benchmark', required: true, index: true },
    title: { type: String, required: true },
    prompt: { type: String, required: true },
    context: { type: String },
    category: { type: String, index: true },
    tags: [{ type: String }],
    difficulty: { type: String, enum: ['easy', 'medium', 'hard'] },
    version: { type: Number, default: 1 },
    expectedStructure: { type: ExpectedStructureSchema, default: () => ({}) },
    providedAnswer: { type: ProvidedAnswerSchema },
    status: { type: String, enum: ['active', 'archived'], default: 'active', index: true },
    metadata: { type: mongoose_1.Schema.Types.Mixed },
}, { timestamps: true });
BenchmarkCaseSchema.index({ benchmarkId: 1, status: 1, createdAt: 1 });
exports.default = mongoose_1.default.model('BenchmarkCase', BenchmarkCaseSchema);
