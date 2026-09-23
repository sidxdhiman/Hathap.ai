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
});