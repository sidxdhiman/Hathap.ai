import React from 'react';
import { Card, CardHeader, CardBody } from '../ui/Card';
import { Execution, TokenUsage } from '../../types';
import { DollarSign } from 'lucide-react';

interface CostPanelProps {
  executions: Execution[];
  loading?: boolean;
}

function aggregateUsage(executions: Execution[]): { tokenUsage: TokenUsage; totalCalls: number } {
  const records = executions.flatMap((e) => (e.tokenUsage ? [e.tokenUsage] : []));
  const totalCalls = records.length;
  const tokenUsage: TokenUsage = records.reduce(
    (acc, r) => {
      acc.inputTokens += r.inputTokens || 0;
      acc.outputTokens += r.outputTokens || 0;
      acc.totalTokens += r.totalTokens || 0;
      acc.estimatedCost += r.estimatedCost || 0;
      if (r.model && !acc.model) acc.model = r.model;
      if (r.provider && !acc.provider) acc.provider = r.provider;
      return acc;
    },
    { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCost: 0, model: '', provider: '' }
  );
  return { tokenUsage, totalCalls };
}

export const CostPanel: React.FC<CostPanelProps> = ({ executions, loading }) => {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <span className="flex items-center gap-2 text-sm font-semibold text-theme-text-primary">
            <DollarSign size={14} /> Cost &amp; Performance
          </span>
        </CardHeader>
        <CardBody>
          <p className="text-xs text-theme-text-secondary py-4 text-center">Loading usage data…</p>
        </CardBody>
      </Card>
    );
  }

  if (!executions || executions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <span className="flex items-center gap-2 text-sm font-semibold text-theme-text-primary">
            <DollarSign size={14} /> Cost &amp; Performance
          </span>
        </CardHeader>
        <CardBody>
          <p className="text-xs text-theme-text-secondary py-4 text-center">No execution data available.</p>
        </CardBody>
      </Card>
    );
  }

  const { tokenUsage, totalCalls } = aggregateUsage(executions);
  const latencyRecords = executions.flatMap((e) =>
    e.tokenUsage && e.tokenUsage.latencyMs != null ? [e.tokenUsage.latencyMs] : []
  );
  const avgLatencyMs =
    latencyRecords.length > 0
      ? latencyRecords.reduce((a, b) => a + b, 0) / latencyRecords.length
      : null;
  const hasActualCost = executions.some((e) => e.actualCost > 0);
  const totalActualCost = executions.reduce((acc, e) => acc + (e.actualCost || 0), 0);
  const totalEstimatedCost = executions.reduce((acc, e) => acc + (e.estimatedCost || 0), 0);
  const totalDuration = executions.reduce<number | null>((acc, e) => {
    if (!e.startedAt) return acc;
    const end = e.completedAt ? new Date(e.completedAt).getTime() : Date.now();
    const dur = end - new Date(e.startedAt).getTime();
    return (acc ?? 0) + Math.max(dur, 0);
  }, null);

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${Math.max(1, Math.round(ms))}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    const min = Math.floor(ms / 60000);
    const sec = Math.round((ms % 60000) / 1000);
    return `${min}m ${sec}s`;
  };

  return (
    <Card>
      <CardHeader>
        <span className="flex items-center gap-2 text-sm font-semibold text-theme-text-primary">
          <DollarSign size={14} /> Cost &amp; Performance
        </span>
      </CardHeader>
      <CardBody className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
          <div className="p-3 rounded bg-theme-bg-secondary border border-theme-border">
            <div className="text-lg font-semibold text-theme-text-primary">{tokenUsage.totalTokens.toLocaleString()}</div>
            <div className="text-[11px] text-theme-text-secondary">Total tokens</div>
          </div>
          <div className="p-3 rounded bg-theme-bg-secondary border border-theme-border">
            <div className="text-lg font-semibold text-theme-text-primary">{tokenUsage.inputTokens.toLocaleString()}</div>
            <div className="text-[11px] text-theme-text-secondary">Input tokens</div>
          </div>
          <div className="p-3 rounded bg-theme-bg-secondary border border-theme-border">
            <div className="text-lg font-semibold text-theme-text-primary">{tokenUsage.outputTokens.toLocaleString()}</div>
            <div className="text-[11px] text-theme-text-secondary">Output tokens</div>
          </div>
          <div className="p-3 rounded bg-theme-bg-secondary border border-theme-border">
            <div className="text-lg font-semibold text-theme-text-primary">{totalCalls}</div>
            <div className="text-[11px] text-theme-text-secondary">LLM calls</div>
          </div>
          <div className="p-3 rounded bg-theme-bg-secondary border border-theme-border">
            <div className="text-lg font-semibold text-theme-text-primary">
              {hasActualCost ? `$${totalActualCost.toFixed(4)}` : '—'}
            </div>
            <div className="text-[11px] text-theme-text-secondary">
              {hasActualCost ? 'Actual cost' : 'Actual cost unavailable'}
            </div>
          </div>
          <div className="p-3 rounded bg-theme-bg-secondary border border-theme-border">
            <div className="text-lg font-semibold text-amber-400">${totalEstimatedCost.toFixed(4)}</div>
            <div className="text-[11px] text-theme-text-secondary">Estimated cost</div>
          </div>
          <div className="p-3 rounded bg-theme-bg-secondary border border-theme-border">
            <div className="text-lg font-semibold text-theme-text-primary">
              {avgLatencyMs != null ? formatDuration(avgLatencyMs) : '—'}
            </div>
            <div className="text-[11px] text-theme-text-secondary">Avg LLM latency</div>
          </div>
        </div>

        {totalDuration !== null && (
          <div className="text-[11px] text-theme-text-secondary">
            Execution duration: <span className="text-theme-text-primary font-medium">{formatDuration(totalDuration)}</span>
          </div>
        )}

        <div className="text-[10px] text-theme-text-secondary space-y-0.5">
          <div>
            Estimated cost is computed from token usage and provider pricing tables. Actual cost represents
            provider-reported charges where available.
          </div>
          <div>
            {tokenUsage.model && tokenUsage.provider
              ? `Primary model: ${tokenUsage.model} (${tokenUsage.provider})`
              : 'No token usage recorded.'}
          </div>
        </div>
      </CardBody>
    </Card>
  );
};