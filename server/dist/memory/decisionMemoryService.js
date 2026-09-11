"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.decisionMemoryService = exports.DecisionMemoryService = void 0;
const Decision_1 = __importDefault(require("../models/Decision"));
const Execution_1 = __importDefault(require("../models/Execution"));
const Task_1 = __importDefault(require("../models/Task"));
const Claim_1 = __importDefault(require("../models/Claim"));
const Evidence_1 = __importDefault(require("../models/Evidence"));
const ReconciliationResult_1 = __importDefault(require("../models/ReconciliationResult"));
const DecisionPlan_1 = __importDefault(require("../models/DecisionPlan"));
const DecisionMemory_1 = __importDefault(require("../models/DecisionMemory"));
const Outcome_1 = __importDefault(require("../models/Outcome"));
const DecisionFeedback_1 = __importDefault(require("../models/DecisionFeedback"));
const VerificationResult_1 = __importDefault(require("../models/VerificationResult"));
const eventBus_1 = require("../decision/eventBus");
const MAX_IMPORTANT_CLAIMS = 12;
const MAX_IMPORTANT_EVIDENCE = 12;
const MAX_AGENTS = 20;
const MAX_MODELS = 20;
const MAX_EXECUTIONS = 20;
/**
 * Phase 8 — DecisionMemoryService.
 *
 * Builds and maintains the structured memory index for one decision. Memory is
 * an index + historical interpretation over the existing execution graph; it
 * intentionally reuses references (claim/evidence/plan ids) instead of copying
 * large content.
 *
 * No LLM is used here. Categories, tags, domains and recommendations are either
 * copied verbatim from persisted data or explicitly marked as unknown — memory
 * never invents meaning.
 */
