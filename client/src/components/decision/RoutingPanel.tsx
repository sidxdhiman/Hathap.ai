import React from 'react';
import { Card, CardHeader, CardBody } from '../ui/Card';
import { Task, TaskRouting } from '../../types';
import { Route } from 'lucide-react';

interface RoutingPanelProps {
  tasks: Task[];
  loading?: boolean;
}

const TYPE_COLORS: Record<string, string> = {
  research: 'bg-sky-500/20 text-sky-300',
  debate: 'bg-violet-500/20 text-violet-300',
  verify_claim: 'bg-green-500/20 text-green-300',
  red_team: 'bg-red-500/20 text-red-300',
  reconciliation: 'bg-amber-500/20 text-amber-300',
};

export const RoutingPanel: React.FC<RoutingPanelProps> = ({ tasks, loading }) => {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <span className="flex items-center gap-2 text-sm font-semibold text-theme-text-primary">
            <Route size={14} /> Model &amp; Agent Routing
          </span>
        </CardHeader>
        <CardBody>
          <p className="text-xs text-theme-text-secondary py-4 text-center">Loading routing metadata…</p>
        </CardBody>
      </Card>
    );
  }

  const routedTasks = (tasks || []).filter((t) => {
    const routing = t.metadata?.routing as TaskRouting | undefined;
    return routing?.selection?.status === 'selected';
  });

  if (routedTasks.length === 0) {
    return (
      <Card>
        <CardHeader>
          <span className="flex items-center gap-2 text-sm font-semibold text-theme-text-primary">
            <Route size={14} /> Model &amp; Agent Routing
          </span>
        </CardHeader>
        <CardBody>
          <p className="text-xs text-theme-text-secondary py-4 text-center">
            Routing metadata unavailable for this execution.
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <span className="flex items-center gap-2 text-sm font-semibold text-theme-text-primary">
          <Route size={14} /> Actual Routing (persisted)
          <span className="text-[10px] px-2 py-0.5 rounded bg-theme-bg-tertiary text-theme-text-secondary font-normal">
            {routedTasks.length} tasks
          </span>
        </span>
      </CardHeader>
      <CardBody className="space-y-2">
        {routedTasks.map((t) => {
          const routing = t.metadata?.routing as TaskRouting | undefined;
          const sel = routing?.selection;
          if (!sel) return null;
          const typeColor = TYPE_COLORS[t.type] || 'bg-theme-bg-tertiary text-theme-text-secondary';
          return (
            <div key={t.id} className="p-3 rounded bg-theme-bg-secondary border border-theme-border">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${typeColor}`}>{t.type}</span>
                <span className="text-xs text-theme-text-primary">
                  {sel.agent?.name || <span className="text-theme-text-secondary">—</span>}
                  <span className="text-theme-text-secondary mx-1">→</span>
                  {sel.model.displayName || sel.model.modelName}
                  <span className="text-[10px] text-theme-text-secondary ml-1">({sel.model.provider})</span>
                </span>
                {sel.fallbackUsed && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-300">fallback</span>
                )}
                {sel.capabilityGateRelaxed && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">gate relaxed</span>
                )}
              </div>
              <div className="text-[10px] text-theme-text-secondary mt-1.5 flex items-center gap-3 flex-wrap">
                <span>mode: {routing?.mode || 'auto'}</span>
                <span>policy: {sel.policyVersion}</span>
                <span>score: {sel.score.total.toFixed(4)}</span>
                <span>{sel.candidateCount} candidates</span>
                <span>
                  {sel.estimate.pricingKnown
                    ? `est. cost $${sel.estimate.estimatedCost.toFixed(6)}`
                    : 'cost unknown'}
                </span>
              </div>
              {sel.reasons.length > 0 && (
                <div className="text-[10px] text-theme-text-secondary mt-1 space-y-0.5">
                  {sel.reasons.map((r, i) => <div key={i}>• {r}</div>)}
                </div>
              )}
              {sel.fallbackFrom && (
                <div className="text-[10px] text-orange-300 mt-1">
                  Fallback from: {sel.fallbackFrom.modelId.slice(-6)}{sel.fallbackFrom.provider ? ` (${sel.fallbackFrom.provider})` : ''}
                </div>
              )}
            </div>
          );
        })}
      </CardBody>
    </Card>
  );
};