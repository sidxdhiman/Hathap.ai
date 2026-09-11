import React, { useState } from 'react';
import { Card, CardHeader, CardBody } from '../ui/Card';
import { Button } from '../ui/Button';
import { BrainCircuit, RefreshCw, Link2 } from 'lucide-react';
import { DecisionMemory, DecisionQualitySignals, MemoryRetrievalResult } from '../../types';
import { formatDate } from '../../utils/helpers';

interface MemoryPanelProps {
  memory: DecisionMemory | null;
  quality: DecisionQualitySignals | null;
  related: MemoryRetrievalResult | null;
  relatedLoading?: boolean;
  onRefreshRelated?: () => void;
}

const statusTone = (status?: string) => {
  switch (status) {
    case 'success': return 'bg-green-500/10 border-green-500/20 text-green-400';
    case 'failure': return 'bg-red-500/10 border-red-500/20 text-red-400';
    case 'partial': return 'bg-amber-500/10 border-amber-500/20 text-amber-400';
    case 'confirmed': return 'bg-green-500/10 border-green-500/20 text-green-400';
    case 'unconfirmed': return 'bg-amber-500/10 border-amber-500/20 text-amber-400';
    default: return 'bg-theme-bg-tertiary border-theme-border text-theme-text-secondary';
  }
};

const QualityBadge: React.FC<{ label: string; active: boolean; positive?: boolean }> = ({ label, active, positive }) => (
  <span
    className={`px-2 py-0.5 rounded text-[11px] border ${
      !active
        ? 'bg-theme-bg-tertiary border-theme-border text-theme-text-secondary'
        : positive
          ? 'bg-green-500/10 border-green-500/20 text-green-400'
          : 'bg-red-500/10 border-red-500/20 text-red-400'
    }`}
  >
    {label}
  </span>
);

