import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Gavel,
  Layers,
  Zap,
  TrendingUp,
  Clock,
  CheckCircle,
  Pause,
} from 'lucide-react';
import { Header } from '../components/layout/Header';
import { Layout, Container, PageHeader, Grid } from '../components/layout/Layout';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { useApp } from '../context/AppContext';
import { formatDate } from '../utils/helpers';

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { courtrooms, models, agentTemplates, needsOnboarding, isLoading } = useApp();

  useEffect(() => {
    if (!isLoading && needsOnboarding) {
      navigate('/onboarding', { replace: true });
    }
  }, [isLoading, needsOnboarding, navigate]);

  const stats = [
    {
      label: 'Total Courtrooms',
      value: courtrooms.length,
      icon: Gavel,
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
      label: 'Active Debates',
      value: courtrooms.filter((c) => c.status === 'active').length,
      icon: TrendingUp,
      color: 'from-orange-500 to-orange-600',
    },
  ];

  const recentCourtrooms = courtrooms.slice(0, 3);

  return (
    <Layout>
      <Header />
      <Container>
        <PageHeader
          title="Dashboard"
          description="Manage your debates, models, and agents with Hathap.AI"
          action={
            <Button onClick={() => navigate('/courtrooms/new')}>
              <Plus size={20} />
              Create Debate
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

        {/* Quick Actions */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold mb-6">Quick Actions</h2>
          <Grid cols={3}>
            <Card
              hover
              className="cursor-pointer"
              onClick={() => navigate('/courtrooms/new')}
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-500/20 border border-blue-600 flex items-center justify-center">
                  <Gavel size={24} className="text-blue-400" />
                </div>
                <div>
                  <h3 className="font-semibold">Create Debate</h3>
                  <p className="text-theme-text-secondary text-sm">Start a new debate</p>
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

        {/* Recent Debates */}
        {recentCourtrooms.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold">Recent Debates</h2>
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
                          <Gavel size={14} />
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
                        <Gavel size={24} className="text-blue-400" />
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
