import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { Plus, Edit2, Trash2 } from 'lucide-react';
import { Header } from '../components/layout/Header';
import { Layout, Container, PageHeader, Grid } from '../components/layout/Layout';
import { Card, CardBody, CardHeader, CardFooter } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { TextArea } from '../components/ui/Input';
import { Select } from '../components/ui/Input';
import { useApp } from '../context/AppContext';
import { generateId } from '../utils/helpers';
export const AgentsPage = () => {
    const { agentTemplates, addAgentTemplate, deleteAgentTemplate, models } = useApp();
    const [isAddingAgent, setIsAddingAgent] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        systemPrompt: '',
        assignedModelId: '',
        avatar: '👤',
        colorTag: 'blue',
    });
    const colors = ['blue', 'purple', 'green', 'red', 'orange', 'pink', 'yellow', 'cyan'];
    const handleAddAgent = () => {
        if (!formData.name || !formData.assignedModelId)
            return;
        const newAgent = {
            id: generateId('agent'),
            name: formData.name,
            description: formData.description,
            systemPrompt: formData.systemPrompt,
            assignedModelId: formData.assignedModelId,
            avatar: formData.avatar,
            colorTag: formData.colorTag,
            createdAt: new Date(),
        };
        addAgentTemplate(newAgent);
        setFormData({
            name: '',
            description: '',
            systemPrompt: '',
            assignedModelId: '',
            avatar: '👤',
            colorTag: 'blue',
        });
        setIsAddingAgent(false);
    };
    return (_jsxs(Layout, { children: [_jsx(Header, {}), _jsxs(Container, { children: [_jsx(PageHeader, { title: "Agent Templates", description: "Create and manage AI agent personas", action: _jsxs(Button, { onClick: () => setIsAddingAgent(true), children: [_jsx(Plus, { size: 20 }), "Create Agent"] }) }), _jsx(Grid, { cols: 3, children: agentTemplates.map((agent) => {
                            const assignedModel = models.find((m) => m.id === agent.assignedModelId);
                            return (_jsxs(Card, { hover: true, children: [_jsx(CardHeader, { children: _jsxs("div", { className: "flex items-start justify-between", children: [_jsxs("div", { className: "flex items-center gap-3 flex-1", children: [_jsx("div", { className: "text-3xl", children: agent.avatar }), _jsxs("div", { children: [_jsx("h3", { className: "font-semibold", children: agent.name }), _jsx("p", { className: "text-xs text-theme-text-secondary", children: assignedModel?.displayName || 'No model' })] })] }), _jsx("div", { className: `w-3 h-3 rounded-full bg-${agent.colorTag}-500` })] }) }), _jsxs(CardBody, { children: [_jsx("p", { className: "text-sm text-theme-text-secondary mb-3", children: agent.description }), _jsx("p", { className: "text-xs text-theme-text-muted bg-white/5 rounded p-2 max-h-20 overflow-y-auto", children: agent.systemPrompt })] }), _jsxs(CardFooter, { children: [_jsxs(Button, { size: "sm", variant: "secondary", className: "flex-1", children: [_jsx(Edit2, { size: 16 }), "Edit"] }), _jsx(Button, { size: "sm", variant: "danger", onClick: () => deleteAgentTemplate(agent.id), children: _jsx(Trash2, { size: 16 }) })] })] }, agent.id));
                        }) }), _jsx(Modal, { isOpen: isAddingAgent, onClose: () => setIsAddingAgent(false), title: "Create Agent Template", size: "lg", children: _jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "grid grid-cols-2 gap-4", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium mb-2", children: "Agent Name" }), _jsx(Input, { placeholder: "e.g., Senior Architect", value: formData.name, onChange: (e) => setFormData({ ...formData, name: e.target.value }) })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium mb-2", children: "Assigned Model" }), _jsxs(Select, { value: formData.assignedModelId, onChange: (e) => setFormData({ ...formData, assignedModelId: e.target.value }), children: [_jsx("option", { value: "", children: "Select a model" }), models.map((model) => (_jsx("option", { value: model.id, children: model.displayName }, model.id)))] })] })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium mb-2", children: "Description" }), _jsx(Input, { placeholder: "Brief description of this agent's role", value: formData.description, onChange: (e) => setFormData({ ...formData, description: e.target.value }) })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium mb-2", children: "System Prompt" }), _jsx(TextArea, { placeholder: "Define the agent's personality, expertise, and behavior...", value: formData.systemPrompt, onChange: (e) => setFormData({ ...formData, systemPrompt: e.target.value }), rows: 5 })] }), _jsxs("div", { className: "grid grid-cols-2 gap-4", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium mb-2", children: "Avatar" }), _jsx(Input, { maxLength: 2, value: formData.avatar, onChange: (e) => setFormData({ ...formData, avatar: e.target.value }), className: "text-2xl" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium mb-2", children: "Color Tag" }), _jsx("div", { className: "grid grid-cols-4 gap-2", children: colors.map((color) => (_jsx("button", { onClick: () => setFormData({ ...formData, colorTag: color }), className: `w-full h-10 rounded-lg bg-${color}-500 ${formData.colorTag === color
                                                            ? `ring-2 ring-${color}-300`
                                                            : 'opacity-50'}` }, color))) })] })] }), _jsxs("div", { className: "flex gap-2 pt-4", children: [_jsx(Button, { onClick: handleAddAgent, className: "flex-1", children: "Create Agent" }), _jsx(Button, { variant: "secondary", onClick: () => setIsAddingAgent(false), className: "flex-1", children: "Cancel" })] })] }) })] })] }));
};
