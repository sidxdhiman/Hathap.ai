import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, FileText, Gauge, Plus } from 'lucide-react';
import { Header } from '../components/layout/Header';
import { Layout, Container, PageHeader } from '../components/layout/Layout';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { useApp } from '../context/AppContext';
import { formatDate, getStatusColor, getStatusText } from '../utils/helpers';
import { Decision } from '../types';

export const DecisionsPage: React.FC = () => {
  const navigate = useNavigate();
  const { decisions, isLoading } = useApp();

  return (
    <Layout>
      <Header />
      <Container>
        <PageHeader
          title="Decisions"
          description="Persistent decision runs backed by research and multi-agent debate"
          action={
            <Button size="sm" onClick={() => navigate('/decisions/new')}>
              <Plus size={16} /> New Decision
            </Button>
          }
        />
        <div className="space-y-4">
          {isLoading ? (
            <Card className="text-center py-12">
              <p className="text-theme-text-secondary">Loading decisions…</p>
            </Card>
          ) : decisions.length === 0 ? (
            <Card className="text-center py-12">
              <FileText className="mx-auto mb-4 text-theme-text-secondary" size={48} />
              <p className="text-theme-text-secondary">No decisions yet.</p>
              <p className="text-sm text-theme-text-secondary mt-1">
                Create a decision to run research and a multi-agent debate on a problem.
              </p>
              <div className="mt-4 flex justify-center">
                <Button onClick={() => navigate('/decisions/new')}>
                  <Plus size={16} /> Create your first decision
                </Button>
              </div>
            </Card>
          ) : (
            decisions.map((d: Decision) => (
              <Card key={d.id} className="cursor-pointer hover:border-sky-600 transition-colors">
                <button
                  className="w-full text-left flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
                  onClick={() => navigate(`/decisions/${d.id}`)}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-1">
                      <FileText size={20} className="text-theme-text-secondary" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-theme-text-primary">{d.title}</h3>
                        <span className={`text-xs px-2 py-0.5 rounded ${getStatusColor(d.status)} ${getStatusText(d.status)}`}>
                          {d.status}
                        </span>
                      </div>
                      <p className="text-sm text-theme-text-secondary line-clamp-2 mt-1">{d.objective}</p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-theme-text-secondary">
                        <span>Created {formatDate(d.createdAt)}</span>
                        {typeof d.confidence === 'number' && (
                          <span className="flex items-center gap-1">
                            <Gauge size={12} />
                            {Math.round(d.confidence * 100)}% confidence
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="shrink-0 text-theme-text-secondary" size={20} />
                </button>
              </Card>
            ))
          )}
        </div>
      </Container>
    </Layout>
  );
};