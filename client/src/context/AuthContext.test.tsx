import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from './AuthContext';

const fetchMock = vi.fn();

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body };
}

function httpResponse(body: unknown, status: number) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

const storedProfile = { id: 'u1', email: 'ada@example.com', name: 'Ada' };

/** Counts requests made to a given endpoint. */
const callsTo = (suffix: string) =>
  fetchMock.mock.calls.filter(([url]) => String(url).endsWith(suffix)).length;

/**
 * Routes `GET /api/auth/me` to a successful validation and everything else to an
 * empty 200, so a test about some other flow does not have to think about
 * startup validation. Tests that are specifically about validation override this.
 */
function mockDefault(meResponse: unknown = storedProfile) {
  fetchMock.mockImplementation((input: any) => {
    const url = String(input);
    if (url.endsWith('/api/auth/me')) return Promise.resolve(jsonResponse(meResponse));
    return Promise.resolve(jsonResponse({}));
  });
}

/** Seeds storage as a returning visitor with a credential. */
function seedStoredSession(token = 'jwt-token') {
  localStorage.setItem('hathap_token', token);
  localStorage.setItem('hathap_user', JSON.stringify(storedProfile));
}

/**
 * Waits for startup validation to finish, then forgets its requests.
 *
 * Startup validation is a network request, so a test that wants to assert on a
 * *second* request has to let the first settle — and then get it out of the way,
 * so the assertion about "this flow made exactly one request" is still literally
 * that. Call history is reset rather than the assertion rewritten.
 *
 * The validation requests themselves are returned, captured before the reset,
 * because they are exactly what a test about validation needs to assert on.
 */
async function settle(result: { current: { sessionCheck: string } }) {
  await waitFor(() => expect(result.current.sessionCheck).not.toBe('pending'));
  const validationCalls = fetchMock.mock.calls.filter(([url]) =>
    String(url).endsWith('/api/auth/me')
  );
  fetchMock.mockClear();
  return validationCalls;
}

