"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.synthesisHandler = void 0;
/**
 * Synthesis handler — establishes the execution boundary for a "synthesis"
 * phase that consolidates prior work into a final decision/verdict.
 *
 * For Phase 2 it reuses the existing DebateEngine (which internally synthesizes
 * a verdict from the debate). The default Decision graph uses a single `debate`
 * task; this handler is available for tailored graphs that separate synthesis
 * from debate.
 */
exports.synthesisHandler = {
    type: 'synthesis',
    canHandle(type) {
        return type === 'synthesis';
    },
    async execute(task, context) {
        const { debateEngine } = await Promise.resolve().then(() => __importStar(require('../../engine/debateEngine')));
        const Decision = (await Promise.resolve().then(() => __importStar(require('../../models/Decision')))).default;
        const decision = await Decision.findById(context.decisionId);
        if (!decision) {
            throw new Error('Decision not found for synthesis task.');
        }
        const strategy = task.input?.strategy || decision.configuration?.strategy || 'consensus';
        const result = await debateEngine.executeForDecision({
            decisionId: context.decisionId,
            userId: context.userId,
            strategy,
            participants: decision.participants,
            objective: decision.objective,
            onUsage: context.onUsage,
        });
        return {
            output: {
                strategy,
                verdict: result.verdict,
                messages: result.messages,
            },
        };
    },
};
