import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { StateMachine } from '../decision/stateMachine';
import { recordUsage, aggregateUsage, usageSummary } from '../decision/usage';
import { parseModelResponse } from '../engine/responseParser';
import { parseDebateRequest, normalizeDebateRequest } from '../a2a/messageParser';

describe('StateMachine - Decision transitions', () => {
  test('allows draft -> investigating', () => {
    const r = StateMachine.canTransitionDecision('draft', 'investigating');
    assert.equal(r.valid, true);
  });

  test('allows draft -> debating', () => {
    assert.equal(StateMachine.canTransitionDecision('draft', 'debating').valid, true);
  });

  test('allows debating -> verifying', () => {
    assert.equal(StateMachine.canTransitionDecision('debating', 'verifying').valid, true);
  });

  test('allows verifying -> awaiting_review', () => {
    assert.equal(StateMachine.canTransitionDecision('verifying', 'awaiting_review').valid, true);
  });

  test('allows awaiting_review -> completed', () => {
    assert.equal(StateMachine.canTransitionDecision('awaiting_review', 'completed').valid, true);
  });

  test('rejects completed -> debating', () => {
    const r = StateMachine.canTransitionDecision('completed', 'debating');
    assert.equal(r.valid, false);
  });

  test('rejects draft -> verifying (skip phase)', () => {
    const r = StateMachine.canTransitionDecision('draft', 'verifying');
    assert.equal(r.valid, false);
  });

  test('transitionDecision throws on invalid', () => {
    assert.throws(
      () => StateMachine.transitionDecision('completed', 'debating'),
      /Invalid state transition/
    );
  });

  test('phaseFromStatus maps correctly', () => {
    assert.equal(StateMachine.phaseFromStatus('completed'), 'completed');
    assert.equal(StateMachine.phaseFromStatus('debating'), 'debating');
    assert.equal(StateMachine.phaseFromStatus('draft'), 'draft');
  });
});

describe('StateMachine - Execution transitions', () => {
  test('allows pending -> running', () => {
    assert.equal(StateMachine.canTransitionExecution('pending', 'running').valid, true);
  });

  test('allows running -> completed', () => {
    assert.equal(StateMachine.canTransitionExecution('running', 'completed').valid, true);
  });

  test('allows running -> partial', () => {
    assert.equal(StateMachine.canTransitionExecution('running', 'partial').valid, true);
  });

  test('rejects completed -> running', () => {
    assert.equal(StateMachine.canTransitionExecution('completed', 'running').valid, false);
  });
});

describe('StateMachine - Task transitions', () => {
  test('allows pending -> ready', () => {
    assert.equal(StateMachine.canTransitionTask('pending', 'ready').valid, true);
  });

  test('allows ready -> running', () => {
    assert.equal(StateMachine.canTransitionTask('ready', 'running').valid, true);
  });

  test('allows running -> completed', () => {
    assert.equal(StateMachine.canTransitionTask('running', 'completed').valid, true);
  });

  test('allows failed -> ready (retry)', () => {
    assert.equal(StateMachine.canTransitionTask('failed', 'ready').valid, true);
  });

  test('rejects completed -> ready', () => {
    assert.equal(StateMachine.canTransitionTask('completed', 'ready').valid, false);
  });
});

describe('Token usage accounting', () => {
  test('recordUsage computes totalTokens and estimatedCost', () => {
    const usage = recordUsage({
      inputTokens: 1000,
      outputTokens: 500,
      model: 'gpt-4o',
      provider: 'openai',
    });
    assert.equal(usage.totalTokens, 1500);
    assert.ok(usage.estimatedCost > 0, 'estimated cost should be positive for known model');
    assert.equal(usage.provider, 'openai');
  });

  test('recordUsage returns zero cost for unknown model', () => {
    const usage = recordUsage({
      inputTokens: 100,
      outputTokens: 50,
      model: 'unknown-model-xyz',
      provider: 'custom',
    });
    assert.equal(usage.estimatedCost, 0);
    assert.equal(usage.totalTokens, 150);
  });

  test('aggregateUsage sums all records', () => {
    const records = [
      recordUsage({ inputTokens: 100, outputTokens: 100, model: 'a', provider: 'p' }),
      recordUsage({ inputTokens: 200, outputTokens: 200, model: 'a', provider: 'p' }),
    ];
    const total = aggregateUsage(records);
    assert.equal(total.inputTokens, 300);
    assert.equal(total.outputTokens, 300);
    assert.equal(total.totalTokens, 600);
  });

  test('usageSummary groups by model', () => {
    const records = [
      recordUsage({ inputTokens: 100, outputTokens: 100, model: 'gpt-4o', provider: 'openai' }),
      recordUsage({ inputTokens: 100, outputTokens: 100, model: 'gpt-4o', provider: 'openai' }),
      recordUsage({ inputTokens: 100, outputTokens: 100, model: 'claude', provider: 'anthropic' }),
    ];
    const summary = usageSummary(records);
    assert.equal(summary.totalCalls, 3);
    assert.equal(summary.byModel['gpt-4o'].totalTokens, 400);
    assert.equal(summary.byModel['claude'].totalTokens, 200);
  });
});

describe('parseModelResponse - structured result parsing', () => {
  test('parses valid JSON response', () => {
    const parsed = parseModelResponse(
      JSON.stringify({
        position: 'Use microservices',
        arguments: ['Scales well', 'Independent deploy'],
        risks: ['Complexity'],
        recommendation: 'Start with microservices',
      })
    );
    assert.equal(parsed.position, 'Use microservices');
    assert.equal(parsed.arguments.length, 2);
    assert.equal(parsed.recommendation, 'Start with microservices');
  });

  test('strips markdown code fences', () => {
    const parsed = parseModelResponse(
      '```json\n' +
        JSON.stringify({
          position: 'P1',
          arguments: ['A1'],
          risks: ['R1'],
          recommendation: 'Rec',
        }) +
        '\n```'
    );
    assert.equal(parsed.position, 'P1');
  });

  test('returns defaults on malformed output', () => {
    const parsed = parseModelResponse('this is not json');
    assert.equal(parsed.position, 'Analysis Provided');
  });

  test('uses defaults for missing fields', () => {
    const parsed = parseModelResponse('{}');
    assert.equal(parsed.position, 'Undecided');
  });
});

describe('A2A message parsing compatibility', () => {
  test('normalizeDebateRequest accepts run-debate', () => {
    const req = normalizeDebateRequest({
      skill: 'run-debate',
      objective: 'Should we go to market?',
      mode: 'consensus',
    });
    assert.ok(req, 'run-debate with objective should be valid');
  });

  test('normalizeDebateRequest rejects run-debate without objective', () => {
    assert.throws(() =>
      normalizeDebateRequest({ skill: 'run-debate', mode: 'consensus' })
    );
  });
});
