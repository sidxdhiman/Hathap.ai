import React, { useState, useMemo } from 'react';
import { Card, CardHeader, CardBody } from '../ui/Card';
import { DecisionEvent } from '../../types';
import { formatTime } from '../../utils/helpers';
import { Activity } from 'lucide-react';

interface EventStreamProps {
  events: DecisionEvent[];
  loading?: boolean;
}

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'research', label: 'Research' },
  { key: 'routing', label: 'Routing' },
  { key: 'verification', label: 'Verification' },
  { key: 'red_team', label: 'Red Team' },
  { key: 'errors', label: 'Errors' },
] as const;

const EVENT_LABELS: Record<string, string> = {
  'decision.started': 'Decision started',
  'planning.started': 'Planning started',
  'planning.completed': 'Planning completed',
  'planning.failed': 'Planning failed',
  'plan.validated': 'Plan validated',
  'plan.rejected': 'Plan rejected',
  'plan.compiled': 'Plan compiled',
  'execution.created': 'Execution created',
  'execution.queued': 'Execution queued',
  'execution.started': 'Execution started',
  'execution.paused': 'Execution paused',
  'execution.resumed': 'Execution resumed',
  'execution.completed': 'Execution completed',
  'execution.failed': 'Execution failed',
  'execution.cancelled': 'Execution cancelled',
  'task.created': 'Task created',
  'task.started': 'Task started',
  'task.completed': 'Task completed',
  'task.failed': 'Task failed',
  'task.retrying': 'Task retrying',
  'task.cancelled': 'Task cancelled',
  'task.paused': 'Task paused',
  'research.completed': 'Research completed',
  'evidence.created': 'Evidence created',
  'claim.created': 'Claim created',
  'routing.started': 'Routing started',
  'routing.completed': 'Routing completed',
  'routing.failed': 'Routing failed',
  'routing.fallback': 'Routing fallback',
  'agent.started': 'Agent started',
  'agent.completed': 'Agent completed',
  'agent.failed': 'Agent failed',
};

function matchesFilter(event: DecisionEvent, filter: string): boolean {
  const type = event.type;
  const taskType =
    event.data && typeof event.data === 'object' && 'type' in event.data
      ? String((event.data as Record<string, unknown>).type)
      : '';
  const isTaskOf = (t: string) => type.startsWith('task.') && taskType === t;
  switch (filter) {
    case 'all':
      return true;
    case 'tasks':
      return type.startsWith('task.') || type.startsWith('agent.');
    case 'research':
      return type === 'research.completed' || type === 'evidence.created' || type === 'claim.created';
    case 'routing':
      return type.startsWith('routing.');
    case 'verification':
      return type === 'claim.created' || isTaskOf('verify_claim');
    case 'red_team':
      return isTaskOf('red_team');
    case 'errors':
      return type.endsWith('.failed') || type === 'task.retrying' || type === 'plan.rejected' || type === 'routing.fallback';
    default:
      return true;
  }
}

const ERROR_EVENT_COLORS: Record<string, string> = {
  'execution.failed': 'text-red-400',
  'task.failed': 'text-red-400',
  'task.retrying': 'text-amber-400',
  'routing.failed': 'text-red-400',
  'routing.fallback': 'text-amber-400',
  'agent.failed': 'text-red-400',
  'planning.failed': 'text-red-400',
  'plan.rejected': 'text-red-400',
  'execution.cancelled': 'text-red-400',
  'task.cancelled': 'text-red-400',
};

export const EventStream: React.FC<EventStreamProps> = ({ events, loading }) => {
  const [filter, setFilter] = useState<string>('all');

  const filtered = useMemo(() => {
    const sorted = [...events].sort((a, b) => {
      const ta = new Date(a.createdAt).getTime();
      const tb = new Date(b.createdAt).getTime();
      if (ta !== tb) return ta - tb;
      return String(a._id).localeCompare(String(b._id));
    });
    return filter === 'all' ? sorted : sorted.filter((e) => matchesFilter(e, filter));
  }, [events, filter]);

  return (
    <Card>
      <CardHeader>
        <span className="flex items-center gap-2 text-sm font-semibold text-theme-text-primary">
          <Activity size={14} /> Event Stream
          <span className="text-[10px] px-2 py-0.5 rounded bg-theme-bg-tertiary text-theme-text-secondary font-normal">
            {events.length} events
          </span>
        </span>
      </CardHeader>
      <CardBody className="space-y-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`text-[11px] px-2.5 py-1 rounded border transition-colors ${
                filter === f.key
                  ? 'border-sky-500 bg-sky-500/10 text-sky-300'
                  : 'border-theme-border text-theme-text-secondary hover:bg-theme-bg-secondary'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        {loading ? (
          <p className="text-xs text-theme-text-secondary py-4 text-center">Loading events…</p>
        ) : filtered.length === 0 ? (
          <p className="text-xs text-theme-text-secondary py-4 text-center">No events match this filter.</p>
        ) : (
          <div className="space-y-1 max-h-80 overflow-y-auto pr-1">
            {filtered.map((event) => {
              const color = ERROR_EVENT_COLORS[event.type] || 'text-theme-text-primary';
              return (
                <div key={event._id} className="flex items-center gap-2 text-xs py-1 border-b border-theme-border/40 last:border-0">
                  <span className="text-[10px] text-theme-text-secondary font-mono shrink-0">
                    {formatTime(new Date(event.createdAt))}
                  </span>
                  <span className={`font-medium truncate ${color}`}>
                    {EVENT_LABELS[event.type] || event.type}
                  </span>
                  {event.taskId && (
                    <span className="text-[10px] text-theme-text-secondary font-mono shrink-0">
                      task:{event.taskId.slice(-6)}
                    </span>
                  )}
                  {event.executionId && (
                    <span className="text-[10px] text-theme-text-secondary font-mono shrink-0">
                      exec:{event.executionId.slice(-6)}
                    </span>
                  )}
                  {event.data && typeof event.data === 'object' && 'type' in event.data && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-theme-bg-tertiary text-theme-text-secondary shrink-0 font-mono">
                      {String((event.data as Record<string, unknown>).type)}
                    </span>
                  )}
                  {event.data && typeof event.data === 'object' && 'phase' in event.data && (
                    <span className="text-[10px] text-theme-text-secondary shrink-0">
                      {String(event.data.phase)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardBody>
    </Card>
  );
};