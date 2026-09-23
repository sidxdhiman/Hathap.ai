import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DecisionStreamMessage } from '../types';
import { useDecisionEventStream } from './useDecisionEventStream';

const fetchMock = vi.fn();

function sseResponse(frames: Array<{ event: string; data: string }>) {
  const text = frames.map((f) => `event: ${f.event}\ndata: ${f.data}\n\n`).join('');
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });
  return { ok: true, body: stream };
}

// Opens and sends its frame(s), then goes silent: further reads stay pending.
function silentAfterOpen(frame = 'event: stream.connected\ndata: {}\n\n') {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(frame));
    },
    pull() {
      return new Promise<void>(() => {});
    },
  });
}

// Emits frames at absolute fake-clock timestamps (measured from Date.now()).
function streamWithScheduledFrames(frames: Array<{ at: number; frame: string }>) {
  const encoder = new TextEncoder();
  let next = 0;
  let scheduled = false;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      return new Promise<void>((resolve) => {
        const tryEmit = () => {
          const frame = frames[next];
          if (!frame) return;
          if (Date.now() >= frame.at) {
            scheduled = false;
            controller.enqueue(encoder.encode(frame.frame));
            next += 1;
            resolve();
            return;
          }
          if (!scheduled) {
            scheduled = true;
            setTimeout(tryEmit, frame.at - Date.now());
          }
        };
        tryEmit();
      });
    },
  });
}

describe('useDecisionEventStream', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not attempt a connection when there is nothing to subscribe to', () => {
    const { result } = renderHook(() =>
      useDecisionEventStream({ id: 'd1', active: false, onEvent: vi.fn() })
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.status).toBe('stopped');

    const idle = renderHook(() =>
      useDecisionEventStream({ id: '', active: true, onEvent: vi.fn() })
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(idle.result.current.status).toBe('stopped');
  });

  it('connects with an auth header and forwards execution events once live', async () => {
    const onEvent = vi.fn();
    const onUpdate = vi.fn();
    localStorage.setItem('hathap_token', 'jwt-token');
    const message: DecisionStreamMessage = {
      _id: 'ev1',
      type: 'task.started',
      createdAt: '2026-01-01T00:00:00Z',
    };
    fetchMock.mockResolvedValue(
      sseResponse([
        { event: 'stream.connected', data: '{}' },
        { event: 'execution-event', data: JSON.stringify(message) },
      ])
    );
    const { result } = renderHook(() =>
      useDecisionEventStream({ id: 'd1', active: true, onEvent, onUpdate })
    );
    await waitFor(() => expect(result.current.status).toBe('live'));
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('/api/decisions/d1/events/stream');
    expect(init.headers).toMatchObject({
      Accept: 'text/event-stream',
      Authorization: 'Bearer jwt-token',
    });
    await waitFor(() => expect(onEvent).toHaveBeenCalledTimes(1));
    expect(onUpdate).toHaveBeenCalled();
    expect(onEvent.mock.calls[0][0]).toMatchObject({ type: 'task.started' });
  });

  it('degrades to polling after repeated connection failures', async () => {
    vi.useFakeTimers();
    try {
      const onUpdate = vi.fn();
      fetchMock.mockRejectedValue(new TypeError('network unreachable'));
      const { result } = renderHook(() =>
        useDecisionEventStream({ id: 'd1', active: true, onUpdate, pollIntervalMs: 3000 })
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(25000);
      });
      expect(result.current.mode).toBe('polling');
      expect(result.current.status).toBe('fallback');
      expect(result.current.attempts).toBeGreaterThan(0);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000);
      });
      expect(onUpdate).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('falls back to polling when no bytes arrive within the silence window', async () => {
    vi.useFakeTimers();
    try {
      const onUpdate = vi.fn();
      fetchMock.mockResolvedValue({ ok: true, body: silentAfterOpen() } as Response);
      const { result } = renderHook(() =>
        useDecisionEventStream({ id: 'd1', active: true, onUpdate, pollIntervalMs: 3000 })
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
        await Promise.resolve();
      });
      expect(result.current.status).toBe('live');

      await act(async () => {
        await vi.advanceTimersByTimeAsync(25000);
      });
      expect(result.current.mode).toBe('polling');
      expect(result.current.status).toBe('fallback');
      expect(fetchMock).toHaveBeenCalledTimes(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000);
      });
      expect(onUpdate).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('resets the silence watchdog on any received bytes', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(0);
      const onUpdate = vi.fn();
      fetchMock.mockResolvedValue({
        ok: true,
        body: streamWithScheduledFrames([
          { at: 0, frame: 'event: stream.connected\ndata: {}\n\n' },
          { at: 20000, frame: ': heartbeat\n\n' },
        ]),
      } as Response);
      const { result } = renderHook(() =>
        useDecisionEventStream({ id: 'd1', active: true, onUpdate, pollIntervalMs: 3000 })
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
        await Promise.resolve();
      });
      expect(result.current.status).toBe('live');

      // A heartbeat at t=20s restarts the 25s window, so a 43s-old stream
      // that keeps producing bytes is still healthy.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(43000);
      });
      expect(result.current.mode).toBe('sse');
      expect(result.current.status).toBe('live');
      expect(onUpdate).not.toHaveBeenCalled();

      // Only once 25s elapse since the *last* bytes do we degrade.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
      expect(result.current.mode).toBe('polling');
      expect(result.current.status).toBe('fallback');
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000);
      });
      expect(onUpdate).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('clears the watchdog and poll timers on unmount', async () => {
    vi.useFakeTimers();
    try {
      const onUpdate = vi.fn();
      fetchMock.mockResolvedValue({ ok: true, body: silentAfterOpen() } as Response);
      const { result, unmount } = renderHook(() =>
        useDecisionEventStream({ id: 'd1', active: true, onUpdate, pollIntervalMs: 3000 })
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
        await Promise.resolve();
      });
      expect(result.current.status).toBe('live');

      unmount();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(40000);
      });
      expect(result.current.mode).toBe('sse');
      expect(result.current.status).toBe('live');
      expect(onUpdate).not.toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('resets timers and state when the stream becomes inactive', async () => {
    vi.useFakeTimers();
    try {
      const onUpdate = vi.fn();
      fetchMock.mockResolvedValue({ ok: true, body: silentAfterOpen() } as Response);
      const props = { id: 'd1', active: true as boolean, onUpdate, pollIntervalMs: 3000 };
      const { result, rerender } = renderHook(
        (p: typeof props) => useDecisionEventStream(p),
        { initialProps: props }
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
        await Promise.resolve();
      });
      expect(result.current.status).toBe('live');

      rerender({ ...props, active: false });
      expect(result.current.mode).toBe('sse');
      expect(result.current.status).toBe('stopped');
      await act(async () => {
        await vi.advanceTimersByTimeAsync(40000);
      });
      expect(result.current.mode).toBe('sse');
      expect(result.current.status).toBe('stopped');
      expect(onUpdate).not.toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});