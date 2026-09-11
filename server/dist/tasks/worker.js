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
exports.worker = exports.Worker = void 0;
const Execution_1 = __importDefault(require("../models/Execution"));
const Decision_1 = __importDefault(require("../models/Decision"));
const Task_1 = __importDefault(require("../models/Task"));
const stateMachine_1 = require("../decision/stateMachine");
const executor_1 = require("../decision/executor");
const handlers_1 = require("./handlers");
const scheduler_1 = require("../decision/scheduler");
const eventBus_1 = require("../decision/eventBus");
/**
 * Background worker for the execution engine.
 *
 * Responsibilities:
 *   - Periodically scan active executions.
 *   - Recover tasks stuck in `running` (stale worker detection) so an execution
 *     resumes after a process restart.
 *   - Detect executions that were interrupted mid-run and bring them back to a
 *     running state so they can make progress.
 *   - Pull scheduler-ready tasks and execute them, respecting a concurrency
 *     limit (no unbounded LLM calls).
 *   - Mark executions completed/failed when all tasks are terminal.
 *
 * This is a lightweight internal worker. The Decision layer talks to the
 * scheduler + executor through clean interfaces, so a real queue can be
 * swapped in later without rewriting the Decision logic.
 */
class Worker {
    constructor(options = {}) {
        this.timer = null;
        this.stopping = false;
        this.active = false;
        this.inFlight = 0;
        this.workerId = `worker-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
        this.pollIntervalMs = options.pollIntervalMs ?? 1500;
        this.maxConcurrentTasks = options.maxConcurrentTasks ?? 4;
        this.staleTaskTimeoutMs = options.staleTaskTimeoutMs ?? 120000;
        this.recoveryBackoffFn =
            options.recoveryBackoff || ((attempt) => Math.min(1000 * 2 ** attempt, 30000));
        this.executor =
            options.executor ||
                new executor_1.TaskExecutor({ registry: handlers_1.taskHandlerRegistry, workerId: this.workerId });
    }
    start() {
        if (this.timer)
            return;
        this.stopping = false;
        this.active = true;
        console.log(`[Worker] started (id=${this.workerId}, maxConcurrent=${this.maxConcurrentTasks})`);
        this.timer = setInterval(() => {
            void this.tick().catch((err) => {
                console.error('[Worker] tick error', err?.message);
            });
        }, this.pollIntervalMs);
        // Initial pass.
        void this.tick().catch((err) => {
            console.error('[Worker] initial tick error', err?.message);
        });
    }
    /**
     * Trigger an immediate tick (used when a new execution is created so work
     * starts without waiting for the next poll). No-op unless the worker has been
     * started, so the singleton never interferes before boot (or in tests).
     */
    wake() {
        if (!this.active)
            return;
        void this.tick().catch((err) => {
            console.error('[Worker] wake tick error', err?.message);
        });
    }
    /**
     * Synchronously drive a single scheduling/execution pass. Available for tests
     * and manual admin tooling to force a poll without waiting.
     */
    async tickNow() {
        await this.tick();
    }
    async stop() {
        this.stopping = true;
        this.active = false;
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        const deadline = Date.now() + 10000;
        while (this.inFlight > 0 && Date.now() < deadline) {
            await new Promise((r) => setTimeout(r, 100));
        }
        console.log('[Worker] stopped');
    }
    async tick() {
        if (this.stopping)
            return;
        // 1. Recover stale running tasks across all executions (process restart).
        await this.recoverStaleTasks();
        // 2. Find active executions (queued or running).
        const activeExecutions = await Execution_1.default.find({
            status: { $in: ['queued', 'running'] },
        });
        for (const execution of activeExecutions) {
            if (this.stopping || this.inFlight >= this.maxConcurrentTasks)
                break;
            await this.processExecution(execution);
        }
    }
    /**
     * Bring any running execution that has no active worker back to `queued` so
     * its ready tasks get processed again. This is the recovery path after a
     * process restart: an execution left in `running` with in-flight tasks is
     * resumed rather than becoming permanently stuck.
     */
    async recoverInterruptedExecutions() {
        // The stale task recovery handles individual tasks; here we simply ensure
        // executions aren't in a state that prevents new tasks from starting.
        const interrupted = await Execution_1.default.find({
            status: 'running',
            updatedAt: { $lt: new Date(Date.now() - this.staleTaskTimeoutMs) },
        });
        for (const execution of interrupted) {
            if (!stateMachine_1.StateMachine.canTransitionExecution('running', 'queued').valid)
                continue;
            execution.status = 'queued';
            await execution.save();
            eventBus_1.executionEventBus.emit({
                type: 'execution.resumed',
                executionId: String(execution._id),
                decisionId: String(execution.decisionId),
            });
        }
    }
    async processExecution(execution) {
        const execStatus = execution.status;
        const decision = execution.decisionId
            ? await Decision_1.default.findById(execution.decisionId)
            : null;
        // If the owning decision is paused/cancelled, hold the execution.
        if (decision) {
            if (decision.status === 'paused') {
                if (execStatus !== 'paused') {
                    await this.setExecutionStatus(execution, 'paused', 'execution.paused');
                }
                return;
            }
            if (decision.status === 'cancelled') {
                if (execStatus !== 'cancelled') {
                    await this.cancelExecutionTasks(execution);
                    await this.setExecutionStatus(execution, 'cancelled', 'execution.cancelled');
                }
                return;
            }
        }
        const tasks = await Task_1.default.find({ executionId: execution._id });
        const { executableTasks, blockedTasks } = (0, scheduler_1.schedule)(execStatus, tasks);
        // Mark ready pending tasks before running (so UI can see readiness).
        for (const e of executableTasks) {
            if (e.task.status !== 'pending' && e.task.status !== 'retrying')
                continue;
            await Task_1.default.updateOne({ _id: e.task._id }, { $set: { status: 'ready' } });
        }
        // Compute progress and update execution.
        const progress = this.computeProgress(tasks);
        await Execution_1.default.updateOne({ _id: execution._id }, {
            $set: {
                progress: progress.progress,
                currentPhase: this.inferPhase(tasks),
                totalTasks: progress.totalTasks,
                completedTasks: progress.completedTasks,
                failedTasks: progress.failedTasks,
                runningTasks: progress.runningTasks,
                pendingTasks: progress.pendingTasks,
            },
        });
        // If nothing is executable and there are no running tasks, the execution
        // is terminal (completed or failed).
        if (executableTasks.length === 0) {
            await this.maybeFinalize(execution);
            return;
        }
        // Execute up to the concurrency ceiling.
        for (const e of executableTasks) {
            if (this.stopping || this.inFlight >= this.maxConcurrentTasks)
                break;
            const claimed = await this.executor.claim(e.task._id.toString());
            if (!claimed)
                continue;
            this.inFlight++;
            void this.runTask(decision, execution, claimed)
                .catch(async (err) => {
                console.error(`[Worker] task ${claimed._id} crashed`, err?.message);
                await Task_1.default.updateOne({ _id: claimed._id }, { $set: { status: 'failed', error: { kind: 'retryable', message: err?.message, createdAt: new Date() } } });
            })
                .finally(() => {
                this.inFlight--;
            });
        }
    }
    async runTask(decision, execution, task) {
        const userId = decision ? String(decision.userId) : '';
        await this.executor.execute(userId, execution, task);
        // After a task settles, re-evaluate whether the whole execution is now
        // terminal. Without this, an execution whose last task completes in the
        // background would never be finalized.
        await this.maybeFinalize(execution);
    }
    async maybeFinalize(execution, tries = 2) {
        const tasks = await Task_1.default.find({ executionId: execution._id });
        const inProgress = tasks.some((t) => ['pending', 'ready', 'running', 'retrying'].includes(t.status));
        if (inProgress) {
            // Two tasks may settle near-simultaneously; give a concurrently
            // finishing sibling a moment to commit its status before giving up.
            if (tries > 1) {
                await new Promise((r) => setTimeout(r, 30));
                return this.maybeFinalize(execution, tries - 1);
            }
            return;
        }
        // Transitions to a terminal state are validated so a re-entry is a no-op.
        const status = tasks.some((t) => t.status === 'failed')
            ? 'failed'
            : 'completed';
        if (!stateMachine_1.StateMachine.canTransitionExecution(execution.status, status).valid)
            return;
        if (status === 'failed') {
            await this.failExecution(execution, tasks);
        }
        else {
            await this.completeExecution(execution, tasks);
        }
    }
    async completeExecution(execution, tasks) {
        const current = execution.status;
        if (!stateMachine_1.StateMachine.canTransitionExecution(current, 'completed').valid)
            return;
        const p = this.computeProgress(tasks);
        await Execution_1.default.updateOne({ _id: execution._id }, {
            $set: {
                status: 'completed',
                progress: 100,
                completedTasks: p.completedTasks,
                failedTasks: p.failedTasks,
                runningTasks: 0,
                pendingTasks: 0,
                completedAt: new Date(),
            },
        });
        eventBus_1.executionEventBus.emit({
            type: 'execution.completed',
            executionId: String(execution._id),
            decisionId: String(execution.decisionId),
        });
        if (execution.decisionId) {
            const decision = await Decision_1.default.findById(execution.decisionId);
            if (decision && !['cancelled', 'failed'].includes(decision.status)) {
                if (stateMachine_1.StateMachine.canTransitionDecision(decision.status, 'completed').valid) {
                    decision.status = 'completed';
                    decision.currentPhase = 'completed';
                    decision.confidence = this.extractConfidence(tasks);
                    decision.completedAt = new Date();
                    await decision.save();
                    await this.recordDecisionMemory(String(decision._id), String(decision.userId), 'completion');
                }
            }
        }
    }
    /**
     * Phase 8 — a completed decision becomes eligible for historical retrieval by
     * persisting its structured memory index. Best-effort: memory must never
     * break the completion flow.
     */
    async recordDecisionMemory(decisionId, userId, via) {
        try {
            const { decisionMemoryService } = await Promise.resolve().then(() => __importStar(require('../memory/decisionMemoryService')));
            await decisionMemoryService.createForDecision(decisionId, userId, { via });
        }
        catch (err) {
            console.error('[Worker] failed to record decision memory', decisionId, err?.message);
        }
    }
    async failExecution(execution, tasks) {
        const firstError = tasks.find((t) => t.status === 'failed')?.error;
        const p = this.computeProgress(tasks);
        await Execution_1.default.updateOne({ _id: execution._id }, {
            $set: {
                status: 'failed',
                progress: p.progress,
                completedTasks: p.completedTasks,
                failedTasks: p.failedTasks,
                runningTasks: 0,
                pendingTasks: 0,
                completedAt: new Date(),
                error: {
                    code: firstError?.code,
                    message: firstError?.message || 'One or more tasks failed.',
                    retryable: firstError?.kind === 'retryable',
                    createdAt: new Date(),
                },
            },
        });
        eventBus_1.executionEventBus.emit({
            type: 'execution.failed',
            executionId: String(execution._id),
            decisionId: String(execution.decisionId),
            data: { message: firstError?.message },
        });
        if (execution.decisionId) {
            const decision = await Decision_1.default.findById(execution.decisionId);
            if (decision) {
                decision.status = 'failed';
                decision.currentPhase = 'failed';
                await decision.save();
            }
        }
    }
    async cancelExecutionTasks(execution) {
        await Task_1.default.updateMany({ executionId: execution._id, status: { $in: ['pending', 'ready', 'retrying'] } }, { $set: { status: 'cancelled', completedAt: new Date(), workerId: undefined, leasedAt: undefined } });
    }
    async setExecutionStatus(execution, status, eventType) {
        const current = execution.status;
        if (!stateMachine_1.StateMachine.canTransitionExecution(current, status).valid)
            return;
        await Execution_1.default.updateOne({ _id: execution._id }, {
            $set: {
                status,
                completedAt: status === 'completed' || status === 'failed' || status === 'cancelled'
                    ? new Date()
                    : execution.completedAt,
            },
        });
        eventBus_1.executionEventBus.emit({
            type: eventType,
            executionId: String(execution._id),
            decisionId: String(execution.decisionId),
        });
    }
    async recoverStaleTasks() {
        const stale = await Task_1.default.find({
            status: 'running',
            leasedAt: { $lt: new Date(Date.now() - this.staleTaskTimeoutMs) },
        });
        if (stale.length === 0)
            return;
        for (const task of stale) {
            // Only recover tasks leased to a worker id that may not be alive. Since
            // this is a single-process worker, any stale lease is treated as dead.
            await Task_1.default.updateOne({ _id: task._id }, {
                $set: {
                    status: 'retrying',
                    error: { kind: 'retryable', message: 'Stale task recovered after restart.', createdAt: new Date() },
                    retryCount: (task.retryCount || 0) + 1,
                    nextRetryAt: new Date(Date.now() + this.recoveryBackoffFn(task.retryCount || 0)),
                    workerId: undefined,
                    leasedAt: undefined,
                },
            });
            eventBus_1.executionEventBus.emit({
                type: 'task.retrying',
                taskId: String(task._id),
                executionId: String(task.executionId),
                retryCount: task.retryCount || 0,
                data: { reason: 'stale-recovered' },
            });
        }
    }
    computeProgress(tasks) {
        const totalTasks = tasks.length || 0;
        if (totalTasks === 0)
            return { progress: 0, totalTasks: 0, completedTasks: 0, failedTasks: 0, runningTasks: 0, pendingTasks: 0 };
        const completedTasks = tasks.filter((t) => t.status === 'completed').length;
        const failedTasks = tasks.filter((t) => t.status === 'failed' || t.status === 'cancelled' || t.status === 'skipped').length;
        const runningTasks = tasks.filter((t) => t.status === 'running').length;
        const pendingTasks = tasks.filter((t) => ['pending', 'ready', 'retrying'].includes(t.status)).length;
        const done = completedTasks + failedTasks;
        const progress = Math.round((done / totalTasks) * 100);
        return { progress, totalTasks, completedTasks, failedTasks, runningTasks, pendingTasks };
    }
    inferPhase(tasks) {
        for (const t of tasks) {
            if (t.status === 'running' || t.status === 'ready' || t.status === 'pending' || t.status === 'retrying') {
                if (t.type === 'debate')
                    return 'debating';
                if (t.type === 'verify_claim' || t.type === 'red_team' || t.type === 'reconciliation')
                    return 'verifying';
                return t.type;
            }
        }
        return 'completed';
    }
    extractConfidence(tasks) {
        const debate = tasks.find((t) => t.type === 'debate' && t.result);
        const verdict = debate?.result;
        if (verdict && typeof verdict.verdict?.confidenceScore === 'number') {
            return verdict.verdict.confidenceScore;
        }
        // Reconciliation may carry a final confidence.
        const recon = tasks.find((t) => t.type === 'reconciliation' && t.result);
        const reconVerdict = recon?.result;
        if (reconVerdict && typeof reconVerdict.confidence === 'number') {
            return reconVerdict.confidence;
        }
        return undefined;
    }
}
exports.Worker = Worker;
exports.worker = new Worker();
