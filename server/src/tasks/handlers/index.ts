import {
  TaskHandler,
  TaskHandlerRegistry,
  TaskType,
} from '../../decision/types';
import { debateHandler } from './debateHandler';
import { analysisHandler } from './analysisHandler';
import { synthesisHandler } from './synthesisHandler';

/**
 * Extensible registry of task handlers. A handler is responsible for the
 * task-specific logic of executing a unit of work. The scheduler decides WHAT
 * runs; the executor decides HOW a task is claimed and persisted; handlers
 * contain the task-specific behaviour.
 *
 * Future handlers (research, challenge, verification, human_review, tool_call)
 * are intentionally not implemented in Phase 2 — register them here when ready.
 */
export class DefaultTaskHandlerRegistry implements TaskHandlerRegistry {
  private registry: Map<TaskType, TaskHandler> = new Map();

  constructor(handlers: TaskHandler[] = []) {
    for (const handler of handlers) {
      this.register(handler);
    }
  }

  register(handler: TaskHandler): void {
    this.registry.set(handler.type, handler);
  }

  getHandler(type: TaskType): TaskHandler | undefined {
    return this.registry.get(type);
  }

  canHandle(type: TaskType): boolean {
    return this.registry.has(type);
  }

  get handlers(): TaskHandler[] {
    return Array.from(this.registry.values());
  }
}

export const taskHandlerRegistry: TaskHandlerRegistry = new DefaultTaskHandlerRegistry([
  debateHandler,
  analysisHandler,
  synthesisHandler,
]);
