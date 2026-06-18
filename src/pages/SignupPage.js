import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Gavel, Mail, User, Lock } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
export const SignupPage = () => {
    const navigate = useNavigate();
    const auth = useAuth();
    const { refreshData } = useApp();
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            await auth.signup(name, email, password);
            refreshData();
            navigate('/dashboard');
        }
        catch (e) {
            alert('Signup failed');
        }
        finally {
            setIsLoading(false);
        }
    };
    return (_jsx("div", { className: "min-h-screen bg-theme-bg-primary flex items-center justify-center px-4", children: _jsxs("div", { className: "w-full max-w-md", children: [_jsx("div", { className: "flex justify-center mb-8", children: _jsx("div", { className: "w-16 h-16 bg-gradient-to-br from-blue-400 to-cyan-400 flex items-center justify-center shadow-2xl shadow-blue-500/20", children: _jsx(Gavel, { size: 40, className: "text-slate-950" }) }) }), _jsxs("div", { className: "text-center mb-8", children: [_jsx("h1", { className: "text-4xl font-bold mb-2 gradient-text", children: "Hathap.AI" }), _jsx("p", { className: "text-theme-text-secondary", children: "Create your account" })] }), _jsxs("form", { onSubmit: handleSubmit, className: "space-y-6", children: [_jsxs("div", { className: "glassmorphism p-6 space-y-4 border-theme-border", children: [_jsxs("div", { children: [_jsxs("label", { className: "block text-sm font-semibold text-theme-text-primary mb-2", children: [_jsx(User, { size: 16, className: "inline mr-2" }), "Full name"] }), _jsx(Input, { value: name, onChange: (e) => setName(e.target.value), required: true })] }), _jsxs("div", { children: [_jsxs("label", { className: "block text-sm font-semibold text-theme-text-primary mb-2", children: [_jsx(Mail, { size: 16, className: "inline mr-2" }), "Email"] }), _jsx(Input, { type: "email", value: email, onChange: (e) => setEmail(e.target.value), required: true })] }), _jsxs("div", { children: [_jsxs("label", { className: "block text-sm font-semibold text-theme-text-primary mb-2", children: [_jsx(Lock, { size: 16, className: "inline mr-2" }), "Password"] }), _jsx(Input, { type: "password", value: password, onChange: (e) => setPassword(e.target.value), required: true })] }), _jsx(Button, { type: "submit", isLoading: isLoading, className: "w-full justify-center", children: "Create Account" })] }), _jsxs("p", { className: "text-center text-theme-text-secondary text-sm", children: ["Already have an account? ", _jsx("a", { className: "text-blue-400 hover:underline", href: "/", children: "Sign in" })] })] })] }) }));
};
