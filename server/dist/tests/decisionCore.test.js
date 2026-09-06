"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const stateMachine_1 = require("../decision/stateMachine");
const usage_1 = require("../decision/usage");
const responseParser_1 = require("../engine/responseParser");
const messageParser_1 = require("../a2a/messageParser");
(0, node_test_1.describe)('StateMachine - Decision transitions', () => {
    (0, node_test_1.test)('allows draft -> investigating', () => {
        const r = stateMachine_1.StateMachine.canTransitionDecision('draft', 'investigating');
        strict_1.default.equal(r.valid, true);
    });
    (0, node_test_1.test)('allows draft -> debating', () => {
        strict_1.default.equal(stateMachine_1.StateMachine.canTransitionDecision('draft', 'debating').valid, true);
    });
    (0, node_test_1.test)('allows debating -> verifying', () => {
        strict_1.default.equal(stateMachine_1.StateMachine.canTransitionDecision('debating', 'verifying').valid, true);
    });
    (0, node_test_1.test)('allows verifying -> awaiting_review', () => {
        strict_1.default.equal(stateMachine_1.StateMachine.canTransitionDecision('verifying', 'awaiting_review').valid, true);
    });
    (0, node_test_1.test)('allows awaiting_review -> completed', () => {
        strict_1.default.equal(stateMachine_1.StateMachine.canTransitionDecision('awaiting_review', 'completed').valid, true);
    });
    (0, node_test_1.test)('rejects completed -> debating', () => {
        const r = stateMachine_1.StateMachine.canTransitionDecision('completed', 'debating');
        strict_1.default.equal(r.valid, false);
    });
    (0, node_test_1.test)('rejects draft -> verifying (skip phase)', () => {
        const r = stateMachine_1.StateMachine.canTransitionDecision('draft', 'verifying');
        strict_1.default.equal(r.valid, false);
    });
    (0, node_test_1.test)('transitionDecision throws on invalid', () => {
        strict_1.default.throws(() => stateMachine_1.StateMachine.transitionDecision('completed', 'debating'), /Invalid state transition/);
    });
    (0, node_test_1.test)('phaseFromStatus maps correctly', () => {
        strict_1.default.equal(stateMachine_1.StateMachine.phaseFromStatus('completed'), 'completed');
        strict_1.default.equal(stateMachine_1.StateMachine.phaseFromStatus('debating'), 'debating');
        strict_1.default.equal(stateMachine_1.StateMachine.phaseFromStatus('draft'), 'draft');
    });
});
(0, node_test_1.describe)('StateMachine - Execution transitions', () => {
    (0, node_test_1.test)('allows pending -> running', () => {
        strict_1.default.equal(stateMachine_1.StateMachine.canTransitionExecution('pending', 'running').valid, true);
    });
    (0, node_test_1.test)('allows running -> completed', () => {
        strict_1.default.equal(stateMachine_1.StateMachine.canTransitionExecution('running', 'completed').valid, true);
    });
    (0, node_test_1.test)('allows running -> partial', () => {
        strict_1.default.equal(stateMachine_1.StateMachine.canTransitionExecution('running', 'partial').valid, true);
    });
    (0, node_test_1.test)('rejects completed -> running', () => {
        strict_1.default.equal(stateMachine_1.StateMachine.canTransitionExecution('completed', 'running').valid, false);
    });
});
(0, node_test_1.describe)('StateMachine - Task transitions', () => {
    (0, node_test_1.test)('allows pending -> ready', () => {
        strict_1.default.equal(stateMachine_1.StateMachine.canTransitionTask('pending', 'ready').valid, true);
    });
    (0, node_test_1.test)('allows ready -> running', () => {
        strict_1.default.equal(stateMachine_1.StateMachine.canTransitionTask('ready', 'running').valid, true);
    });
    (0, node_test_1.test)('allows running -> completed', () => {
        strict_1.default.equal(stateMachine_1.StateMachine.canTransitionTask('running', 'completed').valid, true);
    });
    (0, node_test_1.test)('allows failed -> ready (retry)', () => {
        strict_1.default.equal(stateMachine_1.StateMachine.canTransitionTask('failed', 'ready').valid, true);
    });
    (0, node_test_1.test)('rejects completed -> ready', () => {
        strict_1.default.equal(stateMachine_1.StateMachine.canTransitionTask('completed', 'ready').valid, false);
    });
});
(0, node_test_1.describe)('Token usage accounting', () => {
    (0, node_test_1.test)('recordUsage computes totalTokens and estimatedCost', () => {
        const usage = (0, usage_1.recordUsage)({
            inputTokens: 1000,
            outputTokens: 500,
            model: 'gpt-4o',
            provider: 'openai',
        });
        strict_1.default.equal(usage.totalTokens, 1500);
        strict_1.default.ok(usage.estimatedCost > 0, 'estimated cost should be positive for known model');
        strict_1.default.equal(usage.provider, 'openai');
    });
    (0, node_test_1.test)('recordUsage returns zero cost for unknown model', () => {
        const usage = (0, usage_1.recordUsage)({
            inputTokens: 100,
            outputTokens: 50,
            model: 'unknown-model-xyz',
            provider: 'custom',
        });
        strict_1.default.equal(usage.estimatedCost, 0);
        strict_1.default.equal(usage.totalTokens, 150);
    });
    (0, node_test_1.test)('aggregateUsage sums all records', () => {
        const records = [
            (0, usage_1.recordUsage)({ inputTokens: 100, outputTokens: 100, model: 'a', provider: 'p' }),
            (0, usage_1.recordUsage)({ inputTokens: 200, outputTokens: 200, model: 'a', provider: 'p' }),
        ];
        const total = (0, usage_1.aggregateUsage)(records);
        strict_1.default.equal(total.inputTokens, 300);
        strict_1.default.equal(total.outputTokens, 300);
        strict_1.default.equal(total.totalTokens, 600);
    });
    (0, node_test_1.test)('usageSummary groups by model', () => {
        const records = [
            (0, usage_1.recordUsage)({ inputTokens: 100, outputTokens: 100, model: 'gpt-4o', provider: 'openai' }),
            (0, usage_1.recordUsage)({ inputTokens: 100, outputTokens: 100, model: 'gpt-4o', provider: 'openai' }),
            (0, usage_1.recordUsage)({ inputTokens: 100, outputTokens: 100, model: 'claude', provider: 'anthropic' }),
        ];
        const summary = (0, usage_1.usageSummary)(records);
        strict_1.default.equal(summary.totalCalls, 3);
        strict_1.default.equal(summary.byModel['gpt-4o'].totalTokens, 400);
        strict_1.default.equal(summary.byModel['claude'].totalTokens, 200);
    });
});
(0, node_test_1.describe)('parseModelResponse - structured result parsing', () => {
    (0, node_test_1.test)('parses valid JSON response', () => {
        const parsed = (0, responseParser_1.parseModelResponse)(JSON.stringify({
            position: 'Use microservices',
            arguments: ['Scales well', 'Independent deploy'],
            risks: ['Complexity'],
            recommendation: 'Start with microservices',
        }));
        strict_1.default.equal(parsed.position, 'Use microservices');
        strict_1.default.equal(parsed.arguments.length, 2);
        strict_1.default.equal(parsed.recommendation, 'Start with microservices');
    });
    (0, node_test_1.test)('strips markdown code fences', () => {
        const parsed = (0, responseParser_1.parseModelResponse)('```json\n' +
            JSON.stringify({
                position: 'P1',
                arguments: ['A1'],
                risks: ['R1'],
                recommendation: 'Rec',
            }) +
            '\n```');
        strict_1.default.equal(parsed.position, 'P1');
    });
    (0, node_test_1.test)('returns defaults on malformed output', () => {
        const parsed = (0, responseParser_1.parseModelResponse)('this is not json');
        strict_1.default.equal(parsed.position, 'Analysis Provided');
    });
    (0, node_test_1.test)('uses defaults for missing fields', () => {
        const parsed = (0, responseParser_1.parseModelResponse)('{}');
        strict_1.default.equal(parsed.position, 'Undecided');
    });
});
(0, node_test_1.describe)('A2A message parsing compatibility', () => {
    (0, node_test_1.test)('normalizeDebateRequest accepts run-debate', () => {
        const req = (0, messageParser_1.normalizeDebateRequest)({
            skill: 'run-debate',
            objective: 'Should we go to market?',
            mode: 'consensus',
        });
        strict_1.default.ok(req, 'run-debate with objective should be valid');
    });
    (0, node_test_1.test)('normalizeDebateRequest rejects run-debate without objective', () => {
        strict_1.default.throws(() => (0, messageParser_1.normalizeDebateRequest)({ skill: 'run-debate', mode: 'consensus' }));
    });
});
