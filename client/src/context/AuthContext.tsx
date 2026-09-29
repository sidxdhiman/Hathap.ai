import React, { createContext, useContext, useEffect, useState } from 'react';

interface User {
  id: string;
  email: string;
  name: string;
}

interface AuthContextType {
  token: string | null;
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  exportData: () => Promise<Record<string, unknown>>;
  deleteAccount: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('hathap_token'));
  const [user, setUser] = useState<User | null>(() => {
    try {
      const raw = localStorage.getItem('hathap_user');
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  });

  // Known security limitation: the JWT is stored in localStorage (readable by
  // any script on the page). Server-side invalidation now exists (sign-out,
  // password change and account deletion all take effect immediately, because
  // the server resolves every request against a live account), but the token
  // itself is still script-readable. A session-cookie migration remains a
  // separate, deployment-topology-gated piece of work — see
  // docs/AUTHENTICATION_ARCHITECTURE.md.
  useEffect(() => {
    if (token) localStorage.setItem('hathap_token', token);
    else localStorage.removeItem('hathap_token');
  }, [token]);

  useEffect(() => {
    if (user) localStorage.setItem('hathap_user', JSON.stringify(user));
    else localStorage.removeItem('hathap_user');
  }, [user]);

  const API = (import.meta.env.VITE_API_URL as string) || '';
  if (!API) {
    console.debug('VITE_API_URL not set — using relative /api paths (Vite proxy recommended)');
  } else {
    console.debug('API base:', API);
  }

  const login = async (email: string, password: string) => {
    const res = await fetch(`${API}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Invalid credentials');
    }
    const data = await res.json();
    setToken(data.token);
    setUser(data.user);
  };

  const signup = async (name: string, email: string, password: string) => {
    const res = await fetch(`${API}/api/auth/signup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, email, password }) });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Signup failed');
    }
    const data = await res.json();
    setToken(data.token);
    setUser(data.user);
  };

  const clearSession = () => {
    setToken(null);
    setUser(null);
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
      await fetch(`${API}/api/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${currentToken}` },
      });
    } catch {
      // Intentionally ignored — see above.
    }
  };

  const changePassword = async (currentPassword: string, newPassword: string) => {
    const res = await fetch(`${API}/api/auth/change-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Password change failed');
    }
    // A password change invalidates every credential previously issued to this
    // account, so the one we were using is already dead. The server re-issues a
    // replacement for the caller that proved both passwords; adopt it so this
    // device stays signed in instead of bouncing to the login screen.
    const data = await res.json().catch(() => ({}) as { token?: string });
    if (data.token) setToken(data.token);
  };

  const exportData = async () => {
    const res = await fetch(`${API}/api/auth/export-data`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Data export failed');
    }
    return res.json();
  };

  const deleteAccount = async () => {
    const res = await fetch(`${API}/api/auth/account`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Account deletion failed');
    }
    // The account no longer exists, so there is nothing left to invalidate
    // server-side: `requireAuth` now fails the old token because no user
    // document backs it. Clearing the local credential completes the sign-out.
    clearSession();
  };

  return (
    <AuthContext.Provider value={{ token, user, login, signup, logout, changePassword, exportData, deleteAccount }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
