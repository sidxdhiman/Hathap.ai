import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  KeyRound,
  Layers,
  Shield,
} from 'lucide-react';
import { Header } from '../components/layout/Header';
import { Layout, Container } from '../components/layout/Layout';
import { Card, CardBody, CardFooter, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import logo from '../assets/logo-1.png';
import { Input } from '../components/ui/Input';
import { TextArea } from '../components/ui/Input';
import { Select } from '../components/ui/Input';
import { Alert } from '../components/ui/Alert';
import { useApp } from '../context/AppContext';
import { ModelPicker } from '../components/ui/ModelPicker';

const PROVIDER_PRESETS = [
  {
    provider: 'OpenAI',
    displayName: 'OpenAI GPT-4o',
    modelName: 'gpt-4o',
    baseUrl: 'https://api.openai.com/v1',
  },
  {
    provider: 'Anthropic',
    displayName: 'Claude 3.5 Sonnet',
    modelName: 'claude-3-5-sonnet-20241022',
    baseUrl: 'https://api.anthropic.com/v1',
  },
  {
    provider: 'Google',
    displayName: 'Gemini 1.5 Pro',
    modelName: 'gemini-1.5-pro',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
  },
];

export const OnboardingPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    models,
    agentTemplates,
    addModel,
    addCourtroom,
    testModel,
    updateAgentTemplate,
    refreshData,
  } = useApp();

  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [createdModelId, setCreatedModelId] = useState<string | null>(null);
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);

  const [modelForm, setModelForm] = useState({
    provider: 'OpenAI',
    displayName: 'OpenAI GPT-4o',
    modelName: 'gpt-4o',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
  });

  const [courtroomForm, setCourtroomForm] = useState({
    name: 'My First Debate',
    objective: 'Should we adopt a microservices architecture for our next product release?',
    mode: 'consensus' as const,
  });

  useEffect(() => {
    if (agentTemplates.length > 0 && selectedAgents.length === 0) {
      setSelectedAgents(agentTemplates.slice(0, 5).map((agent) => agent.id));
    }
  }, [agentTemplates, selectedAgents.length]);

  const primaryModel = useMemo(
    () => models.find((model) => model.id === createdModelId) || models[0],
    [models, createdModelId]
  );

  const applyPreset = (preset: (typeof PROVIDER_PRESETS)[number]) => {
    setModelForm((prev) => ({ ...prev, ...preset }));
  };

  const handleSaveModel = async () => {
    setError(null);
    setIsSaving(true);
    try {
      const saved = await addModel({
        ...modelForm,
        enabled: true,
      });
      setCreatedModelId(saved.id);
      const test = await testModel(saved.id);
      if (!test.success) {
        setError(`Model saved but connection test failed: ${test.error}`);
      }
      await refreshData();
      setStep(2);
    } catch (err: any) {
      setError(err.message || 'Failed to save model');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAssignAgents = async () => {
    if (!primaryModel) {
      setError('Add a model before assigning agents.');
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      await Promise.all(
        agentTemplates.map((agent) =>
          updateAgentTemplate(agent.id, { assignedModelId: primaryModel.id })
        )
      );
      await refreshData();
      setStep(3);
    } catch (err: any) {
      setError(err.message || 'Failed to assign models to agents');
    } finally {
      setIsSaving(false);
    }
  };

  const toggleAgent = (agentId: string) => {
    setSelectedAgents((prev) =>
      prev.includes(agentId) ? prev.filter((id) => id !== agentId) : [...prev, agentId]
    );
  };

  const handleCreateCourtroom = async () => {
    if (selectedAgents.length === 0) {
      setError('Select at least one agent for your first debate.');
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const saved = await addCourtroom({
        name: courtroomForm.name,
        objective: courtroomForm.objective,
        mode: courtroomForm.mode,
        description: 'Created during onboarding',
        participants: selectedAgents.map((agentId) => ({ agentId, type: 'agent' as const })),
        status: 'draft',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      navigate(`/courtrooms/${saved.id}`);
    } catch (err: any) {
      setError(err.message || 'Failed to create courtroom');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Layout>
      <Header />
      <Container>
        <div className="max-w-2xl mx-auto py-4">
          <div className="mb-6 text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 text-blue-300 text-xs mb-3">
              <Shield size={12} />
              Secure setup — API keys are encrypted at rest
            </div>
            <h1 className="text-2xl font-bold mb-2">Welcome to Hathap.AI</h1>
            <p className="text-sm text-theme-text-secondary">
              Connect your AI provider, assign agents, and launch your first courtroom debate.
            </p>
          </div>

          <div className="flex items-center justify-center gap-3 mb-6 text-xs">
            {[
              { n: 1, label: 'Model', icon: KeyRound },
              { n: 2, label: 'Agents', icon: Layers },
              { n: 3, label: 'Courtroom', icon: Layers },
            ].map(({ n, label, icon: Icon }) => (
              <div key={n} className="flex items-center gap-2">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    step >= n ? 'bg-blue-500/20 text-blue-300' : 'bg-white/5 text-slate-500'
                  }`}
                >
                  {step > n ? <Check size={14} /> : <Icon size={14} />}
                </div>
                <span className={`${step >= n ? 'text-white' : 'text-slate-500'}`}>{label}</span>
                {n < 3 && <div className={`w-8 h-0.5 ${step > n ? 'bg-blue-500/40' : 'bg-white/10'}`} />}
              </div>
            ))}
          </div>

          {error && (
            <div className="mb-4">
              <Alert variant="error">{error}</Alert>
            </div>
          )}

          {step === 1 && (
            <Card>
              <CardHeader>
                <h2 className="text-lg font-bold">Step 1: Connect your AI model</h2>
                <p className="text-xs text-theme-text-secondary mt-1">
                  Your API key is encrypted with AES-256-GCM before storage and never returned to the browser.
                </p>
              </CardHeader>
              <CardBody className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {PROVIDER_PRESETS.map((preset) => (
                    <Button
                      key={preset.provider}
                      size="sm"
                      variant={modelForm.provider === preset.provider ? 'primary' : 'secondary'}
                      onClick={() => applyPreset(preset)}
                      className="text-xs"
                    >
                      {preset.provider}
                    </Button>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="displayName" className="block text-xs font-medium mb-1">Display Name</label>
                    <Input
                      id="displayName"
                      value={modelForm.displayName}
                      onChange={(e) => setModelForm({ ...modelForm, displayName: e.target.value })}
                    />
                  </div>
                  <div>
                    <label htmlFor="modelName" className="block text-xs font-medium mb-1">Model</label>
                    <ModelPicker
                      provider={modelForm.provider}
                      value={modelForm.modelName}
                      onChange={(modelName) => setModelForm({ ...modelForm, modelName })}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="baseUrl" className="block text-xs font-medium mb-1">Base URL</label>
                  <Input
                    id="baseUrl"
                    value={modelForm.baseUrl}
                    onChange={(e) => setModelForm({ ...modelForm, baseUrl: e.target.value })}
                  />
                </div>

                <div>
                  <label htmlFor="apiKey" className="block text-xs font-medium mb-1">API Key</label>
                  <Input
                    id="apiKey"
                    type="password"
                    placeholder="Paste your provider API key"
                    value={modelForm.apiKey}
                    onChange={(e) => setModelForm({ ...modelForm, apiKey: e.target.value })}
                  />
                </div>
              </CardBody>
              <CardFooter className="gap-2">
                <Button
                  className="flex-1 text-sm"
                  onClick={handleSaveModel}
                  disabled={isSaving || !modelForm.apiKey || !modelForm.modelName}
                  isLoading={isSaving}
                >
                  Save & Test Connection
                  <ArrowRight size={14} />
                </Button>
              </CardFooter>
            </Card>
          )}

          {step === 2 && (
            <Card>
              <CardHeader>
                <h2 className="text-lg font-bold">Step 2: Assign agents to your model</h2>
                <p className="text-xs text-theme-text-secondary mt-1">
                  {agentTemplates.length} default agent personas will use{' '}
                  <strong>{primaryModel?.displayName}</strong> during debates.
                </p>
              </CardHeader>
              <CardBody className="space-y-2 max-h-64 overflow-y-auto">
                {agentTemplates.map((agent) => (
                  <div
                    key={agent.id}
                    className="flex items-center gap-2 p-2 rounded-lg bg-white/5 border border-white/10"
                  >
                    <span className="text-lg">{agent.avatar || '👤'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{agent.name}</p>
                      <p className="text-xs text-theme-text-muted truncate">{agent.description}</p>
                    </div>
                    <span className="text-xs text-blue-300 whitespace-nowrap">{primaryModel?.displayName}</span>
                  </div>
                ))}
              </CardBody>
              <CardFooter className="gap-2">
                <Button variant="secondary" onClick={() => setStep(1)} className="text-sm">
                  <ArrowLeft size={14} />
                  Back
                </Button>
                <Button className="flex-1 text-sm" onClick={handleAssignAgents} isLoading={isSaving}>
                  Assign All Agents
                  <ArrowRight size={14} />
                </Button>
              </CardFooter>
            </Card>
          )}

          {step === 3 && (
            <Card>
              <CardHeader>
                <h2 className="text-lg font-bold">Step 3: Create your first courtroom</h2>
                <p className="text-xs text-theme-text-secondary mt-1">
                  Pick agents to participate, then start the debate from the courtroom page.
                </p>
              </CardHeader>
              <CardBody className="space-y-3">
                <div>
                  <label htmlFor="courtroomName" className="block text-xs font-medium mb-1">Courtroom Name</label>
                  <Input
                    id="courtroomName"
                    value={courtroomForm.name}
                    onChange={(e) => setCourtroomForm({ ...courtroomForm, name: e.target.value })}
                  />
                </div>
                <div>
                  <label htmlFor="objective" className="block text-xs font-medium mb-1">Debate Objective</label>
                  <TextArea
                    id="objective"
                    rows={3}
                    value={courtroomForm.objective}
                    onChange={(e) => setCourtroomForm({ ...courtroomForm, objective: e.target.value })}
                  />
                </div>
                <div>
                  <label htmlFor="debateMode" className="block text-xs font-medium mb-1">Debate Mode</label>
                  <Select
                    id="debateMode"
                    value={courtroomForm.mode}
                    onChange={(e) =>
                      setCourtroomForm({ ...courtroomForm, mode: e.target.value as typeof courtroomForm.mode })
                    }
                  >
                    <option value="consensus">Consensus</option>
                    <option value="majority">Majority Vote</option>
                    <option value="devils-advocate">Devil's Advocate</option>
                    <option value="judge">Judge Mode</option>
                    <option value="open">Open Debate</option>
                  </Select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Participants</label>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {agentTemplates.map((agent) => (
                      <label
                        key={agent.id}
                        className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-white/5 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedAgents.includes(agent.id)}
                          onChange={() => toggleAgent(agent.id)}
                          className="w-4 h-4"
                        />
                        <span className="text-lg">{agent.avatar || '👤'}</span>
                        <span className="text-xs">{agent.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </CardBody>
              <CardFooter className="gap-2">
                <Button variant="secondary" onClick={() => setStep(2)} className="text-sm">
                  <ArrowLeft size={14} />
                  Back
                </Button>
                <Button
                  className="flex-1 text-sm"
                  onClick={handleCreateCourtroom}
                  isLoading={isSaving}
                  disabled={!courtroomForm.name || !courtroomForm.objective}
                >
                  Create Courtroom
                  <Layers size={14} />
                </Button>
              </CardFooter>
            </Card>
          )}

          <div className="text-center mt-4">
            <Button 
              variant="secondary" 
              onClick={() => {
                localStorage.setItem('onboarding_skipped', 'true');
                navigate('/dashboard');
              }} 
              className="text-sm"
            >
              Skip for now
            </Button>
          </div>
        </div>
      </Container>
    </Layout>
  );
};
