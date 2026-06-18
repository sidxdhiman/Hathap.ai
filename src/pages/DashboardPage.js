import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useNavigate } from 'react-router-dom';
import { Plus, Gavel, Layers, Zap, TrendingUp, Clock, CheckCircle, Pause, } from 'lucide-react';
import { Header } from '../components/layout/Header';
import { Layout, Container, PageHeader, Grid } from '../components/layout/Layout';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { useApp } from '../context/AppContext';
import { formatDate } from '../utils/helpers';
export const DashboardPage = () => {
    const navigate = useNavigate();
    const { courtrooms, models, agentTemplates } = useApp();
    const stats = [
        {
            label: 'Total Courtrooms',
            value: courtrooms.length,
            icon: Gavel,
            color: 'from-blue-500 to-blue-600',
        },
        {
            label: 'Agent Templates',
            value: agentTemplates.length,
            icon: Layers,
            color: 'from-purple-500 to-purple-600',
        },
        {
            label: 'Connected Models',
            value: models.filter((m) => m.status === 'connected').length,
            icon: Zap,
            color: 'from-green-500 to-green-600',
        },
        {
            label: 'Active Debates',
            value: courtrooms.filter((c) => c.status === 'active').length,
            icon: TrendingUp,
            color: 'from-orange-500 to-orange-600',
        },
    ];
    const recentCourtrooms = courtrooms.slice(0, 3);
    return (_jsxs(Layout, { children: [_jsx(Header, {}), _jsxs(Container, { children: [_jsx(PageHeader, { title: "Dashboard", description: "Manage your debates, models, and agents with Hathap.AI", action: _jsxs(Button, { onClick: () => navigate('/courtrooms/new'), children: [_jsx(Plus, { size: 20 }), "Create Debate"] }) }), _jsxs("div", { className: "mb-12", children: [_jsx("h2", { className: "text-2xl font-bold mb-6", children: "Overview" }), _jsx(Grid, { cols: 4, children: stats.map((stat) => {
                                    const Icon = stat.icon;
                                    return (_jsx(Card, { hover: true, children: _jsxs("div", { className: "flex items-start justify-between", children: [_jsxs("div", { children: [_jsx("p", { className: "text-theme-text-secondary text-sm mb-1 font-medium", children: stat.label }), _jsx("p", { className: "text-4xl font-bold", children: stat.value })] }), _jsx("div", { className: `w-12 h-12 bg-gradient-to-br ${stat.color} flex items-center justify-center`, children: _jsx(Icon, { size: 24, className: "text-white" }) })] }) }, stat.label));
                                }) })] }), _jsxs("div", { className: "mb-12", children: [_jsx("h2", { className: "text-2xl font-bold mb-6", children: "Quick Actions" }), _jsxs(Grid, { cols: 3, children: [_jsx(Card, { hover: true, className: "cursor-pointer", onClick: () => navigate('/courtrooms/new'), children: _jsxs("div", { className: "flex items-center gap-4", children: [_jsx("div", { className: "w-12 h-12 bg-blue-500/20 border border-blue-600 flex items-center justify-center", children: _jsx(Gavel, { size: 24, className: "text-blue-400" }) }), _jsxs("div", { children: [_jsx("h3", { className: "font-semibold", children: "Create Debate" }), _jsx("p", { className: "text-theme-text-secondary text-sm", children: "Start a new debate" })] })] }) }), _jsx(Card, { hover: true, className: "cursor-pointer", onClick: () => navigate('/models'), children: _jsxs("div", { className: "flex items-center gap-4", children: [_jsx("div", { className: "w-12 h-12 bg-purple-500/20 border border-purple-600 flex items-center justify-center", children: _jsx(Zap, { size: 24, className: "text-purple-400" }) }), _jsxs("div", { children: [_jsx("h3", { className: "font-semibold", children: "Manage Models" }), _jsx("p", { className: "text-theme-text-secondary text-sm", children: "Add/edit models" })] })] }) }), _jsx(Card, { hover: true, className: "cursor-pointer", onClick: () => navigate('/agents'), children: _jsxs("div", { className: "flex items-center gap-4", children: [_jsx("div", { className: "w-12 h-12 bg-green-500/20 border border-green-600 flex items-center justify-center", children: _jsx(Layers, { size: 24, className: "text-green-400" }) }), _jsxs("div", { children: [_jsx("h3", { className: "font-semibold", children: "Agent Templates" }), _jsx("p", { className: "text-theme-text-secondary text-sm", children: "Create agents" })] })] }) })] })] }), recentCourtrooms.length > 0 && (_jsxs("div", { children: [_jsxs("div", { className: "flex items-center justify-between mb-6", children: [_jsx("h2", { className: "text-2xl font-bold", children: "Recent Debates" }), _jsx(Button, { variant: "secondary", onClick: () => navigate('/courtrooms'), children: "View All" })] }), _jsx("div", { className: "space-y-4", children: recentCourtrooms.map((courtroom) => (_jsx(Card, { hover: true, className: "cursor-pointer", onClick: () => navigate(`/courtrooms/${courtroom.id}`), children: _jsxs("div", { className: "flex items-start justify-between", children: [_jsxs("div", { className: "flex-1", children: [_jsxs("div", { className: "flex items-center gap-2 mb-2", children: [_jsx("h3", { className: "text-lg font-semibold", children: courtroom.name }), courtroom.status === 'active' && (_jsxs("span", { className: "text-xs status-badge status-badge-active", children: [_jsx(TrendingUp, { className: "inline", size: 12 }), "Active"] })), courtroom.status === 'paused' && (_jsxs("span", { className: "text-xs status-badge bg-yellow-500/20 text-yellow-300 border-yellow-600", children: [_jsx(Pause, { className: "inline", size: 12 }), "Paused"] })), courtroom.status === 'completed' && (_jsxs("span", { className: "text-xs status-badge bg-blue-500/20 text-blue-300 border-blue-600", children: [_jsx(CheckCircle, { className: "inline", size: 12 }), "Completed"] }))] }), _jsx("p", { className: "text-theme-text-secondary text-sm mb-3", children: courtroom.description }), _jsxs("div", { className: "flex items-center gap-4 text-sm text-theme-text-muted", children: [_jsxs("div", { className: "flex items-center gap-1", children: [_jsx(Gavel, { size: 14 }), courtroom.participants.length, " participants"] }), _jsxs("div", { className: "flex items-center gap-1", children: [_jsx(Clock, { size: 14 }), formatDate(courtroom.createdAt)] })] })] }), _jsx("div", { className: "flex-shrink-0", children: _jsx("div", { className: "w-12 h-12 bg-blue-500/10 border border-blue-600 flex items-center justify-center", children: _jsx(Gavel, { size: 24, className: "text-blue-400" }) }) })] }) }, courtroom.id))) })] }))] })] }));
};
