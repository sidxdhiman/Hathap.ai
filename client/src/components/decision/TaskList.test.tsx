import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Task } from '../../types';
import { TaskList } from './TaskList';

function task(
  partial: Partial<Task> & Pick<Task, 'id' | 'type' | 'status' | 'priority'>
): Task {
  return { executionId: 'ex1', dependencies: [], ...partial };
}

describe('TaskList', () => {
  it('shows an empty state before any tasks exist', () => {
    render(<TaskList tasks={[]} />);
    expect(screen.getByText('No tasks recorded yet.')).toBeInTheDocument();
  });

  it('lists tasks sorted by status then priority and shows the total', () => {
    render(
      <TaskList
        tasks={[
          task({ id: 't1', type: 'research', status: 'completed', priority: 1 }),
          task({ id: 't2', type: 'debate', status: 'running', priority: 5 }),
          task({ id: 't3', type: 'analysis', status: 'pending', priority: 2 }),
        ]}
      />
    );
    expect(screen.getByText('3 total')).toBeInTheDocument();
    const statuses = ['running', 'pending', 'completed'].map((s) => screen.getByText(s));
    const [running, pending, completed] = statuses;
    expect(running.compareDocumentPosition(pending) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(pending.compareDocumentPosition(completed) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('renders routing selections, fallback markers, and dependency hints', () => {
    render(
      <TaskList
        tasks={[
          task({
            id: 't1',
            type: 'verify_claim',
            status: 'completed',
            priority: 1,
            dependencies: ['dep-a'],
            startedAt: new Date('2026-01-01T00:00:00Z'),
            completedAt: new Date('2026-01-01T00:00:30Z'),
            metadata: {
              routing: {
                mode: 'auto',
                selection: {
                  status: 'selected',
                  policyVersion: 'v1',
                  mode: 'auto',
                  agent: { id: 'ag1', name: 'Researcher', capabilities: [] },
                  model: {
                    id: 'm1',
                    modelName: 'gpt-4o',
                    provider: 'OpenAI',
                    displayName: 'GPT-4o',
                    status: 'connected',
                  },
                  score: { total: 0, factors: [], diversityBonus: 0 },
                  reasons: [],
                  candidateCount: 1,
                  capabilityGateRelaxed: false,
                  fallbackUsed: true,
                  fallbackFrom: { modelId: 'm0', provider: 'OpenAI' },
                  estimate: {
                    estimatedInputTokens: 0,
                    estimatedOutputTokens: 0,
                    estimatedCost: 0,
                    pricingKnown: true,
                  },
                  routedAt: new Date('2026-01-01T00:00:00Z'),
                },
              },
            },
          }),
        ]}
      />
    );
    expect(screen.getByText('Researcher')).toBeInTheDocument();
    expect(screen.getByText('fallback')).toBeInTheDocument();
    expect(screen.getByText('after 1')).toBeInTheDocument();
    expect(screen.getByText('30.0s')).toBeInTheDocument();
  });
});