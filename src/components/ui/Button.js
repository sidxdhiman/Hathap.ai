import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export const Button = ({ variant = 'primary', size = 'md', isLoading = false, children, className = '', disabled, ...props }) => {
    const baseClasses = 'font-semibold transition-all duration-150 flex items-center gap-2 border';
    const variantClasses = {
        primary: 'btn-primary',
        secondary: 'btn-secondary',
        danger: 'btn-danger',
        ghost: 'btn-ghost',
    };
    const sizeClasses = {
        sm: 'px-3 py-1.5 text-sm',
        md: 'px-4 py-2 text-base',
        lg: 'px-6 py-3 text-lg',
    };
    return (_jsxs("button", { className: `${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`, disabled: disabled || isLoading, ...props, children: [isLoading && _jsx("div", { className: "w-4 h-4 border-2 border-current border-t-transparent animate-spin" }), children] }));
};
