import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Execution } from '../../types';
import { CostPanel } from './CostPanel';

function execution(
  partial: Partial<Execution> & Pick<Execution, 'id'>
): Execution {
  return {
    decisionId: 'd1',
    status: 'completed',
    progress: 100,
    retryCount: 0,
    maxRetries: 0,
    tokenUsage: {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      estimatedCost: 0,
      model: '',
      provider: '',
    },
    estimatedCost: 0,
    actualCost: 0,
    ...partial,
  };
}

describe('CostPanel', () => {
  it('aggregates token usage, call counts, estimated cost, and latency across executions', () => {
    render(
      <CostPanel
        executions={[
          execution({
            id: 'e1',
            estimatedCost: 0.5,
            tokenUsage: {
              inputTokens: 100,
              outputTokens: 50,
              totalTokens: 150,
              estimatedCost: 0.5,
              model: 'gpt-4o',
              provider: 'OpenAI',
              latencyMs: 250,
            },
          }),
          execution({
            id: 'e2',
            estimatedCost: 1.2,
            tokenUsage: { inputTokens: 200, outputTokens: 100, totalTokens: 300, estimatedCost: 1.2, model: '', provider: '', latencyMs: 150 },
          }),
          execution({ id: 'e3' }),
        ]}
      />
    );
    expect(screen.getByText('450')).toBeInTheDocument();
    expect(screen.getByText('300')).toBeInTheDocument();
    expect(screen.getByText('150')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('$1.7000')).toBeInTheDocument();
    expect(screen.getByText('200ms')).toBeInTheDocument();
  });

  it('shows provider-reported actual cost when present and placeholders otherwise', () => {
    const { unmount } = render(
      <CostPanel
        executions={[
          execution({ id: 'e1', actualCost: 0.75 }),
        ]}
      />
    );
    expect(screen.getByText('$0.7500')).toBeInTheDocument();
    expect(screen.getByText('Actual cost')).toBeInTheDocument();
    unmount();

    render(<CostPanel executions={[execution({ id: 'e2', actualCost: 0 })]} />);
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    expect(screen.getByText('Actual cost unavailable')).toBeInTheDocument();
  });

  it('shows loading and empty states', () => {
    const { unmount } = render(<CostPanel executions={[]} loading />);
    expect(screen.getByText('Loading usage data…')).toBeInTheDocument();
    unmount();

    render(<CostPanel executions={[]} />);
    expect(screen.getByText('No execution data available.')).toBeInTheDocument();
  });
});