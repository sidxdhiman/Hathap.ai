import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export const Layout = ({ children }) => {
    return (_jsx("div", { className: "min-h-screen bg-theme-bg-primary", children: children }));
};
export const Container = ({ children, className = '', }) => {
    return (_jsx("div", { className: `max-w-7xl mx-auto px-4 lg:px-6 py-8 ${className}`, children: children }));
};
export const PageHeader = ({ title, description, action }) => {
    return (_jsxs("div", { className: "flex items-start justify-between gap-4 mb-8", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-4xl font-bold mb-2", children: title }), description && _jsx("p", { className: "text-theme-text-secondary text-lg", children: description })] }), action && _jsx("div", { className: "flex-shrink-0", children: action })] }));
};
export const Grid = ({ children, cols = 3, className = '', }) => {
    const colClasses = {
        1: 'grid-cols-1',
        2: 'grid-cols-1 md:grid-cols-2',
        3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
        4: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4',
    };
    return (_jsx("div", { className: `grid gap-6 ${colClasses[cols]} ${className}`, children: children }));
};
