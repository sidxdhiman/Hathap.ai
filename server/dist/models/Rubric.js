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
const types_1 = require("../evaluation/types");
const CriterionSchema = new mongoose_1.Schema({
    key: { type: String, enum: types_1.CRITERION_KEYS, required: true },
    label: { type: String, required: true },
    description: { type: String },
    weight: { type: Number, default: 0.1 },
    enabled: { type: Boolean, default: true },
}, { _id: false });
const RubricVersionSchema = new mongoose_1.Schema({
    version: { type: Number, required: true },
    criteria: { type: [CriterionSchema], required: true },
    notes: { type: String },
    createdAt: { type: Date, default: Date.now },
}, { _id: false });
const RubricSchema = new mongoose_1.Schema({
    userId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true },
    description: { type: String },
    version: { type: Number, default: 1 },
    status: { type: String, enum: ['draft', 'active', 'archived'], default: 'draft' },
    criteria: { type: [CriterionSchema], default: [] },
    versions: { type: [RubricVersionSchema], default: [] },
}, { timestamps: true });
RubricSchema.index({ userId: 1, status: 1, updatedAt: -1 });
exports.default = mongoose_1.default.model('Rubric', RubricSchema);
