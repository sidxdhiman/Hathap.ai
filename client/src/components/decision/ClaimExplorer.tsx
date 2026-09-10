import React, { useState } from 'react';
import { Card, CardHeader, CardBody } from '../ui/Card';
import { Claim, EvidenceRelationship, VerificationResult } from '../../types';
import { ChevronDown, ChevronRight, MessageSquare } from 'lucide-react';

interface ClaimExplorerProps {
  claims: Claim[];
  relationships?: EvidenceRelationship[];
  verifications?: VerificationResult[];
  loading?: boolean;
}

const TYPE_COLORS: Record<string, string> = {
  fact: 'bg-sky-500/20 text-sky-300',
  assumption: 'bg-purple-500/20 text-purple-300',
  opinion: 'bg-theme-bg-tertiary text-theme-text-secondary',
  inference: 'bg-teal-500/20 text-teal-300',
  recommendation: 'bg-green-500/20 text-green-400',
  risk: 'bg-red-500/20 text-red-400',
};

const STATUS_COLORS: Record<string, string> = {
  verified: 'bg-green-500/20 text-green-400',
  accepted: 'bg-green-500/20 text-green-400',
  disputed: 'bg-amber-500/20 text-amber-300',
  proposed: 'bg-theme-bg-tertiary text-theme-text-secondary',
  rejected: 'bg-red-500/20 text-red-400',
  unverified: 'bg-theme-bg-tertiary text-theme-text-secondary',
};

export const ClaimExplorer: React.FC<ClaimExplorerProps> = ({ claims, relationships, verifications, loading }) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <span className="flex items-center gap-2 text-sm font-semibold text-theme-text-primary">
            <MessageSquare size={14} /> Claims
          </span>
        </CardHeader>
        <CardBody>
          <p className="text-xs text-theme-text-secondary py-4 text-center">Loading claims…</p>
        </CardBody>
      </Card>
    );
  }

  if (claims.length === 0) {
    return (
      <Card>
        <CardHeader>
          <span className="flex items-center gap-2 text-sm font-semibold text-theme-text-primary">
            <MessageSquare size={14} /> Claims
          </span>
        </CardHeader>
        <CardBody>
          <p className="text-xs text-theme-text-secondary py-4 text-center">No claims have been extracted yet.</p>
        </CardBody>
      </Card>
    );
  }

  const relsByClaim = new Map<string, { supports: string[]; contradicts: string[]; related: string[] }>();
  if (relationships) {
    for (const r of relationships) {
      if (!relsByClaim.has(r.claimId)) {
        relsByClaim.set(r.claimId, { supports: [], contradicts: [], related: [] });
      }
      const entry = relsByClaim.get(r.claimId)!;
      if (r.relationship === 'supports') entry.supports.push(r.evidenceId);
      else if (r.relationship === 'contradicts') entry.contradicts.push(r.evidenceId);
      else entry.related.push(r.evidenceId);
    }
  }

  const verificationByClaim = new Map<string, VerificationResult>();
  if (verifications) {
    for (const v of verifications) verificationByClaim.set(v.claimId, v);
  }

  return (
    <Card>
      <CardHeader>
        <span className="flex items-center gap-2 text-sm font-semibold text-theme-text-primary">
          <MessageSquare size={14} /> Claims
          <span className="text-[10px] px-2 py-0.5 rounded bg-theme-bg-tertiary text-theme-text-secondary font-normal">
            {claims.length} total
          </span>
        </span>
      </CardHeader>
      <CardBody className="space-y-2">
        {claims.slice(0, 80).map((cl, idx) => {
          const rels = relsByClaim.get(cl.id);
          const verification = verificationByClaim.get(cl.id);
          const isExpanded = expandedId === cl.id;
          return (
            <div key={cl.id} className="p-3 rounded bg-theme-bg-secondary border border-theme-border">
              <div
                className="flex items-start gap-2 cursor-pointer"
                onClick={() => setExpandedId(isExpanded ? null : cl.id)}
              >
                <div className="mt-0.5 text-theme-text-secondary shrink-0">
                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap text-sm">
                    <span className={`shrink-0 px-2 py-0.5 rounded text-[11px] font-medium ${TYPE_COLORS[cl.type] || 'bg-theme-bg-tertiary text-theme-text-secondary'}`}>
                      {cl.type}
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded ${STATUS_COLORS[cl.status] || 'bg-theme-bg-tertiary text-theme-text-secondary'}`}>
                      {cl.status}
                    </span>
                    <span className="text-[10px] font-mono text-theme-text-secondary">#{String(idx + 1)}</span>
                    {cl.provenanceKind && (
                      <span className="text-[10px] text-theme-text-secondary">provenance: {cl.provenanceKind}</span>
                    )}
                  </div>
                  <p className="text-theme-text-primary leading-snug mt-1">{cl.text}</p>
                  <div className="mt-1.5 flex items-center gap-3 text-[10px] text-theme-text-secondary flex-wrap">
                    {rels && rels.supports.length > 0 && (
                      <span className="text-green-400">{rels.supports.length} supporting evidence</span>
                    )}
                    {rels && rels.contradicts.length > 0 && (
                      <span className="text-red-400">{rels.contradicts.length} contradicting evidence</span>
                    )}
                    {rels && rels.related.length > 0 && (
                      <span>{rels.related.length} related evidence</span>
                    )}
                    {verification && (
                      <span
                        className={
                          verification.status === 'supported' ? 'text-green-400' :
                          verification.status === 'contradicted' ? 'text-red-400' :
                          verification.status === 'inconclusive' ? 'text-amber-400' :
                          'text-theme-text-secondary'
                        }
                      >
                        verification: {verification.status}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              {isExpanded && (
                <div className="mt-3 pl-5 space-y-2">
                  {verification && (
                    <div className="text-xs text-theme-text-secondary">
                      <div className="font-medium text-theme-text-primary mb-1">Verification — {verification.status}</div>
                      {typeof verification.confidence === 'number' && (
                        <div>Confidence: {Math.round(verification.confidence * 100)}%</div>
                      )}
                      <div className="mt-1">Mode: {verification.mode}</div>
                      {verification.rationale && <div className="mt-1">{verification.rationale}</div>}
                      <div className="mt-1 text-[10px]">
                        {verification.supportingEvidenceIds.length > 0 && `Supports: ${verification.supportingEvidenceIds.length} evidence`}
                        {verification.contradictingEvidenceIds.length > 0 && ` · Contradicts: ${verification.contradictingEvidenceIds.length} evidence`}
                        {verification.relatedEvidenceIds.length > 0 && ` · Related: ${verification.relatedEvidenceIds.length} evidence`}
                      </div>
                    </div>
                  )}
                  {cl.attribution?.sourceName && (
                    <div className="text-[10px] text-theme-text-secondary">Source: {cl.attribution.sourceName}</div>
                  )}
                  {rels && rels.supports.length > 0 && (
                    <div className="text-[10px] text-theme-text-secondary">Supports evidence: <span className="font-mono">{rels.supports.map((e) => e.slice(-6)).join(', ')}</span></div>
                  )}
                  {rels && rels.contradicts.length > 0 && (
                    <div className="text-[10px] text-red-400">Contradicted by evidence: <span className="font-mono">{rels.contradicts.map((e) => e.slice(-6)).join(', ')}</span></div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </CardBody>
    </Card>
  );
};