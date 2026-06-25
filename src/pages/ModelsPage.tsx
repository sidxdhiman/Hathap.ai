import React, { useState } from 'react';
import {
  Plus,
  Edit2,
  Trash2,
  CheckCircle,
  AlertCircle,
  Clock,
  TestTube,
  Shield,
} from 'lucide-react';
import { Header } from '../components/layout/Header';
import { Layout, Container, PageHeader, Grid } from '../components/layout/Layout';
import { Card, CardBody, CardHeader, CardFooter } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { Alert } from '../components/ui/Alert';
import { ModelPicker, ProviderPicker } from '../components/ui/ModelPicker';
import { getPresetForProvider } from '../utils/modelCatalog';
import { useApp } from '../context/AppContext';
import { Model } from '../types';
import { getStatusColor, getStatusText } from '../utils/helpers';

export const ModelsPage: React.FC = () => {
  const { models, addModel, updateModel, deleteModel, testModel, showToast } = useApp();
  const [isAddingModel, setIsAddingModel] = useState(false);
  const [editingModel, setEditingModel] = useState<Model | null>(null);
  const [testingModel, setTestingModel] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; success: boolean; message?: string } | null>(
    null
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const emptyForm = {
    provider: '',
    displayName: '',
    modelName: '',
    apiKey: '',
    baseUrl: '',
  };

  const [formData, setFormData] = useState(emptyForm);

  const handleAddModel = async () => {
    if (!formData.provider || !formData.apiKey || !formData.modelName) {
      setFormError('Provider, model name, and API key are required.');
      return;
    }
    setFormError(null);
    setIsSaving(true);
    try {
      const saved = await addModel({
        provider: formData.provider,
        displayName: formData.displayName,
        modelName: formData.modelName,
        apiKey: formData.apiKey,
        baseUrl: formData.baseUrl,
        enabled: true,
      });
      setFormData(emptyForm);
      setIsAddingModel(false);

      setTestingModel(saved.id);
      const result = await testModel(saved.id);
      setTestingModel(null);
      if (result.success) {
        showToast('success', `Connection to ${saved.displayName} succeeded.`);
        setTestResult({ id: saved.id, success: true });
      } else {
        showToast(
          'error',
          `Could not reach ${saved.displayName}: ${result.error || 'unknown error'}`
        );
        setTestResult({
          id: saved.id,
          success: false,
          message: result.error || 'Connection failed',
        });
      }
      setTimeout(() => setTestResult(null), 4000);
    } catch (err: any) {
      setFormError(err.message || 'Failed to add model');
    } finally {
      setIsSaving(false);
      setTestingModel(null);
    }
  };

  const handleUpdateModel = async () => {
    if (!editingModel) return;
    setFormError(null);
    setIsSaving(true);
    try {
      await updateModel(editingModel.id, {
        provider: formData.provider,
        displayName: formData.displayName,
        modelName: formData.modelName,
        baseUrl: formData.baseUrl,
        ...(formData.apiKey ? { apiKey: formData.apiKey } : {}),
      });
      setEditingModel(null);
      setFormData(emptyForm);
    } catch (err: any) {
      setFormError(err.message || 'Failed to update model');
    } finally {
      setIsSaving(false);
    }
  };

  const openEditModal = (model: Model) => {
    setEditingModel(model);
    setFormData({
      provider: model.provider,
      displayName: model.displayName,
      modelName: model.modelName,
      apiKey: '',
      baseUrl: model.baseUrl,
    });
    setFormError(null);
  };

  const handleToggleEnabled = async (model: Model) => {
    await updateModel(model.id, { enabled: !model.enabled });
  };

  const handleTestConnection = async (model: Model) => {
    setTestingModel(model.id);
    try {
      const result = await testModel(model.id);
      if (result.success) {
        showToast('success', `Connection to ${model.displayName} succeeded.`);
        setTestResult({ id: model.id, success: true });
      } else {
        showToast(
          'error',
          `Could not reach ${model.displayName}: ${result.error || 'unknown error'}`
        );
        setTestResult({
          id: model.id,
          success: false,
          message: result.error || 'Connection failed',
        });
      }
    } catch (err: any) {
      showToast('error', err?.message || `Failed to test ${model.displayName}.`);
    } finally {
      setTestingModel(null);
      setTimeout(() => setTestResult(null), 4000);
    }
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

        <Alert variant="info" className="mb-6">
          <div className="flex items-start gap-2">
            <Shield size={18} className="mt-0.5 flex-shrink-0" />
            <span>
              API keys are encrypted with AES-256-GCM on the server. Only a masked hint (last 4 characters) is
              ever shown in the UI.
            </span>
          </div>
        </Alert>

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
                      <span className="font-mono text-xs">{model.apiKey || 'Not set'}</span>
                    </div>
                    {testResult?.id === model.id && (
                      <p className={`text-xs ${testResult.success ? 'text-green-400' : 'text-red-400'}`}>
                        {testResult.success
                          ? 'Connection successful'
                          : testResult.message || 'Connection failed'}
                      </p>
                    )}
                  </div>
                </CardBody>
                <CardFooter className="gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleTestConnection(model)}
                    isLoading={testingModel === model.id}
                  >
                    <TestTube size={16} />
                    Test
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => openEditModal(model)}>
                    <Edit2 size={16} />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleToggleEnabled(model)}
                  >
                    {model.enabled ? 'Enabled' : 'Disabled'}
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => deleteModel(model.id)}>
                    <Trash2 size={16} />
                    Delete
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </Grid>
        )}

        <Modal isOpen={isAddingModel} onClose={() => setIsAddingModel(false)} title="Add New Model">
          <div className="space-y-4">
            {formError && <Alert variant="error">{formError}</Alert>}
            <div>
              <label className="block text-sm font-medium mb-2">Provider</label>
              <ProviderPicker
                value={formData.provider}
                onChange={(provider) => {
                  const preset = getPresetForProvider(provider);
                  setFormData((prev) => ({
                    ...prev,
                    provider,
                    // Auto-fill baseUrl if the user hasn't customized it (or it matches a previous preset default)
                    baseUrl: preset?.defaultBaseUrl ?? prev.baseUrl,
                  }));
                }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Display Name</label>
              <Input
                placeholder="e.g., My GPT-4o"
                value={formData.displayName}
                onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Model</label>
              <ModelPicker
                provider={formData.provider}
                value={formData.modelName}
                onChange={(modelName) => setFormData({ ...formData, modelName })}
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
              <Button
                onClick={handleAddModel}
                className="flex-1"
                isLoading={isSaving}
                disabled={!formData.provider || !formData.apiKey || !formData.modelName}
              >
                Add Model
              </Button>
              <Button variant="secondary" onClick={() => setIsAddingModel(false)} className="flex-1">
                Cancel
              </Button>
            </div>
          </div>
        </Modal>

        <Modal
          isOpen={Boolean(editingModel)}
          onClose={() => setEditingModel(null)}
          title="Edit Model"
        >
          <div className="space-y-4">
            {formError && <Alert variant="error">{formError}</Alert>}
            <div>
              <label className="block text-sm font-medium mb-2">Provider</label>
              <ProviderPicker
                value={formData.provider}
                onChange={(provider) => {
                  const preset = getPresetForProvider(provider);
                  setFormData((prev) => ({
                    ...prev,
                    provider,
                    baseUrl: preset?.defaultBaseUrl ?? prev.baseUrl,
                  }));
                }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Display Name</label>
              <Input
                value={formData.displayName}
                onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Model</label>
              <ModelPicker
                provider={formData.provider}
                value={formData.modelName}
                onChange={(modelName) => setFormData({ ...formData, modelName })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Base URL</label>
              <Input
                value={formData.baseUrl}
                onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">API Key</label>
              <Input
                type="password"
                placeholder="Leave blank to keep existing key"
                value={formData.apiKey}
                onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
              />
              {editingModel && (
                <p className="text-xs text-theme-text-muted mt-1">
                  Current key: {editingModel.apiKey}
                </p>
              )}
            </div>
            <div className="flex gap-2 pt-4">
              <Button onClick={handleUpdateModel} className="flex-1" isLoading={isSaving}>
                Save Changes
              </Button>
              <Button variant="secondary" onClick={() => setEditingModel(null)} className="flex-1">
                Cancel
              </Button>
            </div>
          </div>
        </Modal>
      </Container>
    </Layout>
  );
};
