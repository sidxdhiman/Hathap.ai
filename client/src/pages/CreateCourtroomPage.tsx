import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check } from 'lucide-react';
import { Header } from '../components/layout/Header';
import { Layout, Container } from '../components/layout/Layout';
import { Card, CardBody, CardHeader, CardFooter } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { TextArea } from '../components/ui/Input';
import { Select } from '../components/ui/Input';
import { useApp } from '../context/AppContext';
import { Courtroom } from '../types';

export const CreateCourtroomPage: React.FC = () => {
  const navigate = useNavigate();
  const { addCourtroom } = useApp();
  const [step, setStep] = useState(1);
  const [isCreating, setIsCreating] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    objective: '',
    mode: 'consensus' as const,
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
    if (!formData.name || !formData.objective) return;

    setIsCreating(true);

    const newCourtroom: Omit<Courtroom, 'id'> = {
      name: formData.name,
      description: formData.description,
      objective: formData.objective,
      mode: formData.mode,
      participants: [],
      status: 'draft',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    try {
      const saved = await addCourtroom(newCourtroom);
      navigate(`/courtrooms/${saved.id}`);
    } catch (err: any) {
      setIsCreating(false);
    }
  };

  return (
    <Layout>
      <Header />
      <Container>
        <Button variant="secondary" onClick={() => navigate('/courtrooms')} className="mb-8">
          <ArrowLeft size={16} />
          Back
        </Button>

        <div className="max-w-2xl mx-auto min-h-[60vh] flex flex-col justify-start lg:justify-center">
          {/* Progress */}
          <div className="flex items-center justify-between mb-12">
            {[1, 2].map((s) => (
              <div key={s} className="flex items-center gap-4">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold ${
                    step >= s ? 'bg-blue-500/20 text-blue-300' : 'bg-white/5 text-slate-500'
                  }`}
                >
                  {step > s ? <Check size={20} /> : s}
                </div>
                {s < 2 && (
                  <div className={`w-16 h-1 ${step > s ? 'bg-blue-500/30' : 'bg-white/10'}`} />
                )}
              </div>
            ))}
          </div>

          {/* Step 1: Basic Info */}
          {step === 1 && (
            <Card>
              <CardHeader>
                <h2 className="text-2xl font-bold">Create New Courtroom</h2>
                <p className="text-slate-400 mt-2">Step 1 of 2: Basic Information</p>
              </CardHeader>
              <CardBody className="space-y-6">
                <div>
                  <label className="block text-sm font-medium mb-2">Courtroom Name</label>
                  <Input
                    placeholder="e.g., Microservices vs Monolith"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Description</label>
                  <TextArea
                    placeholder="Describe the purpose of this courtroom..."
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={3}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Debate Objective</label>
                  <TextArea
                    placeholder="What should the AI agents decide or discuss?"
                    value={formData.objective}
                    onChange={(e) => setFormData({ ...formData, objective: e.target.value })}
                    rows={4}
                  />
                </div>
              </CardBody>
              <CardFooter>
                <Button
                  onClick={() => setStep(2)}
                  className="flex-1 justify-center"
                  disabled={!formData.name || !formData.objective}
                >
                  Continue
                </Button>
              </CardFooter>
            </Card>
          )}

          {/* Step 2: Debate Mode */}
          {step === 2 && (
            <>
              <Card className="mb-6">
                <CardHeader>
                  <h2 className="text-2xl font-bold">Select Debate Mode</h2>
                  <p className="text-slate-400 mt-2">Step 2 of 2: How should the debate work?</p>
                </CardHeader>
              </Card>

              <div className="space-y-3 mb-8 max-h-[48vh] overflow-auto pr-2 no-scrollbar">
                {modes.map((mode) => (
                  <Card
                    key={mode.id}
                    hover
                    className={`cursor-pointer transition-all ${
                      formData.mode === mode.id
                        ? 'ring-2 ring-blue-500 bg-blue-500/10'
                        : ''
                    }`}
                    onClick={() =>
                      setFormData({ ...formData, mode: mode.id as any })
                    }
                  >
                    <div className="flex items-start gap-4 p-4">
                      <div
                        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                          formData.mode === mode.id
                            ? 'border-blue-400 bg-blue-400'
                            : 'border-white/20'
                        }`}
                      >
                        {formData.mode === mode.id && (
                          <Check size={16} className="text-slate-900" />
                        )}
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold">{mode.label}</h3>
                        <p className="text-sm text-slate-400 mt-1">{mode.description}</p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>

              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setStep(1)} className="flex-1">
                  Back
                </Button>
                <Button onClick={handleCreate} className="flex-1" disabled={isCreating}>
                  {isCreating ? 'Creating...' : 'Create Courtroom'}
                </Button>
              </div>
            </>
          )}
        </div>
        {isCreating && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50" />
            <div className="relative bg-slate-900 text-slate-100 p-6 rounded shadow-lg w-full max-w-sm text-center">
              <div className="flex items-center justify-center mb-4">
                <div className="w-8 h-8 border-4 border-current border-t-transparent rounded-full animate-spin" />
              </div>
              <div className="text-lg font-semibold">Creating your courtroom</div>
              <div className="text-sm text-slate-400 mt-2">Please wait a moment while we set things up.</div>
            </div>
          </div>
        )}
      </Container>
    </Layout>
  );
};
