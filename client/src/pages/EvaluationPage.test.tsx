import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AggregateRunScore, EvaluationCaseResult, EvaluationRun } from '../types';

const mocks = vi.hoisted(() => ({
  getRunResults: vi.fn(),
  getRunAggregate: vi.fn(),
  startRun: vi.fn(),
  cancelRun: vi.fn(),
  deleteRun: vi.fn(),
  createBaseline: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock('../context/EvaluationContext', () => ({
  useEvaluation: () => ({
    getRunResults: mocks.getRunResults,
    getRunAggregate: mocks.getRunAggregate,
    startRun: mocks.startRun,
    cancelRun: mocks.cancelRun,
    deleteRun: mocks.deleteRun,
    createBaseline: mocks.createBaseline,
  }),
}));

vi.mock('../context/AppContext', () => ({
  useApp: () => ({ showToast: mocks.showToast }),
}));

import { RunRow } from './EvaluationPage';

function makeRun(overrides: Partial<EvaluationRun>): EvaluationRun {
  return {
    id: 'run-1',
    name: 'My Run',
    status: 'draft',
    kind: 'standard',
    progress: { total: 1, completed: 0, error: 0, skipped: 0, running: 0 },
    benchmarkTitle: 'Bench',
    systemUnderTest: { kind: 'decision-engine', label: 'Engine' },
    ...overrides,
  } as EvaluationRun;
}

const errorResult = {
  id: 'c1',
  caseId: 'c1',
  caseTitle: 'Case A',
  status: 'error',
  error: { message: 'Decision execution failed: No models configured or enabled.' },
} as EvaluationCaseResult;

const aggregate = { score: 0 } as AggregateRunScore;

describe('Evaluation RunRow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads and shows per-case error reasons for a failed run', async () => {
    mocks.getRunResults.mockResolvedValue([errorResult]);
    mocks.getRunAggregate.mockResolvedValue(aggregate);

    render(<RunRow run={makeRun({ status: 'failed' })} />);
    fireEvent.click(screen.getByRole('button', { name: /My Run/ }));

    // The failure reason must be surfaced, not hidden behind a generic message.
    expect(
      await screen.findByText(/No models configured or enabled/)
    ).toBeInTheDocument();
    expect(mocks.getRunResults).toHaveBeenCalledWith('run-1');
    expect(screen.queryByText(/No results were recorded for this run/)).not.toBeInTheDocument();
  });

  it('offers a working Start run control for draft runs', async () => {
    mocks.startRun.mockResolvedValue(makeRun({ status: 'queued' }));

    render(<RunRow run={makeRun({ status: 'draft' })} />);
    fireEvent.click(screen.getByRole('button', { name: /My Run/ }));

    const start = screen.getByRole('button', { name: /Start run/ });
    expect(start).toBeEnabled();
    fireEvent.click(start);

    await waitFor(() => expect(mocks.startRun).toHaveBeenCalledWith('run-1'));
  });

  it('loads results when a run reaches a terminal state after being expanded', async () => {
    mocks.getRunResults.mockResolvedValue([errorResult]);
    mocks.getRunAggregate.mockResolvedValue(aggregate);

    const { rerender } = render(<RunRow run={makeRun({ status: 'running' })} />);
    fireEvent.click(screen.getByRole('button', { name: /My Run/ }));

    // Nothing to load while the run is still in progress.
    expect(mocks.getRunResults).not.toHaveBeenCalled();

    rerender(<RunRow run={makeRun({ status: 'completed' })} />);

    expect(await screen.findByText('Case A')).toBeInTheDocument();
    expect(mocks.getRunResults).toHaveBeenCalledWith('run-1');
  });
});
