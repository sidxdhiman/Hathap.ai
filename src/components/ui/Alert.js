import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { AlertCircle, CheckCircle, InfoIcon } from 'lucide-react';
export const Alert = ({ variant = 'info', children, icon }) => {
    const variantClasses = {
        success: 'bg-green-500/20 border-green-600 text-green-300',
        error: 'bg-red-500/20 border-red-600 text-red-300',
        info: 'bg-blue-500/20 border-blue-600 text-blue-300',
    };
    const defaultIcon = {
        success: _jsx(CheckCircle, { size: 20 }),
        error: _jsx(AlertCircle, { size: 20 }),
        info: _jsx(InfoIcon, { size: 20 }),
    };
    return (_jsxs("div", { className: `border ${variantClasses[variant]} p-4 flex gap-3 items-start`, children: [_jsx("div", { className: "flex-shrink-0 mt-0.5", children: icon || defaultIcon[variant] }), _jsx("div", { className: "flex-1", children: children })] }));
};
export const Badge = ({ children, variant = 'primary', }) => {
    const variantClasses = {
        primary: 'bg-blue-500/20 text-blue-300 border border-blue-600',
        success: 'bg-green-500/20 text-green-300 border border-green-600',
        error: 'bg-red-500/20 text-red-300 border border-red-600',
        warning: 'bg-yellow-500/20 text-yellow-300 border border-yellow-600',
    };
    return (_jsx("span", { className: `inline-block px-3 py-1 text-xs font-semibold ${variantClasses[variant]}`, children: children }));
};
export const Loading = ({ message = 'Loading...' }) => {
    return (_jsxs("div", { className: "flex flex-col items-center justify-center py-12 gap-4", children: [_jsx("div", { className: "w-8 h-8 border-4 border-blue-500/20 border-t-blue-500 animate-spin" }), _jsx("p", { className: "text-theme-text-secondary", children: message })] }));
};
