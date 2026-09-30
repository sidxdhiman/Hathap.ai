import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onSessionInvalidated } from './authTransport';
import { ApiError, apiFetch, apiJson, apiText, readJson, toApiError } from './client';

const fetchMock = vi.fn();

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  } as unknown as Response;
}

describe('api client', () => {
  beforeEach(() => {
    localStorage.clear();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const storedToken = (token = 'stored-token') => localStorage.setItem('hathap_token', token);

  const headersOf = (call = 0) => fetchMock.mock.calls[call]?.[1]?.headers as Record<string, string>;
  const urlOf = (call = 0) => String(fetchMock.mock.calls[call]?.[0]);

  describe('credential handling', () => {
    it('attaches the stored credential to an authenticated request', async () => {
      storedToken('abc123');
      fetchMock.mockResolvedValue(jsonResponse({ ok: true }));

      await apiJson('/api/models');

      expect(urlOf()).toBe('/api/models');
      expect(headersOf()).toMatchObject({ Authorization: 'Bearer abc123' });
    });

    it('sends no Authorization header when this device holds no session', async () => {
      fetchMock.mockResolvedValue(jsonResponse([]));

      await apiJson('/api/models');

      expect(headersOf()).not.toHaveProperty('Authorization');
    });

    it('sends no Authorization header for a public endpoint even when a token exists', async () => {
      storedToken('abc123');
      fetchMock.mockResolvedValue(jsonResponse({ token: 'fresh', user: { id: 'u1', email: 'a@b.com', name: 'A' } }));

      await apiJson('/api/auth/login', { method: 'POST', json: { email: 'a@b.com' }, auth: false });

      expect(headersOf()).not.toHaveProperty('Authorization');
    });

    it('uses an explicitly supplied credential instead of the stored one', async () => {
      storedToken('current');
      fetchMock.mockResolvedValue(jsonResponse({ success: true }));

      await apiJson('/api/auth/logout', { method: 'POST', token: 'retired' });

      expect(headersOf()).toMatchObject({ Authorization: 'Bearer retired' });
    });

    it('omits the credential entirely when an explicit null credential is given', async () => {
      storedToken('current');
      fetchMock.mockResolvedValue(jsonResponse({ success: true }));

      await apiJson('/api/auth/logout', { method: 'POST', token: null });

      expect(headersOf()).not.toHaveProperty('Authorization');
    });
  });

  describe('bodies', () => {
    it('serializes a JSON body and sets the JSON content type', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ id: 'm1' }));

      await apiJson('/api/models', { method: 'POST', json: { name: 'model' } });

      expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(JSON.stringify({ name: 'model' }));
      expect(headersOf()).toMatchObject({ 'Content-Type': 'application/json' });
    });

    it('sends no content type on a body-less POST', async () => {
      storedToken('abc123');
      fetchMock.mockResolvedValue(jsonResponse({ success: true }));

      await apiJson('/api/auth/logout', { method: 'POST' });

      const headers = headersOf();
      expect(headers).not.toHaveProperty('Content-Type');
      expect(Object.keys(headers).some((key) => key.toLowerCase() === 'content-type')).toBe(false);
      expect(fetchMock.mock.calls[0]?.[1]?.body).toBeFalsy();
    });

    it('does not overwrite an explicit content type', async () => {
      fetchMock.mockResolvedValue(jsonResponse({}));

      await apiJson('/api/thing', { method: 'POST', json: {}, headers: { 'content-type': 'application/vnd.custom' } });

      expect(headersOf()['content-type']).toBe('application/vnd.custom');
      expect(headersOf()).not.toHaveProperty('Content-Type');
    });

    it('passes caller headers through', async () => {
      fetchMock.mockResolvedValue(jsonResponse({}));

      await apiFetch('/api/decisions/d1/events/stream', { headers: { Accept: 'text/event-stream' } });

      expect(headersOf()).toMatchObject({ Accept: 'text/event-stream' });
    });
  });

  describe('error normalization', () => {
    it('keeps the server error message', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ error: 'Snapshot unavailable' }, false, 500));

      await expect(apiJson('/api/decisions/d1/snapshot')).rejects.toMatchObject({
        name: 'ApiError',
        kind: 'http',
        status: 500,
        message: 'Snapshot unavailable',
      });
    });

    it('falls back to the caller message when the response carries no error string', async () => {
      fetchMock.mockResolvedValue(jsonResponse({}, false, 404));

      await expect(apiJson('/api/thing', { errorMessage: 'Failed to fetch thing' })).rejects.toThrow(
        'Failed to fetch thing'
      );
    });

    it('falls back to the status when there is no caller message', async () => {
      fetchMock.mockResolvedValue(jsonResponse({}, false, 418));

      await expect(apiJson('/api/thing')).rejects.toThrow('Request failed (418)');
    });

    it('classifies a 401 as unauthorized', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ error: 'Unauthorized.' }, false, 401));
      storedToken('abc123');

      await expect(apiJson('/api/thing')).rejects.toMatchObject({ kind: 'unauthorized', status: 401 });
    });

    it('wraps a transport failure as a network error', async () => {
      fetchMock.mockRejectedValue(new Error('offline'));

      const error = await apiJson('/api/thing').catch((err: unknown) => err);

      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({ kind: 'network', status: null, message: 'offline' });
    });

    it('never retries a failed request', async () => {
      fetchMock.mockRejectedValue(new Error('offline'));

      await apiJson('/api/thing').catch(() => undefined);
      await apiJson('/api/thing').catch(() => undefined);

      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('returns a fallback instead of throwing when one is given', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ error: 'boom' }, false, 500));

      await expect(apiJson('/api/decisions', { fallback: [] })).resolves.toEqual([]);
    });

    it('reads a text body on success and throws on failure', async () => {
      fetchMock.mockResolvedValue(jsonResponse('# Report', true, 200));
      await expect(apiText('/api/decisions/d1/report')).resolves.toBe('# Report');

      fetchMock.mockResolvedValue(jsonResponse({ error: 'no report' }, false, 404));
      await expect(apiText('/api/decisions/d1/report')).rejects.toThrow('no report');
    });

    it('falls back rather than throwing on a non-JSON body', async () => {
      const response = {
        ok: false,
        status: 500,
        json: async () => {
          throw new SyntaxError('Unexpected token <');
        },
      } as unknown as Response;

      await expect(readJson(response, { fallback: true })).resolves.toEqual({ fallback: true });
      expect(toApiError(response, undefined, 'Failed').message).toBe('Failed');
    });
  });

  describe('session invalidation', () => {
    it('notifies the session owner when an authenticated request is rejected', async () => {
      storedToken('abc123');
      fetchMock.mockResolvedValue(jsonResponse({ error: 'Unauthorized.' }, false, 401));
      const onInvalidated = vi.fn();
      const unsubscribe = onSessionInvalidated(onInvalidated);

      await expect(apiJson('/api/models')).rejects.toMatchObject({ kind: 'unauthorized' });

      expect(onInvalidated).toHaveBeenCalledTimes(1);
      unsubscribe();
    });

    it('does not notify when the request carried no credential', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ error: 'Unauthorized.' }, false, 401));
      const onInvalidated = vi.fn();
      const unsubscribe = onSessionInvalidated(onInvalidated);

      await expect(apiJson('/api/auth/login', { method: 'POST', json: {}, auth: false })).rejects.toThrow();

      expect(onInvalidated).not.toHaveBeenCalled();
      unsubscribe();
    });

    it('does not notify for a 401 on a public login attempt', async () => {
      storedToken('abc123');
      fetchMock.mockResolvedValue(jsonResponse({ error: 'bad credentials' }, false, 401));
      const onInvalidated = vi.fn();
      const unsubscribe = onSessionInvalidated(onInvalidated);

      await expect(apiJson('/api/auth/login', { method: 'POST', json: {}, auth: false })).rejects.toThrow();

      expect(onInvalidated).not.toHaveBeenCalled();
      unsubscribe();
    });

    it('does not notify for a server fault, only for a rejected credential', async () => {
      storedToken('abc123');
      fetchMock.mockResolvedValue(jsonResponse({ error: 'database down' }, false, 500));
      const onInvalidated = vi.fn();
      const unsubscribe = onSessionInvalidated(onInvalidated);

      await expect(apiJson('/api/models')).rejects.toThrow('database down');

      expect(onInvalidated).not.toHaveBeenCalled();
      unsubscribe();
    });

    it('never resends the request after invalidating the session', async () => {
      storedToken('abc123');
      fetchMock.mockResolvedValue(jsonResponse({ error: 'Unauthorized.' }, false, 401));

      await apiJson('/api/models').catch(() => undefined);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(localStorage.getItem('hathap_token')).toBe('abc123');
    });
  });
});
