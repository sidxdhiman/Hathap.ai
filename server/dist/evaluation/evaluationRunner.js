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
exports.evaluationRunner = exports.EvaluationRunner = exports.STALE_LOCK_MS = void 0;
const EvaluationRun_1 = __importDefault(require("../models/EvaluationRun"));
const EvaluationCaseResult_1 = __importDefault(require("../models/EvaluationCaseResult"));
const Execution_1 = __importDefault(require("../models/Execution"));
const evaluationService_1 = require("./evaluationService");
const benchmarkService_1 = require("./benchmarkService");
const rubricService_1 = require("./rubricService");
const evaluationEvents_1 = require("./evaluationEvents");
const evaluationPolicy_1 = require("./evaluationPolicy");
const evaluationService_2 = require("./evaluationService");
/**
 * Phase 9 — EvaluationRunner.
 *
 * The bounded execution driver. Responsibilities:
 *   - Deterministic case ordering (benchmark insertion order).
 *   - Strict budgets: max cases, max wall-clock, per-case slice, bounded
 *     decision-engine wait.
 *   - Idempotency: re-executing a completed/failed run is a no-op; re-entry
 *     while running uses a lock; interrupted runs (stale lock) resume from the
 *     first unfinished case.
 *   - Failure isolation: one bad case never aborts the whole run — it becomes
 *     an `error` result and the run finishes as `partial`.
 *   - No chain-of-thought / no secrets: error messages are sanitized before
 *     they are stored.
 */
