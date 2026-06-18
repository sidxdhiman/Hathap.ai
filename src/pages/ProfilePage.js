import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { ArrowLeft, Moon, Sun, Save } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../components/layout/Header';
import { Layout, Container, PageHeader } from '../components/layout/Layout';
import { Card, CardBody, CardHeader, CardFooter } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { useTheme } from '../context/ThemeContext';
import { useApp } from '../context/AppContext';
export const ProfilePage = () => {
    const navigate = useNavigate();
    const { theme, toggleTheme } = useTheme();
    const [isSaved, setIsSaved] = useState(false);
    const [profile, setProfile] = useState({
        name: 'Alex Johnson',
        email: 'alex@hathap.ai',
        organization: 'AI Research Lab',
        role: 'Researcher',
    });
    const { models, agentTemplates, courtrooms } = useApp();
    const handleSave = () => {
        setIsSaved(true);
        setTimeout(() => setIsSaved(false), 2000);
    };
    return (_jsxs(Layout, { children: [_jsx(Header, {}), _jsxs(Container, { children: [_jsx(PageHeader, { title: "Profile Settings", description: "Manage your account and preferences", action: _jsxs(Button, { variant: "ghost", onClick: () => navigate('/dashboard'), children: [_jsx(ArrowLeft, { size: 18 }), "Back"] }) }), _jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-4xl", children: [_jsx("div", { className: "lg:col-span-2", children: _jsxs(Card, { children: [_jsx(CardHeader, { children: _jsx("h3", { className: "text-xl font-bold", children: "Account Information" }) }), _jsxs(CardBody, { className: "space-y-4", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-sm font-semibold mb-2 text-slate-200", children: "Full Name" }), _jsx(Input, { value: profile.name, onChange: (e) => setProfile({ ...profile, name: e.target.value }) })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-sm font-semibold mb-2 text-slate-200", children: "Email" }), _jsx(Input, { type: "email", value: profile.email, onChange: (e) => setProfile({ ...profile, email: e.target.value }) })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-sm font-semibold mb-2 text-slate-200", children: "Organization" }), _jsx(Input, { value: profile.organization, onChange: (e) => setProfile({ ...profile, organization: e.target.value }) })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-sm font-semibold mb-2 text-slate-200", children: "Role" }), _jsx(Input, { value: profile.role, onChange: (e) => setProfile({ ...profile, role: e.target.value }) })] })] }), _jsx(CardFooter, { children: _jsxs(Button, { onClick: handleSave, className: "flex-1 justify-center", children: [_jsx(Save, { size: 18 }), isSaved ? 'Saved!' : 'Save Changes'] }) })] }) }), _jsxs("div", { children: [_jsxs(Card, { children: [_jsx(CardHeader, { children: _jsx("h3", { className: "text-lg font-bold", children: "Theme" }) }), _jsx(CardBody, { className: "space-y-4", children: _jsxs("div", { className: "space-y-3", children: [_jsx("div", { className: `p-4 border cursor-pointer transition-all ${theme === 'dark'
                                                                ? 'bg-blue-500/20 border-blue-600'
                                                                : 'bg-slate-800 border-slate-700 hover:border-slate-600'}`, onClick: () => theme !== 'dark' && toggleTheme(), children: _jsxs("div", { className: "flex items-center gap-3", children: [_jsx(Moon, { size: 24, className: theme === 'dark' ? 'text-blue-400' : 'text-slate-400' }), _jsxs("div", { children: [_jsx("p", { className: "font-semibold text-slate-100", children: "Dark Mode" }), _jsx("p", { className: "text-xs text-slate-400", children: "Professional and comfortable" })] })] }) }), _jsx("div", { className: `p-4 border cursor-pointer transition-all ${theme === 'light'
                                                                ? 'bg-blue-500/20 border-blue-600'
                                                                : 'bg-slate-800 border-slate-700 hover:border-slate-600'}`, onClick: () => theme !== 'light' && toggleTheme(), children: _jsxs("div", { className: "flex items-center gap-3", children: [_jsx(Sun, { size: 24, className: theme === 'light' ? 'text-blue-400' : 'text-slate-400' }), _jsxs("div", { children: [_jsx("p", { className: "font-semibold text-slate-100", children: "Light Mode" }), _jsx("p", { className: "text-xs text-slate-400", children: "Clean and bright" })] })] }) })] }) })] }), _jsxs(Card, { className: "mt-6", children: [_jsx(CardHeader, { children: _jsx("h3", { className: "text-lg font-bold", children: "Quick Stats" }) }), _jsxs(CardBody, { className: "space-y-3", children: [_jsxs("div", { className: "flex justify-between items-center p-2 bg-slate-800 border border-slate-700", children: [_jsx("span", { className: "text-slate-400", children: "Debates Created" }), _jsx("span", { className: "font-bold", children: courtrooms.length })] }), _jsxs("div", { className: "flex justify-between items-center p-2 bg-slate-800 border border-slate-700", children: [_jsx("span", { className: "text-slate-400", children: "Models Connected" }), _jsx("span", { className: "font-bold", children: models.length })] }), _jsxs("div", { className: "flex justify-between items-center p-2 bg-slate-800 border border-slate-700", children: [_jsx("span", { className: "text-slate-400", children: "Agents Created" }), _jsx("span", { className: "font-bold", children: agentTemplates.length })] })] })] })] })] }), _jsx("div", { className: "mt-8 max-w-4xl", children: _jsxs(Card, { children: [_jsx(CardHeader, { children: _jsx("h3", { className: "text-lg font-bold", children: "Account Actions" }) }), _jsxs(CardBody, { className: "space-y-3", children: [_jsx(Button, { variant: "secondary", className: "w-full justify-center", children: "Change Password" }), _jsx(Button, { variant: "secondary", className: "w-full justify-center", children: "Download Data" }), _jsx(Button, { variant: "danger", className: "w-full justify-center", children: "Delete Account" })] })] }) })] })] }));
};
