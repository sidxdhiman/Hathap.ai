import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { DecisionEvent } from '../../types';
import { EventStream } from './EventStream';

function event(
  partial: Partial<DecisionEvent> & Pick<DecisionEvent, '_id' | 'type'>
): DecisionEvent {
  return { createdAt: '2026-01-01T00:00:00Z', ...partial };
}

describe('EventStream', () => {
  it('renders known event labels and the event-count badge', () => {
    render(
      <EventStream
        events={[
          event({ _id: 'e1', type: 'execution.started', createdAt: '2026-01-01T00:00:00Z' }),
          event({ _id: 'e2', type: 'task.failed', createdAt: '2026-01-01T00:01:00Z' }),
        ]}
      />
    );
    expect(screen.getByText('Event Stream')).toBeInTheDocument();
    expect(screen.getByText('2 events')).toBeInTheDocument();
    expect(screen.getByText('Execution started')).toBeInTheDocument();
    expect(screen.getByText('Task failed')).toBeInTheDocument();
  });

  it('sorts events chronologically regardless of input order', () => {
    render(
      <EventStream
        events={[
          event({ _id: 'e2', type: 'planning.completed', createdAt: '2026-01-01T00:02:00Z' }),
          event({ _id: 'e1', type: 'planning.started', createdAt: '2026-01-01T00:01:00Z' }),
        ]}
      />
    );
    const started = screen.getByText('Planning started');
    const completed = screen.getByText('Planning completed');
    expect(started.compareDocumentPosition(completed) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('filters to error events and reports when nothing matches', () => {
    const { unmount } = render(
      <EventStream
        events={[
          event({ _id: 'e1', type: 'execution.started', createdAt: '2026-01-01T00:00:00Z' }),
          event({ _id: 'e2', type: 'task.failed', createdAt: '2026-01-01T00:01:00Z' }),
        ]}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Errors' }));
    expect(screen.queryByText('Execution started')).not.toBeInTheDocument();
    expect(screen.getByText('Task failed')).toBeInTheDocument();
    unmount();

    render(
      <EventStream
        events={[event({ _id: 'e3', type: 'execution.started', createdAt: '2026-01-01T00:00:00Z' })]}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Red Team' }));
    expect(screen.getByText('No events match this filter.')).toBeInTheDocument();
  });
});