import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProvider, useApp } from './AppContext';

const fetchMock = vi.fn();

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body };
}

function mockCollections(models: unknown[], agents: unknown[], courtrooms: unknown[]) {
  fetchMock.mockImplementation((url: string) => {
    if (url.endsWith('/api/models')) return Promise.resolve(jsonResponse(models));
    if (url.endsWith('/api/agents')) return Promise.resolve(jsonResponse(agents));
    if (url.endsWith('/api/courtrooms')) return Promise.resolve(jsonResponse(courtrooms));
    return Promise.resolve(jsonResponse({}));
  });
}

const baseModel = {
  provider: 'OpenAI',
  displayName: 'GPT-4o',
  modelName: 'gpt-4o',
  baseUrl: '',
  status: 'connected',
  enabled: true,
};

describe('AppProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads models, agents, and courtrooms on mount and maps Mongo _id to id', async () => {
    mockCollections(
      [{ _id: 'm1', ...baseModel, apiKey: 'sk-test' }],
      [{ _id: 'a1', name: 'Devil Advocate' }],
      [{ _id: 'c1', name: 'Office Hours' }]
    );
    const { result } = renderHook(() => useApp(), { wrapper: AppProvider });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.models).toMatchObject([{ id: 'm1', apiKey: 'sk-test', hasApiKey: true }]);
    expect(result.current.agentTemplates[0].id).toBe('a1');
    expect(result.current.courtrooms[0].id).toBe('c1');
  });

  it('flags onboarding only until a model has an API key configured', async () => {
    mockCollections([{ _id: 'm1', ...baseModel, apiKey: '' }], [], []);
    const first = renderHook(() => useApp(), { wrapper: AppProvider });
    await waitFor(() => expect(first.result.current.isLoading).toBe(false));
    expect(first.result.current.needsOnboarding).toBe(true);
    first.unmount();

    mockCollections([{ _id: 'm2', ...baseModel, apiKey: 'sk-live' }], [], []);
    const second = renderHook(() => useApp(), { wrapper: AppProvider });
    await waitFor(() => expect(second.result.current.isLoading).toBe(false));
    expect(second.result.current.needsOnboarding).toBe(false);
  });

  it('sends the bearer header and surfaces server errors when adding a model fails', async () => {
    localStorage.setItem('hathap_token', 'jwt-123');
    mockCollections([], [], []);
    fetchMock.mockResolvedValue(jsonResponse({ error: 'Duplicate model name' }, false));
    const { result } = renderHook(() => useApp(), { wrapper: AppProvider });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await expect(
      result.current.addModel({ ...baseModel, apiKey: 'sk-test' })
    ).rejects.toThrow('Duplicate model name');
    const [url, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
    expect(String(url)).toBe('/api/models');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer jwt-123' });
  });

  it('adds toasts and removes them on dismiss or after the timeout', async () => {
    mockCollections([], [], []);
    const { result } = renderHook(() => useApp(), { wrapper: AppProvider });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.showToast('error', 'Something broke'));
    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0]).toMatchObject({ variant: 'error', message: 'Something broke' });

    act(() => result.current.dismissToast(result.current.toasts[0].id));
    expect(result.current.toasts).toHaveLength(0);

    vi.useFakeTimers();
    try {
      act(() => result.current.showToast('info', 'Auto-dismiss me'));
      expect(result.current.toasts).toHaveLength(1);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(4001);
      });
    } finally {
      vi.useRealTimers();
    }
    expect(result.current.toasts).toHaveLength(0);
  });
});