describe('AuthProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    mockDefault();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('startup session validation', () => {
    it('is anonymous without any validation request when no credential is stored', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

      expect(result.current.status).toBe('anonymous');
      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.token).toBeNull();
      expect(result.current.user).toBeNull();
      expect(result.current.sessionCheck).toBe('idle');

      // Nothing to verify means nothing to ask. A request here would be pure
      // overhead on every anonymous page view.
      await act(async () => {
        await Promise.resolve();
      });
      expect(callsTo('/api/auth/me')).toBe(0);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('does not claim authentication while a stored credential is still unverified', () => {
      seedStoredSession();
      const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

      // Presence of a token is not evidence that it works. The router gets an
      // explicit pending state so it waits instead of rendering the app shell
      // for a credential that may already be dead.
      expect(result.current.status).toBe('loading');
      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.sessionCheck).toBe('pending');
      // The credential itself is still known, so a request issued during
      // validation carries it rather than appearing unauthenticated.
      expect(result.current.token).toBe('jwt-token');
    });

    it('validates a stored credential once and becomes authenticated when the server accepts it', async () => {
      seedStoredSession();
      mockDefault({ id: 'u1', email: 'ada@example.com', name: 'Ada Lovelace' });

      const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
      const validationCalls = await settle(result);

      expect(result.current.sessionCheck).toBe('valid');
      expect(result.current.status).toBe('authenticated');
      expect(result.current.isAuthenticated).toBe(true);
      expect(validationCalls).toHaveLength(1);

      // The validation response is authoritative for identity, so a renamed
      // account does not keep rendering its stale name.
      expect(result.current.user?.name).toBe('Ada Lovelace');
      expect(JSON.parse(localStorage.getItem('hathap_user') ?? '{}').name).toBe('Ada Lovelace');

      // No retry loop: history was reset by settle, so any request counted here
      // would be a second validation issued after the first one succeeded.
      await act(async () => {
        await Promise.resolve();
      });
      expect(callsTo('/api/auth/me')).toBe(0);
      expect(localStorage.getItem('hathap_token')).toBe('jwt-token');
    });

    it('sends the stored credential on the validation request', async () => {
      seedStoredSession('jwt-abc');
      const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
      const validationCalls = await settle(result);

      expect(validationCalls).toHaveLength(1);
      const [, init] = validationCalls[0];
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer jwt-abc' });
      // A GET: validation must not mutate anything.
      expect(init?.method ?? 'GET').toBe('GET');
      expect(init?.body ?? null).toBeNull();
    });

    it.each([
      ['expired or revoked', httpResponse({ error: 'Unauthorized' }, 401)],
      ['malformed', httpResponse({ error: 'Unauthorized' }, 401)],
    ])('becomes anonymous after validation rejects an %s credential', async (_label, response) => {
      seedStoredSession('dead-token');
      fetchMock.mockImplementation((input: any) => {
        const url = String(input);
        if (url.endsWith('/api/auth/me')) return Promise.resolve(response);
        return Promise.resolve(jsonResponse({}));
      });

      const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
      await settle(result);

      expect(result.current.sessionCheck).toBe('invalid');
      expect(result.current.status).toBe('anonymous');
      expect(result.current.isAuthenticated).toBe(false);
      // The invariant: no valid session means no authenticated user state, in
      // memory or in storage.
      expect(result.current.token).toBeNull();
      expect(result.current.user).toBeNull();
      expect(localStorage.getItem('hathap_token')).toBeNull();
      expect(localStorage.getItem('hathap_user')).toBeNull();
    });

    it('keeps the credential and proceeds when validation cannot reach a verdict', async () => {
      seedStoredSession();
      fetchMock.mockRejectedValue(new Error('network down'));

      const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
      await settle(result);

      // A network outage is not proof the credential is dead. Signing out here
      // would turn a transient fault into a lost session.
      expect(result.current.sessionCheck).toBe('unavailable');
      expect(result.current.status).toBe('authenticated');
      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.token).toBe('jwt-token');
      expect(localStorage.getItem('hathap_token')).toBe('jwt-token');
    });

    it('keeps the credential when validation fails with a server error', async () => {
      seedStoredSession();
      fetchMock.mockImplementation((input: any) => {
        const url = String(input);
        if (url.endsWith('/api/auth/me')) {
          return Promise.resolve(httpResponse({ error: 'Authentication service unavailable.' }, 500));
        }
        return Promise.resolve(jsonResponse({}));
      });

      const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
      await settle(result);

      expect(result.current.sessionCheck).toBe('unavailable');
      expect(result.current.isAuthenticated).toBe(true);
      expect(localStorage.getItem('hathap_token')).toBe('jwt-token');
    });

    it('keeps the cached profile when validation returns an unusable body', async () => {
      seedStoredSession();
      mockDefault({});

      const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
      await settle(result);

      // The request validates the credential; it does not refresh the profile.
      // A partial body must not blank the known identity.
      expect(result.current.sessionCheck).toBe('valid');
      expect(result.current.user).toEqual(storedProfile);
    });

    it('still signs out when a real 401 arrives after validation could not reach a verdict', async () => {
      seedStoredSession('jwt-token');
      fetchMock.mockImplementation((input: any) => {
        const url = String(input);
        if (url.endsWith('/api/auth/me')) return Promise.reject(new Error('network down'));
        if (url.endsWith('/api/models')) return Promise.resolve(httpResponse({ error: 'Unauthorized' }, 401));
        return Promise.resolve(jsonResponse({}));
      });

      const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
      await settle(result);
      expect(result.current.isAuthenticated).toBe(true);

      const { apiJson } = await import('../api/client');
      await act(async () => {
        await apiJson('/api/models').catch(() => undefined);
      });

      // 'unavailable' defers the verdict, it does not grant immunity.
      expect(result.current.status).toBe('anonymous');
      expect(result.current.user).toBeNull();
      expect(localStorage.getItem('hathap_token')).toBeNull();
    });

    it('does not validate a credential the server has just issued', async () => {
      fetchMock.mockImplementation((input: any, init?: any) => {
        const url = String(input);
        if (init?.method === 'POST' && url.endsWith('/api/auth/login')) {
          return Promise.resolve(jsonResponse({ token: 'fresh-token', user: storedProfile }));
        }
        if (url.endsWith('/api/auth/me')) return Promise.resolve(jsonResponse(storedProfile));
        return Promise.resolve(jsonResponse({}));
      });

      const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
      await act(async () => {
        await result.current.login('ada@example.com', 'secret');
      });
      await settle(result);

      // Login is a direct transition: the server authenticated the credential,
      // so a validation round trip would add latency and no information.
      expect(result.current.status).toBe('authenticated');
      expect(callsTo('/api/auth/me')).toBe(0);
    });

    it('does not leave a stale profile when a 401 retires the credential while validation is in flight', async () => {
      seedStoredSession('doomed-token');
      // The regression this covers: a 401 on another request clears the session
      // first, and the validation response then arrives for a credential that
      // no longer exists. Writing the profile at that point would put an
      // orphaned `hathap_user` back into storage with no credential beside it.
      let releaseCheck: () => void = () => {};
      const checkGate = new Promise<void>((resolve) => {
        releaseCheck = resolve;
      });

      fetchMock.mockImplementation((input: any) => {
        const url = String(input);
        if (url.endsWith('/api/auth/me')) {
          return checkGate.then(() => jsonResponse(storedProfile));
        }
        if (url.endsWith('/api/models')) {
          return Promise.resolve(httpResponse({ error: 'Unauthorized' }, 401));
        }
        return Promise.resolve(jsonResponse({}));
      });

      const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
      expect(result.current.status).toBe('loading');

      const { apiJson } = await import('../api/client');
      await act(async () => {
        await apiJson('/api/models').catch(() => undefined);
      });

      // Let the validation response land after the sign-out.
      await act(async () => {
        releaseCheck();
        await Promise.resolve();
      });
      await waitFor(() => expect(result.current.status).toBe('anonymous'));

      expect(result.current.token).toBeNull();
      expect(result.current.user).toBeNull();
      // The invariant that matters: no credential means no authenticated user
      // state anywhere, including storage.
      expect(localStorage.getItem('hathap_token')).toBeNull();
      expect(localStorage.getItem('hathap_user')).toBeNull();
    });

    it('settles the pending state instead of hanging when the credential is cleared before validation completes', async () => {
      seedStoredSession('doomed-token');
      let releaseCheck: () => void = () => {};
      const checkGate = new Promise<void>((resolve) => {
        releaseCheck = resolve;
      });

      fetchMock.mockImplementation((input: any) => {
        const url = String(input);
        if (url.endsWith('/api/auth/me')) return checkGate.then(() => jsonResponse(storedProfile));
        return Promise.resolve(jsonResponse({}));
      });

      const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
      expect(result.current.status).toBe('loading');

      await act(async () => {
        await result.current.logout();
      });
      // A credential that vanished mid-flight must resolve the lifecycle, or the
      // router would wait on a validation that can never report.
      await waitFor(() => expect(result.current.sessionCheck).not.toBe('pending'));
      expect(result.current.status).toBe('anonymous');

      await act(async () => {
        releaseCheck();
        await Promise.resolve();
      });

      expect(result.current.status).toBe('anonymous');
      expect(result.current.user).toBeNull();
      expect(localStorage.getItem('hathap_user')).toBeNull();
    });
  });

  it('restores an existing session from localStorage', async () => {
    seedStoredSession();
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    // Synchronous on the first render: a guard must never see a signed-in
    // device as signed out, which would redirect it to the login page.
    expect(result.current.token).toBe('jwt-token');
    expect(result.current.status).toBe('loading');

    // And once verified it is fully authenticated without any reload.
    await settle(result);
    expect(result.current.status).toBe('authenticated');
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user).toEqual(storedProfile);
  });

  it('reports an anonymous session with no stored credential', () => {
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    expect(result.current.status).toBe('anonymous');
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.token).toBeNull();
    expect(result.current.user).toBeNull();
  });

  it('ignores a cached profile that has no credential behind it', () => {
    localStorage.setItem('hathap_user', JSON.stringify({ id: 'u1', email: 'a@b.com', name: 'Ada' }));
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
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
    seedStoredSession();
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await settle(result);
    await act(async () => {
      await result.current.logout();
    });
    expect(result.current.token).toBeNull();
    expect(result.current.user).toBeNull();
    expect(localStorage.getItem('hathap_token')).toBeNull();
    expect(localStorage.getItem('hathap_user')).toBeNull();
  });

  it('tells the server to invalidate the session on logout', async () => {
    seedStoredSession();
    fetchMock.mockImplementation((input: any) => {
      const url = String(input);
      if (url.endsWith('/api/auth/me')) return Promise.resolve(jsonResponse(storedProfile));
      return Promise.resolve(jsonResponse({ success: true }));
    });
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await settle(result);

    await act(async () => {
      await result.current.logout();
    });

    // Exactly one request, and it is the logout — not the validation round trip.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/auth/logout');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ Authorization: 'Bearer jwt-token' });
  });

  it('still signs out locally when the logout request fails', async () => {
    seedStoredSession();
    fetchMock.mockImplementation((input: any) => {
      const url = String(input);
      if (url.endsWith('/api/auth/me')) return Promise.resolve(jsonResponse(storedProfile));
      return Promise.reject(new Error('network down'));
    });
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await settle(result);

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
    seedStoredSession('old-token');
    // The server invalidates the old credential and returns a fresh one, so the
    // device that changed the password stays signed in.
    fetchMock.mockImplementation((input: any) => {
      const url = String(input);
      if (url.endsWith('/api/auth/me')) return Promise.resolve(jsonResponse(storedProfile));
      return Promise.resolve(jsonResponse({ success: true, token: 'replacement-token' }));
    });
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await settle(result);

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
    seedStoredSession('old-token');
    fetchMock.mockImplementation((input: any) => {
      const url = String(input);
      if (url.endsWith('/api/auth/me')) return Promise.resolve(jsonResponse(storedProfile));
      return Promise.resolve(jsonResponse({ error: 'Current password is incorrect.' }, false));
    });
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await settle(result);

    await act(async () => {
      await expect(
        result.current.changePassword('wrong', 'new-password')
      ).rejects.toThrow('Current password is incorrect.');
    });

    expect(result.current.token).toBe('old-token');
  });

  it('clears the session after account deletion without calling logout', async () => {
    seedStoredSession('old-token');
    fetchMock.mockImplementation((input: any) => {
      const url = String(input);
      if (url.endsWith('/api/auth/me')) return Promise.resolve(jsonResponse(storedProfile));
      return Promise.resolve(jsonResponse({ success: true }));
    });
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await settle(result);

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

  describe('dead-session handling', () => {
    it('signs the device out when an authenticated request is rejected with 401', async () => {
      seedStoredSession('stale-token');
      fetchMock.mockImplementation((input: any) => {
        const url = String(input);
        if (url.endsWith('/api/auth/me')) return Promise.resolve(jsonResponse(storedProfile));
        return Promise.resolve(httpResponse({ error: 'Unauthorized.' }, 401));
      });
      const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
      await settle(result);
      expect(result.current.isAuthenticated).toBe(true);

      const { apiJson } = await import('../api/client');
      await act(async () => {
        await apiJson('/api/models').catch(() => undefined);
      });

      expect(result.current.token).toBeNull();
      expect(result.current.user).toBeNull();
      expect(result.current.isAuthenticated).toBe(false);
      expect(localStorage.getItem('hathap_token')).toBeNull();
      expect(localStorage.getItem('hathap_user')).toBeNull();
      // Invalidated exactly once: the dead credential is never resent.
      expect(callsTo('/api/models')).toBe(1);
    });

    it('does not sign out when the rejection came with no credential', async () => {
      seedStoredSession('live-token');
      fetchMock.mockImplementation((input: any, init?: any) => {
        const url = String(input);
        if (init?.auth === false || init?.method === 'POST') {
          return Promise.resolve(httpResponse({ error: 'Unauthorized.' }, 401));
        }
        if (url.endsWith('/api/auth/me')) return Promise.resolve(jsonResponse(storedProfile));
        return Promise.resolve(jsonResponse({}));
      });
      const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
      await settle(result);

      const { apiJson } = await import('../api/client');
      await act(async () => {
        await apiJson('/api/auth/login', { method: 'POST', json: {}, auth: false }).catch(() => undefined);
      });

      // A public endpoint rejecting an anonymous caller says nothing about the
      // live credential on this device.
      expect(result.current.token).toBe('live-token');
      expect(result.current.isAuthenticated).toBe(true);
    });

    it('keeps the session on a server fault, which is not a rejected credential', async () => {
      seedStoredSession('live-token');
      fetchMock.mockImplementation((input: any) => {
        const url = String(input);
        if (url.endsWith('/api/auth/me')) return Promise.resolve(jsonResponse(storedProfile));
        return Promise.resolve(httpResponse({ error: 'database unavailable' }, 500));
      });
      const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
      await settle(result);

      const { apiJson } = await import('../api/client');
      await act(async () => {
        await apiJson('/api/models').catch(() => undefined);
      });

      expect(result.current.token).toBe('live-token');
      expect(result.current.isAuthenticated).toBe(true);
    });

    it('keeps a failed login from signing out an existing session', async () => {
      seedStoredSession('live-token');
      fetchMock.mockImplementation((input: any, init?: any) => {
        const url = String(input);
        if (init?.method === 'POST' && url.endsWith('/api/auth/login')) {
          return Promise.resolve(httpResponse({ error: 'bad credentials' }, 401));
        }
        if (url.endsWith('/api/auth/me')) return Promise.resolve(jsonResponse(storedProfile));
        return Promise.resolve(jsonResponse({}));
      });
      const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
      await settle(result);

      await act(async () => {
        await result.current.login('a@b.com', 'wrong').catch(() => undefined);
      });

      // The 401 carried no credential (login is public), so it must not retire
      // the session that was already established on this device.
      expect(result.current.token).toBe('live-token');
      expect(result.current.isAuthenticated).toBe(true);
    });
  });
});
