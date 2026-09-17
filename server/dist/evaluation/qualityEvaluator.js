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
exports.pairMetrics = exports.qualityEvaluator = exports.QualityEvaluator = void 0;
const Evidence_1 = __importDefault(require("../models/Evidence"));
const Execution_1 = __importDefault(require("../models/Execution"));
const Task_1 = __importDefault(require("../models/Task"));
const VerificationResult_1 = __importDefault(require("../models/VerificationResult"));
const RedTeamFinding_1 = __importDefault(require("../models/RedTeamFinding"));
const ReconciliationResult_1 = __importDefault(require("../models/ReconciliationResult"));
const DecisionPlan_1 = __importDefault(require("../models/DecisionPlan"));
const Outcome_1 = __importDefault(require("../models/Outcome"));
const outcomeService_1 = require("../memory/outcomeService");
const structuralEvaluator_1 = require("./structuralEvaluator");
const metrics_1 = require("./metrics");
class QualityEvaluator {
    /**
     * Answer quality from the artifact itself (plus, when a real decision is
     * referenced, Phase 8 decision-quality signals reported separately).
     */
    async evaluateArtifactQuality(userId, artifact, opts = {}) {
        const text = [artifact.answerText, artifact.recommendation, artifact.rationale].filter(Boolean).join(' ');
        const signals = {
            recommendationPresent: (0, structuralEvaluator_1.nonEmpty)(artifact.recommendation),
            rationalePresent: (0, structuralEvaluator_1.nonEmpty)(artifact.rationale),
            rationaleLength: artifact.rationale ? artifact.rationale.trim().length : undefined,
            confidencePresent: typeof artifact.confidence === 'number' &&
                Number.isFinite(artifact.confidence) &&
                artifact.confidence >= 0 &&
                artifact.confidence <= 100,
            grounded: artifact.evidenceRefs.length > 0 || artifact.evidenceIds.length > 0,
        };
        const relevance = opts.prompt ? (0, structuralEvaluator_1.promptRelevance)(opts.prompt, artifact) : undefined;
        signals.objectiveRelevance = relevance;
        const minLen = opts.expectedMinAnswerLength ?? 60;
        const maxLen = opts.expectedMaxAnswerLength;
        const len = text.trim().length;
        signals.verbosityInRange = len >= Math.max(1, minLen) && (maxLen ? len <= maxLen : true);
        if (artifact.decisionId) {
            try {
                const { decisionMemoryService } = await Promise.resolve().then(() => __importStar(require('../memory/decisionMemoryService')));
                const dq = await decisionMemoryService.getDecisionQuality(artifact.decisionId, userId);
                signals.decisionQuality = {
                    outcomeAchieved: dq.outcomeAchieved,
                    recommendationAccepted: dq.recommendationAccepted,
                    outcomeConfirmed: dq.outcomeConfirmed,
                    expectedVsActualComputed: dq.expectedVsActualComputed,
                };
            }
            catch {
                /* best-effort: quality signals are a bonus, never a blocker */
            }
        }
        const weighted = [
            { w: 0.25, pass: signals.recommendationPresent, label: 'recommendation' },
            { w: 0.2, pass: signals.rationalePresent, label: 'rationale' },
            { w: 0.15, pass: signals.confidencePresent, label: 'confidence' },
            { w: 0.15, pass: signals.grounded, label: 'grounded' },
            {
                w: 0.15,
                pass: typeof relevance === 'number' && relevance >= 0.15,
                label: 'relevance',
            },
            { w: 0.1, pass: !!signals.verbosityInRange, label: 'verbosity' },
        ];
        const applicable = weighted.some((s) => s.pass);
        const score = applicable
            ? weighted.filter((s) => s.pass).reduce((sum, s) => sum + s.w, 0) /
                weighted.reduce((sum, s) => sum + s.w, 0)
            : undefined;
        return { enabled: true, applicable, score, signals };
    }
    /** Evidence quality from the evidence documents backing the artifact. The
     *  artifact's decisionId (or evidenceIds) already points at an ownership-
     *  scoped decision — evidence has no userId of its own. */
    async evaluateEvidence(artifact) {
        const stats = { count: 0, withReliability: 0, categories: {} };
        let docs = [];
        if (artifact.evidenceIds.length > 0) {
            docs = await Evidence_1.default.find({ _id: { $in: artifact.evidenceIds } }).limit(50);
        }
        else if (artifact.decisionId) {
            docs = await Evidence_1.default.find({ decisionId: artifact.decisionId }).limit(50);
        }
        stats.count = docs.length;
        stats.withReliability = docs.filter((d) => typeof d.sourceReliability === 'string').length;
        const reliables = docs.filter((d) => d.sourceReliability === 'high').length;
        stats.highReliabilityRatio = stats.count > 0 ? reliables / stats.count : undefined;
        const relevant = docs
            .map((d) => d.relevanceScore)
            .filter((r) => typeof r === 'number' && Number.isFinite(r));
        stats.avgRelevance = relevant.length > 0 ? (0, metrics_1.mean)(relevant) : undefined;
        for (const d of docs) {
            const key = d.sourceType || 'unknown';
            stats.categories[key] = (stats.categories[key] || 0) + 1;
        }
        const applicable = stats.count > 0;
        let score;
        if (applicable) {
            const parts = [];
            parts.push(stats.count >= 1 ? 1 : 0);
            if (stats.highReliabilityRatio !== undefined)
                parts.push(stats.highReliabilityRatio);
            if (stats.avgRelevance !== undefined)
                parts.push(stats.avgRelevance);
            score = (0, metrics_1.mean)(parts);
        }
        return { enabled: true, applicable, score, stats };
    }
    /** Reasoning / process quality from the execution graph of a real decision. */
    async evaluateReasoningDecision(decisionId) {
        if (!decisionId || !decisionId.trim()) {
            return {
                enabled: true,
                applicable: false,
                stats: {
                    executions: 0,
                    totalTasks: 0,
                    completedTasks: 0,
                    failedTasks: 0,
                    cancelledTasks: 0,
                    retriedTasks: 0,
                    hasPlan: false,
                    planValidated: false,
                    hasVerification: false,
                    hasRedTeam: false,
                    hasReconciliation: false,
                },
                comments: ['No decision execution to measure.'],
            };
        }
        const executions = await Execution_1.default.find({ decisionId }).sort({ createdAt: 1 });
        const comments = [];
        if (executions.length === 0) {
            return {
                enabled: true,
                applicable: false,
                stats: {
                    executions: 0,
                    totalTasks: 0,
                    completedTasks: 0,
                    failedTasks: 0,
                    cancelledTasks: 0,
                    retriedTasks: 0,
                    hasPlan: false,
                    planValidated: false,
                    hasVerification: false,
                    hasRedTeam: false,
                    hasReconciliation: false,
                },
                comments,
            };
        }
        const execIds = executions.map((e) => e._id);
        const tasks = await Task_1.default.find({ executionId: { $in: execIds } });
        const completed = tasks.filter((t) => t.status === 'completed').length;
        const failed = tasks.filter((t) => t.status === 'failed').length;
        const cancelled = tasks.filter((t) => t.status === 'cancelled' || t.status === 'skipped').length;
        const retried = tasks.filter((t) => (t.retryCount || 0) > 0).length;
        const total = tasks.length || 1;
        const [plan, verification, redTeam, reconciliation] = await Promise.all([
            DecisionPlan_1.default.findOne({ decisionId, status: { $in: ['validated', 'compiled'] } }),
            VerificationResult_1.default.countDocuments({ decisionId }),
            RedTeamFinding_1.default.countDocuments({ decisionId }),
            ReconciliationResult_1.default.findOne({ decisionId }),
        ]);
        const stats = {
            executions: executions.length,
            totalTasks: tasks.length,
            completedTasks: completed,
            failedTasks: failed,
            cancelledTasks: cancelled,
            retriedTasks: retried,
            hasPlan: Boolean(plan),
            planValidated: Boolean(plan && plan.status === 'validated'),
            hasVerification: verification > 0,
            hasRedTeam: redTeam > 0,
            hasReconciliation: Boolean(reconciliation),
            needsMoreResearch: reconciliation?.needsMoreResearch,
        };
        if (failed === 0 && tasks.length === 0)
            comments.push('No tasks recorded for the decision.');
        const parts = [];
        parts.push(completed / total);
        if (stats.hasPlan)
            parts.push(1);
        if (stats.planValidated)
            parts.push(1);
        if (stats.hasVerification)
            parts.push(1);
        if (stats.hasRedTeam)
            parts.push(1);
        if (stats.hasReconciliation)
            parts.push(1);
        const base = parts.length > 0 ? (0, metrics_1.mean)(parts) : 0;
        const penalty = 0.1 * failed + 0.05 * retried;
        const score = Math.max(0, Math.min(1, base - penalty));
        if (failed > 0)
            comments.push(`${failed} task(s) failed.`);
        if (retried > 0)
            comments.push(`${retried} task(s) required retries.`);
        return { enabled: true, applicable: true, score, stats, comments };
    }
    /**
     * Real-world outcome evaluation built on the Phase 8 outcome layer. Only an
     * explicit actual outcome makes this applicable; missing outcomes are never
     * penalized.
     */
    async evaluateOutcome(userId, decisionId) {
        const signal = {
            hasExpected: false,
            hasActual: false,
            meaningfulComparisons: 0,
            achievedComparisons: 0,
            metricComparisons: [],
            outcomeConfirmed: false,
        };
        if (!decisionId || !decisionId.trim()) {
            return {
                enabled: true,
                applicable: false,
                signals: signal,
                notes: ['No decision referenced — outcome evaluation not applicable.'],
            };
        }
        const outcomes = await Outcome_1.default.find({ decisionId, userId }).sort({ createdAt: 1 });
        const notes = [];
        signal.hasExpected = outcomes.some((o) => o.kind === 'expected');
        signal.hasActual = outcomes.some((o) => o.kind === 'actual');
        if (!signal.hasActual) {
            return {
                enabled: true,
                applicable: false,
                signals: signal,
                notes: ['No actual outcome recorded — outcome evaluation not applicable.'],
            };
        }
        const { expectedVsActual } = outcomeService_1.outcomeService;
        const summary = await expectedVsActual(userId, decisionId);
        signal.expectedStatus = summary.expected?.status || signal.expectedStatus;
        signal.actualStatus = summary.actual?.status || signal.actualStatus;
        const latestActual = outcomes.filter((o) => o.kind === 'actual').pop();
        if (latestActual) {
            signal.outcomeConfirmed = latestActual.source === 'human';
            if (latestActual.status === 'success')
                signal.outcomeAchieved = true;
            else if (latestActual.status === 'failure')
                signal.outcomeAchieved = false;
        }
        signal.metricComparisons = summary.metricComparisons
            .filter((m) => m.meaningful)
            .map((m) => ({ metricName: m.metricName, achieved: m.achieved, meaningful: true }));
        signal.meaningfulComparisons = signal.metricComparisons.length;
        signal.achievedComparisons = signal.metricComparisons.filter((m) => m.achieved === true).length;
        const parts = [];
        if (summary.qualityComputed && signal.meaningfulComparisons > 0) {
            parts.push(signal.achievedComparisons / signal.meaningfulComparisons);
        }
        if (signal.outcomeAchieved !== undefined) {
            parts.push(signal.outcomeAchieved ? 1 : 0);
        }
        const applicable = signal.hasActual && parts.length > 0;
        const score = applicable ? (0, metrics_1.mean)(parts) : undefined;
        if (signal.outcomeAchieved === undefined && signal.meaningfulComparisons === 0) {
            notes.push('Actual outcome recorded without a success/failure status or metrics.');
        }
        else if (signal.outcomeAchieved === true) {
            notes.push('Actual outcome reached success.');
        }
        else if (signal.outcomeAchieved === false) {
            notes.push('Actual outcome was a failure.');
        }
        return { enabled: true, applicable, score, signals: signal, notes };
    }
}
exports.QualityEvaluator = QualityEvaluator;
exports.qualityEvaluator = new QualityEvaluator();
/** Re-export the deterministic metric pairing so consumers keep one import path. */
var outcomeService_2 = require("../memory/outcomeService");
Object.defineProperty(exports, "pairMetrics", { enumerable: true, get: function () { return outcomeService_2.pairMetrics; } });
