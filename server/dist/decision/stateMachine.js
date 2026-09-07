"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StateMachine = void 0;
const DECISION_TRANSITIONS = {
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
const EXECUTION_TRANSITIONS = {
    pending: ['queued', 'running', 'paused', 'completed', 'failed', 'cancelled'],
    queued: ['running', 'paused', 'completed', 'failed', 'cancelled'],
    running: ['paused', 'completed', 'failed', 'partial', 'cancelled'],
    paused: ['running', 'completed', 'failed', 'cancelled'],
    completed: ['partial', 'failed', 'cancelled'],
    partial: ['running', 'completed', 'failed', 'cancelled'],
    failed: ['pending', 'running', 'queued', 'cancelled'],
    cancelled: ['queued', 'running'],
};
const TASK_TRANSITIONS = {
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
            case 'cancelled': return 'failed';
            default: return 'draft';
        }
    }
}
exports.StateMachine = StateMachine;
