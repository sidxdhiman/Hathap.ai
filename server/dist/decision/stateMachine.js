"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StateMachine = void 0;
const DECISION_TRANSITIONS = {
    draft: ['investigating', 'reasoning', 'debating', 'completed', 'failed', 'paused'],
    investigating: ['reasoning', 'debating', 'completed', 'failed', 'paused', 'awaiting_review'],
    reasoning: ['investigating', 'debating', 'verifying', 'completed', 'failed', 'paused', 'awaiting_review'],
    debating: ['reasoning', 'verifying', 'awaiting_review', 'completed', 'failed', 'paused'],
    verifying: ['awaiting_review', 'reasoning', 'completed', 'failed', 'paused'],
    awaiting_review: ['completed', 'failed', 'paused', 'debating'],
    completed: ['failed', 'paused'],
    failed: ['draft', 'debating', 'reasoning'],
    paused: ['investigating', 'reasoning', 'debating', 'verifying', 'completed', 'failed'],
};
const EXECUTION_TRANSITIONS = {
    pending: ['running', 'paused', 'completed', 'failed'],
    running: ['paused', 'completed', 'failed', 'partial'],
    paused: ['running', 'completed', 'failed'],
    completed: ['partial', 'failed'],
    partial: ['running', 'completed', 'failed'],
    failed: ['pending', 'running'],
};
const TASK_TRANSITIONS = {
    pending: ['ready', 'running', 'skipped', 'failed'],
    ready: ['running', 'skipped', 'failed'],
    running: ['completed', 'failed'],
    completed: ['failed'],
    failed: ['ready', 'running'],
    skipped: ['ready'],
};
function canTransition(current, next, transitions) {
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
class StateMachine {
    static canTransitionDecision(current, next) {
        return canTransition(current, next, DECISION_TRANSITIONS);
    }
    static transitionDecision(current, next) {
        const result = this.canTransitionDecision(current, next);
        if (!result.valid) {
            throw new Error(result.message);
        }
    }
    static canTransitionExecution(current, next) {
        return canTransition(current, next, EXECUTION_TRANSITIONS);
    }
    static transitionExecution(current, next) {
        const result = this.canTransitionExecution(current, next);
        if (!result.valid) {
            throw new Error(result.message);
        }
    }
    static canTransitionTask(current, next) {
        return canTransition(current, next, TASK_TRANSITIONS);
    }
    static transitionTask(current, next) {
        const result = this.canTransitionTask(current, next);
        if (!result.valid) {
            throw new Error(result.message);
        }
    }
    static getDecisionStates() {
        return Object.keys(DECISION_TRANSITIONS);
    }
    static getExecutionStates() {
        return Object.keys(EXECUTION_TRANSITIONS);
    }
    static getTaskStates() {
        return Object.keys(TASK_TRANSITIONS);
    }
    static allDecisionTransitions() {
        return DECISION_TRANSITIONS;
    }
    static allExecutionTransitions() {
        return EXECUTION_TRANSITIONS;
    }
    static allTaskTransitions() {
        return TASK_TRANSITIONS;
    }
    static phaseFromStatus(status) {
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
            default: return 'draft';
        }
    }
}
exports.StateMachine = StateMachine;
