import React from 'react';
import { Card, CardHeader, CardBody } from '../ui/Card';
import { ReconciliationResult } from '../../types';
import { GitMerge, ShieldAlert } from 'lucide-react';

interface ReconciliationPanelProps {
  reconciliation?: ReconciliationResult | null;
  loading?: boolean;
}

export const ReconciliationPanel: React.FC<ReconciliationPanelProps> = ({ reconciliation, loading }) => {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <span className="flex items-center gap-2 text-sm font-semibold text-theme-text-primary">
            <GitMerge size={14} /> Reconciliation
          </span>
        </CardHeader>
        <CardBody>
          <p className="text-xs text-theme-text-secondary py-4 text-center">Loading reconciliation…</p>
        </CardBody>
      </Card>
    );
  }

  if (!reconciliation) {
    return (
      <Card>
        <CardHeader>
          <span className="flex items-center gap-2 text-sm font-semibold text-theme-text-primary">
            <GitMerge size={14} /> Reconciliation
          </span>
        </CardHeader>
        <CardBody>
          <p className="text-xs text-theme-text-secondary py-4 text-center">Reconciliation has not completed yet.</p>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <span className="flex items-center gap-2 text-sm font-semibold text-theme-text-primary">
          <GitMerge size={14} /> Reconciliation
        </span>
      </CardHeader>
      <CardBody className="space-y-4">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-theme-text-secondary mb-1">Final recommendation</div>
          <p className="text-theme-text-primary text-sm leading-relaxed">{reconciliation.recommendation}</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div className="p-3 rounded bg-green-500/10 border border-green-500/20">
            <div className="text-lg font-semibold text-green-400">{reconciliation.survivingClaimIds.length}</div>
            <div className="text-[11px] text-theme-text-secondary">surviving</div>
          </div>
          <div className="p-3 rounded bg-red-500/10 border border-red-500/20">
            <div className="text-lg font-semibold text-red-400">{reconciliation.rejectedClaimIds.length}</div>
            <div className="text-[11px] text-theme-text-secondary">rejected</div>
          </div>
          <div className="p-3 rounded bg-amber-500/10 border border-amber-500/20">
            <div className="text-lg font-semibold text-amber-400">{reconciliation.uncertainClaimIds.length}</div>
            <div className="text-[11px] text-theme-text-secondary">uncertain</div>
          </div>
          <div className="p-3 rounded bg-theme-bg-tertiary border border-theme-border">
            <div className="text-lg font-semibold text-theme-text-primary">{reconciliation.redTeamFindingIds.length}</div>
            <div className="text-[11px] text-theme-text-secondary">red-team findings</div>
          </div>
        </div>
        {reconciliation.needsMoreResearch && (
          <div className="flex items-start gap-2 p-3 rounded bg-amber-500/10 border border-amber-500/20 text-sm text-amber-300">
            <ShieldAlert size={16} className="mt-0.5 shrink-0" />
            <div>
              <div className="font-medium">Needs more research</div>
              {(reconciliation.researchQuestions || []).map((q, i) => (
                <div key={i} className="text-xs text-amber-200/90 mt-1">• {q}</div>
              ))}
            </div>
          </div>
        )}
        {reconciliation.rationale && (
          <p className="text-xs text-theme-text-secondary">{reconciliation.rationale}</p>
        )}
      </CardBody>
    </Card>
  );
};