export const MemoryPanel: React.FC<MemoryPanelProps> = ({
  memory,
  quality,
  related,
  relatedLoading = false,
  onRefreshRelated,
}) => {
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    if (!onRefreshRelated) return;
    setRefreshing(true);
    try {
      await onRefreshRelated();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <span className="flex items-center gap-2 text-sm font-semibold text-theme-text-primary">
          <BrainCircuit size={14} /> Decision Memory
        </span>
      </CardHeader>
      <CardBody className="space-y-4">
        {!memory ? (
          <div>
            <p className="text-xs text-theme-text-secondary py-2 text-center">
              No memory record yet. A record is written when this decision completes or is cancelled.
            </p>
            {quality && (
              <div className="flex flex-wrap gap-2 mt-2">
                <QualityBadge label="Expected vs actual" active={quality.expectedVsActualComputed} />
                <QualityBadge label="Feedback" active={quality.hasHumanFeedback} />
                <QualityBadge label="Outcome confirmed" active={quality.outcomeConfirmed} />
                <QualityBadge label="Verification present" active={quality.evidenceCompleteness.verificationStatusPresent} />
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className={`px-2 py-0.5 rounded text-[11px] border bg-theme-bg-tertiary border-theme-border text-theme-text-secondary`}>
                {memory.status}
              </span>
              <span className="text-[11px] text-theme-text-secondary">
                {memory.completedAt ? `Completed ${formatDate(new Date(memory.completedAt))}` : 'Memory record'}
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {[memory.category, memory.domain, memory.problemType].filter(Boolean).map((tag, i) => (
                <span key={i} className="px-2 py-0.5 rounded bg-theme-bg-secondary border border-theme-border text-[11px] text-theme-text-primary">
                  {tag}
                </span>
              ))}
              {memory.tags.map((tag, i) => (
                <span key={`t${i}`} className="px-2 py-0.5 rounded bg-sky-500/10 border border-sky-500/20 text-[11px] text-sky-300">
                  #{tag}
                </span>
              ))}
            </div>

            {memory.finalRecommendation && (
              <div>
                <div className="text-[11px] uppercase tracking-wide text-theme-text-secondary mb-1">
                  Final recommendation{' '}
                  <span className="normal-case text-theme-text-secondary/60">({memory.recommendationSource})</span>
                </div>
                <p className="text-sm text-theme-text-primary leading-relaxed">{memory.finalRecommendation}</p>
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              <div className="p-2 rounded bg-theme-bg-tertiary border border-theme-border">
                <div className="text-sm font-semibold text-theme-text-primary">{memory.importantClaimIds.length}</div>
                <div className="text-[11px] text-theme-text-secondary">important claims</div>
              </div>
              <div className="p-2 rounded bg-theme-bg-tertiary border border-theme-border">
                <div className="text-sm font-semibold text-theme-text-primary">{memory.importantEvidenceIds.length}</div>
                <div className="text-[11px] text-theme-text-secondary">key evidence</div>
              </div>
              <div className="p-2 rounded bg-theme-bg-tertiary border border-theme-border">
                <div className="text-sm font-semibold text-theme-text-primary">{memory.agentsUsed.length}</div>
                <div className="text-[11px] text-theme-text-secondary">agents</div>
              </div>
              <div className="p-2 rounded bg-theme-bg-tertiary border border-theme-border">
                <div className="text-sm font-semibold text-theme-text-primary">{memory.outcomeIds.length}</div>
                <div className="text-[11px] text-theme-text-secondary">outcomes</div>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {memory.agentsUsed.map((a, i) => (
                <span key={i} className="px-2 py-0.5 rounded bg-theme-bg-secondary border border-theme-border text-[11px] text-theme-text-secondary">
                  {a}
                </span>
              ))}
              {memory.modelsUsed.map((m, i) => (
                <span key={`m${i}`} className="px-2 py-0.5 rounded bg-theme-bg-secondary border border-theme-border text-[11px] text-theme-text-secondary">
                  {m}
                </span>
              ))}
            </div>
          </div>
        )}

        {quality && (
          <div className="border-t border-theme-border pt-3 space-y-2">
            <div className="text-[11px] uppercase tracking-wide text-theme-text-secondary">Quality signals</div>
            <div className="flex flex-wrap gap-2">
              <QualityBadge
                label="Recommendation accepted"
                active={quality.recommendationAccepted === true}
                positive={quality.recommendationAccepted === true}
              />
              <QualityBadge
                label="Recommendation rejected"
                active={quality.recommendationAccepted === false}
                positive={false}
              />
              <QualityBadge
                label="Outcome achieved"
                active={quality.outcomeAchieved === true}
                positive={quality.outcomeAchieved === true}
              />
              <QualityBadge
                label="Outcome missed"
                active={quality.outcomeAchieved === false}
                positive={false}
              />
              <QualityBadge
                label="Feedback present"
                active={quality.hasHumanFeedback}
              />
              <QualityBadge
                label="Recommendation known"
                active={quality.recommendationKnown}
              />
            </div>
            <p className="text-[11px] text-theme-text-secondary">
              Outcome signals are computed from recorded expected/actual outcomes. No outcome means “unknown”, never “failure”.
            </p>
          </div>
        )}

        <div className="border-t border-theme-border pt-3">
          <div className="flex items-center justify-between mb-2">
            <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-theme-text-secondary">
              <Link2 size={12} /> Related past decisions
            </span>
            {onRefreshRelated && (
              <Button size="sm" variant="ghost" onClick={handleRefresh} isLoading={refreshing}>
                <RefreshCw size={12} /> Refresh
              </Button>
            )}
          </div>

          {relatedLoading && !related ? (
            <p className="text-xs text-theme-text-secondary py-3 text-center">Loading related decisions…</p>
          ) : !related || related.memories.length === 0 ? (
            <p className="text-xs text-theme-text-secondary py-3 text-center">
              No related decisions found yet. Past completed decisions with similar context appear here.
            </p>
          ) : (
            <div className="space-y-2">
              {related.memories.map((m) => (
                <div key={m.memoryId} className="p-3 rounded bg-theme-bg-tertiary border border-theme-border">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-theme-text-primary">{m.title}</span>
                    <span className="text-[11px] text-sky-400 shrink-0">{Math.round(m.relevance * 100)}% match</span>
                  </div>
                  {m.outcome && (
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className={`px-2 py-0.5 rounded text-[10px] border ${m.outcome.status ? statusTone(m.outcome.status) : ''}`}>
                        {m.outcome.status || 'no outcome recorded'}
                      </span>
                      {m.outcome.humanConfirmed && (
                        <span className="px-2 py-0.5 rounded text-[10px] border bg-green-500/10 border-green-500/20 text-green-400">
                          human confirmed
                        </span>
                      )}
                      {m.feedbackPresent && (
                        <span className="px-2 py-0.5 rounded text-[10px] border bg-theme-bg-secondary border-theme-border text-theme-text-secondary">
                          feedback
                        </span>
                      )}
                      <span className="text-[11px] text-theme-text-secondary">{formatDate(new Date(m.updatedAt))}</span>
                    </div>
                  )}
                  <p className="text-xs text-theme-text-primary mt-2">{m.finalRecommendation}</p>
                  <p className="text-[11px] text-theme-text-secondary mt-1.5">
                    Because: {m.relatedBecause.join(', ')}
                  </p>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {m.tags.map((t, i) => (
                      <span key={i} className="px-1.5 py-0.5 rounded bg-sky-500/10 border border-sky-500/20 text-[10px] text-sky-300">
                        #{t}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  );
};