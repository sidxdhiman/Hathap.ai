import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Play,
  Pause,
  Square,
  UserPlus,
  Settings,
  MessageSquare,
  CheckCircle,
  AlertCircle,
  TrendingUp,
} from 'lucide-react';
import { Header } from '../components/layout/Header';
import { Layout, Container } from '../components/layout/Layout';
import { Card, CardBody, CardHeader, CardFooter } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Alert } from '../components/ui/Alert';
import { useApp } from '../context/AppContext';
import { formatTime } from '../utils/helpers';

export const CourtroomDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { courtrooms, agentTemplates, models, updateCourtroom } = useApp();
  const courtroom = courtrooms.find((c) => c.id === id);
  const [showParticipantModal, setShowParticipantModal] = useState(false);

  if (!courtroom) {
    return (
      <Layout>
        <Header />
        <Container>
          <Alert variant="error">Courtroom not found</Alert>
          <Button onClick={() => navigate('/courtrooms')} className="mt-4">
            <ArrowLeft size={16} />
            Back to Courtrooms
          </Button>
        </Container>
      </Layout>
    );
  }

  const participants = courtroom.participants.map((p) => {
    if (p.type === 'model') {
      const model = models.find((m) => m.id === p.modelId);
      return { ...p, name: model?.displayName || 'Unknown', avatar: '🤖' };
    } else {
      const agent = agentTemplates.find((a) => a.id === p.agentId);
      return { ...p, name: agent?.name || 'Unknown', avatar: agent?.avatar || '👤' };
    }
  });

  const messages: any[] = [];
  const consensus: any = {
    agreements: [],
    disagreements: [],
    risks: [],
    recommendedSolution: '',
    confidenceScore: 0,
  };
  const debates: any[] = [];

  const handleToggleStatus = () => {
    const newStatus = courtroom.status === 'active' ? 'paused' : 'active';
    updateCourtroom(courtroom.id, { status: newStatus });
  };

  return (
    <Layout>
      <Header />
      <Container>
        {/* Header */}
        <div className="mb-8">
          <Button variant="secondary" onClick={() => navigate('/courtrooms')} className="mb-4">
            <ArrowLeft size={16} />
            Back to Courtrooms
          </Button>

          <div className="flex items-start justify-between gap-6 mb-6">
            <div>
              <h1 className="text-4xl font-bold mb-2">{courtroom.name}</h1>
              <p className="text-slate-400 text-lg">{courtroom.description}</p>
              <div className="flex items-center gap-4 mt-3 text-sm text-slate-400">
                <span className="px-3 py-1 rounded-lg bg-white/5 border border-white/10">
                  {courtroom.mode}
                </span>
                <span className="px-3 py-1 rounded-lg bg-white/5 border border-white/10">
                  {courtroom.status}
                </span>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleToggleStatus}
                variant={courtroom.status === 'active' ? 'secondary' : 'primary'}
              >
                {courtroom.status === 'active' ? (
                  <>
                    <Pause size={16} />
                    Pause
                  </>
                ) : (
                  <>
                    <Play size={16} />
                    Start
                  </>
                )}
              </Button>
              <Button variant="secondary">
                <Settings size={16} />
              </Button>
            </div>
          </div>

          <Alert variant="info">
            <strong>Objective:</strong> {courtroom.objective}
          </Alert>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Left Sidebar */}
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <h3 className="font-semibold flex items-center gap-2">
                  <MessageSquare size={18} />
                  Participants ({participants.length})
                </h3>
              </CardHeader>
              <CardBody className="space-y-2">
                {participants.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 p-2 hover:bg-white/5 rounded">
                    <span className="text-2xl">{p.avatar}</span>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{p.name}</p>
                      <p className="text-xs text-slate-500">{p.type}</p>
                    </div>
                  </div>
                ))}
              </CardBody>
              <CardFooter>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setShowParticipantModal(true)}
                  className="w-full"
                >
                  <UserPlus size={16} />
                  Add Participant
                </Button>
              </CardFooter>
            </Card>

            <Card>
              <CardHeader>
                <h3 className="font-semibold flex items-center gap-2">
                  <TrendingUp size={18} />
                  Rounds
                </h3>
              </CardHeader>
              <CardBody className="space-y-2">
                {debates.map((debate) => (
                  <div
                    key={debate.id}
                    className="flex items-center gap-2 p-2 hover:bg-white/5 rounded cursor-pointer"
                  >
                    <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center text-xs font-medium">
                      {debate.roundNumber}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm">Round {debate.roundNumber}</p>
                      <p className="text-xs text-slate-500 capitalize">{debate.status}</p>
                    </div>
                  </div>
                ))}
              </CardBody>
            </Card>
          </div>

          {/* Center - Messages */}
          <div className="lg:col-span-1">
            <Card className="h-full flex flex-col">
              <CardHeader>
                <h3 className="font-semibold">Debate Thread</h3>
              </CardHeader>
              <CardBody className="flex-1 overflow-y-auto space-y-4 max-h-96">
                {messages.map((message) => {
                  const participant = participants.find((p) => p.id === message.participantId);
                  return (
                    <div key={message.id} className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{participant?.avatar}</span>
                        <div className="flex-1">
                          <p className="text-sm font-medium">{participant?.name}</p>
                          <p className="text-xs text-slate-500">{formatTime(message.timestamp)}</p>
                        </div>
                      </div>
                      <p className="text-sm text-slate-300 ml-8 leading-relaxed">{message.content}</p>
                    </div>
                  );
                })}
              </CardBody>
            </Card>
          </div>

          {/* Right Sidebar - Consensus */}
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <h3 className="font-semibold flex items-center gap-2">
                  <CheckCircle size={18} className="text-green-400" />
                  Consensus
                </h3>
              </CardHeader>
              <CardBody className="space-y-4 text-sm">
                <div>
                  <p className="font-medium text-green-400 mb-2">Agreements</p>
                  <ul className="space-y-1 text-slate-300">
                    {consensus.agreements.map((item, i) => (
                      <li key={i} className="text-xs flex gap-2">
                        <CheckCircle size={12} className="text-green-400 flex-shrink-0 mt-0.5" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <p className="font-medium text-orange-400 mb-2">Disagreements</p>
                  <ul className="space-y-1 text-slate-300">
                    {consensus.disagreements.map((item, i) => (
                      <li key={i} className="text-xs flex gap-2">
                        <AlertCircle size={12} className="text-orange-400 flex-shrink-0 mt-0.5" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <p className="font-medium text-red-400 mb-2">Risks</p>
                  <ul className="space-y-1 text-slate-300">
                    {consensus.risks.slice(0, 2).map((item, i) => (
                      <li key={i} className="text-xs flex gap-2">
                        <AlertCircle size={12} className="text-red-400 flex-shrink-0 mt-0.5" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="pt-3 border-t border-white/10">
                  <p className="font-medium text-blue-400 mb-2">Recommendation</p>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {consensus.recommendedSolution}
                  </p>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-green-500 to-blue-500"
                      style={{ width: `${consensus.confidenceScore * 100}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium">
                    {(consensus.confidenceScore * 100).toFixed(0)}%
                  </span>
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardHeader>
                <h3 className="font-semibold">Status</h3>
              </CardHeader>
              <CardBody className="text-sm space-y-3">
                <div className="flex justify-between items-center p-2 bg-white/5 rounded">
                  <span className="text-slate-400">Messages</span>
                  <span className="font-semibold">{messages.length}</span>
                </div>
                <div className="flex justify-between items-center p-2 bg-white/5 rounded">
                  <span className="text-slate-400">Rounds</span>
                  <span className="font-semibold">{debates.length}</span>
                </div>
                <div className="flex justify-between items-center p-2 bg-white/5 rounded">
                  <span className="text-slate-400">Status</span>
                  <span className="font-semibold capitalize">{courtroom.status}</span>
                </div>
              </CardBody>
            </Card>
          </div>
        </div>
      </Container>

      {/* Add Participant Modal */}
      <Modal
        isOpen={showParticipantModal}
        onClose={() => setShowParticipantModal(false)}
        title="Add Participant"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4">
            <Button variant="primary" className="justify-center">
              Add Model Directly
            </Button>
            <Button variant="secondary" className="justify-center">
              Add Agent Template
            </Button>
          </div>
          <Button variant="secondary" onClick={() => setShowParticipantModal(false)} className="w-full">
            Cancel
          </Button>
        </div>
      </Modal>
    </Layout>
  );
};
