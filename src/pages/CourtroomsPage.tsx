import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Gavel,
  Clock,
  Users,
  TrendingUp,
  CheckCircle,
  Pause,
  ChevronRight,
} from 'lucide-react';
import { Header } from '../components/layout/Header';
import { Layout, Container, PageHeader } from '../components/layout/Layout';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { useApp } from '../context/AppContext';
import { formatDate } from '../utils/helpers';

export const CourtroomsPage: React.FC = () => {
  const navigate = useNavigate();
  const { courtrooms } = useApp();

  const statusConfig = {
    active: { label: 'Active', icon: TrendingUp, color: 'text-green-400', bgColor: 'bg-green-500/20' },
    paused: { label: 'Paused', icon: Pause, color: 'text-yellow-400', bgColor: 'bg-yellow-500/20' },
    completed: { label: 'Completed', icon: CheckCircle, color: 'text-blue-400', bgColor: 'bg-blue-500/20' },
    draft: { label: 'Draft', icon: Gavel, color: 'text-theme-text-secondary', bgColor: 'bg-theme-bg-tertiary' },
  };

  const modeLabels = {
    consensus: 'Consensus Mode',
    majority: 'Majority Vote',
    'devils-advocate': "Devil's Advocate",
    judge: 'Judge Mode',
    open: 'Open Debate',
  };

  return (
    <Layout>
      <Header />
      <Container>
        <PageHeader
          title="Courtrooms"
          description="Manage your debate rooms and discussions"
          action={
            <Button onClick={() => navigate('/courtrooms/new')}>
              <Plus size={20} />
              Create Courtroom
            </Button>
          }
        />

        <div className="space-y-4">
          {courtrooms.length === 0 ? (
            <Card className="text-center py-12">
              <Gavel className="mx-auto mb-4 text-theme-text-secondary" size={48} />
              <p className="text-theme-text-secondary">No courtrooms yet</p>
              <Button className="mt-4" onClick={() => navigate('/courtrooms/new')}>
                Create Your First Courtroom
              </Button>
            </Card>
          ) : (
            courtrooms.map((courtroom) => {
              const statusConfig_ = statusConfig[courtroom.status];
              const StatusIcon = statusConfig_.icon;
              const modeLabel = modeLabels[courtroom.mode];

              return (
                <Card
                  key={courtroom.id}
                  hover
                  className="cursor-pointer"
                  onClick={() => navigate(`/courtrooms/${courtroom.id}`)}
                >
                  <div className="flex items-start justify-between gap-6">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-xl font-semibold">{courtroom.name}</h3>
                        <div
                          className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${statusConfig_.bgColor} ${statusConfig_.color}`}
                        >
                          <StatusIcon size={14} />
                          {statusConfig_.label}
                        </div>
                      </div>

                      <p className="text-theme-text-secondary mb-4">{courtroom.description}</p>

                      <div className="flex items-center gap-6 text-sm text-theme-text-secondary">
                        <div className="flex items-center gap-2">
                          <Users size={16} />
                          <span>{courtroom.participants.length} participants</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock size={16} />
                          <span>{formatDate(courtroom.createdAt)}</span>
                        </div>
                        <div className="px-3 py-1 rounded-lg bg-white/5 border border-white/10 text-xs">
                          {modeLabel}
                        </div>
                      </div>

                      <div className="mt-3 text-xs text-theme-text-muted">
                        <strong>Objective:</strong> {courtroom.objective}
                      </div>
                    </div>

                    <div className="flex-shrink-0 flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-2xl font-bold">{courtroom.participants.length}</div>
                        <div className="text-xs text-theme-text-muted">Participants</div>
                      </div>
                      <ChevronRight size={24} className="text-theme-text-muted" />
                    </div>
                  </div>
                </Card>
              );
            })
          )}
        </div>
      </Container>
    </Layout>
  );
};
