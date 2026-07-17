import React, { useState } from 'react';
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
  Trash2,
} from 'lucide-react';
import { Header } from '../components/layout/Header';
import { Layout, Container, PageHeader } from '../components/layout/Layout';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Alert } from '../components/ui/Alert';
import { useApp } from '../context/AppContext';
import { formatDate } from '../utils/helpers';

export const CourtroomsPage: React.FC = () => {
  const navigate = useNavigate();
  const { courtrooms, deleteCourtroom, showToast } = useApp();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);

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

  const handleConfirmDelete = async () => {
    if (!confirmDelete) return;
    const { id, name } = confirmDelete;
    setDeletingId(id);
    try {
      await deleteCourtroom(id);
      showToast('success', `Deleted courtroom "${name}".`);
    } catch (err: any) {
      showToast('error', err.message || 'Failed to delete courtroom.');
    } finally {
      setDeletingId(null);
      setConfirmDelete(null);
    }
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

                    <div className="flex-shrink-0 flex items-center gap-3">
                      <div className="text-right">
                        <div className="text-2xl font-bold">{courtroom.participants.length}</div>
                        <div className="text-xs text-theme-text-muted">Participants</div>
                      </div>
                      <Button
                        size="sm"
                        variant="danger"
                        isLoading={deletingId === courtroom.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDelete({ id: courtroom.id, name: courtroom.name });
                        }}
                        title="Delete courtroom"
                        className="p-2 min-w-0"
                      >
                        <Trash2 size={16} />
                      </Button>
                      <ChevronRight size={24} className="text-theme-text-muted" />
                    </div>
                  </div>
                </Card>
              );
            })
          )}
        </div>
      </Container>

      <Modal
        isOpen={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        title="Delete Courtroom"
      >
        <div className="space-y-4">
          <Alert variant="warning">
            Are you sure you want to delete <strong>"{confirmDelete?.name}"</strong>? All messages
            and the verdict for this courtroom will be removed. This action cannot be undone.
          </Alert>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => setConfirmDelete(null)}
              className="flex-1"
              disabled={deletingId !== null}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleConfirmDelete}
              className="flex-1"
              isLoading={deletingId !== null}
            >
              <Trash2 size={16} />
              Delete
            </Button>
          </div>
        </div>
      </Modal>
    </Layout>
  );
};
