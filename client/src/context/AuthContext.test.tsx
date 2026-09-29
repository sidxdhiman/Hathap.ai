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
    expect((error as Error).message).toBe('bad credentials');
    expect(result.current.token).toBeNull();
    expect(result.current.user).toBeNull();
  });

  it('surfaces the server error message when login fails without an error body', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, false));
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
  });

  it('surfaces the server error message when signup fails', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'User exists' }, false));
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    let error: unknown;
    await act(async () => {
      try {
        await result.current.signup('New', 'new@b.com', 'pw');
      } catch (err) {
        error = err;
      }
    });
    expect((error as Error).message).toBe('User exists');
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

  it('logs out by clearing the session and persisted storage', async () => {
    localStorage.setItem('hathap_token', 'jwt-token');
    localStorage.setItem('hathap_user', '{"id":"u1","email":"a@b.com","name":"Ada"}');
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await act(async () => {
      await result.current.logout();
    });
    expect(result.current.token).toBeNull();
    expect(result.current.user).toBeNull();
    expect(localStorage.getItem('hathap_token')).toBeNull();
    expect(localStorage.getItem('hathap_user')).toBeNull();
  });

  it('tells the server to invalidate the session on logout', async () => {
    localStorage.setItem('hathap_token', 'jwt-token');
    localStorage.setItem('hathap_user', '{"id":"u1","email":"a@b.com","name":"Ada"}');
    fetchMock.mockResolvedValue(jsonResponse({ success: true }));
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    await act(async () => {
      await result.current.logout();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/auth/logout');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ Authorization: 'Bearer jwt-token' });
  });

  it('still signs out locally when the logout request fails', async () => {
    localStorage.setItem('hathap_token', 'jwt-token');
    localStorage.setItem('hathap_user', '{"id":"u1","email":"a@b.com","name":"Ada"}');
    fetchMock.mockRejectedValue(new Error('network down'));
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    await act(async () => {
      await expect(result.current.logout()).resolves.toBeUndefined();
    });

    expect(result.current.token).toBeNull();
    expect(localStorage.getItem('hathap_token')).toBeNull();
  });

  it('does not call the server when logging out without a token', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await act(async () => {
      await result.current.logout();
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('adopts the replacement credential returned by a password change', async () => {
    localStorage.setItem('hathap_token', 'old-token');
    localStorage.setItem('hathap_user', '{"id":"u1","email":"a@b.com","name":"Ada"}');
    // The server invalidates the old credential and returns a fresh one, so the
    // device that changed the password stays signed in.
    fetchMock.mockResolvedValue(jsonResponse({ success: true, token: 'replacement-token' }));
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    await act(async () => {
      await result.current.changePassword('old-password', 'new-password');
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/auth/change-password');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer old-token' });
    expect(result.current.token).toBe('replacement-token');
    expect(localStorage.getItem('hathap_token')).toBe('replacement-token');
  });

  it('keeps the current credential when a password change fails', async () => {
    localStorage.setItem('hathap_token', 'old-token');
    fetchMock.mockResolvedValue(jsonResponse({ error: 'Current password is incorrect.' }, false));
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    await act(async () => {
      await expect(
        result.current.changePassword('wrong', 'new-password')
      ).rejects.toThrow('Current password is incorrect.');
    });

    expect(result.current.token).toBe('old-token');
  });

  it('clears the session after account deletion without calling logout', async () => {
    localStorage.setItem('hathap_token', 'old-token');
    localStorage.setItem('hathap_user', '{"id":"u1","email":"a@b.com","name":"Ada"}');
    fetchMock.mockResolvedValue(jsonResponse({ success: true }));
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    await act(async () => {
      await result.current.deleteAccount();
    });

    expect(result.current.token).toBeNull();
    expect(result.current.user).toBeNull();
    expect(localStorage.getItem('hathap_token')).toBeNull();
    // One request only: the account is gone, so there is no session left to
    // invalidate server-side.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/auth/account');
  });
});