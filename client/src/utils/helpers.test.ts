import { describe, expect, it } from 'vitest';
import type { AgentTemplate, Model, Participant } from '../types';
import {
  formatDate,
  getParticipantInfo,
  getParticipantName,
  getStatusColor,
  getStatusText,
} from './helpers';

const models: Model[] = [
  {
    id: 'm1',
    provider: 'OpenAI',
    displayName: 'GPT-4o',
    modelName: 'gpt-4o',
    apiKey: '',
    baseUrl: '',
    status: 'connected',
    enabled: true,
  },
];

const agents: AgentTemplate[] = [
  {
    id: 'a1',
    name: 'Devil Advocate',
    description: '',
    systemPrompt: '',
    assignedModelId: 'm1',
    avatar: '😈',
    colorTag: 'red',
    createdAt: new Date('2026-01-01T00:00:00Z'),
  },
];

function makeParticipant(overrides: Partial<Participant>): Participant {
  return { id: 'p1', courtroomId: 'c1', type: 'agent', ...overrides };
}

describe('helpers', () => {
  it('getParticipantName resolves model participants by displayName', () => {
    const participant = makeParticipant({ type: 'model', modelId: 'm1' });
    expect(getParticipantName(participant, models, agents)).toBe('GPT-4o');
  });

  it('getParticipantName resolves agent participants by name', () => {
    const participant = makeParticipant({ type: 'agent', agentId: 'a1' });
    expect(getParticipantName(participant, models, agents)).toBe('Devil Advocate');
  });

  it('getParticipantName falls back to the Unknown labels for missing references', () => {
    const missingModel = makeParticipant({ type: 'model', modelId: 'nope' });
    const missingAgent = makeParticipant({ type: 'agent', agentId: 'nope' });
    expect(getParticipantName(missingModel, models, agents)).toBe('Unknown Model');
    expect(getParticipantName(missingAgent, models, agents)).toBe('Unknown Agent');
  });

  it('getParticipantInfo describes model and agent participants', () => {
    const asModel = makeParticipant({ type: 'model', modelId: 'm1' });
    const asAgent = makeParticipant({ type: 'agent', agentId: 'a1' });
    expect(getParticipantInfo(asModel, models, agents)).toMatchObject({
      name: 'GPT-4o',
      avatar: '🤖',
    });
    expect(getParticipantInfo(asAgent, models, agents)).toMatchObject({
      name: 'Devil Advocate',
      avatar: '😈',
    });
  });

  it('getStatusColor maps known statuses to the expected palette', () => {
    expect(getStatusColor('connected')).toBe('bg-green-500/20');
    expect(getStatusColor('error')).toBe('bg-red-500/20');
    expect(getStatusColor('draft')).toBe('bg-yellow-500/20');
    expect(getStatusColor('anything-else')).toBe('bg-blue-500/20');
  });

  it('getStatusText maps the same statuses to the text palette', () => {
    expect(getStatusText('completed')).toBe('text-green-400');
    expect(getStatusText('error')).toBe('text-red-400');
    expect(getStatusText('untested')).toBe('text-yellow-400');
    expect(getStatusText('unknown')).toBe('text-blue-400');
  });

  it('formatDate renders a stable en-US date string', () => {
    expect(formatDate(new Date(2026, 8, 22))).toBe('Sep 22, 2026');
  });
});