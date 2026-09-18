import { useCallback, useEffect, useRef, useState } from 'react';
import { DecisionStreamMessage, StreamMode, StreamStatus } from '../types';

export type { StreamMode, StreamStatus };

interface Options {
  /** Decision id to subscribe to. */
  id?: string;
  /** When false (terminal decision, unmounted view) nothing runs. */
  active: boolean;
  /** Called for each live `execution-event`. */
  onEvent?: (event: DecisionStreamMessage) => void;
  /** Called when new data likely arrived (SSE event or poll tick). */
  onUpdate?: () => void;
  /** Poll interval used when SSE is unavailable/degraded. */
  pollIntervalMs?: number;
}

const MAX_RECONNECT_ATTEMPTS = 5;
const BASE_RECONNECT_DELAY_MS = 800;
const SILENCE_TIMEOUT_MS = 25000; // server heartbeats every 15s

/**
 * Live execution event subscription for a decision.
 *
 * Uses fetch-based Server-Sent Events (so the JWT goes in the Authorization
 * header, never the URL), with:
 *   - automatic reconnection with backoff and Last-Event-ID resume,
 *   - a silence watchdog: if the connection produces no bytes for 25s it is
 *     treated as degraded and we fall back to polling (e.g. behind proxies
 *     without streaming support),
 *   - full cleanup on unmount / inactive / route change.
 */
export function useDecisionEventStream({
  id,
  active,
  onEvent,
  onUpdate,
  pollIntervalMs = 3000,
}: Options): { mode: StreamMode; status: StreamStatus; attempts: number } {
  const [mode, setMode] = useState<StreamMode>('sse');
  const [status, setStatus] = useState<StreamStatus>('stopped');
  const [attempts, setAttempts] = useState(0);

  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  const abortRef = useRef<AbortController | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectCountRef = useRef(0);
  const lastEventIdRef = useRef('');
  const degradedRef = useRef(false);
  const startedRef = useRef(false);

  const clearStreamTimers = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    setMode('polling');
    setStatus('fallback');
    if (!pollTimerRef.current) {
      pollTimerRef.current = setInterval(() => onUpdateRef.current?.(), pollIntervalMs);
    }
  }, [pollIntervalMs]);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    // Effect teardown handles unmount.
    if (!id || !active) {
      abortRef.current?.abort();
      abortRef.current = null;
      clearStreamTimers();
      stopPolling();
      degradedRef.current = false;
      reconnectCountRef.current = 0;
      lastEventIdRef.current = '';
      startedRef.current = false;
      setMode('sse');
      setStatus('stopped');
      return;
    }

    if (degradedRef.current) {
      startPolling();
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    startedRef.current = true;

    const parseFrame = (frame: string) => {
      let eventName = '';
      let data = '';
      let eventId = '';
      for (const line of frame.split('\n')) {
        if (line.startsWith('event:')) eventName = line.slice(6).trim();
        else if (line.startsWith('id:')) eventId = line.slice(3).trim();
        else if (line.startsWith('data:')) data += (data ? '\n' : '') + line.slice(5).trim();
      }
      // Comment/keepalive frames carry no event name — their bytes already
      // refreshed the silence watchdog, so nothing to do here.
      if (!eventName && !data) return;
      if (eventId) lastEventIdRef.current = eventId;
      if (eventName === 'stream.connected') {
        reconnectCountRef.current = 0;
        setAttempts(0);
        setStatus('live');
        return;
      }
      if (eventName === 'execution-event' && data) {
        try {
          onEventRef.current?.(JSON.parse(data) as DecisionStreamMessage);
        } catch {
          /* ignore malformed frame */
        }
        onUpdateRef.current?.();
      }
    };

    let activeEffect = true;

    const scheduleReconnect = () => {
      if (!activeEffect) return;
      reconnectCountRef.current += 1;
      setAttempts(reconnectCountRef.current);
      if (reconnectCountRef.current > MAX_RECONNECT_ATTEMPTS) {
        degradedRef.current = true;
        startPolling();
        return;
      }
      const delay = Math.min(
        BASE_RECONNECT_DELAY_MS * 2 ** (reconnectCountRef.current - 1),
        10000
      );
      reconnectTimerRef.current = setTimeout(() => {
        if (!activeEffect || degradedRef.current) return;
        connect();
      }, delay);
    };

    const connect = async () => {
      if (!activeEffect || degradedRef.current) return;
      setStatus('connecting');
      const API = (import.meta.env.VITE_API_URL as string) || '';
      const token = localStorage.getItem('hathap_token');
      const headers: Record<string, string> = { Accept: 'text/event-stream' };
      if (token) headers.Authorization = `Bearer ${token}`;
      if (lastEventIdRef.current) headers['Last-Event-ID'] = lastEventIdRef.current;

      let res: Response;
      try {
        res = await fetch(`${API}/api/decisions/${id}/events/stream`, {
          headers,
          signal: controller.signal,
        });
      } catch (err) {
        if (controller.signal.aborted || !activeEffect) return;
        scheduleReconnect();
        return;
      }
      if (!res.ok || !res.body) {
        if (controller.signal.aborted || !activeEffect) return;
        scheduleReconnect();
        return;
      }

      const resetSilence = () => {
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = setTimeout(() => {
          // No bytes for a long stretch — stream is degraded; fall back to
          // polling rather than pretending the connection is live.
          if (!activeEffect) return;
          degradedRef.current = true;
          controller.abort();
          startPolling();
        }, SILENCE_TIMEOUT_MS);
      };
      // The silence window starts once the stream opens.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let raw = '';
      setStatus('connecting');
      resetSilence();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          resetSilence();
          raw += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
          const frames = raw.split('\n\n');
          raw = frames.pop() ?? '';
          for (const frame of frames) parseFrame(frame);
        }
      } catch (err) {
        // Aborted (teardown or silence fallback) or transient read error.
        if (controller.signal.aborted || !activeEffect) return;
      }
      if (activeEffect && !controller.signal.aborted && !degradedRef.current) {
        // Stream ended without an abort → server closed it; reconnect.
        scheduleReconnect();
      }
    };

    void connect();

    return () => {
      activeEffect = false;
      controller.abort();
      clearStreamTimers();
      stopPolling();
    };
  }, [id, active, clearStreamTimers, startPolling, stopPolling]);

  return { mode, status, attempts };
}