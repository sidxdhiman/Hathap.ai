"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.persistClaimsFromMessages = persistClaimsFromMessages;
const Claim_1 = __importDefault(require("../models/Claim"));
/**
 * Persists agent-sourced claims from debate messages into the Claim collection.
 *
 * Phase 3 improvement: claims written from a debate that consumed research
 * evidence carry `evidenceIds` (the bounded evidence bundle passed to agents)
 * and `executionId`/`taskId` provenance. Attribution is coarse and documented:
 * we cannot know exactly which evidence a model used, so we link the bundle and
 * mark every claim `proposed`.
 */
async function persistClaimsFromMessages(params) {
    const created = [];
    for (const msg of params.messages) {
        const parsed = msg.parsedResponse;
        if (!parsed)
            continue;
        const entries = [];
        if (parsed.position && typeof parsed.position === 'string') {
            entries.push({ text: parsed.position, type: 'opinion' });
        }
        if (Array.isArray(parsed.arguments)) {
            for (const arg of parsed.arguments)
                entries.push({ text: String(arg), type: 'inference' });
        }
        if (Array.isArray(parsed.risks)) {
            for (const risk of parsed.risks)
                entries.push({ text: String(risk), type: 'risk' });
        }
        if (parsed.recommendation && typeof parsed.recommendation === 'string') {
            entries.push({ text: parsed.recommendation, type: 'recommendation' });
        }
        for (const c of entries) {
            const claim = new Claim_1.default({
                decisionId: params.decisionId,
                agentId: msg.agentId || msg.agentName,
                text: c.text,
                type: c.type,
                confidence: c.confidence,
                status: 'proposed',
                evidenceIds: params.evidenceIds || [],
                supportingEvidenceIds: params.evidenceIds || [],
                contradictingEvidenceIds: [],
                provenanceKind: 'inferred',
                sourceAgentId: msg.agentId,
                executionId: params.executionId,
                taskId: params.taskId,
                metadata: {
                    source: 'debate',
                    note: 'Agent-generated; evidence attribution is coarse (bundle-level) and unverified.',
                },
            });
            const saved = await claim.save();
            created.push({ _id: saved._id });
            params.onClaim?.({ _id: saved._id });
        }
    }
    return created;
}
