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
exports.debateHandler = void 0;
exports.selectClaimsForVerification = selectClaimsForVerification;
exports.schedulePhase4DownstreamTasks = schedulePhase4DownstreamTasks;
const researchService_1 = require("../../research/researchService");
const claimPersistence_1 = require("../../decision/claimPersistence");
const evidenceGraphService_1 = require("../../decision/evidenceGraphService");
const Task_1 = __importDefault(require("../../models/Task"));
const Claim_1 = __importDefault(require("../../models/Claim"));
const Evidence_1 = __importDefault(require("../../models/Evidence"));
/**
 * Phase 4 — deterministic claim selection for verification.
 *
 * We do NOT verify every string in the system. We prioritize:
 *   1. factual claims
 *   2. high-impact claims
 *   3. claims directly supporting the recommendation
 *   4. claims with evidence
 *   5. assumptions
 *
 * This simple deterministic selection avoids wasting compute on trivial prose.
 * Returns at most `maxClaims` claim documents.
 */
async function selectClaimsForVerification(decisionId, maxClaims = 8) {
    const claims = await Claim_1.default.find({ decisionId }).sort({ createdAt: 1 });
    const scored = claims
        .map((c) => {
        let score = 0;
        if (c.type === 'fact')
            score += 5;
        if (c.type === 'assumption')
            score += 4;
        if (c.type === 'recommendation')
            score += 3;
        if (c.type === 'inference')
            score += 2;
        if ((c.evidenceIds || []).length > 0)
            score += 2;
        return { claim: c, score };
    })
        .sort((a, b) => b.score - a.score);
    return scored.slice(0, maxClaims).map((s) => ({
        id: s.claim._id.toString(),
        text: s.claim.text,
        type: s.claim.type,
        evidenceIds: s.claim.evidenceIds || [],
    }));
}
/**
 * Schedule the Phase 4 downstream task graph after the debate produces a
 * candidate verdict:
 *
 *   Candidate Verdict
 *        │
 *   ┌────┴────┐
 *   ▼         ▼
 *   Verify   Red Team
 *   │         │
 *   └────┬────┘
 *        ▼
 *   Reconciliation
 *
 * All tasks are real persisted Task documents with real dependency IDs
 * controlled by the Phase 2 scheduler. Verification and Red Team run in
 * parallel; Reconciliation depends on all of them.
 *
 * Phase 5: when called from the intelligent planner path, the plan's
 * termination flags decide which stages actually run. A simple decision may
 * skip verification/red team and go straight to reconciliation, or stop at the
 * debate entirely.
 */
async function schedulePhase4DownstreamTasks(context, result, decision, options) {
    const verify = options?.verify ?? true;
    const redTeam = options?.redTeam ?? true;
    const reconciliation = options?.reconciliation ?? true;
    const debateTaskId = context.taskId;
    const claims = await Claim_1.default.find({ decisionId: context.decisionId });
    const evidence = await Evidence_1.default.find({ decisionId: context.decisionId });
    const claimIdStrs = claims.map((c) => c._id.toString());
    const allEvidenceIds = evidence.map((e) => e._id.toString());
    const selectedClaims = await selectClaimsForVerification(context.decisionId, 8);
    const candidateRecommendation = result?.verdict?.recommendation || 'Further analysis needed.';
    const selectedClaimIds = selectedClaims.map((c) => c.id);
    const verifyClaimTaskIds = [];
    // 1. Verification tasks (one per selected claim, parallel). Skipped when the
    //    plan does not require verification.
    if (verify) {
        for (const claim of selectedClaims) {
            const vcTask = await Task_1.default.create({
                executionId: context.executionId,
                type: 'verify_claim',
                status: 'pending',
                priority: 5,
                input: {
                    claimId: claim.id,
                    claimStatement: claim.text,
                    evidenceIds: (claim.evidenceIds || []).length > 0
                        ? claim.evidenceIds
                        : allEvidenceIds.slice(0, 3),
                    decisionId: context.decisionId,
                    executionId: context.executionId,
                    verificationMode: 'evidence',
                },
                dependencies: [debateTaskId],
                metadata: {
                    description: `Verify claim: ${claim.text.slice(0, 80)}`,
                    phase: 'verification',
                    claimId: claim.id,
                },
            });
            verifyClaimTaskIds.push(vcTask._id.toString());
        }
    }
    // 2. Red-team task (parallel with verification). Only when the plan requires it.
    let redTeamTaskId;
    if (redTeam) {
        const redTeamTask = await Task_1.default.create({
            executionId: context.executionId,
            type: 'red_team',
            status: 'pending',
            priority: 5,
            input: {
                decisionId: context.decisionId,
                candidateRecommendation,
                claimIds: selectedClaimIds,
                evidenceIds: allEvidenceIds,
                assumptions: decision?.assumptions || [],
            },
            dependencies: [debateTaskId],
            metadata: {
                description: 'Adversarially analyze the candidate decision.',
                phase: 'red_team',
                candidateRecommendation,
            },
        });
        redTeamTaskId = redTeamTask._id.toString();
    }
    const downstreamDeps = [...verifyClaimTaskIds, ...(redTeamTaskId ? [redTeamTaskId] : [])];
    // 3. Reconciliation depends on the debate plus any downstream tasks that ran.
    let reconciliationTaskId;
    if (reconciliation) {
        const reconciliationTask = await Task_1.default.create({
            executionId: context.executionId,
            type: 'reconciliation',
            status: 'pending',
            priority: 1,
            input: {
                decisionId: context.decisionId,
                candidateRecommendation,
                claimIds: claimIdStrs,
                verifyClaimTaskIds,
                redTeamTaskId,
            },
            dependencies: downstreamDeps.length > 0 ? downstreamDeps : [debateTaskId],
            metadata: {
                description: 'Merge verification and red-team results into a final decision.',
                phase: 'reconciliation',
            },
        });
        reconciliationTaskId = reconciliationTask._id.toString();
    }
    return {
        verificationTaskIds: verifyClaimTaskIds,
        redTeamTaskId,
        reconciliationTaskId,
        selectedClaimCount: verify ? selectedClaims.length : 0,
    };
}
/**
 * Debate handler — executes a debate through the existing (proven) DebateEngine
 * and the configured strategy (Consensus / Majority Vote / Devil's Advocate /
 * Judge / Open Debate). It does NOT rewrite the debate logic.
 *
 * Phase 3: when the decision has research evidence, a bounded, provenance-tagged
 * evidence bundle is passed to the engine (injected as untrusted data in agent
 * prompts) and claims produced by the debate are persisted with that bundle's
 * evidence IDs (coarse attribution, always `proposed`).
 *
 * Phase 4: after the debate produces a candidate verdict and persists claims,
 * it seeds the explicit evidence graph (supports/contradicts/related) and
 * schedules the downstream verification, red-team, and reconciliation stages.
 */