exports.STALE_LOCK_MS = 5 * 60 * 1000;
class EvaluationRunner {
    /**
     * Kick a run off in the background. Returns the persisted queued run — never
     * pretends execution already completed.
     */
    async startRun(userId, runId) {
        const run = await evaluationService_1.evaluationService.getRun(userId, runId);
        if (!run)
            throw new evaluationService_2.EvaluationValidationError('Evaluation run not found.');
        if (run.status !== 'draft') {
            throw new evaluationService_2.EvaluationValidationError(`Run is in state "${run.status}" and cannot be started.`);
        }
        run.status = 'queued';
        await run.save();
        void this.executeRun(userId, runId).catch((err) => {
            console.error(`[EvaluationRunner] run ${runId} crashed`, err?.message || err);
        });
        return run;
    }
    /** Execute a run to completion synchronously (also used by tests). */
    async executeRun(userId, runId) {
        const run = await EvaluationRun_1.default.findById(runId);
        if (!run)
            throw new evaluationService_2.EvaluationValidationError('Evaluation run not found.');
        if (String(run.userId) !== userId) {
            throw new evaluationService_2.EvaluationValidationError('Evaluation run not found.');
        }
        // Idempotency: terminal runs are not re-executed.
        if (['completed', 'failed', 'cancelled'].includes(run.status))
            return run;
        // Single-flight: another caller is already running this run.
        if (run.status === 'running' &&
            run.lockedAt &&
            Date.now() - run.lockedAt.getTime() < exports.STALE_LOCK_MS) {
            throw new evaluationService_2.EvaluationValidationError('Evaluation run is already executing.');
        }
        await this.acquireLock(run);
        try {
            const cases = await benchmarkService_1.benchmarkService.activeCases(String(run.benchmarkId), run.selectedCaseIds);
            const rubric = run.rubricId
                ? await rubricService_1.rubricService.getRubricSnapshot(userId, String(run.rubricId))
                : null;
            const snapshot = await evaluationService_1.evaluationService.toSnapshot(run);
            const deadline = Date.now() + run.limits.maxDurationMs;
            const existing = await EvaluationCaseResult_1.default.find({ runId: run._id });
            const done = new Set(existing.map((r) => String(r.caseId)));
            const sortedCases = cases
                .map((c) => ({
                caseId: String(c._id),
                title: c.title,
                version: c.version,
                prompt: c.prompt,
                expectedStructure: c.expectedStructure,
                providedAnswer: c.providedAnswer,
            }))
                .sort((a, b) => a.caseId.localeCompare(b.caseId));
            for (const caseDef of sortedCases) {
                const freshRun = await EvaluationRun_1.default.findById(run._id);
                if (!freshRun)
                    break;
                if (freshRun.status === 'cancelled')
                    break;
                if (done.has(caseDef.caseId))
                    continue;
                if (Date.now() > deadline) {
                    await this.finalizeRun(run._id, 'partial', 'Run exceeded its time budget.');
                    return (await EvaluationRun_1.default.findById(run._id));
                }
                const sliceDeadline = Date.now() + freshRun.limits.maxSliceMs;
                try {
                    const artifact = await this.resolveArtifact(userId, freshRun, caseDef, sliceDeadline);
                    const data = await evaluationService_1.evaluationService.runCase({
                        userId,
                        run: snapshot,
                        caseDef,
                        artifact,
                        rubric,
                        limits: freshRun.limits,
                    });
                    await evaluationService_1.evaluationService.persistCaseResult(data);
                    done.add(caseDef.caseId);
                    await this.bumpProgress(run._id, data.status);
                    (0, evaluationEvents_1.emitEvaluationEvent)({
                        type: 'evaluation.run.case_completed',
                        runId: String(run._id),
                        userId,
                        caseId: caseDef.caseId,
                        decisionId: data.artifact?.decisionId,
                        data: { status: data.status, score: data.metrics?.score ?? null },
                    });
                }
                catch (err) {
                    const message = (0, evaluationPolicy_1.sanitizeSignal)(err?.message || 'Unknown evaluation error', 500);
                    const errorData = {
                        runId: String(run._id),
                        userId,
                        benchmarkId: String(freshRun.benchmarkId),
                        caseId: caseDef.caseId,
                        caseTitle: caseDef.title,
                        caseVersion: caseDef.version,
                        status: 'error',
                        error: { message, phase: 'system' },
                        startedAt: new Date(Date.now() - 1),
                        completedAt: new Date(),
                    };
                    await evaluationService_1.evaluationService.persistCaseResult(errorData);
                    done.add(caseDef.caseId);
                    await this.bumpProgress(run._id, 'error');
                    (0, evaluationEvents_1.emitEvaluationEvent)({
                        type: 'evaluation.run.case_error',
                        runId: String(run._id),
                        userId,
                        caseId: caseDef.caseId,
                        data: { message },
                    });
                }
            }
            const fresh = (await EvaluationRun_1.default.findById(run._id));
            const status = fresh.progress.total > 0 &&
                fresh.progress.completed + fresh.progress.error >= fresh.progress.total
                ? fresh.progress.error === fresh.progress.total
                    ? 'failed'
                    : fresh.progress.error > 0
                        ? 'partial'
                        : 'completed'
                : 'partial';
            await this.finalizeRun(run._id, status);
            return (await EvaluationRun_1.default.findById(run._id));
        }
        catch (err) {
            const message = (0, evaluationPolicy_1.sanitizeSignal)(err?.message || 'Evaluation run failed.', 500);
            await this.finalizeRun(run._id, 'failed', message);
            return (await EvaluationRun_1.default.findById(run._id));
        }
    }
    /** Resolve the artifact under evaluation for one case. */
    async resolveArtifact(userId, run, caseDef, sliceDeadline) {
        const sut = run.systemUnderTest;
        if (sut.kind === 'decision-engine') {
            const artifact = await this.runDecisionEngine(userId, run, caseDef, sliceDeadline);
            if (!artifact)
                throw new Error('Decision-engine produced no evaluable artifact.');
            return artifact;
        }
        // static / external → evaluate the case's provided artifact.
        const artifact = evaluationService_1.evaluationService.artifactFromProvidedAnswer(caseDef.providedAnswer, caseDef.caseId);
        if (!artifact) {
            throw new Error('Case has no artifact to evaluate. Provide "providedAnswer" for static runs, or use an "decision-engine" run to generate one.');
        }
        return artifact;
    }
    /**
     * Provider-dependent path: create a real Hathap decision from the case prompt
     * and wait (bounded) for it to reach a terminal execution state.
     */
    async runDecisionEngine(userId, run, caseDef, sliceDeadline) {
        const deadline = Math.min(sliceDeadline, Date.now() + run.limits.maxDecisionWaitMs);
        const { decisionOrchestrator } = await Promise.resolve().then(() => __importStar(require('../decision/orchestrator')));
        const settings = run.systemUnderTest.decisionSettings || {};
        const decision = await decisionOrchestrator.createDecision({
            userId,
            title: caseDef.title || 'Evaluation case',
            objective: caseDef.prompt,
            context: caseDef.prompt,
            configuration: {
                verificationEnabled: settings.verificationEnabled ?? false,
            },
            metadata: {
                evaluationRunId: String(run._id),
                evaluationCaseId: caseDef.caseId,
            },
        });
        await decisionOrchestrator.startDecision(String(decision._id), userId, {
            planningMode: settings.planningMode || 'fixed',
            routingMode: settings.routingMode || 'auto',
            researchQueries: settings.researchQueries
                ? settings.researchQueries.map((q) => ({ query: q }))
                : [],
        });
        while (Date.now() < deadline) {
            const execution = await Execution_1.default.findOne({
                decisionId: decision._id,
            }).sort({ createdAt: -1 });
            if (execution && ['completed', 'failed', 'cancelled', 'partial'].includes(execution.status)) {
                if (execution.status === 'failed' || execution.status === 'cancelled') {
                    throw new Error(`Decision execution ${execution.status}: ${execution.error?.message || 'no detail'}`);
                }
                return evaluationService_1.evaluationService.collectDecisionArtifact(userId, String(decision._id));
            }
            await new Promise((r) => setTimeout(r, 750));
        }
        // Cancelling an evaluation-created decision keeps it honest: it never
        // becomes persisted history masquerading as a finished decision.
        try {
            await decisionOrchestrator.cancelDecision(String(decision._id), userId);
        }
        catch {
            /* best-effort */
        }
        throw new Error('Decision-engine case exceeded its evaluation budget.');
    }
    async acquireLock(run) {
        run.status = 'running';
        run.lockedAt = new Date();
        run.lockedBy = `runner-${process.pid}-${Date.now()}`;
        run.startedAt = run.startedAt || new Date();
        run.error = undefined;
        await run.save();
        (0, evaluationEvents_1.emitEvaluationEvent)({
            type: 'evaluation.run.started',
            runId: String(run._id),
            userId: String(run.userId),
        });
    }
    async bumpProgress(runId, status) {
        const inc = status === 'error' ? { 'progress.error': 1 } : { 'progress.completed': 1 };
        await EvaluationRun_1.default.updateOne({ _id: runId }, { $inc: inc });
    }
    async finalizeRun(runId, status, message) {
        const update = {
            status,
            lockedAt: undefined,
            lockedBy: undefined,
            completedAt: status === 'completed' || status === 'failed' || status === 'partial' ? new Date() : undefined,
        };
        if (message)
            update.error = { message };
        await EvaluationRun_1.default.updateOne({ _id: runId }, { $set: update });
        (0, evaluationEvents_1.emitEvaluationEvent)({
            type: status === 'completed'
                ? 'evaluation.run.completed'
                : status === 'failed'
                    ? 'evaluation.run.failed'
                    : status === 'partial'
                        ? 'evaluation.run.partial'
                        : 'evaluation.run.cancelled',
            runId: String(runId),
            data: { status, message },
        });
    }
}
exports.EvaluationRunner = EvaluationRunner;
exports.evaluationRunner = new EvaluationRunner();
