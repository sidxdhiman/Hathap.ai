import React, { useState } from 'react';
import { Card, CardHeader, CardBody } from '../ui/Card';
import { Evidence, EvidenceRelationship } from '../../types';
import { ExternalLink, FileText, ChevronDown, ChevronRight } from 'lucide-react';
import { formatDate } from '../../utils/helpers';

interface EvidenceExplorerProps {
  evidence: Evidence[];
  relationships?: EvidenceRelationship[];
  loading?: boolean;
}

const RELIABILITY_COLORS: Record<string, string> = {
  high: 'bg-green-500/20 text-green-400',
  medium: 'bg-theme-bg-tertiary text-theme-text-secondary',
  low: 'bg-yellow-500/20 text-yellow-400',
};

export const EvidenceExplorer: React.FC<EvidenceExplorerProps> = ({ evidence, relationships, loading }) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <span className="flex items-center gap-2 text-sm font-semibold text-theme-text-primary">
            <FileText size={14} /> Evidence
          </span>
        </CardHeader>
        <CardBody>
          <p className="text-xs text-theme-text-secondary py-4 text-center">Loading evidence…</p>
        </CardBody>
      </Card>
    );
  }

  if (evidence.length === 0) {
    return (
      <Card>
        <CardHeader>
          <span className="flex items-center gap-2 text-sm font-semibold text-theme-text-primary">
            <FileText size={14} /> Evidence
          </span>
        </CardHeader>
        <CardBody>
          <p className="text-xs text-theme-text-secondary py-4 text-center">No research evidence was gathered.</p>
        </CardBody>
      </Card>
    );
  }

  const relsByEvidence = new Map<string, { supports: string[]; contradicts: string[]; related: string[] }>();
  if (relationships) {
    for (const r of relationships) {
      if (!relsByEvidence.has(r.evidenceId)) {
        relsByEvidence.set(r.evidenceId, { supports: [], contradicts: [], related: [] });
      }
      const entry = relsByEvidence.get(r.evidenceId)!;
      if (r.relationship === 'supports') entry.supports.push(r.claimId);
      else if (r.relationship === 'contradicts') entry.contradicts.push(r.claimId);
      else entry.related.push(r.claimId);
    }
  }

  return (
    <Card>
      <CardHeader>
        <span className="flex items-center gap-2 text-sm font-semibold text-theme-text-primary">
          <FileText size={14} /> Evidence
          <span className="text-[10px] px-2 py-0.5 rounded bg-theme-bg-tertiary text-theme-text-secondary font-normal">
            {evidence.length} items
          </span>
        </span>
      </CardHeader>
      <CardBody className="space-y-2">
        {evidence.slice(0, 80).map((ev) => {
          const rels = relsByEvidence.get(ev.id);
          const isExpanded = expandedId === ev.id;
          return (
            <div key={ev.id} className="p-3 rounded bg-theme-bg-secondary border border-theme-border">
              <div
                className="flex items-start gap-2 cursor-pointer"
                onClick={() => setExpandedId(isExpanded ? null : ev.id)}
              >
                <div className="mt-0.5 text-theme-text-secondary">
                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-sm font-medium text-theme-text-primary truncate">{ev.title}</h4>
                    {ev.provenanceKind && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-theme-bg-tertiary text-theme-text-secondary">
                        {ev.provenanceKind}
                      </span>
                    )}
                    {ev.sourceReliability && ev.sourceReliability !== 'medium' && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${RELIABILITY_COLORS[ev.sourceReliability]}`}>
                        {ev.sourceReliability}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-theme-text-secondary mt-1 flex items-center gap-2 flex-wrap">
                    {ev.sourceName && <span>{ev.sourceName}</span>}
                    {ev.sourceUrl && (
                      <a
                        href={ev.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sky-400 hover:text-sky-300 inline-flex items-center gap-0.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {(() => { try { return new URL(ev.sourceUrl).hostname; } catch { return ev.sourceUrl; } })()}
                        <ExternalLink size={10} />
                      </a>
                    )}
                    <span>·</span>
                    <span>{formatDate(ev.retrievedAt)}</span>
                    {typeof ev.relevanceScore === 'number' && (
                      <>
                        <span>·</span>
                        <span>{Math.round(ev.relevanceScore * 100)}% relevance</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              {isExpanded && (
                <div className="mt-3 pl-5 space-y-2">
                  {(ev.snippet || ev.content) && (
                    <p className="text-xs text-theme-text-secondary leading-relaxed">
                      {ev.snippet || ev.content}
                    </p>
                  )}
                  {rels && (rels.supports.length > 0 || rels.contradicts.length > 0 || rels.related.length > 0) && (
                    <div className="text-[10px] text-theme-text-secondary space-y-1">
                      {rels.supports.length > 0 && (
                        <div>Supports {rels.supports.length} claim(s): <span className="font-mono">{rels.supports.map((c) => c.slice(-6)).join(', ')}</span></div>
                      )}
                      {rels.contradicts.length > 0 && (
                        <div className="text-red-400">Contradicts {rels.contradicts.length} claim(s): <span className="font-mono">{rels.contradicts.map((c) => c.slice(-6)).join(', ')}</span></div>
                      )}
                      {rels.related.length > 0 && (
                        <div>Related to {rels.related.length} claim(s)</div>
                      )}
                    </div>
                  )}
                  <div className="text-[10px] text-theme-text-secondary space-y-0.5">
                    {ev.provider && <div>Provider: {ev.provider}</div>}
                    {ev.query && <div>Query: {ev.query}</div>}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </CardBody>
    </Card>
  );
};
