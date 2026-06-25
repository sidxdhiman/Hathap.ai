import React, { useState } from 'react';
import { Plus, Edit2, Trash2 } from 'lucide-react';
import { Header } from '../components/layout/Header';
import { Layout, Container, PageHeader, Grid } from '../components/layout/Layout';
import { Card, CardBody, CardHeader, CardFooter } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { TextArea } from '../components/ui/Input';
import { Select } from '../components/ui/Input';
import { Alert } from '../components/ui/Alert';
import { useApp } from '../context/AppContext';
import { AgentTemplate } from '../types';
import { generateId } from '../utils/helpers';

export const AgentsPage: React.FC = () => {
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
    if (!formData.name || !formData.assignedModelId) return;

    const newAgent: AgentTemplate = {
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

  return (
    <Layout>
      <Header />
      <Container>
        <PageHeader
          title="Agent Templates"
          description="Create and manage AI agent personas"
          action={
            <Button onClick={() => setIsAddingAgent(true)} disabled={models.length === 0}>
              <Plus size={20} />
              Create Agent
            </Button>
          }
        />

        {models.length === 0 && (
          <Alert variant="warning" className="mb-6">
            Add a model with an API key first before creating or assigning agents.
          </Alert>
        )}

        <Grid cols={3}>
          {agentTemplates.map((agent) => {
            const assignedModel = models.find((m) => m.id === agent.assignedModelId);
            return (
              <Card key={agent.id} hover>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3 flex-1">
                      <div className="text-3xl">{agent.avatar}</div>
                      <div>
                        <h3 className="font-semibold">{agent.name}</h3>
                        <p className="text-xs text-theme-text-secondary">
                          {assignedModel?.displayName || 'No model'}
                        </p>
                      </div>
                    </div>
                    <div className={`w-3 h-3 rounded-full bg-${agent.colorTag}-500`} />
                  </div>
                </CardHeader>
                <CardBody>
                  <p className="text-sm text-theme-text-secondary mb-3">{agent.description}</p>
                  <p className="text-xs text-theme-text-muted bg-white/5 rounded p-2 max-h-20 overflow-y-auto">
                    {agent.systemPrompt}
                  </p>
                </CardBody>
                <CardFooter>
                  <Button size="sm" variant="secondary" className="flex-1">
                    <Edit2 size={16} />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => deleteAgentTemplate(agent.id)}
                  >
                    <Trash2 size={16} />
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </Grid>

        {/* Add Agent Modal */}
        <Modal isOpen={isAddingAgent} onClose={() => setIsAddingAgent(false)} title="Create Agent Template" size="lg">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Agent Name</label>
                <Input
                  placeholder="e.g., Senior Architect"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Assigned Model</label>
                <Select
                  value={formData.assignedModelId}
                  onChange={(e) => setFormData({ ...formData, assignedModelId: e.target.value })}
                >
                  <option value="">Select a model</option>
                  {models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.displayName}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Description</label>
              <Input
                placeholder="Brief description of this agent's role"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">System Prompt</label>
              <TextArea
                placeholder="Define the agent's personality, expertise, and behavior..."
                value={formData.systemPrompt}
                onChange={(e) => setFormData({ ...formData, systemPrompt: e.target.value })}
                rows={5}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Avatar</label>
                <Input
                  maxLength={2}
                  value={formData.avatar}
                  onChange={(e) => setFormData({ ...formData, avatar: e.target.value })}
                  className="text-2xl"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Color Tag</label>
                <div className="grid grid-cols-4 gap-2">
                  {colors.map((color) => (
                    <button
                      key={color}
                      onClick={() => setFormData({ ...formData, colorTag: color })}
                      className={`w-full h-10 rounded-lg bg-${color}-500 ${
                        formData.colorTag === color
                          ? `ring-2 ring-${color}-300`
                          : 'opacity-50'
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-4">
              <Button onClick={handleAddAgent} className="flex-1">
                Create Agent
              </Button>
              <Button variant="secondary" onClick={() => setIsAddingAgent(false)} className="flex-1">
                Cancel
              </Button>
            </div>
          </div>
        </Modal>
      </Container>
    </Layout>
  );
};
