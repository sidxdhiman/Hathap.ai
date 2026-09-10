import React from 'react';
import { Card, CardHeader, CardBody } from '../ui/Card';
import { RedTeamFinding } from '../../types';
import { ShieldAlert } from 'lucide-react';

interface RedTeamPanelProps {
  findings?: RedTeamFinding[];
  loading?: boolean;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-500/20 text-red-300',
  high: 'bg-red-500/20 text-red-300',
  medium: 'bg-amber-500/20 text-amber-300',
  low: 'bg-theme-bg-tertiary text-theme-text-secondary',
};

const SEVERITY_ICON: Record<string, string> = {
  critical: '⚠',
  high: '⚠',
  medium: '▴',
  low: '•',
};

export const RedTeamPanel: React.FC<RedTeamPanelProps> = ({ findings, loading }) => {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <span className="flex items-center gap-2 text-sm font-semibold text-theme-text-primary">
            <ShieldAlert size={14} /> Red Team
          </span>
        </CardHeader>
        <CardBody>
          <p className="text-xs text-theme-text-secondary py-4 text-center">Loading red-team findings…</p>
        </CardBody>
      </Card>
    );
  }

  if (!findings || findings.length === 0) {
    return (
      <Card>
        <CardHeader>
          <span className="flex items-center gap-2 text-sm font-semibold text-theme-text-primary">
            <ShieldAlert size={14} /> Red Team
          </span>
        </CardHeader>
        <CardBody>
          <p className="text-xs text-theme-text-secondary py-4 text-center">No red-team findings yet.</p>
        </CardBody>
      </Card>
    );
  }

  const sorted = [...findings].sort((a, b) => {
    const order = { critical: 0, high: 1, medium: 2, low: 3 };
    return (order[a.severity] ?? 4) - (order[b.severity] ?? 4);
  });

  return (
    <Card>
      <CardHeader>
        <span className="flex items-center gap-2 text-sm font-semibold text-theme-text-primary">
          <ShieldAlert size={14} /> Red Team Findings
          <span className="text-[10px] px-2 py-0.5 rounded bg-theme-bg-tertiary text-theme-text-secondary font-normal">
            {findings.length} findings
          </span>
        </span>
      </CardHeader>
      <CardBody className="space-y-2">
        {sorted.map((f) => (
          <div key={f.id} className="p-3 rounded bg-theme-bg-secondary border border-theme-border">
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${SEVERITY_COLORS[f.severity] || 'bg-theme-bg-tertiary text-theme-text-secondary'}`}>
                {SEVERITY_ICON[f.severity] || '•'} {f.severity}
              </span>
              <span className="text-[11px] text-theme-text-secondary">{f.type}</span>
              {f.relatedClaimIds.length > 0 && (
                <span className="text-[10px] font-mono text-theme-text-secondary">claims: {f.relatedClaimIds.map((c) => c.slice(-6)).join(', ')}</span>
              )}
            </div>
            <p className="text-sm text-theme-text-primary mt-1">{f.description}</p>
            {f.suggestedAction && (
              <p className="text-xs text-theme-text-secondary mt-1">Suggested: {f.suggestedAction}</p>
            )}
          </div>
        ))}
      </CardBody>
    </Card>
  );
};