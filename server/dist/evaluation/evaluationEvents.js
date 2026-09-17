"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EVALUATION_EVENT_TYPES = void 0;
exports.emitEvaluationEvent = emitEvaluationEvent;
const eventBus_1 = require("../decision/eventBus");
const evaluationPolicy_1 = require("./evaluationPolicy");
exports.EVALUATION_EVENT_TYPES = [
    'evaluation.run.created',
    'evaluation.run.started',
    'evaluation.run.case_completed',
    'evaluation.run.case_error',
    'evaluation.run.partial',
    'evaluation.run.completed',
    'evaluation.run.failed',
    'evaluation.run.cancelled',
];
function emitEvaluationEvent(payload) {
    eventBus_1.executionEventBus.emit({
        type: payload.type,
        decisionId: payload.decisionId,
        data: {
            runId: payload.runId,
            policyVersion: evaluationPolicy_1.EVALUATION_POLICY_VERSION,
            ...(payload.userId ? { userId: payload.userId } : {}),
            ...(payload.caseId ? { caseId: payload.caseId } : {}),
            ...(payload.data || {}),
        },
    });
}
