import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext, useState, useEffect } from 'react';
const ThemeContext = createContext(undefined);
export const ThemeProvider = ({ children }) => {
    const [theme, setTheme] = useState(() => {
        try {
            const stored = localStorage.getItem('hathap-theme');
            return stored || 'dark';
        }
        catch (e) {
            return 'dark';
        }
    });
    useEffect(() => {
        // Apply theme to document
        if (theme === 'light') {
            document.body.classList.add('theme-light');
        }
        else {
            document.body.classList.remove('theme-light');
        }
        // Store theme preference
        try {
            localStorage.setItem('hathap-theme', theme);
        }
        catch (e) {
            // ignore
        }
    }, [theme]);
    const toggleTheme = () => {
        setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
    };
    return (_jsx(ThemeContext.Provider, { value: { theme, toggleTheme }, children: children }));
};
export const useTheme = () => {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useTheme must be used within ThemeProvider');
    }
    return context;
};
