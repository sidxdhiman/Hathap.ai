/**
 * Client authentication transport.
 *
 * This is the ONLY module in the client that knows how the current credential
 * is stored. Every other module asks this one for the token and for the
 * session-invalidation signal, so moving off `localStorage` becomes a change to
 * this file instead of a change across the app.
 *
 * Shipped transport: `localStorage`, keys `hathap_token` / `hathap_user`.
 * This is deliberately still the case — see the limitation note below.
 *
 * Known limitation, unchanged by this module: the JWT is script-readable, so
 * any script on the origin can steal it. Server-side invalidation (Phase 17)
 * limits what a stolen token can be used for, but does not stop the theft.
 * Moving the credential into an `HttpOnly` cookie requires the production
 * deployment-topology decision recorded in
 * docs/AUTHENTICATION_ARCHITECTURE.md §4.4 (same-site vs cross-site, HTTPS),
 * which the repository does not answer.
 */

const TOKEN_KEY = 'hathap_token';
const USER_KEY = 'hathap_user';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

/** Reads are guarded: touching storage itself can throw in restricted contexts. */
function readKey(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeKey(key: string, value: string | null): void {
  if (value === null) localStorage.removeItem(key);
  else localStorage.setItem(key, value);
}

/** The current access token, or null when this device holds no session. */
export function readStoredToken(): string | null {
  return readKey(TOKEN_KEY);
}

export function writeStoredToken(token: string | null): void {
  writeKey(TOKEN_KEY, token);
}

export function readStoredUser(): AuthUser | null {
  const raw = readKey(USER_KEY);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as AuthUser;
  } catch {
    return null;
  }
}

export function writeStoredUser(user: AuthUser | null): void {
  writeKey(USER_KEY, user ? JSON.stringify(user) : null);
}

/**
 * The credential plus the cached profile, read together in one pass.
 *
 * Read synchronously by AuthContext's initial state so the very first render
 * already knows whether this device holds a session. A cached profile is only
 * meaningful alongside a credential, so a token-less read yields a null profile
 * and never leaves an orphaned `hathap_user` looking like a session.
 */
export interface StoredSession {
  token: string | null;
  user: AuthUser | null;
}

export function readStoredSession(): StoredSession {
  const token = readStoredToken();
  return { token, user: token ? readStoredUser() : null };
}

/** Drops every stored trace of the session in a single call. */
export function clearStoredSession(): void {
  writeStoredToken(null);
  writeStoredUser(null);
}

type SessionInvalidatedListener = () => void;

const listeners = new Set<SessionInvalidatedListener>();

/**
 * Subscribes the session owner (AuthContext) to credential invalidation.
 * Returns an unsubscribe function.
 *
 * This is the only supported way for a request to tell the UI that the session
 * is gone. Individual components never delete the token themselves.
 */
export function onSessionInvalidated(listener: SessionInvalidatedListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Signals that the credential used for a request is no longer valid: expired,
 * revoked by server-side invalidation, or belonging to a deleted account.
 *
 * The request layer only calls this for a request that actually carried a
 * credential, so an ordinary 401 on a public endpoint (a failed login, for
 * example) never becomes a sign-out. Emission is idempotent and is never
 * followed by a retry with the same token.
 */
export function emitSessionInvalidated(): void {
  for (const listener of Array.from(listeners)) {
    try {
      listener();
    } catch {
      // One failing subscriber must not stop the rest from clearing state.
    }
  }
}
