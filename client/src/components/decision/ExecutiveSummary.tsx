import React from 'react';
import { Card, CardHeader, CardBody } from '../ui/Card';
import { DecisionSnapshot } from '../../types';
import { Gauge } from 'lucide-react';

interface ExecutiveSummaryProps {
  snapshot: DecisionSnapshot;
}

const ConfidenceBar: React.FC<{ label: string; value: number; color: string; detail?: string }> = ({ label, value, color, detail }) => (
  <div className="flex items-center gap-3 text-xs">
    <span className="text-theme-text-secondary w-36 shrink-0">{label}</span>
    <div className="flex-1 bg-theme-bg-tertiary h-2 rounded overflow-hidden">
      <div className={`h-2 rounded transition-all duration-500 ${color}`} style={{ width: `${Math.min(Math.round(value * 100), 100)}%` }} />
    </div>
    <span className="text-theme-text-primary w-8 text-right">{Math.round(value * 100)}%</span>
    {detail && <span className="text-[10px] text-theme-text-secondary w-20 text-right shrink-0 hidden sm:block">{detail}</span>}
  </div>
);

export const ExecutiveSummary: React.FC<ExecutiveSummaryProps> = ({ snapshot }) => {
  const { reconciliation, claims, evidence, verifications, redTeamFindings, confidence } = snapshot;

  const evidenceCount = evidence.length;
  const claimCount = claims.length;
  const researchQueryCount = snapshot.tasks.filter((t) => t.type === 'research').length;
  const supportedCount = verifications?.filter((v) => v.status === 'supported').length ?? 0;
  const contradictedCount = verifications?.filter((v) => v.status === 'contradicted').length ?? 0;
  const inconclusiveCount = verifications?.filter((v) => v.status === 'inconclusive').length ?? 0;
  const unsupportedCount = verifications?.filter((v) => v.status === 'unsupported').length ?? 0;
  const criticalFindings = redTeamFindings?.filter((f) => f.severity === 'critical').length ?? 0;
  const highFindings = redTeamFindings?.filter((f) => f.severity === 'high').length ?? 0;
  const mediumFindings = redTeamFindings?.filter((f) => f.severity === 'medium').length ?? 0;
  const lowFindings = redTeamFindings?.filter((f) => f.severity === 'low').length ?? 0;
  const totalFindings = redTeamFindings?.length ?? 0;

  const surviving = reconciliation?.survivingClaimIds.length ?? 0;
  const rejected = reconciliation?.rejectedClaimIds.length ?? 0;
  const uncertain = reconciliation?.uncertainClaimIds.length ?? 0;

  return (
    <Card>
      <CardHeader>
        <span className="text-sm font-semibold text-theme-text-primary">Executive Summary</span>
      </CardHeader>
      <CardBody className="space-y-5">
        {/* Recommendation */}
        {reconciliation?.recommendation && (
          <div>
            <div className="text-[11px] uppercase tracking-wide text-theme-text-secondary mb-1">Recommendation</div>
            <p className="text-theme-text-primary text-sm leading-relaxed">{reconciliation.recommendation}</p>
          </div>
        )}

        {/* Confidence */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Gauge size={14} className="text-theme-text-secondary" />
            <span className="text-[11px] uppercase tracking-wide text-theme-text-secondary">Confidence</span>
          </div>
          {typeof confidence === 'number' ? (
            <div className="space-y-2">
              <div className="text-2xl font-bold text-theme-text-primary">{Math.round(confidence * 100)}%</div>
              <ConfidenceBar label="Evidence Strength" value={evidenceCount > 0 ? Math.min(evidenceCount / 10, 1) : 0} color="bg-sky-500" detail={`${evidenceCount} items`} />
              <ConfidenceBar label="Verification Coverage" value={verifications?.length ? supportedCount / verifications.length : 0} color="bg-green-500" detail={`${supportedCount}/${verifications?.length ?? 0}`} />
              <ConfidenceBar label="Contradiction Risk" value={contradictedCount > 0 ? Math.min(contradictedCount / Math.max(claimCount, 1), 1) : 0} color="bg-red-500" detail={`${contradictedCount} claims`} />
              <ConfidenceBar label="Research Coverage" value={evidenceCount > 0 ? Math.min(evidenceCount / 5, 1) : 0} color="bg-sky-500" detail={`${researchQueryCount} queries`} />
              <ConfidenceBar label="Red-Team Risk" value={totalFindings > 0 ? Math.min(totalFindings / 5, 1) : 0} color="bg-amber-500" detail={`${totalFindings} findings`} />
              <p className="text-[10px] text-theme-text-secondary pt-1">
                Factor bars are derived from observed decision data; the overall confidence is set by reconciliation.
              </p>
            </div>
          ) : (
            <p className="text-xs text-theme-text-secondary">Confidence unavailable</p>
          )}
        </div>

        {/* Key Metrics Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="p-3 rounded bg-theme-bg-secondary border border-theme-border">
            <div className="text-lg font-semibold text-theme-text-primary">{evidenceCount}</div>
            <div className="text-[11px] text-theme-text-secondary">Evidence items</div>
          </div>
          <div className="p-3 rounded bg-theme-bg-secondary border border-theme-border">
            <div className="text-lg font-semibold text-theme-text-primary">{claimCount}</div>
            <div className="text-[11px] text-theme-text-secondary">Claims</div>
          </div>
          <div className="p-3 rounded bg-theme-bg-secondary border border-theme-border">
            <div className="text-lg font-semibold text-green-400">{supportedCount}</div>
            <div className="text-[11px] text-theme-text-secondary">Verified</div>
          </div>
          <div className="p-3 rounded bg-theme-bg-secondary border border-theme-border">
            <div className="text-lg font-semibold text-theme-text-primary">{totalFindings}</div>
            <div className="text-[11px] text-theme-text-secondary">Red-team findings</div>
          </div>
        </div>

        {/* Verification Summary */}
        {(verifications?.length ?? 0) > 0 && (
          <div className="flex items-center gap-3 flex-wrap text-[11px]">
            <span className="text-theme-text-secondary">Verification:</span>
            <span className="text-green-400">{supportedCount} supported</span>
            <span className="text-red-400">{contradictedCount} contradicted</span>
            <span className="text-amber-400">{inconclusiveCount} inconclusive</span>
            {unsupportedCount > 0 && <span className="text-theme-text-secondary">{unsupportedCount} unsupported</span>}
          </div>
        )}

        {/* Reconciliation Summary */}
        {reconciliation && (
          <div className="flex items-center gap-3 flex-wrap text-[11px]">
            <span className="text-theme-text-secondary">Reconciliation:</span>
            <span className="text-green-400">{surviving} surviving</span>
            <span className="text-red-400">{rejected} rejected</span>
            {uncertain > 0 && <span className="text-amber-400">{uncertain} uncertain</span>}
            {reconciliation.needsMoreResearch && (
              <span className="text-amber-400 font-medium">needs more research</span>
            )}
          </div>
        )}

        {/* Red Team Summary */}
        {totalFindings > 0 && (
          <div className="flex items-center gap-3 flex-wrap text-[11px]">
            <span className="text-theme-text-secondary">Red Team:</span>
            {criticalFindings > 0 && <span className="text-red-400">{criticalFindings} critical</span>}
            {highFindings > 0 && <span className="text-red-300">{highFindings} high</span>}
            {mediumFindings > 0 && <span className="text-amber-400">{mediumFindings} medium</span>}
            {lowFindings > 0 && <span className="text-theme-text-secondary">{lowFindings} low</span>}
          </div>
        )}
      </CardBody>
    </Card>
  );
};
