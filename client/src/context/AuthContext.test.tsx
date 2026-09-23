import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from './AuthContext';

const fetchMock = vi.fn();

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body };
}

describe('AuthProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('restores an existing session from localStorage', () => {
    localStorage.setItem('hathap_token', 'jwt-token');
    localStorage.setItem(
      'hathap_user',
      JSON.stringify({ id: 'u1', email: 'ada@example.com', name: 'Ada' })
    );
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    expect(result.current.token).toBe('jwt-token');
    expect(result.current.user).toEqual({ id: 'u1', email: 'ada@example.com', name: 'Ada' });
  });

  it('logs in by posting credentials and stores the returned session', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ token: 'fresh-token', user: { id: 'u2', email: 'a@b.com', name: 'A' } })
    );
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await act(async () => {
      await result.current.login('a@b.com', 'secret');
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/auth/login');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ email: 'a@b.com', password: 'secret' });
    expect(result.current.token).toBe('fresh-token');
    expect(result.current.user?.name).toBe('A');
    expect(localStorage.getItem('hathap_token')).toBe('fresh-token');
  });

  it('rejects with an error message and keeps the session empty when login fails', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'bad credentials' }, false));
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    let error: unknown;
    await act(async () => {
      try {
        await result.current.login('a@b.com', 'wrong');
      } catch (err) {
        error = err;
      }
    });
    expect((error as Error).message).toBe('Invalid credentials');
    expect(result.current.token).toBeNull();
    expect(result.current.user).toBeNull();
  });

  it('signs up by posting name, email, and password to the signup endpoint', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ token: 'signed-up', user: { id: 'u3', email: 'new@b.com', name: 'New' } })
    );
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await act(async () => {
      await result.current.signup('New', 'new@b.com', 'pw');
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/auth/signup');
    expect(JSON.parse(String(init.body))).toEqual({ name: 'New', email: 'new@b.com', password: 'pw' });
    expect(result.current.token).toBe('signed-up');
  });

  it('logs out by clearing the session and persisted storage', () => {
    localStorage.setItem('hathap_token', 'jwt-token');
    localStorage.setItem('hathap_user', '{"id":"u1","email":"a@b.com","name":"Ada"}');
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    act(() => result.current.logout());
    expect(result.current.token).toBeNull();
    expect(result.current.user).toBeNull();
    expect(localStorage.getItem('hathap_token')).toBeNull();
    expect(localStorage.getItem('hathap_user')).toBeNull();
  });
});