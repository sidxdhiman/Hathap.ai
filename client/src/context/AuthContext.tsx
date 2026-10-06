import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  AuthUser,
  StoredSession,
  clearStoredSession,
  onSessionInvalidated,
  readStoredSession,
  readStoredToken,
  writeStoredToken,
  writeStoredUser,
} from '../api/authTransport';
import { ApiError, apiJson } from '../api/client';

/**
 * Where the client stands with respect to a session.
 *
 * Three states, and the third is what Phase 20 added:
 *
 * - `loading`   — a stored credential exists and is being verified. The router
 *                 must render a placeholder and must NOT redirect: redirecting
 *                 here is what produces the bounce off a deep link.
 * - `authenticated` — the credential is present and either verified by this
 *                 session's validation request or produced by a credential-
 *                 proving flow (login/signup/change-password).
 * - `anonymous` — there is no usable credential on this device.
 *
 * `loading` exists because the presence of a token is not evidence that it
 * works. An expired or revoked token used to present the whole authenticated
 * shell on the first render and only reveal itself when the first API call
 * failed, which cost a flash of stale UI and a wasted round trip.
 */
export type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

/**
 * What the startup validation request concluded.
 *
 * This is deliberately separate from `status`, which the router reads. The two
 * questions a caller actually has are different: "may I show protected UI?"
 * (`status`) and "did the server confirm this credential?" (this). Keeping them
 * apart is what lets a transient failure be reported honestly instead of being
 * laundered into a logout.
 *
 * - `idle`        — nothing to validate; there was no stored credential.
 * - `valid`       — the server accepted the credential (`GET /api/auth/me` 200).
 * - `invalid`     — the server rejected it. The credential is cleared. This is
 *                    the only outcome that signs the device out.
 * - `unavailable` — the request never reached a verdict (network failure, or a
 *                    5xx). The credential is KEPT and the device proceeds as
 *                    authenticated, because a server outage is not proof that a
 *                    credential is dead. Any real rejection still arrives
 *                    through the centralized 401 path.
 */
export type SessionCheck =
  | 'idle'
  | 'pending'
  | 'valid'
  | 'invalid'
  | 'unavailable';

