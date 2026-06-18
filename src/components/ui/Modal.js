import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { X } from 'lucide-react';
export const Modal = ({ isOpen, onClose, title, children, size = 'md', }) => {
    if (!isOpen)
        return null;
    const sizeClasses = {
        sm: 'max-w-sm',
        md: 'max-w-md',
        lg: 'max-w-lg',
        xl: 'max-w-2xl',
    };
    return (_jsxs("div", { className: "fixed inset-0 z-50 flex items-center justify-center", children: [_jsx("div", { className: "absolute inset-0 bg-black/60 backdrop-blur-sm", onClick: onClose }), _jsxs("div", { className: `relative border shadow-2xl rounded-[10px] ${sizeClasses[size]} w-full mx-4`, style: {
                    backgroundColor: 'var(--color-bg-primary)',
                    borderColor: 'var(--color-border)'
                }, children: [_jsxs("div", { className: "flex items-center justify-between p-6 border-b", style: { borderColor: 'var(--color-border)' }, children: [_jsx("h2", { className: "text-xl font-bold", style: { color: 'var(--color-text-primary)' }, children: title }), _jsx("button", { onClick: onClose, className: "text-slate-400 hover:text-white transition-colors", children: _jsx(X, { size: 24 }) })] }), _jsx("div", { className: "p-6 max-h-[calc(100vh-200px)] overflow-y-auto", children: children })] })] }));
};
