import React from 'react';
import { Card, CardHeader, CardBody } from '../ui/Card';
import { ResearchTaskSummary } from '../../types';
import { getStatusColor, getStatusText } from '../../utils/helpers';
import { Search, ExternalLink } from 'lucide-react';

interface ResearchPanelProps {
  research: ResearchTaskSummary[];
  loading?: boolean;
}

export const ResearchPanel: React.FC<ResearchPanelProps> = ({ research, loading }) => {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <span className="flex items-center gap-2 text-sm font-semibold text-theme-text-primary">
            <Search size={14} /> Research
          </span>
        </CardHeader>
        <CardBody>
          <p className="text-xs text-theme-text-secondary py-4 text-center">Loading research…</p>
        </CardBody>
      </Card>
    );
  }

  if (research.length === 0) {
    return (
      <Card>
        <CardHeader>
          <span className="flex items-center gap-2 text-sm font-semibold text-theme-text-primary">
            <Search size={14} /> Research
          </span>
        </CardHeader>
        <CardBody>
          <p className="text-xs text-theme-text-secondary py-4 text-center">No research was requested.</p>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <span className="flex items-center gap-2 text-sm font-semibold text-theme-text-primary">
          <Search size={14} /> Research
          <span className="text-[10px] px-2 py-0.5 rounded bg-theme-bg-tertiary text-theme-text-secondary font-normal">
            {research.length} queries
          </span>
        </span>
      </CardHeader>
      <CardBody className="space-y-4">
        {research.map((rt) => (
          <div key={rt.taskId} className="p-3 rounded bg-theme-bg-secondary border border-theme-border">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="min-w-0">
                <span className="text-xs font-mono text-theme-text-secondary">query:</span>{' '}
                <span className="text-sm text-theme-text-primary">
                  {rt.input && 'query' in rt.input ? String((rt.input as Record<string, unknown>).query) : '—'}
                </span>
                {rt.input && 'purpose' in rt.input && rt.input.purpose && rt.input.purpose !== 'background' && (
                  <span className="text-xs text-theme-text-secondary ml-2">{String(rt.input.purpose)}</span>
                )}
              </div>
              <span className={`text-xs px-2 py-0.5 rounded ${getStatusColor(rt.status)} ${getStatusText(rt.status)}`}>
                {rt.status}
              </span>
            </div>
            {rt.error && (
              <p className="text-xs text-red-400 mt-2 break-all">
                {typeof rt.error === 'object' && 'message' in rt.error ? String((rt.error as { message: string }).message) : String(rt.error)}
              </p>
            )}
            {rt.evidence.length > 0 && (
              <div className="mt-3 space-y-2">
                <div className="text-[11px] uppercase tracking-wide text-theme-text-secondary">
                  Sources ({rt.evidence.length})
                </div>
                {rt.evidence.map((ev) => (
                  <div key={ev.id} className="flex items-start gap-2 text-xs">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-theme-text-primary truncate">{ev.title}</span>
                        {ev.sourceUrl && (
                          <a
                            href={ev.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex text-sky-400 hover:text-sky-300"
                          >
                            <ExternalLink size={11} />
                          </a>
                        )}
                        {ev.sourceReliability && ev.sourceReliability !== 'medium' && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                            ev.sourceReliability === 'high' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'
                          }`}>
                            {ev.sourceReliability}
                          </span>
                        )}
                        {typeof ev.relevanceScore === 'number' && (
                          <span className="text-[10px] text-theme-text-secondary">{Math.round(ev.relevanceScore * 100)}%</span>
                        )}
                      </div>
                      {ev.snippet && (
                        <p className="text-theme-text-secondary line-clamp-2 mt-1">{ev.snippet}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </CardBody>
    </Card>
  );
};