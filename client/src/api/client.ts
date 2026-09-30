import { emitSessionInvalidated, readStoredToken } from './authTransport';

/**
 * Centralized client HTTP / authenticated-request layer.
 *
 * Every API call in the app goes through here, which gives one place each for:
 *   - the API base URL,
 *   - attaching `Authorization: Bearer <token>` from the auth transport,
 *   - recognizing a dead session (401 on a request that carried a credential),
 *   - normalizing API errors while preserving the server's `error` message.
 *
 * It deliberately does not navigate, retry, or cache. On a 401 the only thing
 * it does is notify the session owner (AuthContext), which clears the session;
 * protected routes then react through that state. Keeping navigation out of
 * this layer is what makes redirect loops impossible.
 *
 * This module does not know that the credential lives in `localStorage` — see
 * `authTransport.ts` for that, and docs/AUTHENTICATION_ARCHITECTURE.md for why
 * the cookie migration is still pending.
 */

const API_BASE = (import.meta.env.VITE_API_URL as string) || '';

if (!API_BASE) {
  console.debug('VITE_API_URL not set — using relative /api paths (Vite proxy recommended)');
} else {
  console.debug('API base:', API_BASE);
}

/**
 * Why a request failed, kept distinct so callers never have to guess:
 *   - `unauthorized` — the server rejected the credential (HTTP 401).
 *   - `http`         — the server answered with another error status.
 *   - `network`      — the request never got an answer (offline, DNS, TLS, abort).
 */
export type ApiErrorKind = 'unauthorized' | 'http' | 'network';

export class ApiError extends Error {
  kind: ApiErrorKind;
  status: number | null;
  body: unknown;

  constructor(kind: ApiErrorKind, message: string, status: number | null = null, body: unknown = undefined) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
    this.body = body;
  }

  get isUnauthorized(): boolean {
    return this.kind === 'unauthorized';
  }

  get isNetworkError(): boolean {
    return this.kind === 'network';
  }
}

export interface ApiRequestOptions extends Omit<RequestInit, 'headers'> {
  /**
   * JSON-serializable request body. Serialized here, which is also what sets
   * `Content-Type: application/json` — so a body-less request never carries it.
   */
  json?: unknown;
  /** Attach the current credential. Default `true`; `false` for public endpoints. */
  auth?: boolean;
  /**
   * Explicit credential to use instead of the stored one. Used only by logout,
   * which retires the stored session *before* calling the server so local
   * sign-out never depends on the network.
   */
  token?: string | null;
  headers?: Record<string, string>;
}

export interface ApiJsonOptions extends ApiRequestOptions {
  /** Message used when the server response carries no usable `error` string. */
  errorMessage?: string;
  /**
   * Resolve with this value instead of throwing when the response is not ok.
   * For the collection loads that deliberately degrade to an empty list.
   */
  fallback?: unknown;
}

function transportMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Network request failed';
}

function serverErrorMessage(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const error = (body as { error?: unknown }).error;
  return typeof error === 'string' && error.length > 0 ? error : null;
}

/** Builds the normalized error for a non-ok response, keeping the server message. */
export function toApiError(response: Response, body: unknown, fallbackMessage?: string): ApiError {
  const message = serverErrorMessage(body) ?? fallbackMessage ?? `Request failed (${response.status})`;
  return new ApiError(response.status === 401 ? 'unauthorized' : 'http', message, response.status, body);
}

/** Parses a JSON body, falling back instead of throwing on a non-JSON response. */
export async function readJson<T>(response: Response, fallback: T): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    return fallback;
  }
}

/**
 * Performs an API request with the current credential attached.
 *
 * Resolves with the raw `Response` for the (few) callers that need the status
 * or a non-JSON body. Never throws on an HTTP error status; only transport
 * failures throw. Never retries.
 */
export async function apiFetch(path: string, options: ApiRequestOptions = {}): Promise<Response> {
  const { json, auth = true, token, headers: extraHeaders, body: rawBody, ...rest } = options;

  const headers: Record<string, string> = { ...extraHeaders };
  let body: BodyInit | null = rawBody ?? null;

  if (json !== undefined) {
    body = JSON.stringify(json);
    const hasContentType = Object.keys(headers).some((key) => key.toLowerCase() === 'content-type');
    if (!hasContentType) headers['Content-Type'] = 'application/json';
  }

  const credential = token !== undefined ? token : auth ? readStoredToken() : null;
  if (credential) headers.Authorization = `Bearer ${credential}`;

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...rest,
      method: rest.method ?? (json !== undefined ? 'POST' : 'GET'),
      headers,
      body,
    });
  } catch (error) {
    throw new ApiError('network', transportMessage(error), null, error);
  }

  if (response.status === 401 && credential) {
    // The credential we just sent is dead. Retire the session exactly once,
    // centrally, and do not retry: the same token would only 401 again.
    emitSessionInvalidated();
  }

  return response;
}

/** JSON request/response. Throws an {@link ApiError} unless `fallback` is given. */
export async function apiJson<T = unknown>(path: string, options: ApiJsonOptions = {}): Promise<T> {
  const { errorMessage, fallback, ...rest } = options;
  const response = await apiFetch(path, rest);
  const data = await readJson<T>(response, (fallback ?? {}) as T);
  if (!response.ok) {
    if (fallback !== undefined) return fallback as T;
    throw toApiError(response, data, errorMessage);
  }
  return data;
}

/** Text/markdown response (the decision report endpoint). */
export async function apiText(
  path: string,
  options: Omit<ApiJsonOptions, 'fallback'> = {}
): Promise<string> {
  const { errorMessage, ...rest } = options;
  const response = await apiFetch(path, rest);
  if (!response.ok) {
    throw toApiError(response, await readJson<unknown>(response, {}), errorMessage);
  }
  return response.text();
}
