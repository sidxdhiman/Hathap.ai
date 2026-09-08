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
const TerminationSchema = new mongoose_1.Schema({
    requiresVerification: { type: Boolean, default: false },
    requiresRedTeam: { type: Boolean, default: false },
    requiresReconciliation: { type: Boolean, default: true },
}, { _id: false });
const PlanValidationSchema = new mongoose_1.Schema({
    valid: { type: Boolean, default: false },
    errors: [{ type: String }],
}, { _id: false });
const PlanFailureSchema = new mongoose_1.Schema({
    code: String,
    message: String,
    reason: String,
    createdAt: { type: Date, default: Date.now },
}, { _id: false });
const DecisionPlanSchema = new mongoose_1.Schema({
    decisionId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Decision', required: true, index: true },
    executionId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Execution', required: true, unique: true, index: true },
    version: { type: String, default: '1.0' },
    source: { type: String, enum: ['intelligent', 'fallback', 'baseline'], required: true },
    planningMode: { type: String, enum: ['fixed', 'intelligent'], required: true },
    plannerModel: { type: String },
    plannerVersion: { type: String, default: 'planner-v1' },
    planVersion: { type: Number, default: 1 },
    status: {
        type: String,
        enum: ['proposed', 'validated', 'rejected', 'compiled', 'failed'],
        default: 'proposed',
        index: true,
    },
    tasks: { type: [mongoose_1.Schema.Types.Mixed], default: [] },
    termination: { type: TerminationSchema, default: () => ({ requiresReconciliation: true }) },
    rationale: { type: mongoose_1.Schema.Types.Mixed },
    estimates: { type: mongoose_1.Schema.Types.Mixed, default: () => ({}) },
    validation: { type: PlanValidationSchema, default: () => ({ valid: false, errors: [] }) },
    failure: { type: PlanFailureSchema },
    compiledAt: { type: Date },
}, { timestamps: true });
exports.default = mongoose_1.default.model('DecisionPlan', DecisionPlanSchema);
