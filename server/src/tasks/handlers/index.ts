import {
  TaskHandler,
  TaskHandlerRegistry,
  TaskType,
} from '../../decision/types';
import { debateHandler } from './debateHandler';
import { analysisHandler } from './analysisHandler';
import { synthesisHandler } from './synthesisHandler';
import { researchHandler } from './researchHandler';
import { verifyClaimHandler } from './verifyClaimHandler';
import { redTeamHandler } from './redTeamHandler';
import { reconciliationHandler } from './reconciliationHandler';

/**
 * Extensible registry of task handlers. A handler is responsible for the
 * task-specific logic of executing a unit of work. The scheduler decides WHAT
 * runs; the executor decides HOW a task is claimed and persisted; handlers
 * contain the task-specific behaviour.
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
  researchHandler,
  verifyClaimHandler,
  redTeamHandler,
  reconciliationHandler,
]);
