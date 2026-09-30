import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  AuthUser,
  StoredSession,
  clearStoredSession,
  onSessionInvalidated,
  readStoredSession,
  writeStoredToken,
  writeStoredUser,
} from '../api/authTransport';
import { apiJson } from '../api/client';

/**
 * Where the client stands with respect to a session.
 *
 * There is deliberately no third "loading" state: the transport reads
 * `localStorage` synchronously, so the session is known on the very first
 * render. Deferring that read to an effect would briefly present the app as
 * signed out, which makes a guard redirect a signed-in user to `/login` on
 * every page load — and once the token appears, bounce them straight to
 * `/dashboard`. Resolving inline keeps that window closed.
 */
export type AuthStatus = 'authenticated' | 'anonymous';

interface AuthContextType {
  status: AuthStatus;
  isAuthenticated: boolean;
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

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // The transport module owns storage; this is the UI mirror of it. Storage is
  // written synchronously alongside the state (never from an effect) so a
  // request issued immediately after login already carries the new credential.
  const [session, setSession] = useState<StoredSession>(() => readStoredSession());

  const token = session.token;
  const user = session.user;

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
  useEffect(() => onSessionInvalidated(clearSession), [clearSession]);

  const login = async (email: string, password: string) => {
    const data = await apiJson<{ token: string; user: AuthUser }>('/api/auth/login', {
      method: 'POST',
      json: { email, password },
      auth: false,
      errorMessage: 'Invalid credentials',
    });
    adoptSession(data.token, data.user);
  };

  const signup = async (name: string, email: string, password: string) => {
    const data = await apiJson<{ token: string; user: AuthUser }>('/api/auth/signup', {
      method: 'POST',
      json: { name, email, password },
      auth: false,
      errorMessage: 'Signup failed',
    });
    adoptSession(data.token, data.user);
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
    if (data.token) adoptSession(data.token, user);
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
        status: token ? 'authenticated' : 'anonymous',
        isAuthenticated: Boolean(token),
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
