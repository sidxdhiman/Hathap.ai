import {
  DecisionStatus,
  DecisionPhase,
  ExecutionStatus,
  TaskStatus,
} from './types';

interface Transition {
  valid: boolean;
  message: string;
}

const DECISION_TRANSITIONS: Record<DecisionStatus, DecisionStatus[]> = {
  draft: ['investigating', 'reasoning', 'debating', 'completed', 'failed', 'paused', 'cancelled'],
  investigating: ['reasoning', 'debating', 'completed', 'failed', 'paused', 'awaiting_review', 'cancelled'],
  reasoning: ['investigating', 'debating', 'verifying', 'completed', 'failed', 'paused', 'awaiting_review', 'cancelled'],
  debating: ['reasoning', 'verifying', 'awaiting_review', 'completed', 'failed', 'paused', 'cancelled'],
  verifying: ['awaiting_review', 'reasoning', 'completed', 'failed', 'paused', 'cancelled'],
  awaiting_review: ['completed', 'failed', 'paused', 'debating', 'cancelled'],
  completed: ['failed', 'paused', 'cancelled'],
  failed: ['draft', 'debating', 'reasoning', 'cancelled'],
  paused: ['investigating', 'reasoning', 'debating', 'verifying', 'completed', 'failed', 'cancelled'],
  cancelled: ['draft', 'reasoning', 'debating'],
};

const EXECUTION_TRANSITIONS: Record<ExecutionStatus, ExecutionStatus[]> = {
  pending: ['queued', 'running', 'paused', 'completed', 'failed', 'cancelled'],
  queued: ['running', 'paused', 'completed', 'failed', 'cancelled'],
  running: ['paused', 'completed', 'failed', 'partial', 'cancelled'],
  paused: ['running', 'completed', 'failed', 'cancelled'],
  completed: ['partial', 'failed', 'cancelled'],
  partial: ['running', 'completed', 'failed', 'cancelled'],
  failed: ['pending', 'running', 'queued', 'cancelled'],
  cancelled: ['queued', 'running'],
};

const TASK_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  pending: ['ready', 'running', 'cancelled', 'failed', 'skipped'],
  ready: ['running', 'cancelled', 'skipped', 'failed'],
  running: ['completed', 'failed', 'retrying', 'cancelled'],
  completed: ['failed'],
  failed: ['ready', 'running', 'retrying', 'cancelled'],
  retrying: ['ready', 'running', 'cancelled', 'failed'],
  paused: ['ready', 'running', 'cancelled', 'completed', 'failed'],
  cancelled: ['ready', 'running'],
  skipped: ['ready'],
};

function canTransition(
  current: string,
  next: string,
  transitions: Record<string, string[]>
): Transition {
  const allowed = transitions[current];
  if (!allowed) {
    return { valid: false, message: `Unknown state: ${current}` };
  }
  if (allowed.includes(next)) {
    return { valid: true, message: `${current} -> ${next} is allowed` };
  }
  return {
    valid: false,
    message: `Invalid state transition: ${current} -> ${next}`,
  };
}

export class StateMachine {
  static canTransitionDecision(current: DecisionStatus, next: DecisionStatus): Transition {
    return canTransition(current, next, DECISION_TRANSITIONS);
  }

  static transitionDecision(current: DecisionStatus, next: DecisionStatus): void {
    const result = this.canTransitionDecision(current, next);
    if (!result.valid) {
      throw new Error(result.message);
    }
  }

  static canTransitionExecution(current: ExecutionStatus, next: ExecutionStatus): Transition {
    return canTransition(current, next, EXECUTION_TRANSITIONS);
  }

  static transitionExecution(current: ExecutionStatus, next: ExecutionStatus): void {
    const result = this.canTransitionExecution(current, next);
    if (!result.valid) {
      throw new Error(result.message);
    }
  }

  static canTransitionTask(current: TaskStatus, next: TaskStatus): Transition {
    return canTransition(current, next, TASK_TRANSITIONS);
  }

  static transitionTask(current: TaskStatus, next: TaskStatus): void {
    const result = this.canTransitionTask(current, next);
    if (!result.valid) {
      throw new Error(result.message);
    }
  }

  static getDecisionStates(): DecisionStatus[] {
    return Object.keys(DECISION_TRANSITIONS) as DecisionStatus[];
  }

  static getExecutionStates(): ExecutionStatus[] {
    return Object.keys(EXECUTION_TRANSITIONS) as ExecutionStatus[];
  }

  static getTaskStates(): TaskStatus[] {
    return Object.keys(TASK_TRANSITIONS) as TaskStatus[];
  }

  static allDecisionTransitions(): Record<DecisionStatus, DecisionStatus[]> {
    return DECISION_TRANSITIONS;
  }

  static allExecutionTransitions(): Record<ExecutionStatus, ExecutionStatus[]> {
    return EXECUTION_TRANSITIONS;
  }

  static allTaskTransitions(): Record<TaskStatus, TaskStatus[]> {
    return TASK_TRANSITIONS;
  }

  static phaseFromStatus(status: DecisionStatus): DecisionPhase {
    switch (status) {
      case 'draft': return 'draft';
      case 'investigating': return 'investigating';
      case 'reasoning': return 'reasoning';
      case 'debating': return 'debating';
      case 'verifying': return 'verifying';
      case 'awaiting_review': return 'awaiting_review';
      case 'completed': return 'completed';
      case 'failed': return 'failed';
      case 'paused': return status;
      case 'cancelled': return 'failed';
      default: return 'draft';
    }
  }
}
