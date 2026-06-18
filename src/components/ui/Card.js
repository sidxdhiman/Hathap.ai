import { jsx as _jsx } from "react/jsx-runtime";
export const Card = ({ hover = false, className = '', children, ...props }) => {
    return (_jsx("div", { className: `glassmorphism ${hover ? 'card-hover' : ''} p-6 ${className}`, ...props, children: children }));
};
export const CardHeader = ({ className = '', children, ...props }) => (_jsx("div", { className: `pb-4 border-b border-theme-border mb-4 ${className}`, ...props, children: children }));
export const CardBody = ({ className = '', children, ...props }) => (_jsx("div", { className: `space-y-4 ${className}`, ...props, children: children }));
export const CardFooter = ({ className = '', children, ...props }) => (_jsx("div", { className: `pt-4 border-t border-theme-border mt-4 flex gap-2 ${className}`, ...props, children: children }));
