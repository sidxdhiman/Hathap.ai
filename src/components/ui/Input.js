import { jsx as _jsx } from "react/jsx-runtime";
export const Input = ({ className = '', ...props }) => {
    return _jsx("input", { className: `input-field ${className}`, ...props });
};
export const TextArea = ({ className = '', ...props }) => {
    return _jsx("textarea", { className: `input-field resize-none ${className}`, ...props });
};
export const Select = ({ className = '', children, ...props }) => {
    return (_jsx("select", { className: `input-field ${className}`, ...props, children: children }));
};