interface AuthContextType {
  status: AuthStatus;
  isAuthenticated: boolean;
  sessionCheck: SessionCheck;
  token: string | null;
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  exportData: () => Promise<Record<string, unknown>>;
  deleteAccount: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Coerce a `/api/auth/me` response into a profile.
 *
 * The endpoint returns exactly `{ id, email, name }`, but this session's
 * validation must not *replace* a known-good profile with a partial one. If any
 * field is missing or the wrong type, the response is treated as unusable and
 * the cached profile is kept — the point of the request is to confirm the
 * credential, not to refresh the profile.
 */
function toAuthUser(data: unknown): AuthUser | null {
  if (!data || typeof data !== 'object') return null;
  const { id, email, name } = data as Record<string, unknown>;
  if (typeof id !== 'string' || !id) return null;
  if (typeof email !== 'string' || typeof name !== 'string') return null;
  return { id, email, name };
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // The transport module owns storage; this is the UI mirror of it. Storage is
  // written synchronously alongside the state (never from an effect) so a
  // request issued immediately after login already carries the new credential.
  //
  // The initial read is synchronous, so the very first render already knows
  // whether this device holds a credential. What it cannot know on the first
  // render is whether that credential still works, which is what the `loading`
  // state represents.
  const [session, setSession] = useState<StoredSession>(() => readStoredSession());
  const [sessionCheck, setSessionCheck] = useState<SessionCheck>(() =>
    readStoredSession().token ? 'pending' : 'idle'
  );

  const token = session.token;
  const user = session.user;
  // True only while a credential this session never proved is outstanding.
  const isValidating = sessionCheck === 'pending';
  // The specific credential under validation. Named separately from `token` so
  // the validation effect can depend on it and notice when the credential it is
  // verifying has been retired.
  const validatingToken = isValidating ? token : null;

  // A null `nextUser` means "keep whatever profile is already cached" — a
  // password change re-issues the credential but not the profile.
  const adoptSession = useCallback((nextToken: string, nextUser: AuthUser | null) => {
    if (nextUser) writeStoredUser(nextUser);
    writeStoredToken(nextToken);
    setSession((prev) => ({ token: nextToken, user: nextUser ?? prev.user }));
  }, []);

  const clearSession = useCallback(() => {
    clearStoredSession();
    setSession({ token: null, user: null });
  }, []);

  // Single notification path for a dead session: the request layer reports a
  // 401 on an authenticated call, and this clears the client state. Components
  // never delete the token themselves, and this never navigates, so a 401
  // cannot start a redirect loop.
  //
  // The startup validation request reaches AuthContext by the same route: it
  // carries a credential, so `api/client.ts` emits invalidation for it exactly
  // as it does for any other credentialed 401. There is no second auth path.
  useEffect(() => onSessionInvalidated(clearSession), [clearSession]);

  // Startup validation.
  //
  // Runs when a stored credential has not yet been verified by this session.
  // The request goes through the shared client, so it carries the credential,
  // reuses the Phase 17 server verification (signature, expiry, user
  // existence, authVersion) and reuses the centralized 401 handling. No second
  // authentication implementation exists on either side of this call.
  useEffect(() => {
    if (sessionCheck !== 'pending') return;

    // A credential that disappeared before the request settled — a logout, or a
    // centralized 401 from some other request — has already resolved the
    // lifecycle. There is nothing left to verify.
    if (!validatingToken) {
      setSessionCheck('idle');
      return;
    }

    const credential = validatingToken;
    let active = true;

    void (async () => {
      try {
        const data = await apiJson<unknown>('/api/auth/me', { auth: true });
        if (!active) return;
        // The credential this request authenticated may have been retired while
        // it was in flight. Writing the profile now would resurrect an orphaned
        // `hathap_user` for a session that no longer exists, breaking the
        // "no valid session, no authenticated user state" invariant.
        if (readStoredToken() !== credential) return;
        const fresh = toAuthUser(data);
        if (fresh) {
          writeStoredUser(fresh);
          setSession((prev) => (prev.token === credential ? { ...prev, user: fresh } : prev));
        }
        setSessionCheck('valid');
      } catch (err) {
        if (!active) return;
        if (err instanceof ApiError && err.kind === 'unauthorized') {
          // The centralized path has already cleared the credential; record the
          // verdict. Clearing again would be harmless but redundant, and this
          // keeps the reason for the sign-out explicit.
          setSessionCheck('invalid');
          return;
        }
        // A network failure or a 5xx is not a verdict about the credential.
        // Keep it and proceed; do not manufacture a logout from an outage.
        setSessionCheck('unavailable');
      }
    })();

    return () => {
      active = false;
    };
  }, [sessionCheck, validatingToken]);

  const login = async (email: string, password: string) => {
    const data = await apiJson<{ token: string; user: AuthUser }>('/api/auth/login', {
      method: 'POST',
      json: { email, password },
      auth: false,
      errorMessage: 'Invalid credentials',
    });
    adoptSession(data.token, data.user);
    // The server just authenticated these credentials, so they need no startup
    // validation round trip — this is what makes login a direct transition into
    // the authenticated state, with no reload and no validating spinner.
    setSessionCheck('valid');
  };

  const signup = async (name: string, email: string, password: string) => {
    const data = await apiJson<{ token: string; user: AuthUser }>('/api/auth/signup', {
      method: 'POST',
      json: { name, email, password },
      auth: false,
      errorMessage: 'Signup failed',
    });
    adoptSession(data.token, data.user);
    setSessionCheck('valid');
  };

  const logout = async () => {
    const currentToken = token;
    // Clear locally first and unconditionally, so this device is signed out
    // even if the request never completes. The server call is then best-effort:
    // it tells the server to invalidate the account's outstanding credentials,
    // and its failure leaves a credential the server may still honour until it
    // expires. Local sign-out must not depend on it.
    clearSession();
    if (!currentToken) return;
    try {
      // The stored credential is already gone, so the retired one is passed
      // explicitly rather than read back out of storage.
      await apiJson('/api/auth/logout', { method: 'POST', token: currentToken });
    } catch {
      // Intentionally ignored — see above.
    }
  };

  const changePassword = async (currentPassword: string, newPassword: string) => {
    // A password change invalidates every credential previously issued to this
    // account, so the one we were using is already dead. The server re-issues a
    // replacement for the caller that proved both passwords; adopt it so this
    // device stays signed in instead of bouncing to the login screen.
    const data = await apiJson<{ token?: string }>('/api/auth/change-password', {
      method: 'POST',
      json: { currentPassword, newPassword },
      errorMessage: 'Password change failed',
    });
    if (data.token) {
      adoptSession(data.token, user);
      // The server minted and returned this replacement, so it is already known
      // good; validating it would add a request for no information.
      setSessionCheck('valid');
    }
  };

  const exportData = async () => {
    return apiJson<Record<string, unknown>>('/api/auth/export-data', {
      method: 'POST',
      errorMessage: 'Data export failed',
    });
  };

  const deleteAccount = async () => {
    await apiJson('/api/auth/account', {
      method: 'DELETE',
      errorMessage: 'Account deletion failed',
    });
    // The account no longer exists, so there is nothing left to invalidate
    // server-side: `requireAuth` now fails the old token because no user
    // document backs it. Clearing the local credential completes the sign-out.
    clearSession();
  };

  return (
    <AuthContext.Provider
      value={{
        status: isValidating ? 'loading' : token ? 'authenticated' : 'anonymous',
        isAuthenticated: !isValidating && Boolean(token),
        sessionCheck,
        token,
        user,
        login,
        signup,
        logout,
        changePassword,
        exportData,
        deleteAccount,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
