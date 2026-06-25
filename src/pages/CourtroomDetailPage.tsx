import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Play,
  Pause,
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
  const { courtrooms, agentTemplates, models, updateCourtroom, refreshData, showToast } = useApp();
  const courtroom = courtrooms.find((c) => c.id === id);

  const [showParticipantModal, setShowParticipantModal] = useState(false);
  const [messages, setMessages] = useState<any[]>([]);
  const [verdict, setVerdict] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDebateData = async () => {
    try {
      const API = (import.meta.env.VITE_API_URL as string) || '';
      const token = localStorage.getItem('hathap_token');
      const headers: any = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const [msgRes, verdictRes] = await Promise.all([
        fetch(`${API}/api/courtrooms/${id}/messages`, { headers }).then((r) => r.ok ? r.json() : []),
        fetch(`${API}/api/courtrooms/${id}/verdict`, { headers }).then((r) => r.ok ? r.json() : null),
      ]);

      setMessages(msgRes);
      setVerdict(verdictRes);
    } catch (err) {
      console.error('Failed to load debate data', err);
    }
  };

  useEffect(() => {
    if (id) {
      fetchDebateData();
    }
  }, [id, courtroom?.status]);

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

  const availableAgents = agentTemplates.filter(
    (agent) => !courtroom.participants.some((p) => p.agentId === agent.id)
  );

  const enabledModels = models.filter((model) => model.enabled && model.hasApiKey);

  const startBlockers: string[] = [];
  if (courtroom.participants.length === 0) {
    startBlockers.push('Add at least one agent participant.');
  }
  if (enabledModels.length === 0) {
    startBlockers.push('Add and enable at least one model with an API key on the Models page.');
  }

  const canStartDebate = startBlockers.length === 0;
  const setupWarnings: string[] = [];
  if (models.some((model) => model.enabled && model.status !== 'connected')) {
    setupWarnings.push('Some models have not passed a connection test yet.');
  }

  const rounds = Array.from(new Set(messages.map((m) => m.roundNumber))).sort((a, b) => a - b);

  const handleStartDebate = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const API = (import.meta.env.VITE_API_URL as string) || '';
      const token = localStorage.getItem('hathap_token');
      const headers: any = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API}/api/courtrooms/${id}/start`, {
        method: 'POST',
        headers,
      });

      if (!res.ok) {
        const data = await res.json();
        const message = data.errors?.length ? data.errors.join(' ') : data.error || 'Failed to run debate engine';
        throw new Error(message);
      }

      await fetchDebateData();
      await refreshData();
      showToast('success', 'Debate completed — verdict saved.');
    } catch (err: any) {
      setError(err.message);
      showToast('error', err.message || 'Failed to start debate.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddAgent = (agent: any) => {
    if (!courtroom) return;
    const newParticipant = {
      id: `part_${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      courtroomId: courtroom.id,
      type: 'agent' as const,
      agentId: agent.id || agent._id,
    };
    const updatedParticipants = [...courtroom.participants, newParticipant];
    updateCourtroom(courtroom.id, { participants: updatedParticipants });
    showToast('success', `Added ${agent.name || 'agent'} to the courtroom.`);
    setShowParticipantModal(false);
  };

  const handleRemoveParticipant = (participantId: string) => {
    if (!courtroom) return;
    const participant = courtroom.participants.find((p) => p.id === participantId);
    const updatedParticipants = courtroom.participants.filter((p) => p.id !== participantId);
    updateCourtroom(courtroom.id, { participants: updatedParticipants });
    if (participant) {
      const name =
        participant.type === 'agent'
          ? agentTemplates.find((a) => a.id === participant.agentId)?.name || 'agent'
          : models.find((m) => m.id === participant.modelId)?.displayName || 'model';
      showToast('info', `Removed ${name} from the courtroom.`);
    }
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
              <p className="text-theme-text-secondary text-lg">{courtroom.description}</p>
              <div className="flex items-center gap-4 mt-3 text-sm text-theme-text-secondary">
                <span className="px-3 py-1 rounded-lg bg-white/5 border border-white/10 capitalize">
                  Mode: {courtroom.mode}
                </span>
                <span className="px-3 py-1 rounded-lg bg-white/5 border border-white/10 capitalize">
                  Status: {courtroom.status}
                </span>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleStartDebate}
                variant="primary"
                disabled={isLoading || !canStartDebate}
                title={!canStartDebate ? startBlockers.join(' ') : undefined}
              >
                {isLoading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2 inline-block" />
                    Running...
                  </>
                ) : courtroom.status === 'completed' ? (
                  <>
                    <Play size={16} />
                    Rerun Debate
                  </>
                ) : (
                  <>
                    <Play size={16} />
                    Start Debate
                  </>
                )}
              </Button>
            </div>
          </div>

          {error && (
            <div className="mb-4">
              <Alert variant="error">
                {error}
              </Alert>
            </div>
          )}

          <Alert variant="info">
            <strong>Objective:</strong> {courtroom.objective}
          </Alert>

          {!canStartDebate && (
            <Alert variant="warning" className="mt-4">
              <strong>Before you can start:</strong>
              <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
                {startBlockers.map((blocker) => (
                  <li key={blocker}>{blocker}</li>
                ))}
              </ul>
            </Alert>
          )}

          {canStartDebate && setupWarnings.length > 0 && (
            <Alert variant="info" className="mt-4">
              {setupWarnings.join(' ')}
            </Alert>
          )}
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
                {participants.length > 0 ? (
                  participants.map((p) => (
                    <div key={p.id} className="flex items-center justify-between p-2 hover:bg-white/5 rounded group">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{p.avatar}</span>
                        <div className="flex-1">
                          <p className="text-sm font-medium">{p.name}</p>
                          <p className="text-xs text-theme-text-muted">{p.type}</p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 min-w-0"
                        onClick={() => handleRemoveParticipant(p.id)}
                      >
                        ✕
                      </Button>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-theme-text-muted text-center py-4">No participants added yet.</p>
                )}
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
                  Debate Rounds
                </h3>
              </CardHeader>
              <CardBody className="space-y-2">
                {rounds.length > 0 ? (
                  rounds.map((roundNum) => (
                    <div
                      key={roundNum}
                      className="flex items-center gap-2 p-2 bg-white/5 rounded"
                    >
                      <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center text-xs font-semibold text-blue-300">
                        {roundNum}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium">Round {roundNum}</p>
                        <p className="text-xs text-theme-text-muted font-normal">
                          {messages.filter((m) => m.roundNumber === roundNum).length} contributions
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-theme-text-muted text-center py-4">No rounds completed yet.</p>
                )}
              </CardBody>
            </Card>
          </div>

          {/* Center - Messages */}
          <div className="lg:col-span-1">
            <Card className="h-full flex flex-col">
              <CardHeader>
                <h3 className="font-semibold">Debate Thread</h3>
              </CardHeader>
              <CardBody className="flex-1 overflow-y-auto space-y-4 max-h-[600px]">
                {messages.length > 0 ? (
                  messages.map((message) => {
                    const agent = agentTemplates.find((a) => a.id === message.agentId);
                    const avatar = agent?.avatar || '🤖';
                    const name = message.agentName || agent?.name || 'Unknown Agent';

                    return (
                      <div key={message._id || message.id} className="space-y-2 border-b border-white/5 pb-3 last:border-0">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{avatar}</span>
                          <div className="flex-1">
                            <p className="text-sm font-medium text-white flex items-center gap-2">
                              {name}
                              <span className="text-xs px-2 py-0.5 rounded bg-blue-500/10 text-blue-300 font-normal">
                                Round {message.roundNumber}
                              </span>
                            </p>
                            <p className="text-xs text-theme-text-muted">
                              {formatTime(message.createdAt)}
                            </p>
                          </div>
                        </div>

                        {message.parsedResponse ? (
                          <div className="ml-8 space-y-3 mt-1 text-sm text-theme-text-secondary leading-relaxed">
                            <div>
                              <strong className="text-theme-text-primary text-xs uppercase tracking-wider block mb-1">Stance / Position:</strong>
                              <p className="bg-white/5 p-2 rounded border border-white/10 text-white font-medium">{message.parsedResponse.position}</p>
                            </div>
                            {message.parsedResponse.arguments && message.parsedResponse.arguments.length > 0 && (
                              <div>
                                <strong className="text-theme-text-primary text-xs uppercase tracking-wider block mb-1">Supporting Arguments:</strong>
                                <ul className="list-disc list-inside space-y-1 pl-1">
                                  {message.parsedResponse.arguments.map((arg: string, idx: number) => (
                                    <li key={idx} className="text-xs">{arg}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {message.parsedResponse.risks && message.parsedResponse.risks.length > 0 && (
                              <div>
                                <strong className="text-orange-400 text-xs uppercase tracking-wider block mb-1">Identified Risks:</strong>
                                <ul className="list-disc list-inside space-y-1 pl-1">
                                  {message.parsedResponse.risks.map((risk: string, idx: number) => (
                                    <li key={idx} className="text-xs text-orange-200/80">{risk}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            <div>
                              <strong className="text-blue-400 text-xs uppercase tracking-wider block mb-1">Recommendation:</strong>
                              <p className="text-xs italic text-blue-300">{message.parsedResponse.recommendation}</p>
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm text-theme-text-secondary ml-8 leading-relaxed whitespace-pre-wrap">{message.content}</p>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <p className="text-xs text-theme-text-muted text-center py-12">
                    No contributions yet. Start the debate to run the courtroom engine.
                  </p>
                )}
              </CardBody>
            </Card>
          </div>

          {/* Right Sidebar - Verdict */}
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <h3 className="font-semibold flex items-center gap-2">
                  <CheckCircle size={18} className="text-green-400" />
                  Verdict & Consensus
                </h3>
              </CardHeader>
              <CardBody className="space-y-4 text-sm">
                {verdict ? (
                  <>
                    <div>
                      <p className="font-medium text-green-400 mb-2">Summary Decision</p>
                      <p className="text-xs text-theme-text-secondary leading-relaxed bg-white/5 p-3 rounded border border-white/10">
                        {verdict.summary}
                      </p>
                    </div>

                    <div>
                      <p className="font-medium text-blue-400 mb-2">Recommendation</p>
                      <p className="text-xs text-theme-text-secondary leading-relaxed bg-blue-500/5 p-3 rounded border border-blue-500/10 italic">
                        {verdict.recommendation}
                      </p>
                    </div>

                    {verdict.pros && verdict.pros.length > 0 && (
                      <div>
                        <p className="font-medium text-emerald-400 mb-2">Key Pros / Benefits</p>
                        <ul className="space-y-1 text-theme-text-secondary pl-1">
                          {verdict.pros.map((item: string, i: number) => (
                            <li key={i} className="text-xs flex gap-2">
                              <CheckCircle size={12} className="text-emerald-400 flex-shrink-0 mt-0.5" />
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {verdict.cons && verdict.cons.length > 0 && (
                      <div>
                        <p className="font-medium text-orange-400 mb-2">Potential Drawbacks</p>
                        <ul className="space-y-1 text-theme-text-secondary pl-1">
                          {verdict.cons.map((item: string, i: number) => (
                            <li key={i} className="text-xs flex gap-2">
                              <AlertCircle size={12} className="text-orange-400 flex-shrink-0 mt-0.5" />
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {verdict.risks && verdict.risks.length > 0 && (
                      <div>
                        <p className="font-medium text-red-400 mb-2">Critical Risks</p>
                        <ul className="space-y-1 text-theme-text-secondary pl-1">
                          {verdict.risks.map((item: string, i: number) => (
                            <li key={i} className="text-xs flex gap-2">
                              <AlertCircle size={12} className="text-red-400 flex-shrink-0 mt-0.5" />
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {verdict.nextActions && verdict.nextActions.length > 0 && (
                      <div>
                        <p className="font-medium text-purple-400 mb-2">Next Actions</p>
                        <ul className="space-y-1 text-theme-text-secondary pl-1">
                          {verdict.nextActions.map((item: string, i: number) => (
                            <li key={i} className="text-xs flex gap-2">
                              <span className="text-purple-400 font-bold">•</span>
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="pt-3 border-t border-white/10">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-theme-text-secondary">Confidence Score</span>
                        <span className="font-semibold text-blue-400">{verdict.confidenceScore}%</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-emerald-500 to-blue-500"
                            style={{ width: `${verdict.confidenceScore}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-theme-text-muted text-center py-6">
                    No verdict generated yet. Start the debate to run the courtroom engine.
                  </p>
                )}
              </CardBody>
            </Card>
          </div>
        </div>
      </Container>

      {/* Add Participant Modal */}
      <Modal
        isOpen={showParticipantModal}
        onClose={() => setShowParticipantModal(false)}
        title="Add Expert Participant"
      >
        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          {availableAgents.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs text-theme-text-secondary mb-2">Select from your configured AI agents:</p>
              {availableAgents.map((agent) => (
                <div
                  key={agent.id}
                  className="flex items-center justify-between p-3 bg-white/5 border border-white/10 hover:border-blue-500/50 hover:bg-white/10 rounded-xl cursor-pointer transition-all"
                  onClick={() => handleAddAgent(agent)}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{agent.avatar || '👤'}</span>
                    <div>
                      <p className="text-sm font-semibold text-white">{agent.name}</p>
                      <p className="text-xs text-theme-text-muted truncate max-w-[200px]">{agent.description}</p>
                    </div>
                  </div>
                  <Button size="sm" variant="primary">Add</Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-sm text-theme-text-muted">
              No available agents. Configure more templates in the Agents tab first.
            </div>
          )}
          
          <Button variant="secondary" onClick={() => setShowParticipantModal(false)} className="w-full">
            Cancel
          </Button>
        </div>
      </Modal>
    </Layout>
  );
};
