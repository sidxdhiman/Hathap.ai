import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { Plus, Edit2, Trash2, CheckCircle, AlertCircle, Clock, TestTube, } from 'lucide-react';
import { Header } from '../components/layout/Header';
import { Layout, Container, PageHeader, Grid } from '../components/layout/Layout';
import { Card, CardBody, CardHeader, CardFooter } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { useApp } from '../context/AppContext';
import { getStatusColor, getStatusText } from '../utils/helpers';
export const ModelsPage = () => {
    const { models, addModel, updateModel, deleteModel } = useApp();
    const [isAddingModel, setIsAddingModel] = useState(false);
    const [editingModel, setEditingModel] = useState(null);
    const [testingModel, setTestingModel] = useState(null);
    const [testResult, setTestResult] = useState(null);
    const [formData, setFormData] = useState({
        provider: '',
        displayName: '',
        modelName: '',
        apiKey: '',
        baseUrl: '',
    });
    const handleAddModel = () => {
        if (!formData.provider)
            return;
        const newModel = {
            id: `model-${Date.now()}`,
            provider: formData.provider,
            displayName: formData.displayName,
            modelName: formData.modelName,
            apiKey: formData.apiKey,
            baseUrl: formData.baseUrl,
            status: 'untested',
            enabled: true,
        };
        addModel(newModel);
        setFormData({ provider: '', displayName: '', modelName: '', apiKey: '', baseUrl: '' });
        setIsAddingModel(false);
    };
    const handleEditModel = (model) => {
        updateModel(model.id, {
            enabled: !model.enabled,
        });
    };
    const handleTestConnection = (id) => {
        setTestingModel(id);
        setTimeout(() => {
            setTestResult({ id, success: Math.random() > 0.2 });
            setTestingModel(null);
            setTimeout(() => setTestResult(null), 2000);
        }, 1500);
    };
    return (_jsxs(Layout, { children: [_jsx(Header, {}), _jsxs(Container, { children: [_jsx(PageHeader, { title: "Models", description: "Manage your AI model integrations", action: _jsxs(Button, { onClick: () => setIsAddingModel(true), children: [_jsx(Plus, { size: 20 }), "Add Model"] }) }), models.length === 0 ? (_jsxs(Card, { className: "text-center py-12", children: [_jsx(AlertCircle, { className: "mx-auto mb-4 text-slate-400", size: 48 }), _jsx("p", { className: "text-slate-400", children: "No models configured yet" }), _jsx(Button, { className: "mt-4", onClick: () => setIsAddingModel(true), children: "Add Your First Model" })] })) : (_jsx(Grid, { cols: 2, children: models.map((model) => (_jsxs(Card, { hover: true, children: [_jsx(CardHeader, { children: _jsxs("div", { className: "flex items-start justify-between", children: [_jsxs("div", { className: "flex-1", children: [_jsx("h3", { className: "text-lg font-semibold", children: model.displayName }), _jsx("p", { className: "text-sm text-slate-400", children: model.provider })] }), _jsxs("div", { className: `px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(model.status)} ${getStatusText(model.status)}`, children: [model.status === 'connected' && _jsx(CheckCircle, { className: "inline mr-1", size: 12 }), model.status === 'error' && _jsx(AlertCircle, { className: "inline mr-1", size: 12 }), model.status === 'untested' && _jsx(Clock, { className: "inline mr-1", size: 12 }), model.status] })] }) }), _jsx(CardBody, { children: _jsxs("div", { className: "space-y-2 text-sm text-slate-400", children: [_jsxs("div", { children: [_jsx("span", { className: "text-slate-500", children: "Model:" }), " ", model.modelName] }), _jsxs("div", { children: [_jsx("span", { className: "text-slate-500", children: "Base URL:" }), ' ', _jsx("span", { className: "font-mono text-xs", children: model.baseUrl })] }), _jsxs("div", { children: [_jsx("span", { className: "text-slate-500", children: "API Key:" }), ' ', _jsx("span", { className: "font-mono text-xs", children: model.apiKey })] })] }) }), _jsxs(CardFooter, { className: "gap-2", children: [_jsxs(Button, { size: "sm", variant: "secondary", onClick: () => handleTestConnection(model.id), isLoading: testingModel === model.id, children: [_jsx(TestTube, { size: 16 }), "Test"] }), _jsxs(Button, { size: "sm", variant: model.enabled ? 'secondary' : 'secondary', onClick: () => handleEditModel(model), children: [_jsx(Edit2, { size: 16 }), model.enabled ? 'Enabled' : 'Disabled'] }), _jsxs(Button, { size: "sm", variant: "danger", onClick: () => deleteModel(model.id), children: [_jsx(Trash2, { size: 16 }), "Delete"] })] })] }, model.id))) })), _jsx(Modal, { isOpen: isAddingModel, onClose: () => setIsAddingModel(false), title: "Add New Model", children: _jsxs("div", { className: "space-y-4", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium mb-2", children: "Provider Name" }), _jsx(Input, { placeholder: "e.g., OpenAI, Anthropic", value: formData.provider, onChange: (e) => setFormData({ ...formData, provider: e.target.value }) })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium mb-2", children: "Display Name" }), _jsx(Input, { placeholder: "e.g., GPT-4 Turbo", value: formData.displayName, onChange: (e) => setFormData({ ...formData, displayName: e.target.value }) })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium mb-2", children: "Model Name" }), _jsx(Input, { placeholder: "e.g., gpt-4-turbo", value: formData.modelName, onChange: (e) => setFormData({ ...formData, modelName: e.target.value }) })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium mb-2", children: "Base URL" }), _jsx(Input, { placeholder: "https://api.openai.com/v1", value: formData.baseUrl, onChange: (e) => setFormData({ ...formData, baseUrl: e.target.value }) })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium mb-2", children: "API Key" }), _jsx(Input, { type: "password", placeholder: "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022", value: formData.apiKey, onChange: (e) => setFormData({ ...formData, apiKey: e.target.value }) })] }), _jsxs("div", { className: "flex gap-2 pt-4", children: [_jsx(Button, { onClick: handleAddModel, className: "flex-1", children: "Add Model" }), _jsx(Button, { variant: "secondary", onClick: () => setIsAddingModel(false), className: "flex-1", children: "Cancel" })] })] }) })] })] }));
};
