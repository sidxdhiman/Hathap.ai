import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Link, useLocation } from 'react-router-dom';
import { Gavel, LogOut, Menu, X, User } from 'lucide-react';
import { useState } from 'react';
export const Header = () => {
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const location = useLocation();
    const isActive = (path) => location.pathname === path;
    const navItems = [
        { path: '/dashboard', label: 'Dashboard' },
        { path: '/courtrooms', label: 'Debates' },
        { path: '/models', label: 'Models' },
        { path: '/agents', label: 'Agents' },
    ];
    return (_jsx("header", { className: "sticky top-0 z-40 glassmorphism border-b border-theme-border", children: _jsxs("div", { className: "px-4 py-4 lg:px-6", children: [_jsxs("div", { className: "max-w-6xl mx-auto flex items-center gap-4", children: [_jsx("div", { className: "flex items-center gap-3", children: _jsxs(Link, { to: "/", className: "flex items-center gap-3 group", children: [_jsx("div", { className: "w-10 h-10 bg-gradient-to-br from-blue-400 to-cyan-400 flex items-center justify-center transform group-hover:scale-110 transition-transform", children: _jsx(Gavel, { size: 24, className: "text-slate-950" }) }), _jsx("div", { className: "hidden md:block", children: _jsx("h1", { className: "text-lg font-bold gradient-text", children: "Hathap.AI" }) })] }) }), _jsx("nav", { className: "hidden md:flex flex-1 justify-center items-center", children: _jsx("div", { className: "inline-flex bg-transparent rounded px-2 py-1", children: navItems.map((item) => (_jsx(Link, { to: item.path, className: `mx-1 px-3 py-2 text-sm transition-all ${isActive(item.path)
                                        ? 'bg-blue-500/20 text-blue-300 border border-blue-600'
                                        : 'text-theme-text-secondary hover:bg-theme-bg-secondary border border-transparent'}`, children: item.label }, item.path))) }) }), _jsxs("div", { className: "hidden md:flex items-center gap-3", children: [_jsx(Link, { to: "/profile", children: _jsx("button", { className: "p-2 hover:bg-theme-bg-secondary transition-colors text-theme-text-secondary hover:text-theme-text-primary border border-transparent hover:border-theme-border", children: _jsx(User, { size: 20 }) }) }), _jsx("button", { className: "p-2 hover:bg-theme-bg-secondary transition-colors text-theme-text-secondary hover:text-theme-text-primary border border-transparent hover:border-theme-border", children: _jsx(LogOut, { size: 20 }) })] }), _jsx("button", { onClick: () => setMobileMenuOpen(!mobileMenuOpen), className: "md:hidden p-2 hover:bg-theme-bg-secondary transition-colors border border-transparent hover:border-theme-border ml-auto", children: mobileMenuOpen ? _jsx(X, { size: 24 }) : _jsx(Menu, { size: 24 }) })] }), mobileMenuOpen && (_jsxs("nav", { className: "md:hidden mt-4 space-y-2 border-t border-theme-border pt-4", children: [navItems.map((item) => (_jsx(Link, { to: item.path, onClick: () => setMobileMenuOpen(false), className: `block px-4 py-2 transition-all border ${isActive(item.path)
                                ? 'bg-blue-500/20 text-blue-300 border-blue-600'
                                : 'text-theme-text-secondary hover:bg-theme-bg-secondary border-transparent'}`, children: item.label }, item.path))), _jsx(Link, { to: "/profile", onClick: () => setMobileMenuOpen(false), children: _jsxs("button", { className: "w-full text-left px-4 py-2 transition-all border text-theme-text-secondary hover:bg-theme-bg-secondary border-transparent hover:border-theme-border flex items-center gap-2", children: [_jsx(User, { size: 18 }), "Profile"] }) })] }))] }) }));
};
