"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.executionEventBus = exports.ExecutionEventBus = void 0;
const events_1 = require("events");
const ExecutionEvent_1 = __importDefault(require("../models/ExecutionEvent"));
/**
 * Central event system for the execution engine.
 *
 * Two concerns are combined intentionally:
 *   1. A durable event log persisted to the `ExecutionEvent` collection
 *      (built on top of the persistence layer, which is the source of truth).
 *   2. An in-process EventEmitter that future SSE/WebSocket layers can
 *      subscribe to for live updates.
 *
 * Events describe state changes but never *replace* persistence — the
 * underlying Decision/Execution/Task documents remain the source of truth.
 *
 * Generation of events is decoupled from any frontend concern.
 */
class ExecutionEventBus {
    constructor() {
        this.emitter = new events_1.EventEmitter();
    }
    emit(record) {
        const stamped = { ...record, timestamp: record.timestamp || new Date() };
        // Always fan out to in-process listeners synchronously first so observers
        // (future SSE/WebSocket adapters) never miss an update.
        this.emitter.emit(stamped.type, stamped);
        // Persist asynchronously (fire-and-forget; persistence failures must not
        // break the execution flow, which is governed by document state).
        ExecutionEvent_1.default.create({
            type: stamped.type,
            decisionId: stamped.decisionId,
            executionId: stamped.executionId,
            taskId: stamped.taskId,
            agentId: stamped.agentId,
            retryCount: stamped.retryCount,
            data: stamped.data,
        }).catch((err) => {
            console.error('[EventBus] failed to persist event', stamped.type, err?.message);
        });
    }
    on(type, listener) {
        this.emitter.on(type, listener);
    }
    off(type, listener) {
        this.emitter.off(type, listener);
    }
    async listByExecution(executionId) {
        return ExecutionEvent_1.default.find({ executionId }).sort({ createdAt: 1 });
    }
    async listByDecision(decisionId) {
        return ExecutionEvent_1.default.find({ decisionId }).sort({ createdAt: 1 });
    }
}
exports.ExecutionEventBus = ExecutionEventBus;
exports.executionEventBus = new ExecutionEventBus();
