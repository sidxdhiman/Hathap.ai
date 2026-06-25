import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  KeyRound,
  Layers,
  Gavel,
  Shield,
} from 'lucide-react';
import { Header } from '../components/layout/Header';
import { Layout, Container } from '../components/layout/Layout';
import { Card, CardBody, CardFooter, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
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
        <div className="max-w-3xl mx-auto py-8">
          <div className="mb-8 text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 text-blue-300 text-sm mb-4">
              <Shield size={14} />
              Secure setup — API keys are encrypted at rest
            </div>
            <h1 className="text-3xl font-bold mb-2">Welcome to Hathap.AI</h1>
            <p className="text-theme-text-secondary">
              Connect your AI provider, assign agents, and launch your first courtroom debate.
            </p>
          </div>

          <div className="flex items-center justify-center gap-4 mb-8">
            {[
              { n: 1, label: 'Model', icon: KeyRound },
              { n: 2, label: 'Agents', icon: Layers },
              { n: 3, label: 'Courtroom', icon: Gavel },
            ].map(({ n, label, icon: Icon }) => (
              <div key={n} className="flex items-center gap-2">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    step >= n ? 'bg-blue-500/20 text-blue-300' : 'bg-white/5 text-slate-500'
                  }`}
                >
                  {step > n ? <Check size={18} /> : <Icon size={18} />}
                </div>
                <span className={`text-sm ${step >= n ? 'text-white' : 'text-slate-500'}`}>{label}</span>
                {n < 3 && <div className={`w-10 h-0.5 ${step > n ? 'bg-blue-500/40' : 'bg-white/10'}`} />}
              </div>
            ))}
          </div>

          {error && (
            <div className="mb-6">
              <Alert variant="error">{error}</Alert>
            </div>
          )}

          {step === 1 && (
            <Card>
              <CardHeader>
                <h2 className="text-xl font-bold">Step 1: Connect your AI model</h2>
                <p className="text-sm text-theme-text-secondary mt-1">
                  Your API key is encrypted with AES-256-GCM before storage and never returned to the browser.
                </p>
              </CardHeader>
              <CardBody className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {PROVIDER_PRESETS.map((preset) => (
                    <Button
                      key={preset.provider}
                      size="sm"
                      variant={modelForm.provider === preset.provider ? 'primary' : 'secondary'}
                      onClick={() => applyPreset(preset)}
                    >
                      {preset.provider}
                    </Button>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Display Name</label>
                    <Input
                      value={modelForm.displayName}
                      onChange={(e) => setModelForm({ ...modelForm, displayName: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Model</label>
                    <ModelPicker
                      provider={modelForm.provider}
                      value={modelForm.modelName}
                      onChange={(modelName) => setModelForm({ ...modelForm, modelName })}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Base URL</label>
                  <Input
                    value={modelForm.baseUrl}
                    onChange={(e) => setModelForm({ ...modelForm, baseUrl: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">API Key</label>
                  <Input
                    type="password"
                    placeholder="Paste your provider API key"
                    value={modelForm.apiKey}
                    onChange={(e) => setModelForm({ ...modelForm, apiKey: e.target.value })}
                  />
                </div>
              </CardBody>
              <CardFooter className="gap-2">
                <Button
                  className="flex-1"
                  onClick={handleSaveModel}
                  disabled={isSaving || !modelForm.apiKey || !modelForm.modelName}
                  isLoading={isSaving}
                >
                  Save & Test Connection
                  <ArrowRight size={16} />
                </Button>
              </CardFooter>
            </Card>
          )}

          {step === 2 && (
            <Card>
              <CardHeader>
                <h2 className="text-xl font-bold">Step 2: Assign agents to your model</h2>
                <p className="text-sm text-theme-text-secondary mt-1">
                  {agentTemplates.length} default agent personas will use{' '}
                  <strong>{primaryModel?.displayName}</strong> during debates.
                </p>
              </CardHeader>
              <CardBody className="space-y-3 max-h-80 overflow-y-auto">
                {agentTemplates.map((agent) => (
                  <div
                    key={agent.id}
                    className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10"
                  >
                    <span className="text-2xl">{agent.avatar || '👤'}</span>
                    <div className="flex-1">
                      <p className="font-medium">{agent.name}</p>
                      <p className="text-xs text-theme-text-muted">{agent.description}</p>
                    </div>
                    <span className="text-xs text-blue-300">{primaryModel?.displayName}</span>
                  </div>
                ))}
              </CardBody>
              <CardFooter className="gap-2">
                <Button variant="secondary" onClick={() => setStep(1)}>
                  <ArrowLeft size={16} />
                  Back
                </Button>
                <Button className="flex-1" onClick={handleAssignAgents} isLoading={isSaving}>
                  Assign All Agents
                  <ArrowRight size={16} />
                </Button>
              </CardFooter>
            </Card>
          )}

          {step === 3 && (
            <Card>
              <CardHeader>
                <h2 className="text-xl font-bold">Step 3: Create your first courtroom</h2>
                <p className="text-sm text-theme-text-secondary mt-1">
                  Pick agents to participate, then start the debate from the courtroom page.
                </p>
              </CardHeader>
              <CardBody className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Courtroom Name</label>
                  <Input
                    value={courtroomForm.name}
                    onChange={(e) => setCourtroomForm({ ...courtroomForm, name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Debate Objective</label>
                  <TextArea
                    rows={4}
                    value={courtroomForm.objective}
                    onChange={(e) => setCourtroomForm({ ...courtroomForm, objective: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Debate Mode</label>
                  <Select
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
                  <label className="block text-sm font-medium mb-2">Participants</label>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {agentTemplates.map((agent) => (
                      <label
                        key={agent.id}
                        className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedAgents.includes(agent.id)}
                          onChange={() => toggleAgent(agent.id)}
                        />
                        <span>{agent.avatar || '👤'}</span>
                        <span className="text-sm">{agent.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </CardBody>
              <CardFooter className="gap-2">
                <Button variant="secondary" onClick={() => setStep(2)}>
                  <ArrowLeft size={16} />
                  Back
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleCreateCourtroom}
                  isLoading={isSaving}
                  disabled={!courtroomForm.name || !courtroomForm.objective}
                >
                  Create Courtroom
                  <Gavel size={16} />
                </Button>
              </CardFooter>
            </Card>
          )}

          <div className="text-center mt-6">
            <Button variant="secondary" onClick={() => navigate('/dashboard')}>
              Skip for now
            </Button>
          </div>
        </div>
      </Container>
    </Layout>
  );
};