exports.debateHandler = {
    type: 'debate',
    canHandle(type) {
        return type === 'debate';
    },
    async execute(task, context) {
        const { debateEngine } = await Promise.resolve().then(() => __importStar(require('../../engine/debateEngine')));
        const Decision = (await Promise.resolve().then(() => __importStar(require('../../models/Decision')))).default;
        const Execution = (await Promise.resolve().then(() => __importStar(require('../../models/Execution')))).default;
        const DecisionPlan = (await Promise.resolve().then(() => __importStar(require('../../models/DecisionPlan')))).default;
        const decision = await Decision.findById(context.decisionId);
        if (!decision) {
            throw new Error('Decision not found for debate task.');
        }
        const strategy = task.input?.strategy || decision.configuration?.strategy || 'consensus';
        const evidence = await researchService_1.researchService.getEvidenceViews(context.decisionId);
        const result = await debateEngine.executeForDecision({
            decisionId: context.decisionId,
            userId: context.userId,
            strategy,
            participants: decision.participants,
            objective: decision.objective,
            onUsage: context.onUsage,
            evidence,
            routing: context.routing
                ? {
                    agentId: context.routing.agentId,
                    modelId: context.routing.modelId,
                }
                : undefined,
        });
        const claimIds = await (0, claimPersistence_1.persistClaimsFromMessages)({
            decisionId: context.decisionId,
            messages: result.messages,
            executionId: context.executionId,
            taskId: context.taskId,
            evidenceIds: evidence.map((e) => e.id),
        });
        // ---- Phase 4: Seed the explicit evidence graph from coarse attribution ----
        await evidenceGraphService_1.evidenceGraphService.seedFromExistingClaims(context.decisionId, context.executionId);
        // ---- Phase 4/5: Schedule downstream verification / red team / reconciliation ----
        // Phase 5 intelligent plans gate these stages via the plan's termination
        // flags. Legacy (fixed-mode) executions without a plan get the full Phase 4
        // graph, exactly as before.
        const termination = await resolvePlanTermination(context.executionId);
        const phase4TaskIds = await schedulePhase4DownstreamTasks(context, result, decision, termination);
        return {
            output: {
                strategy,
                messages: result.messages,
                verdict: result.verdict,
                evidenceCount: evidence.length,
                claimIds: claimIds.map((c) => c._id.toString()),
                candidateVerdict: result.verdict,
                phase4: phase4TaskIds,
            },
        };
    },
};
/**
 * Resolve the termination flags that control the Phase 4 downstream graph.
 * Fixed-mode executions (no plan) keep the legacy behavior (all stages on).
 * Intelligent-mode executions honor the plan's termination flags.
 */
async function resolvePlanTermination(executionId) {
    try {
        const Execution = (await Promise.resolve().then(() => __importStar(require('../../models/Execution')))).default;
        const DecisionPlan = (await Promise.resolve().then(() => __importStar(require('../../models/DecisionPlan')))).default;
        const execution = await Execution.findById(executionId);
        const planId = execution?.planId;
        if (!planId)
            return { verify: true, redTeam: true, reconciliation: true };
        const plan = await DecisionPlan.findById(planId);
        if (!plan?.termination)
            return { verify: true, redTeam: true, reconciliation: true };
        return {
            verify: plan.termination.requiresVerification !== false,
            redTeam: plan.termination.requiresRedTeam !== false,
            reconciliation: plan.termination.requiresReconciliation !== false,
        };
    }
    catch {
        return { verify: true, redTeam: true, reconciliation: true };
    }
}
