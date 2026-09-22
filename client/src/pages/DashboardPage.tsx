import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Layers,
  Zap,
  TrendingUp,
  Clock,
  CheckCircle,
  Pause,
  Users,
  FileText,
  FileCheck,
  Globe,
} from 'lucide-react';
import logo from '../../assets/logo-1.png';
import { Header } from '../components/layout/Header';
import { Layout, Container, PageHeader, Grid } from '../components/layout/Layout';
import { Card, CardBody } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { useApp } from '../context/AppContext';
import { formatDate, getStatusColor, getStatusText } from '../utils/helpers';
import { ResearchStatus } from '../types';

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { courtrooms, models, agentTemplates, decisions, needsOnboarding, isLoading, getResearchStatus } = useApp();

  const [researchStatus, setResearchStatus] = useState<ResearchStatus | null>(null);

  useEffect(() => {
    getResearchStatus()
      .then(setResearchStatus)
      .catch(() => setResearchStatus(null));
  }, [getResearchStatus]);

  useEffect(() => {
    if (!isLoading && needsOnboarding && !localStorage.getItem('onboarding_skipped')) {
      navigate('/onboarding', { replace: true });
    }
  }, [isLoading, needsOnboarding, navigate]);

  const stats = [
    {
      label: 'Total Courtrooms',
      value: courtrooms.length,
      icon: Clock,
      color: 'from-blue-500 to-blue-600',
    },
    {
      label: 'Agent Templates',
      value: agentTemplates.length,
      icon: Layers,
      color: 'from-purple-500 to-purple-600',
    },
    {
      label: 'Connected Models',
      value: models.filter((m) => m.status === 'connected').length,
      icon: Zap,
      color: 'from-green-500 to-green-600',
    },
    {
      label: 'Active Courtrooms',
      value: courtrooms.filter((c) => c.status === 'active').length,
      icon: TrendingUp,
      color: 'from-orange-500 to-orange-600',
    },
    {
      label: 'Total Decisions',
      value: decisions.length,
      icon: FileText,
      color: 'from-sky-500 to-sky-600',
    },
    {
      label: 'Active Decisions',
      value: decisions.filter((d) => d.status === 'debating' || d.status === 'verifying').length,
      icon: FileCheck,
      color: 'from-cyan-500 to-cyan-600',
    },
  ];

  const recentCourtrooms = courtrooms.slice(0, 3);
  const activeDecisions = decisions
    .filter((d) => d.status === 'debating' || d.status === 'verifying' || d.status === 'awaiting_review')
    .slice(0, 3);

  return (
    <Layout>
      <Header />
      <Container>
        <PageHeader
          title="Dashboard"
          description="Manage your courtrooms, models, and agents with Hathap.AI"
          action={
            <Button onClick={() => navigate('/courtrooms/new', { state: { from: '/dashboard' } })}>
              <Plus size={20} />
              Create Courtroom
            </Button>
          }
        />

        {/* Statistics */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold mb-6">Overview</h2>
          <Grid cols={4}>
            {stats.map((stat) => {
              const Icon = stat.icon;
              return (
                <Card key={stat.label} hover>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-theme-text-secondary text-sm mb-1 font-medium">{stat.label}</p>
                      <p className="text-4xl font-bold">{stat.value}</p>
                    </div>
                    <div
                      className={`w-12 h-12 bg-gradient-to-br ${stat.color} flex items-center justify-center`}
                    >
                      <Icon size={24} className="text-white" />
                    </div>
                  </div>
                </Card>
              );
            })}
          </Grid>
        </div>

        {/* Web-grounded research status */}
        {researchStatus && (
          <div className="mb-8">
            <Card>
              <CardBody>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className={`mt-0.5 w-8 h-8 flex items-center justify-center border ${
                      researchStatus.real
                        ? 'bg-green-500/20 border-green-600 text-green-400'
                        : researchStatus.mock
                        ? 'bg-yellow-500/20 border-yellow-600 text-yellow-400'
                        : 'bg-red-500/20 border-red-600 text-red-400'
                    }`}>
                      <Globe size={15} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-theme-text-primary">
                          Web-grounded research
                        </span>
                        <span className={`text-[10px] px-2 py-0.5 rounded ${
                          researchStatus.real
                            ? 'bg-green-500/20 text-green-400'
                            : researchStatus.mock
                            ? 'bg-yellow-500/20 text-yellow-400'
                            : 'bg-red-500/20 text-red-400'
                        }`}>
                          {researchStatus.real ? `Live ${researchStatus.provider}` : researchStatus.mock ? 'Mock (labeled)' : 'Not configured'}
                        </span>
                        {researchStatus.mode && (
                          <span className="text-[10px] text-theme-text-secondary">{researchStatus.mode}</span>
                        )}
                      </div>
                      <p className="text-sm text-theme-text-secondary mt-1">
                        {researchStatus.real
                          ? `Research tasks run against ${researchStatus.provider} with real web-grounded sources.`
                          : researchStatus.mock
                          ? 'Research runs in explicit mock mode — clearly labeled, never presented as real sources.'
                          : 'Add a research provider API key to enable web-grounded evidence.'}
                      </p>
                    </div>
                  </div>
                </div>
              </CardBody>
            </Card>
          </div>
        )}

        {/* Quick Actions */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold mb-6">Quick Actions</h2>
          <Grid cols={3}>
            <Card
              hover
              className="cursor-pointer"
              onClick={() => navigate('/decisions/new')}
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-sky-500/20 border border-sky-600 flex items-center justify-center">
                  <FileText size={24} className="text-sky-400" />
                </div>
                <div>
                  <h3 className="font-semibold">Create Decision</h3>
                  <p className="text-theme-text-secondary text-sm">Run research + AI debate</p>
                </div>
              </div>
            </Card>

            <Card
              hover
              className="cursor-pointer"
              onClick={() => navigate('/courtrooms/new')}
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-500/20 border border-blue-600 flex items-center justify-center">
                  <img src={logo} alt="Hathap Logo" className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-semibold">Create Courtroom</h3>
                  <p className="text-theme-text-secondary text-sm">Start a new courtroom</p>
                </div>
              </div>
            </Card>

            <Card
              hover
              className="cursor-pointer"
              onClick={() => navigate('/models')}
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-purple-500/20 border border-purple-600 flex items-center justify-center">
                  <Zap size={24} className="text-purple-400" />
                </div>
                <div>
                  <h3 className="font-semibold">Manage Models</h3>
                  <p className="text-theme-text-secondary text-sm">Add/edit models</p>
                </div>
              </div>
            </Card>

            <Card
              hover
              className="cursor-pointer"
              onClick={() => navigate('/agents')}
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-green-500/20 border border-green-600 flex items-center justify-center">
                  <Layers size={24} className="text-green-400" />
                </div>
                <div>
                  <h3 className="font-semibold">Agent Templates</h3>
                  <p className="text-theme-text-secondary text-sm">Create agents</p>
                </div>
              </div>
            </Card>
          </Grid>
        </div>

        {/* Recent Courtrooms */}
        {recentCourtrooms.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold">Recent Courtrooms</h2>
              <Button variant="secondary" onClick={() => navigate('/courtrooms')}>
                View All
              </Button>
            </div>
            <div className="space-y-4">
              {recentCourtrooms.map((courtroom) => (
                <Card
                  key={courtroom.id}
                  hover
                  className="cursor-pointer"
                  onClick={() => navigate(`/courtrooms/${courtroom.id}`)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="text-lg font-semibold">{courtroom.name}</h3>
                        {courtroom.status === 'active' && (
                          <span className="text-xs status-badge status-badge-active">
                            <TrendingUp className="inline" size={12} />
                            Active
                          </span>
                        )}
                        {courtroom.status === 'paused' && (
                          <span className="text-xs status-badge bg-yellow-500/20 text-yellow-300 border-yellow-600">
                            <Pause className="inline" size={12} />
                            Paused
                          </span>
                        )}
                        {courtroom.status === 'completed' && (
                          <span className="text-xs status-badge bg-blue-500/20 text-blue-300 border-blue-600">
                            <CheckCircle className="inline" size={12} />
                            Completed
                          </span>
                        )}
                      </div>
                      <p className="text-theme-text-secondary text-sm mb-3">{courtroom.description}</p>
                      <div className="flex items-center gap-4 text-sm text-theme-text-muted">
                        <div className="flex items-center gap-1">
                          <Users size={14} />
                          {courtroom.participants.length} participants
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock size={14} />
                          {formatDate(courtroom.createdAt)}
                        </div>
                      </div>
                    </div>
                    <div className="flex-shrink-0">
                      <div className="w-12 h-12 bg-blue-500/10 border border-blue-600 flex items-center justify-center">
                        <img src={logo} alt="Hathap Logo" className="w-6 h-6" />
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Active Decisions */}
        {activeDecisions.length > 0 && (
          <div className="mt-12">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold">Active Decisions</h2>
              <Button variant="secondary" onClick={() => navigate('/decisions')}>
                View All
              </Button>
            </div>
            <div className="space-y-4">
              {activeDecisions.map((decision) => (
                <Card
                  key={decision.id}
                  hover
                  className="cursor-pointer"
                  onClick={() => navigate(`/decisions/${decision.id}`)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <h3 className="text-lg font-semibold">{decision.title}</h3>
                        <span className={`text-xs px-2 py-0.5 rounded ${getStatusColor(decision.status)} ${getStatusText(decision.status)}`}>
                          {decision.status}
                        </span>
                      </div>
                      <p className="text-theme-text-secondary text-sm mb-3">{decision.objective}</p>
                      <div className="flex items-center gap-4 text-sm text-theme-text-muted">
                        <span className="flex items-center gap-1">
                          <Clock size={14} />
                          {formatDate(decision.createdAt)}
                        </span>
                        {typeof decision.confidence === 'number' && (
                          <span className="flex items-center gap-1">
                            <FileCheck size={14} />
                            {Math.round(decision.confidence * 100)}% confidence
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}
      </Container>
    </Layout>
  );
};
