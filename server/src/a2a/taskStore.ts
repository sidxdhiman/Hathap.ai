import type { Task } from '@a2a-js/sdk';
import type { ServerCallContext, TaskStore } from '@a2a-js/sdk/server';
import { getUserId } from './types';

/**
 * Task store that binds every stored task to the A2A principal that created it.
 *
 * The SDK's `InMemoryTaskStore` is a plain `Map<string, Task>`: `load` ignores
 * the `ServerCallContext` that `DefaultRequestHandler` hands it, so
 * `tasks/get`, `tasks/cancel`, `tasks/resubscribe`, `message/send` with a
 * `taskId`, and `referenceTaskIds` all resolved any identifier any caller
 * supplied. Task IDs are the only thing standing between one user and another
 * user's debate history, verdict and courtroom IDs.
 *
 * Ownership is decided here rather than in a wrapper around the request
 * handler so that *every* read the handler performs — including the ones it
 * performs internally while appending history, resolving `referenceTaskIds`,
 * or reloading after a cancel — passes through the same check.
 *
 * Policy:
 *  - `load` returns `undefined` unless the caller is the owner. The SDK turns
 *    that into its normal `taskNotFound` error (`-32001` / HTTP `404`), which
 *    is byte-identical to the response for an identifier that never existed,
 *    so the endpoint cannot be used to confirm that a task exists.
 *  - `save` refuses to persist a task without an authenticated owner, and
 *    refuses to overwrite a task owned by somebody else, so ownership cannot
 *    be reassigned after the fact.
 */
export class OwnedTaskStore implements TaskStore {
  private readonly tasks = new Map<string, Task>();
  private readonly owners = new Map<string, string>();

  async load(taskId: string, context?: ServerCallContext): Promise<Task | undefined> {
    return this.loadFor(taskId, getUserId(context?.user));
  }

  /**
   * Ownership query used by `createTaskAccessGate`, which has no
   * `ServerCallContext` because it runs before the A2A transport builds one.
   * Returns `undefined` for an unknown task and for a task owned by somebody
   * else, so the two are never distinguishable.
   */
  async loadFor(taskId: string, userId: string | undefined): Promise<Task | undefined> {
    if (userId === undefined) {
      return undefined;
    }
    if (this.owners.get(taskId) !== userId) {
      return undefined;
    }
    const task = this.tasks.get(taskId);
    return task ? { ...task } : undefined;
  }

  async save(task: Task, context?: ServerCallContext): Promise<void> {
    const caller = getUserId(context?.user);
    if (caller === undefined) {
      throw new Error('Refusing to persist an A2A task without an authenticated owner.');
    }

    const owner = this.owners.get(task.id);
    if (owner !== undefined && owner !== caller) {
      throw new Error('Refusing to overwrite an A2A task owned by another user.');
    }

    this.tasks.set(task.id, { ...task });
    this.owners.set(task.id, caller);
  }

  /** Number of tasks currently retained. Diagnostics and tests only. */
  size(): number {
    return this.tasks.size;
  }
}
