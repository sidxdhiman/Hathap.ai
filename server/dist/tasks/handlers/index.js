"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.taskHandlerRegistry = exports.DefaultTaskHandlerRegistry = void 0;
const debateHandler_1 = require("./debateHandler");
const analysisHandler_1 = require("./analysisHandler");
const synthesisHandler_1 = require("./synthesisHandler");
const researchHandler_1 = require("./researchHandler");
/**
 * Extensible registry of task handlers. A handler is responsible for the
 * task-specific logic of executing a unit of work. The scheduler decides WHAT
 * runs; the executor decides HOW a task is claimed and persisted; handlers
 * contain the task-specific behaviour.
 *
 * Future handlers (challenge, verification, human_review, tool_call)
 * are intentionally not implemented yet — register them here when ready.
 */
class DefaultTaskHandlerRegistry {
    constructor(handlers = []) {
        this.registry = new Map();
        for (const handler of handlers) {
            this.register(handler);
        }
    }
    register(handler) {
        this.registry.set(handler.type, handler);
    }
    getHandler(type) {
        return this.registry.get(type);
    }
    canHandle(type) {
        return this.registry.has(type);
    }
    get handlers() {
        return Array.from(this.registry.values());
    }
}
exports.DefaultTaskHandlerRegistry = DefaultTaskHandlerRegistry;
exports.taskHandlerRegistry = new DefaultTaskHandlerRegistry([
    debateHandler_1.debateHandler,
    analysisHandler_1.analysisHandler,
    synthesisHandler_1.synthesisHandler,
    researchHandler_1.researchHandler,
]);
