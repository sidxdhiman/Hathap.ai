import React, { useState } from 'react';
import {
  Plus,
  Edit2,
  Trash2,
  CheckCircle,
  AlertCircle,
  Clock,
  TestTube,
} from 'lucide-react';
import { Header } from '../components/layout/Header';
import { Layout, Container, PageHeader, Grid } from '../components/layout/Layout';
import { Card, CardBody, CardHeader, CardFooter } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { useApp } from '../context/AppContext';
import { Model } from '../types';
import { getStatusColor, getStatusText } from '../utils/helpers';

export const ModelsPage: React.FC = () => {
  const { models, addModel, updateModel, deleteModel } = useApp();
  const [isAddingModel, setIsAddingModel] = useState(false);
  const [editingModel, setEditingModel] = useState<Model | null>(null);
  const [testingModel, setTestingModel] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; success: boolean } | null>(null);

  const [formData, setFormData] = useState({
    provider: '',
    displayName: '',
    modelName: '',
    apiKey: '',
    baseUrl: '',
  });

  const handleAddModel = () => {
    if (!formData.provider) return;
    const newModel: Model = {
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

  const handleEditModel = (model: Model) => {
    updateModel(model.id, {
      enabled: !model.enabled,
    });
  };

  const handleTestConnection = (id: string) => {
    setTestingModel(id);
    setTimeout(() => {
      setTestResult({ id, success: Math.random() > 0.2 });
      setTestingModel(null);
      setTimeout(() => setTestResult(null), 2000);
    }, 1500);
  };

  return (
    <Layout>
      <Header />
      <Container>
        <PageHeader
          title="Models"
          description="Manage your AI model integrations"
          action={
            <Button onClick={() => setIsAddingModel(true)}>
              <Plus size={20} />
              Add Model
            </Button>
          }
        />

        {models.length === 0 ? (
          <Card className="text-center py-12">
            <AlertCircle className="mx-auto mb-4 text-slate-400" size={48} />
            <p className="text-slate-400">No models configured yet</p>
            <Button className="mt-4" onClick={() => setIsAddingModel(true)}>
              Add Your First Model
            </Button>
          </Card>
        ) : (
          <Grid cols={2}>
            {models.map((model) => (
              <Card key={model.id} hover>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold">{model.displayName}</h3>
                      <p className="text-sm text-slate-400">{model.provider}</p>
                    </div>
                    <div
                      className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(model.status)} ${getStatusText(model.status)}`}
                    >
                      {model.status === 'connected' && <CheckCircle className="inline mr-1" size={12} />}
                      {model.status === 'error' && <AlertCircle className="inline mr-1" size={12} />}
                      {model.status === 'untested' && <Clock className="inline mr-1" size={12} />}
                      {model.status}
                    </div>
                  </div>
                </CardHeader>
                <CardBody>
                  <div className="space-y-2 text-sm text-slate-400">
                    <div>
                      <span className="text-slate-500">Model:</span> {model.modelName}
                    </div>
                    <div>
                      <span className="text-slate-500">Base URL:</span>{' '}
                      <span className="font-mono text-xs">{model.baseUrl}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">API Key:</span>{' '}
                      <span className="font-mono text-xs">{model.apiKey}</span>
                    </div>
                  </div>
                </CardBody>
                <CardFooter className="gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleTestConnection(model.id)}
                    isLoading={testingModel === model.id}
                  >
                    <TestTube size={16} />
                    Test
                  </Button>
                  <Button
                    size="sm"
                    variant={model.enabled ? 'secondary' : 'secondary'}
                    onClick={() => handleEditModel(model)}
                  >
                    <Edit2 size={16} />
                    {model.enabled ? 'Enabled' : 'Disabled'}
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => deleteModel(model.id)}
                  >
                    <Trash2 size={16} />
                    Delete
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </Grid>
        )}

        {/* Add Model Modal */}
        <Modal isOpen={isAddingModel} onClose={() => setIsAddingModel(false)} title="Add New Model">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Provider Name</label>
              <Input
                placeholder="e.g., OpenAI, Anthropic"
                value={formData.provider}
                onChange={(e) => setFormData({ ...formData, provider: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Display Name</label>
              <Input
                placeholder="e.g., GPT-4 Turbo"
                value={formData.displayName}
                onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Model Name</label>
              <Input
                placeholder="e.g., gpt-4-turbo"
                value={formData.modelName}
                onChange={(e) => setFormData({ ...formData, modelName: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Base URL</label>
              <Input
                placeholder="https://api.openai.com/v1"
                value={formData.baseUrl}
                onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">API Key</label>
              <Input
                type="password"
                placeholder="••••••••"
                value={formData.apiKey}
                onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
              />
            </div>
            <div className="flex gap-2 pt-4">
              <Button onClick={handleAddModel} className="flex-1">
                Add Model
              </Button>
              <Button variant="secondary" onClick={() => setIsAddingModel(false)} className="flex-1">
                Cancel
              </Button>
            </div>
          </div>
        </Modal>
      </Container>
    </Layout>
  );
};
