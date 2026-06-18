import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext, useEffect, useState } from 'react';
const AuthContext = createContext(undefined);
export const AuthProvider = ({ children }) => {
    const [token, setToken] = useState(() => localStorage.getItem('hathap_token'));
    const [user, setUser] = useState(() => {
        try {
            const raw = localStorage.getItem('hathap_user');
            return raw ? JSON.parse(raw) : null;
        }
        catch (e) {
            return null;
        }
    });
    useEffect(() => {
        if (token)
            localStorage.setItem('hathap_token', token);
        else
            localStorage.removeItem('hathap_token');
    }, [token]);
    useEffect(() => {
        if (user)
            localStorage.setItem('hathap_user', JSON.stringify(user));
        else
            localStorage.removeItem('hathap_user');
    }, [user]);
    const API = import.meta.env.VITE_API_URL || '';
    if (!API) {
        console.debug('VITE_API_URL not set — using relative /api paths (Vite proxy recommended)');
    }
    else {
        console.debug('API base:', API);
    }
    const login = async (email, password) => {
        const res = await fetch(`${API}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
        if (!res.ok)
            throw new Error('Invalid credentials');
        const data = await res.json();
        setToken(data.token);
        setUser(data.user);
    };
    const signup = async (name, email, password) => {
        const res = await fetch(`${API}/api/auth/signup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, email, password }) });
        if (!res.ok)
            throw new Error('Signup failed');
        const data = await res.json();
        setToken(data.token);
        setUser(data.user);
    };
    const logout = () => {
        setToken(null);
        setUser(null);
    };
    return (_jsx(AuthContext.Provider, { value: { token, user, login, signup, logout }, children: children }));
};
export const useAuth = () => {
    const ctx = useContext(AuthContext);
    if (!ctx)
        throw new Error('useAuth must be used within AuthProvider');
    return ctx;
};
