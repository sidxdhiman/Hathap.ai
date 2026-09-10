import React from 'react';
import { Card, CardHeader, CardBody } from '../ui/Card';
import { VerificationResult } from '../../types';
import { ShieldCheck } from 'lucide-react';

interface VerificationPanelProps {
  verifications?: VerificationResult[];
  loading?: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  supported: 'bg-green-500/20 text-green-300',
  contradicted: 'bg-red-500/20 text-red-400',
  inconclusive: 'bg-amber-500/20 text-amber-300',
  unsupported: 'bg-theme-bg-tertiary text-theme-text-secondary',
};

const STATUS_ICON: Record<string, string> = {
  supported: '✓',
  contradicted: '✕',
  inconclusive: '⚠',
  unsupported: '○',
};

export const VerificationPanel: React.FC<VerificationPanelProps> = ({ verifications, loading }) => {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <span className="flex items-center gap-2 text-sm font-semibold text-theme-text-primary">
            <ShieldCheck size={14} /> Verification
          </span>
        </CardHeader>
        <CardBody>
          <p className="text-xs text-theme-text-secondary py-4 text-center">Loading verification results…</p>
        </CardBody>
      </Card>
    );
  }

  if (!verifications || verifications.length === 0) {
    return (
      <Card>
        <CardHeader>
          <span className="flex items-center gap-2 text-sm font-semibold text-theme-text-primary">
            <ShieldCheck size={14} /> Verification
          </span>
        </CardHeader>
        <CardBody>
          <p className="text-xs text-theme-text-secondary py-4 text-center">No verification results yet.</p>
        </CardBody>
      </Card>
    );
  }

  const counts = verifications.reduce<Record<string, number>>((acc, v) => {
    acc[v.status] = (acc[v.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <Card>
      <CardHeader>
        <span className="flex items-center gap-2 text-sm font-semibold text-theme-text-primary">
          <ShieldCheck size={14} /> Verification
          <span className="text-[10px] px-2 py-0.5 rounded bg-theme-bg-tertiary text-theme-text-secondary font-normal">
            {verifications.length} results
          </span>
        </span>
      </CardHeader>
      <CardBody className="space-y-4">
        <div className="flex items-center gap-4 flex-wrap text-[11px]">
          {counts.supported && <span className="text-green-400">{counts.supported} supported</span>}
          {counts.contradicted && <span className="text-red-400">{counts.contradicted} contradicted</span>}
          {counts.inconclusive && <span className="text-amber-400">{counts.inconclusive} inconclusive</span>}
          {counts.unsupported && <span className="text-theme-text-secondary">{counts.unsupported} unsupported</span>}
        </div>
        <div className="space-y-2">
          {verifications.map((v) => (
            <div key={v.id} className="p-3 rounded bg-theme-bg-secondary border border-theme-border">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${STATUS_COLORS[v.status] || 'bg-theme-bg-tertiary text-theme-text-secondary'}`}>
                    {STATUS_ICON[v.status] || '○'} {v.status}
                  </span>
                  <span className="text-[11px] text-theme-text-secondary">mode: {v.mode}</span>
                  {typeof v.confidence === 'number' && (
                    <span className="text-[11px] text-theme-text-secondary">confidence: {Math.round(v.confidence * 100)}%</span>
                  )}
                </div>
                <span className="text-[10px] font-mono text-theme-text-secondary">claim:{v.claimId.slice(-6)}</span>
              </div>
              <p className="text-sm text-theme-text-primary mt-1">{v.claimStatement}</p>
              <div className="flex gap-4 mt-1 text-[11px] text-theme-text-secondary flex-wrap">
                {v.supportingEvidenceIds.length > 0 && <span className="text-green-400">supports: {v.supportingEvidenceIds.length}</span>}
                {v.contradictingEvidenceIds.length > 0 && <span className="text-red-400">contradicts: {v.contradictingEvidenceIds.length}</span>}
                {v.relatedEvidenceIds.length > 0 && <span>related: {v.relatedEvidenceIds.length}</span>}
              </div>
              {v.rationale && <p className="text-xs text-theme-text-secondary mt-1">{v.rationale}</p>}
            </div>
          ))}
        </div>
      </CardBody>
    </Card>
  );
};