"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.schedule = schedule;
/**
 * Pure scheduling logic for a persistent execution engine.
 *
 * The scheduler answers ONE question: "Which work is ready to run right now?"
 * It contains NO agent-specific or strategy-specific business logic. It only
 * reasons over task status, dependencies, and execution state.
 *
 * A task is executable when:
 *   - its execution is in a state that permits new work (running/queued)
 *   - the task itself is pending/ready (or retrying and past its backoff)
 *   - all of its dependencies are in a terminal `completed` state
 *
 * Design intent: because this is a pure, stateless function over documents,
 * it can be driven by a simple in-process worker today or pulled into a real
 * queue (BullMQ/RabbitMQ/SQS) later without rewriting this logic.
 */
function schedule(executionStatus, tasks) {
    const executableTasks = [];
    const blockedTasks = [];
    const isActive = executionStatus === 'running' || executionStatus === 'queued';
    const statusById = new Map();
    for (const t of tasks)
        statusById.set(t._id.toString(), t);
    for (const task of tasks) {
        const id = task._id.toString();
        // A task that is already running, completed, cancelled or skipped is not
        // schedulable — it's either in progress or terminal.
        if (['running', 'completed', 'cancelled', 'skipped'].includes(task.status)) {
            continue;
        }
        // Paused tasks are explicitly held — they must be resumed before running.
        if (task.status === 'paused') {
            blockedTasks.push({ task, reason: 'paused' });
            continue;
        }
        if (!isActive) {
            blockedTasks.push({ task, reason: `execution not active (${executionStatus})` });
            continue;
        }
        // Retrying tasks are only eligible once their backoff window has elapsed.
        if (task.status === 'retrying') {
            if (task.nextRetryAt && task.nextRetryAt.getTime() > Date.now()) {
                blockedTasks.push({ task, reason: 'retry backoff not elapsed' });
                continue;
            }
            // Fall through to dependency check / executable below.
        }
        // A failed task without remaining retries is not schedulable.
        if (task.status === 'failed') {
            blockedTasks.push({ task, reason: 'failed (retries exhausted)' });
            continue;
        }
        // Dependency check: every dependency must be completed.
        const incompleteDeps = (task.dependencies || [])
            .map((depId) => statusById.get(depId))
            .filter((dep) => dep && dep.status !== 'completed');
        if (incompleteDeps.length > 0) {
            blockedTasks.push({
                task,
                reason: `dependencies incomplete: ${incompleteDeps.map((d) => d.type).join(', ')}`,
            });
            continue;
        }
        executableTasks.push({ task, reason: 'ready' });
    }
    // Higher priority first, then older tasks first for determinism.
    executableTasks.sort((a, b) => (b.task.priority || 0) - (a.task.priority || 0) ||
        (a.task.createdAt?.getTime() || 0) - (b.task.createdAt?.getTime() || 0));
    return { executableTasks, blockedTasks };
}
