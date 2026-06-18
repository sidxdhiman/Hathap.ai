import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check } from 'lucide-react';
import { Header } from '../components/layout/Header';
import { Layout, Container } from '../components/layout/Layout';
import { Card, CardBody, CardHeader, CardFooter } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { TextArea } from '../components/ui/Input';
import { useApp } from '../context/AppContext';
import { generateId } from '../utils/helpers';
export const CreateCourtroomPage = () => {
    const navigate = useNavigate();
    const { addCourtroom } = useApp();
    const [step, setStep] = useState(1);
    const [isCreating, setIsCreating] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        objective: '',
        mode: 'consensus',
    });
    const modes = [
        {
            id: 'consensus',
            label: 'Consensus Mode',
            description: 'All participants must agree on a solution',
        },
        {
            id: 'majority',
            label: 'Majority Vote',
            description: 'Majority decision wins',
        },
        {
            id: 'devils-advocate',
            label: "Devil's Advocate",
            description: 'One participant challenges all others',
        },
        {
            id: 'judge',
            label: 'Judge Mode',
            description: 'One participant makes final decision',
        },
        {
            id: 'open',
            label: 'Open Debate',
            description: 'Free-form discussion without conclusion',
        },
    ];
    const handleCreate = async () => {
        if (!formData.name || !formData.objective)
            return;
        setIsCreating(true);
        const newCourtroom = {
            id: generateId('courtroom'),
            name: formData.name,
            description: formData.description,
            objective: formData.objective,
            mode: formData.mode,
            participants: [],
            status: 'draft',
            createdAt: new Date(),
            updatedAt: new Date(),
        };
        // simulate small creation delay for UX while backend processes
        try {
            addCourtroom(newCourtroom);
            await new Promise((r) => setTimeout(r, 700));
            navigate(`/courtrooms/${newCourtroom.id}`);
        }
        finally {
            setIsCreating(false);
        }
    };
    return (_jsxs(Layout, { children: [_jsx(Header, {}), _jsxs(Container, { children: [_jsxs(Button, { variant: "secondary", onClick: () => navigate('/courtrooms'), className: "mb-8", children: [_jsx(ArrowLeft, { size: 16 }), "Back"] }), _jsxs("div", { className: "max-w-2xl mx-auto min-h-[60vh] flex flex-col justify-start lg:justify-center", children: [_jsx("div", { className: "flex items-center justify-between mb-12", children: [1, 2].map((s) => (_jsxs("div", { className: "flex items-center gap-4", children: [_jsx("div", { className: `w-10 h-10 rounded-full flex items-center justify-center font-semibold ${step >= s ? 'bg-blue-500/20 text-blue-300' : 'bg-white/5 text-slate-500'}`, children: step > s ? _jsx(Check, { size: 20 }) : s }), s < 2 && (_jsx("div", { className: `w-16 h-1 ${step > s ? 'bg-blue-500/30' : 'bg-white/10'}` }))] }, s))) }), step === 1 && (_jsxs(Card, { children: [_jsxs(CardHeader, { children: [_jsx("h2", { className: "text-2xl font-bold", children: "Create New Courtroom" }), _jsx("p", { className: "text-slate-400 mt-2", children: "Step 1 of 2: Basic Information" })] }), _jsxs(CardBody, { className: "space-y-6", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium mb-2", children: "Courtroom Name" }), _jsx(Input, { placeholder: "e.g., Microservices vs Monolith", value: formData.name, onChange: (e) => setFormData({ ...formData, name: e.target.value }) })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium mb-2", children: "Description" }), _jsx(TextArea, { placeholder: "Describe the purpose of this courtroom...", value: formData.description, onChange: (e) => setFormData({ ...formData, description: e.target.value }), rows: 3 })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium mb-2", children: "Debate Objective" }), _jsx(TextArea, { placeholder: "What should the AI agents decide or discuss?", value: formData.objective, onChange: (e) => setFormData({ ...formData, objective: e.target.value }), rows: 4 })] })] }), _jsx(CardFooter, { children: _jsx(Button, { onClick: () => setStep(2), className: "flex-1 justify-center", disabled: !formData.name || !formData.objective, children: "Continue" }) })] })), step === 2 && (_jsxs(_Fragment, { children: [_jsx(Card, { className: "mb-6", children: _jsxs(CardHeader, { children: [_jsx("h2", { className: "text-2xl font-bold", children: "Select Debate Mode" }), _jsx("p", { className: "text-slate-400 mt-2", children: "Step 2 of 2: How should the debate work?" })] }) }), _jsx("div", { className: "space-y-3 mb-8 max-h-[48vh] overflow-auto pr-2 no-scrollbar", children: modes.map((mode) => (_jsx(Card, { hover: true, className: `cursor-pointer transition-all ${formData.mode === mode.id
                                                ? 'ring-2 ring-blue-500 bg-blue-500/10'
                                                : ''}`, onClick: () => setFormData({ ...formData, mode: mode.id }), children: _jsxs("div", { className: "flex items-start gap-4 p-4", children: [_jsx("div", { className: `w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${formData.mode === mode.id
                                                            ? 'border-blue-400 bg-blue-400'
                                                            : 'border-white/20'}`, children: formData.mode === mode.id && (_jsx(Check, { size: 16, className: "text-slate-900" })) }), _jsxs("div", { className: "flex-1", children: [_jsx("h3", { className: "font-semibold", children: mode.label }), _jsx("p", { className: "text-sm text-slate-400 mt-1", children: mode.description })] })] }) }, mode.id))) }), _jsxs("div", { className: "flex gap-2", children: [_jsx(Button, { variant: "secondary", onClick: () => setStep(1), className: "flex-1", children: "Back" }), _jsx(Button, { onClick: handleCreate, className: "flex-1", disabled: isCreating, children: isCreating ? 'Creating...' : 'Create Courtroom' })] })] }))] }), isCreating && (_jsxs("div", { className: "fixed inset-0 z-50 flex items-center justify-center", children: [_jsx("div", { className: "absolute inset-0 bg-black/50" }), _jsxs("div", { className: "relative bg-slate-900 text-slate-100 p-6 rounded shadow-lg w-full max-w-sm text-center", children: [_jsx("div", { className: "flex items-center justify-center mb-4", children: _jsx("div", { className: "w-8 h-8 border-4 border-current border-t-transparent rounded-full animate-spin" }) }), _jsx("div", { className: "text-lg font-semibold", children: "Creating your courtroom" }), _jsx("div", { className: "text-sm text-slate-400 mt-2", children: "Please wait a moment while we set things up." })] })] }))] })] }));
};
