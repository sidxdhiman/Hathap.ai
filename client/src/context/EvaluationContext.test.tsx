import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EvaluationProvider, useEvaluation } from './EvaluationContext';

const fetchMock = vi.fn();

const jsonResponse = (body: unknown, ok = true, status = 200) =>
  Promise.resolve({ ok, status, json: () => Promise.resolve(body) } as Response);

const emptyResource = () => jsonResponse([]);

const activeRun = { id: 'r1', name: 'Sprint 3', status: 'running' };

const wrapper = ({ children }: { children: ReactNode }) => (
  <EvaluationProvider>{children}</EvaluationProvider>
);

const flushAsync = async () => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();
  });
};

const runsCallCount = () =>
  fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/runs')).length;

describe('EvaluationProvider polling', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('does not poll while loading or when no run is active', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation((url: unknown) =>
      String(url).endsWith('/runs') ? jsonResponse([]) : emptyResource()
    );
    const { result } = renderHook(() => useEvaluation(), { wrapper });

    await flushAsync();
    expect(result.current.isLoading).toBe(false);
    expect(runsCallCount()).toBe(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20000);
    });
    expect(runsCallCount()).toBe(1);
  });

  it('polls every 5s while a run is active and stops once it completes', async () => {
    vi.useFakeTimers();
    let runsCalls = 0;
    fetchMock.mockImplementation((url: unknown) => {
      const u = String(url);
      if (u.endsWith('/runs')) {
        runsCalls += 1;
        return jsonResponse(
          runsCalls === 1 ? [activeRun] : [{ ...activeRun, status: 'completed' }]
        );
      }
      return emptyResource();
    });
    const { result } = renderHook(() => useEvaluation(), { wrapper });

    await flushAsync();
    expect(runsCalls).toBe(1);
    expect(result.current.runs[0].status).toBe('running');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(runsCalls).toBe(2);
    expect(result.current.runs[0].status).toBe('completed');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });
    expect(runsCalls).toBe(2);
  });

  it('keeps polling and preserves state when a poll request fails', async () => {
    vi.useFakeTimers();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      let runsCalls = 0;
      fetchMock.mockImplementation((url: unknown) => {
        const u = String(url);
        if (u.endsWith('/runs')) {
          runsCalls += 1;
          if (runsCalls === 1) return jsonResponse([activeRun]);
          return Promise.reject(new TypeError('network gone'));
        }
        return emptyResource();
      });
      const { result } = renderHook(() => useEvaluation(), { wrapper });

      await flushAsync();
      expect(result.current.isLoading).toBe(false);
      expect(result.current.runs[0].status).toBe('running');

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(errorSpy).toHaveBeenCalled();
      expect(result.current.runs[0].status).toBe('running');

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(runsCalls).toBe(3);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('clears the poll timer on unmount', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation((url: unknown) =>
      String(url).endsWith('/runs') ? jsonResponse([activeRun]) : emptyResource()
    );
    const { result, unmount } = renderHook(() => useEvaluation(), { wrapper });

    await flushAsync();
    expect(result.current.runs[0].status).toBe('running');

    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });
    expect(runsCallCount()).toBe(1);
  });
});