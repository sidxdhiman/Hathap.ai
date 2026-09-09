"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskExecutor = void 0;
const Task_1 = __importDefault(require("../models/Task"));
const Execution_1 = __importDefault(require("../models/Execution"));
const Decision_1 = __importDefault(require("../models/Decision"));
const stateMachine_1 = require("./stateMachine");
const eventBus_1 = require("./eventBus");
const errorClassifier_1 = require("./errorClassifier");
const usage_1 = require("./usage");
const routing_1 = require("../routing");
/**
 * TaskExecutor — decides HOW a task runs.
 *
 * Responsibilities:
 *   - Claim a scheduled task atomically (lease) so two workers never run the
 *     same task (idempotency / claim-based, not exactly-once).
 *   - Refuse to re-execute a task that already has a successful result.
 *   - Execute the task via its registered handler.
 *   - Persist the result, aggregate usage, and drive state transitions.
 *   - Classify failures into retryable vs permanent and schedule retries with
 *     exponential backoff, or mark the task failed permanently.
 */
class TaskExecutor {
    constructor(options) {
        this.options = options;
        this.backoff = options.backoff || ((attempt) => Math.min(1000 * 2 ** (attempt - 1), 30000));
        this.router = options.router || new routing_1.RouteTaskRouter();
    }
    /**
     * Atomically claim a task if it is still eligible to run. Returns the task
     * when claimed, or null if it can no longer run (already done / being worked).
     *
     * The lease is a `workerId` + `leasedAt` stamp. It is checked defensively to
     * satisfy the idempotency requirement: a completed task is never re-executed.
     */
    async claim(taskId) {
        const task = await Task_1.default.findById(taskId);
        if (!task)
            return null;
        // Idempotency guards.
        if (task.status === 'completed' && task.result)
            return null;
        if (task.status === 'cancelled')
            return null;
        if (!stateMachine_1.StateMachine.canTransitionTask(task.status, 'running').valid)
            return null;
        const updated = await Task_1.default.findOneAndUpdate({ _id: taskId, status: { $in: ['ready', 'pending', 'retrying'] } }, {
            $set: {
                status: 'running',
                workerId: this.options.workerId,
                leasedAt: new Date(),
                startedAt: task.startedAt || new Date(),
            },
            $inc: { attempts: 1 },
        }, { new: true });
        if (!updated)
            return null;
        eventBus_1.executionEventBus.emit({
            type: 'task.started',
            taskId: updated._id.toString(),
            executionId: updated.executionId?.toString(),
        });
        return updated;
    }
    /**
     * Execute a claimed task to completion (or retry/fail), persisting everything
     * through the document layer. `userId` is the owner of the decision the task
     * belongs to (needed to resolve agents/models in debate-style handlers).
     */
    async execute(userId, execution, task) {
        const handler = this.options.registry.getHandler(task.type);
        if (!handler) {
            return this.finishFailure(execution, task, {
                code: 'AGENT_FAILURE',
                message: `No handler registered for task type "${task.type}".`,
                taskId: task._id.toString(),
                kind: 'non_retryable',
                attempt: task.attempts || 0,
                createdAt: new Date(),
            });
        }
        const taskId = task._id.toString();
        const usageCollector = [];
        // Phase 6 — determine WHO performs this task before it runs. Persisted
        // routing is reused on retries; the model override flows to handlers via
        // the context and is never a credential.
        const routing = await this.ensureRouting(userId, execution, task);
        if (routing.status === 'failed') {
            return this.finishFailure(execution, task, {
                code: 'ROUTING_FAILURE',
                message: routing.message,
                taskId,
                kind: 'non_retryable',
                attempt: task.attempts || 0,
                createdAt: new Date(),
            });
        }
        const context = {
            userId,
            decisionId: String(execution.decisionId),
            executionId: String(execution._id),
            taskId,
            onUsage: (usage) => usageCollector.push(usage),
            ...(routing.status === 'selected'
                ? {
                    routing: {
                        agentId: routing.selection.agent?.id,
                        agentName: routing.selection.agent?.name,
                        modelId: routing.selection.model.id,
                        modelName: routing.selection.model.modelName,
                        provider: routing.selection.model.provider,
                    },
                }
                : {}),
        };
        try {
            const handlerTask = {
                ...(typeof task.toObject === 'function' ? task.toObject() : task),
                attempts: task.attempts || 0,
                input: task.input,
            };
            const handlerResult = await handler.execute(handlerTask, context);
            await this.recordUsage(execution, usageCollector);
            await Task_1.default.updateOne({ _id: taskId }, {
                $set: {
                    status: 'completed',
                    output: handlerResult.output,
                    result: handlerResult.output,
                    completedAt: new Date(),
                    error: undefined,
                    workerId: undefined,
                    leasedAt: undefined,
                    nextRetryAt: undefined,
                },
            });
            eventBus_1.executionEventBus.emit({
                type: 'task.completed',
                taskId,
                executionId: String(execution._id),
                decisionId: String(execution.decisionId),
                data: { type: task.type },
            });
            return (await Task_1.default.findById(taskId)) || task;
        }
        catch (error) {
            await this.recordUsage(execution, usageCollector);
            return this.finishFailure(execution, task, (0, errorClassifier_1.buildTaskError)(error, { taskId, attempt: task.attempts || 0 }));
        }
    }
    async finishFailure(execution, task, taskError) {
        const taskId = task._id.toString();
        const attempt = task.attempts || 0;
        // Cancelled tasks are never retried/failed — they stay cancelled.
        if (task.status === 'cancelled') {
            return (await Task_1.default.findById(taskId)) || task;
        }
        const canRetry = taskError.kind === 'retryable' && attempt <= (task.maxRetries ?? 2);
        if (canRetry) {
            // Phase 6 — bounded runtime fallback: reselect a different model once
            // before retrying, when the failure is model/provider related.
            await this.maybeFallbackToAlternativeModel(execution, task, taskError);
            const delay = this.backoff(attempt);
            await Task_1.default.updateOne({ _id: taskId }, {
                $set: {
                    status: 'retrying',
                    error: taskError,
                    nextRetryAt: new Date(Date.now() + delay),
                    retryCount: attempt,
                    workerId: undefined,
                    leasedAt: undefined,
                },
            });
            eventBus_1.executionEventBus.emit({
                type: 'task.retrying',
                taskId,
                executionId: String(execution._id),
                decisionId: String(execution.decisionId),
                retryCount: attempt,
                data: { nextRetryAt: new Date(Date.now() + delay).toISOString(), kind: taskError.kind },
            });
        }
        else {
            await Task_1.default.updateOne({ _id: taskId }, {
                $set: {
                    status: 'failed',
                    error: taskError,
                    completedAt: new Date(),
                    workerId: undefined,
                    leasedAt: undefined,
                    nextRetryAt: undefined,
                },
            });
            eventBus_1.executionEventBus.emit({
                type: 'task.failed',
                taskId,
                executionId: String(execution._id),
                decisionId: String(execution.decisionId),
                retryCount: attempt,
                data: { kind: taskError.kind, message: taskError.message },
            });
        }
        return (await Task_1.default.findById(taskId)) || task;
    }
    /**
     * Phase 6 — resolve (and persist) WHOSE resources run this task.
     *
     * Rules:
     *   - Only executions created through the routing-aware start flow
     *     (execution.metadata.routing set) are routed. Courtroom-linked and
     *     legacy executions skip routing and behave exactly as before.
     *   - A persisted selection is reused (idempotent across retries).
     *   - A routing failure marks the task non-retryable with ROUTING_FAILURE so
     *     a misconfiguration surfaces instead of burning retries.
     */
    async ensureRouting(userId, execution, task) {
        const routeConfig = execution.metadata?.routing;
        if (!routeConfig)
            return { status: 'skipped' };
        const taskId = String(task._id);
        const existing = task.metadata?.routing;
        if (existing?.selection?.status === 'selected') {
            return { status: 'selected', selection: existing.selection };
        }
        const taskType = task.type;
        const primaryProvider = taskType === 'verify_claim' || taskType === 'red_team'
            ? await this.router.resolvePrimaryProvider(String(execution._id))
            : undefined;
        const result = await this.router.routeTask({
            userId,
            decisionId: String(execution.decisionId),
            executionId: String(execution._id),
            taskId,
            taskType,
            requirements: task.metadata?.requirements || [],
            routingMode: routeConfig.mode === 'manual' ? 'manual' : 'auto',
            manualModelId: routeConfig.modelId,
            primaryProvider,
        });
        if (result.status === 'failed') {
            return { status: 'failed', message: result.message };
        }
        if (result.status === 'skipped') {
            return { status: 'skipped' };
        }
        await Task_1.default.updateOne({ _id: taskId }, {
            $set: {
                assignedAgent: result.agent?.id,
                assignedModel: result.model.id,
                'metadata.routing': { mode: routeConfig.mode || 'auto', selection: result },
            },
        });
        return { status: 'selected', selection: result };
    }
    /**
     * Phase 6 — bounded runtime fallback. When a retryable model/provider failure
     * occurs on a task that was routed in auto mode, re-route ONCE excluding the
     * failing model. Permanent errors and manual-mode pins never reselect; if no
     * alternative exists the task retries normally on its current assignment.
     */
    async maybeFallbackToAlternativeModel(execution, task, taskError) {
        const routeConfig = execution.metadata?.routing;
        if (routeConfig?.mode === 'manual')
            return undefined;
        const ROUTABLE_FAILURE_CODES = [
            'MODEL_UNAVAILABLE',
            'PROVIDER_OUTAGE',
            'TIMEOUT',
            'NETWORK_FAILURE',
            'RATE_LIMIT',
        ];
        if (!taskError.code || !ROUTABLE_FAILURE_CODES.includes(taskError.code))
            return undefined;
        const fresh = await Task_1.default.findById(task._id);
        const existing = fresh?.metadata?.routing;
        const current = existing?.selection;
        if (!current ||
            current.status !== 'selected' ||
            current.fallbackUsed ||
            !current.model?.id) {
            return undefined;
        }
        // Ownership scope for the reselection comes from the owning decision.
        const decision = await Decision_1.default.findById(execution.decisionId).select('userId').lean();
        if (!decision?.userId)
            return undefined;
        const result = await this.router.routeFallbackForRetry({
            userId: String(decision.userId),
            decisionId: String(execution.decisionId),
            executionId: String(execution._id),
            taskId: String(task._id),
            taskType: task.type,
            requirements: task.metadata?.requirements || [],
            routingMode: 'auto',
            excludeModelIds: [current.model.id],
        });
        if (result.status !== 'selected')
            return undefined;
        await Task_1.default.updateOne({ _id: task._id }, {
            $set: {
                assignedAgent: result.agent?.id,
                assignedModel: result.model.id,
                'metadata.routing': { mode: 'auto', selection: result },
            },
        });
        return result;
    }
    async recordUsage(execution, usage) {
        if (!usage.length)
            return;
        const agg = (0, usage_1.aggregateUsage)(usage);
        const current = execution.tokenUsage || { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCost: 0 };
        const newCost = (current.estimatedCost || 0) + agg.estimatedCost;
        await Execution_1.default.updateOne({ _id: execution._id }, {
            $set: {
                tokenUsage: {
                    inputTokens: (current.inputTokens || 0) + agg.inputTokens,
                    outputTokens: (current.outputTokens || 0) + agg.outputTokens,
                    totalTokens: (current.totalTokens || 0) + agg.totalTokens,
                    estimatedCost: newCost,
                    model: agg.model || current.model,
                    provider: agg.provider || current.provider,
                },
                estimatedCost: newCost,
                actualCost: newCost,
            },
        });
    }
}
exports.TaskExecutor = TaskExecutor;
