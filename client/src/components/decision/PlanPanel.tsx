import React from 'react';
import { Card, CardHeader, CardBody } from '../ui/Card';
import { DecisionPlan, RoutingPreview } from '../../types';
import { Button } from '../ui/Button';
import { formatDateTime, getStatusColor, getStatusText } from '../../utils/helpers';
import { Workflow, Route } from 'lucide-react';

interface PlanPanelProps {
  plans: DecisionPlan[];
  routingPreview: RoutingPreview | null;
  previewLoading: boolean;
  onFetchRoutingPreview: () => void;
}

export const PlanPanel: React.FC<PlanPanelProps> = ({ plans, routingPreview, previewLoading, onFetchRoutingPreview }) => {
  const latestPlan = plans[0];

  if (plans.length === 0) {
    return null;
  }

  return (
    <Card className="mb-6">
      <CardHeader>
        <span className="flex items-center gap-2 text-sm font-medium text-theme-text-primary">
          <Workflow size={16} /> Decision Plan
          {latestPlan && (
            <span className={`text-[10px] px-2 py-0.5 rounded ${getStatusColor(latestPlan.status)} ${getStatusText(latestPlan.status)}`}>
              {latestPlan.status}
            </span>
          )}
        </span>
      </CardHeader>
      <CardBody className="space-y-4">
        {latestPlan ? (
          <>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-theme-text-secondary">
              <span>
                source: <span className="font-mono text-theme-text-primary">{latestPlan.source}</span>
              </span>
              {latestPlan.plannerModel && <span>planner: {latestPlan.plannerModel}</span>}
              <span>mode: {latestPlan.planningMode}</span>
              <span>plan v{latestPlan.planVersion}</span>
              <span>{formatDateTime(latestPlan.createdAt)}</span>
              {latestPlan.estimates && (
                <span>
                  est. {latestPlan.estimates.estimatedTasks} tasks ·{' '}
                  {latestPlan.estimates.estimatedResearchTasks} research ·{' '}
                  {latestPlan.estimates.estimatedLLMTasks} llm
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {latestPlan.termination.requiresVerification ? (
                <span className="text-[11px] px-2 py-0.5 rounded bg-green-500/20 text-green-400">verification on</span>
              ) : (
                <span className="text-[11px] px-2 py-0.5 rounded bg-theme-bg-tertiary text-theme-text-secondary">verification off</span>
              )}
              {latestPlan.termination.requiresRedTeam ? (
                <span className="text-[11px] px-2 py-0.5 rounded bg-green-500/20 text-green-400">red team on</span>
              ) : (
                <span className="text-[11px] px-2 py-0.5 rounded bg-theme-bg-tertiary text-theme-text-secondary">red team off</span>
              )}
              {latestPlan.termination.requiresReconciliation ? (
                <span className="text-[11px] px-2 py-0.5 rounded bg-green-500/20 text-green-400">reconciliation on</span>
              ) : (
                <span className="text-[11px] px-2 py-0.5 rounded bg-theme-bg-tertiary text-theme-text-secondary">reconciliation off</span>
              )}
            </div>

            {latestPlan.rationale?.summary && (
              <p className="text-sm text-theme-text-secondary">{latestPlan.rationale.summary}</p>
            )}

            {latestPlan.tasks.length > 0 && (
              <div className="space-y-2">
                <div className="text-[11px] uppercase tracking-wide text-theme-text-secondary">
                  Planned task graph ({latestPlan.tasks.length})
                </div>
                {latestPlan.tasks.map((t, i) => (
                  <div key={`${t.tempId}-${i}`} className="p-3 rounded bg-theme-bg-secondary border border-theme-border">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${
                        t.type === 'research' ? 'bg-sky-500/20 text-sky-300' :
                        t.type === 'debate' ? 'bg-violet-500/20 text-violet-300' :
                        t.type === 'verify_claim' ? 'bg-green-500/20 text-green-300' :
                        t.type === 'red_team' ? 'bg-red-500/20 text-red-300' :
                        'bg-amber-500/20 text-amber-300'
                      }`}>
                        {t.type}
                      </span>
                      <span className="font-mono text-[10px] text-theme-text-secondary">{t.tempId}</span>
                      {typeof t.priority === 'number' && (
                        <span className="text-[10px] text-theme-text-secondary">priority {t.priority}</span>
                      )}
                    </div>
                    <p className="text-xs text-theme-text-primary mt-1">{t.purpose}</p>
                    {t.dependsOn.length > 0 && (
                      <div className="text-[10px] text-theme-text-secondary mt-1">
                        after: <span className="font-mono">{t.dependsOn.join(', ')}</span>
                      </div>
                    )}
                    {t.requirements && t.requirements.length > 0 && (
                      <div className="text-[10px] text-theme-text-secondary mt-1">
                        requires: <span className="font-mono">{t.requirements.join(', ')}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {latestPlan.rationale && (latestPlan.rationale.research || latestPlan.rationale.verification) && (
              <div className="text-[11px] text-theme-text-secondary space-y-1">
                {latestPlan.rationale.research && <div>Research: {latestPlan.rationale.research}</div>}
                {latestPlan.rationale.debate && <div>Debate: {latestPlan.rationale.debate}</div>}
                {latestPlan.rationale.verification && <div>Verification: {latestPlan.rationale.verification}</div>}
                {latestPlan.rationale.redTeam && <div>Red team: {latestPlan.rationale.redTeam}</div>}
              </div>
            )}

            {(latestPlan.validation?.errors?.length || 0) > 0 && (
              <div className="text-xs text-red-400 space-y-1">
                {latestPlan.validation!.errors!.slice(0, 5).map((e, i) => <div key={i}>• {e}</div>)}
              </div>
            )}

            <div className="flex items-center gap-3 border-t border-theme-border pt-3">
              <Button onClick={onFetchRoutingPreview} size="sm" variant="secondary" disabled={previewLoading}>
                <Route size={14} /> {previewLoading ? 'Computing…' : (routingPreview ? 'Refresh routing preview' : 'Routing preview (estimated)')}
              </Button>
              {routingPreview && (
                <span className="text-[11px] text-theme-text-secondary">
                  policy {routingPreview.policyVersion} ·{' '}
                  <span className="text-amber-300/90">estimated — not yet persisted</span>
                </span>
              )}
            </div>

            {routingPreview && (
              <div className="space-y-2">
                <div className="text-[11px] uppercase tracking-wide text-theme-text-secondary">
                  Estimated / planned routing ({routingPreview.tasks.length})
                </div>
                {routingPreview.tasks.map((t, i) => (
                  <div key={`${t.tempId || t.type}-${i}`} className="p-3 rounded bg-theme-bg-secondary border border-theme-border">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${
                        t.type === 'research' ? 'bg-sky-500/20 text-sky-300' :
                        t.type === 'debate' ? 'bg-violet-500/20 text-violet-300' :
                        t.type === 'verify_claim' ? 'bg-green-500/20 text-green-300' :
                        t.type === 'red_team' ? 'bg-red-500/20 text-red-300' :
                        'bg-amber-500/20 text-amber-300'
                      }`}>
                        {t.type}
                      </span>
                      {t.status === 'selected' ? (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-green-500/20 text-green-400">
                          {t.agent?.name || '—'} → {t.model?.displayName || t.model?.modelName}
                        </span>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-theme-bg-tertiary text-theme-text-secondary">
                          {t.status === 'skipped' ? 'skipped' : 'failed'}
                        </span>
                      )}
                      {typeof t.score === 'number' && (
                        <span className="text-[10px] font-mono text-theme-text-secondary">score {t.score.toFixed(4)}</span>
                      )}
                      {typeof t.estimatedCost === 'number' && t.pricingKnown && (
                        <span className="text-[10px] text-theme-text-secondary">est. cost ${t.estimatedCost.toFixed(6)}</span>
                      )}
                    </div>
                    {t.reason && <p className="text-[11px] text-amber-300/90 mt-1">{t.reason}</p>}
                    {t.status !== 'selected' && !t.reason && (
                      <p className="text-[11px] text-theme-text-secondary mt-1">
                        Estimated routing is best-effort; attribution appears after execution.
                      </p>
                    )}
                    {t.reasons && t.reasons.length > 0 && (
                      <div className="text-[10px] text-theme-text-secondary mt-1 space-y-0.5">
                        {t.reasons.map((r, j) => <div key={j}>• {r}</div>)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="text-xs text-theme-text-secondary">No plan has been generated yet.</p>
        )}
      </CardBody>
    </Card>
  );
};