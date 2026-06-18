import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useNavigate } from 'react-router-dom';
import { Plus, Gavel, Clock, Users, TrendingUp, CheckCircle, Pause, ChevronRight, } from 'lucide-react';
import { Header } from '../components/layout/Header';
import { Layout, Container, PageHeader } from '../components/layout/Layout';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { useApp } from '../context/AppContext';
import { formatDate } from '../utils/helpers';
export const CourtroomsPage = () => {
    const navigate = useNavigate();
    const { courtrooms } = useApp();
    const statusConfig = {
        active: { label: 'Active', icon: TrendingUp, color: 'text-green-400', bgColor: 'bg-green-500/20' },
        paused: { label: 'Paused', icon: Pause, color: 'text-yellow-400', bgColor: 'bg-yellow-500/20' },
        completed: { label: 'Completed', icon: CheckCircle, color: 'text-blue-400', bgColor: 'bg-blue-500/20' },
        draft: { label: 'Draft', icon: Gavel, color: 'text-theme-text-secondary', bgColor: 'bg-theme-bg-tertiary' },
    };
    const modeLabels = {
        consensus: 'Consensus Mode',
        majority: 'Majority Vote',
        'devils-advocate': "Devil's Advocate",
        judge: 'Judge Mode',
        open: 'Open Debate',
    };
    return (_jsxs(Layout, { children: [_jsx(Header, {}), _jsxs(Container, { children: [_jsx(PageHeader, { title: "Courtrooms", description: "Manage your debate rooms and discussions", action: _jsxs(Button, { onClick: () => navigate('/courtrooms/new'), children: [_jsx(Plus, { size: 20 }), "Create Courtroom"] }) }), _jsx("div", { className: "space-y-4", children: courtrooms.length === 0 ? (_jsxs(Card, { className: "text-center py-12", children: [_jsx(Gavel, { className: "mx-auto mb-4 text-theme-text-secondary", size: 48 }), _jsx("p", { className: "text-theme-text-secondary", children: "No courtrooms yet" }), _jsx(Button, { className: "mt-4", onClick: () => navigate('/courtrooms/new'), children: "Create Your First Courtroom" })] })) : (courtrooms.map((courtroom) => {
                            const statusConfig_ = statusConfig[courtroom.status];
                            const StatusIcon = statusConfig_.icon;
                            const modeLabel = modeLabels[courtroom.mode];
                            return (_jsx(Card, { hover: true, className: "cursor-pointer", onClick: () => navigate(`/courtrooms/${courtroom.id}`), children: _jsxs("div", { className: "flex items-start justify-between gap-6", children: [_jsxs("div", { className: "flex-1", children: [_jsxs("div", { className: "flex items-center gap-3 mb-2", children: [_jsx("h3", { className: "text-xl font-semibold", children: courtroom.name }), _jsxs("div", { className: `flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${statusConfig_.bgColor} ${statusConfig_.color}`, children: [_jsx(StatusIcon, { size: 14 }), statusConfig_.label] })] }), _jsx("p", { className: "text-theme-text-secondary mb-4", children: courtroom.description }), _jsxs("div", { className: "flex items-center gap-6 text-sm text-theme-text-secondary", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx(Users, { size: 16 }), _jsxs("span", { children: [courtroom.participants.length, " participants"] })] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx(Clock, { size: 16 }), _jsx("span", { children: formatDate(courtroom.createdAt) })] }), _jsx("div", { className: "px-3 py-1 rounded-lg bg-white/5 border border-white/10 text-xs", children: modeLabel })] }), _jsxs("div", { className: "mt-3 text-xs text-theme-text-muted", children: [_jsx("strong", { children: "Objective:" }), " ", courtroom.objective] })] }), _jsxs("div", { className: "flex-shrink-0 flex items-center gap-4", children: [_jsxs("div", { className: "text-right", children: [_jsx("div", { className: "text-2xl font-bold", children: courtroom.participants.length }), _jsx("div", { className: "text-xs text-theme-text-muted", children: "Participants" })] }), _jsx(ChevronRight, { size: 24, className: "text-theme-text-muted" })] })] }) }, courtroom.id));
                        })) })] })] }));
};