class DecisionMemoryService {
    async find(decisionId, userId) {
        return DecisionMemory_1.default.findOne({ decisionId, userId });
    }
    /**
     * Idempotently create or refresh memory for a decision. The lifecycle status
     * is derived from the decision's own status; a draft/in-progress decision is
     * stored as `active` and is NOT retrievable as finished history by default.
     */
    async createForDecision(decisionId, userId, opts = {}) {
        const decision = await Decision_1.default.findOne({ _id: decisionId, userId });
        if (!decision)
            return null;
        const [reconciliation, plan, executions] = await Promise.all([
            ReconciliationResult_1.default.findOne({ decisionId }).sort({ createdAt: -1 }),
            DecisionPlan_1.default.findOne({ decisionId, status: { $in: ['validated', 'compiled'] } }).sort({
                createdAt: -1,
            }),
            Execution_1.default.find({ decisionId }).sort({ createdAt: -1 }).limit(MAX_EXECUTIONS),
        ]);
        const importantClaimIds = await this.collectImportantClaims(decisionId, reconciliation);
        const importantEvidenceIds = await this.collectImportantEvidence(decisionId, importantClaimIds, reconciliation);
        const { agentsUsed, modelsUsed, executionIds } = await this.collectAgentsAndModels(executions, decision);
        const status = this.lifecycleFor(decision.status);
        const payload = {
            userId,
            decisionId,
            status,
            title: decision.title,
            objective: decision.objective,
            category: this.optionalString(decision.metadata?.category),
            domain: this.optionalString(decision.metadata?.domain),
            problemType: this.optionalString(decision.metadata?.problemType),
            tags: this.stringArray(decision.metadata?.tags),
            entities: this.stringArray(decision.metadata?.entities),
            finalRecommendation: reconciliation?.recommendation || decision.metadata?.finalRecommendation,
            recommendationSource: this.recommendationSourceFor(reconciliation?.recommendation, decision),
            selectedPlanId: plan?._id,
            importantClaimIds,
            importantEvidenceIds,
            agentsUsed,
            modelsUsed,
            executionIds,
            completedAt: decision.completedAt || decision.updatedAt,
            createdVia: opts.via || 'on-demand',
            metadata: {
                decisionStatus: decision.status,
                reconciledNeedsMoreResearch: reconciliation?.needsMoreResearch ?? undefined,
            },
        };
        const existing = await DecisionMemory_1.default.findOne({ decisionId, userId });
        let saved;
        if (existing) {
            existing.set(payload);
            saved = await existing.save();
        }
        else {
            saved = await DecisionMemory_1.default.create(payload);
            eventBus_1.executionEventBus.emit({
                type: 'memory.created',
                decisionId,
                data: {
                    memoryId: saved._id.toString(),
                    status: saved.status,
                    category: saved.category || null,
                    hasRecommendation: Boolean(saved.finalRecommendation),
                },
            });
        }
        return saved;
    }
    /**
     * On-demand memory: return existing, or build lazily for a decision that has
     * reached a terminal state. Non-terminal decisions return null — memory cannot
     * be fabricated for an in-flight decision.
     */
    async ensureMemory(decisionId, userId) {
        const existing = await this.find(decisionId, userId);
        if (existing)
            return existing;
        const decision = await Decision_1.default.findOne({ _id: decisionId, userId });
        if (!decision)
            return null;
        if (!this.isTerminal(decision.status))
            return null;
        return this.createForDecision(decisionId, userId, { via: 'on-demand' });
    }
    async lifecycleStatus(decisionId, userId) {
        const existing = await this.find(decisionId, userId);
        if (existing)
            return existing.status;
        const decision = await Decision_1.default.findOne({ _id: decisionId, userId });
        if (!decision)
            return null;
        return this.lifecycleFor(decision.status);
    }
    // ---- quality signals (data foundation for Phase 9) ----
    async getDecisionQuality(decisionId, userId) {
        const [feedback, outcomes, reconciliation, decision] = await Promise.all([
            DecisionFeedback_1.default.findOne({ decisionId, userId }),
            Outcome_1.default.find({ decisionId, userId }).sort({ createdAt: 1 }),
            ReconciliationResult_1.default.findOne({ decisionId }),
            Decision_1.default.findOne({ _id: decisionId, userId }),
        ]);
        const latestActual = outcomes.filter((o) => o.kind === 'actual').pop();
        const expected = outcomes.find((o) => o.kind === 'expected');
        const { evidenceCount, claimCount } = await this.counts(decisionId);
        return {
            recommendationAccepted: feedback
                ? feedback.recommendationStatus === 'accepted' || feedback.recommendationStatus === 'modified'
                : undefined,
            outcomeAchieved: latestActual
                ? this.outcomeAchieved(latestActual)
                : undefined,
            expectedVsActualComputed: Boolean(expected && latestActual),
            outcomeConfirmed: Boolean(latestActual && latestActual.source === 'human'),
            hasHumanFeedback: Boolean(feedback),
            evidenceCompleteness: {
                hasEvidence: evidenceCount > 0,
                hasClaims: claimCount > 0,
                hasVerifications: (await VerificationResult_1.default.countDocuments({ decisionId })) > 0,
                hasReconciliation: Boolean(reconciliation),
                verificationStatusPresent: Boolean(await VerificationResult_1.default.countDocuments({ decisionId })),
            },
            recommendationKnown: Boolean(reconciliation?.recommendation || decision?.metadata?.finalRecommendation),
        };
    }
    outcomeAchieved(outcome) {
        // Only explicit success/failure read as achieved/not — partial, unknown,
        // pending and cancelled remain undefined (honest uncertainty).
        if (outcome.status === 'success')
            return true;
        if (outcome.status === 'failure')
            return false;
        return undefined;
    }
    // ---- internals ----
    isTerminal(status) {
        return status === 'completed' || status === 'cancelled' || status === 'failed';
    }
    lifecycleFor(decisionStatus) {
        switch (decisionStatus) {
            case 'completed':
                return 'completed';
            case 'cancelled':
                return 'cancelled';
            case 'failed':
                return 'failed';
            default:
                return 'active';
        }
    }
    optionalString(value) {
        return typeof value === 'string' && value.trim() ? value.trim() : undefined;
    }
    stringArray(value) {
        if (!Array.isArray(value))
            return [];
        return value.filter((v) => typeof v === 'string').slice(0, 30);
    }
    recommendationSourceFor(reconciliationRecommendation, decision) {
        if (reconciliationRecommendation)
            return 'reconciliation';
        if (decision.metadata?.linkedFromCourtroom)
            return 'courtroom';
        return 'none';
    }
    async collectImportantClaims(decisionId, reconciliation) {
        const preferred = [];
        if (reconciliation?.survivingClaimIds?.length)
            preferred.push(...reconciliation.survivingClaimIds);
        if (reconciliation?.uncertainClaimIds?.length)
            preferred.push(...reconciliation.uncertainClaimIds);
        if (preferred.length)
            return preferred.slice(0, MAX_IMPORTANT_CLAIMS);
        const claims = await Claim_1.default.find({ decisionId, status: { $in: ['accepted', 'verified'] } })
            .sort({ createdAt: 1 })
            .limit(MAX_IMPORTANT_CLAIMS);
        return claims.map((c) => String(c._id));
    }
    async collectImportantEvidence(decisionId, claimIds, reconciliation) {
        const ids = new Set();
        if (claimIds.length) {
            const claims = await Claim_1.default.find({ _id: { $in: claimIds } }).select('evidenceIds supportingEvidenceIds');
            for (const c of claims) {
                for (const eid of [...(c.evidenceIds || []), ...(c.supportingEvidenceIds || [])]) {
                    if (ids.size < MAX_IMPORTANT_EVIDENCE)
                        ids.add(String(eid));
                }
            }
        }
        if (ids.size < MAX_IMPORTANT_EVIDENCE) {
            const related = await Evidence_1.default.find({ decisionId })
                .sort({ relevanceScore: -1, createdAt: 1 })
                .limit(MAX_IMPORTANT_EVIDENCE - ids.size);
            for (const e of related)
                ids.add(String(e._id));
        }
        return [...ids];
    }
    async collectAgentsAndModels(executions, decision) {
        const agents = new Set();
        const models = new Set();
        const executionIds = [];
        for (const p of decision.participants || []) {
            const name = p?.name || p?.agentName || p?.role;
            if (typeof name === 'string' && name)
                agents.add(name);
        }
        const plannerModel = this.optionalString(decision.metadata?.plannerModel);
        if (plannerModel)
            models.add(plannerModel);
        for (const e of executions) {
            if (executionIds.length < MAX_EXECUTIONS)
                executionIds.push(String(e._id));
            if (e.tokenUsage?.model)
                models.add(String(e.tokenUsage.model));
            if (e.metadata?.plannerModel)
                models.add(String(e.metadata.plannerModel));
            if (e.metadata?.courtroomId && !agents.size)
                agents.add('courtroom');
        }
        const taskIdsByExec = await Task_1.default.find({
            executionId: { $in: executions.map((e) => e._id) },
        })
            .select('assignedAgent assignedModel metadata')
            .limit(200);
        for (const t of taskIdsByExec) {
            if (t.assignedAgent)
                agents.add(String(t.assignedAgent));
            if (t.assignedModel)
                models.add(String(t.assignedModel));
            const routingModel = t.metadata?.routing?.selection?.model?.modelName;
            if (routingModel)
                models.add(String(routingModel));
        }
        return {
            agentsUsed: [...agents].slice(0, MAX_AGENTS),
            modelsUsed: [...models].slice(0, MAX_MODELS),
            executionIds,
        };
    }
    async counts(decisionId) {
        const [evidenceCount, claimCount] = await Promise.all([
            Evidence_1.default.countDocuments({ decisionId }),
            Claim_1.default.countDocuments({ decisionId }),
        ]);
        return { evidenceCount, claimCount };
    }
}
exports.DecisionMemoryService = DecisionMemoryService;
exports.decisionMemoryService = new DecisionMemoryService();
