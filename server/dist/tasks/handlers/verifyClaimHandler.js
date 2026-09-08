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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyClaimHandler = void 0;
const verificationService_1 = require("../../decision/verificationService");
const Claim_1 = __importDefault(require("../../models/Claim"));
const evidenceGraphService_1 = require("../../decision/evidenceGraphService");
/**
 * Verify claim handler — the task boundary for evidence-based claim verification.
 *
 * This handler receives a structured claim + evidence and runs the
 * deterministic verification pipeline. It does NOT ask an LLM "is this true?"
 * — it evaluates the existing evidence relationships and produces an auditable
 * verification result.
 *
 * Lifecycle: pending → ready → running → completed (or failed)
 * Retryable: provider outages, network failures (via error classifier)
 * Non-retryable: missing claim, invalid input
 *
 * Idempotency: retrying a verify_claim task updates the existing
 * VerificationResult record (findOneAndUpdate with upsert on claimId+taskId).
 */
exports.verifyClaimHandler = {
    type: 'verify_claim',
    canHandle(type) {
        return type === 'verify_claim';
    },
    async execute(task, context) {
        // Validate input
        const claimId = task.input?.claimId;
        const claimStatement = task.input?.claimStatement;
        const evidenceIds = Array.isArray(task.input?.evidenceIds)
            ? task.input.evidenceIds
            : [];
        if (!claimId || typeof claimId !== 'string') {
            throw new Error('verify_claim task input requires a valid claimId.');
        }
        if (!claimStatement || typeof claimStatement !== 'string') {
            throw new Error('verify_claim task input requires a claimStatement.');
        }
        // Load the claim to verify it exists and belongs to this decision
        const claim = await Claim_1.default.findOne({ _id: claimId, decisionId: context.decisionId });
        if (!claim) {
            throw new Error(`Claim ${claimId} not found for decision ${context.decisionId}.`);
        }
        // Validate that all provided evidenceIds actually exist in this decision
        if (evidenceIds.length > 0) {
            const Evidence = (await Promise.resolve().then(() => __importStar(require('../../models/Evidence')))).default;
            const validDocs = await Evidence.find({
                _id: { $in: evidenceIds },
                decisionId: context.decisionId,
            }).select('_id');
            const validIds = new Set(validDocs.map((d) => d._id.toString()));
            if (validIds.size === 0) {
                throw new Error(`No valid evidence found for verification of claim ${claimId}.`);
            }
        }
        // Seed the evidence graph from existing coarse attribution if needed
        const existingRels = await evidenceGraphService_1.evidenceGraphService.getRelationshipsForClaim(claimId);
        const hasExplicitRels = existingRels.supports.length > 0 ||
            existingRels.contradicts.length > 0 ||
            existingRels.related.length > 0;
        if (!hasExplicitRels && claim.evidenceIds && claim.evidenceIds.length > 0) {
            await evidenceGraphService_1.evidenceGraphService.seedFromExistingClaims(context.decisionId, context.executionId);
        }
        // Run the deterministic verification
        const result = await verificationService_1.verificationService.verifyClaim({
            claimId,
            claimStatement: claimStatement || claim.text,
            evidenceIds: evidenceIds.length > 0 ? evidenceIds : (claim.evidenceIds || []),
            decisionId: context.decisionId,
            executionId: context.executionId,
            taskId: context.taskId,
            verificationMode: task.input?.verificationMode || 'evidence',
        });
        return {
            output: {
                claimId,
                status: result.status,
                supportingEvidenceIds: result.supportingEvidenceIds,
                contradictingEvidenceIds: result.contradictingEvidenceIds,
                relatedEvidenceIds: result.relatedEvidenceIds,
                rationale: result.rationale,
                confidence: result.confidence,
                mode: result.mode,
                verificationResultId: result._id.toString(),
            },
        };
    },
};
