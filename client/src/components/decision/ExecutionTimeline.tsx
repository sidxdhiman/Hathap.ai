import React from 'react';
import { Card, CardHeader, CardBody } from '../ui/Card';
import { DecisionEvent } from '../../types';
import { formatTime } from '../../utils/helpers';
import { Clock } from 'lucide-react';

interface ExecutionTimelineProps {
  events: DecisionEvent[];
  loading: boolean;
}

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

const EVENT_COLORS: Record<string, string> = {
  'execution.completed': 'bg-green-500',
  'task.completed': 'bg-green-500',
  'research.completed': 'bg-green-500',
  'routing.completed': 'bg-green-500',
  'agent.completed': 'bg-green-500',
  'plan.compiled': 'bg-green-500',
  'plan.validated': 'bg-green-500',
  'execution.failed': 'bg-red-500',
  'task.failed': 'bg-red-500',
  'routing.failed': 'bg-red-500',
  'agent.failed': 'bg-red-500',
  'planning.failed': 'bg-red-500',
  'plan.rejected': 'bg-red-500',
  'execution.cancelled': 'bg-red-500',
  'task.cancelled': 'bg-red-500',
  'task.retrying': 'bg-amber-500',
  'execution.paused': 'bg-amber-500',
  'task.paused': 'bg-amber-500',
  'routing.fallback': 'bg-amber-500',
};

const EVENT_DOT_COLORS: Record<string, string> = {
  'execution.completed': 'bg-green-400',
  'task.completed': 'bg-green-400',
  'research.completed': 'bg-green-400',
  'routing.completed': 'bg-green-400',
  'agent.completed': 'bg-green-400',
  'execution.failed': 'bg-red-400',
  'task.failed': 'bg-red-400',
  'routing.failed': 'bg-red-400',
  'agent.failed': 'bg-red-400',
  'execution.cancelled': 'bg-red-400',
  'task.cancelled': 'bg-red-400',
  'task.retrying': 'bg-amber-400',
  'execution.paused': 'bg-amber-400',
  'routing.fallback': 'bg-amber-400',
};

export const ExecutionTimeline: React.FC<ExecutionTimelineProps> = ({ events, loading }) => {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <span className="flex items-center gap-2 text-sm font-semibold text-theme-text-primary">
            <Clock size={14} /> Execution Timeline
          </span>
        </CardHeader>
        <CardBody>
          <p className="text-xs text-theme-text-secondary py-4 text-center">Loading events…</p>
        </CardBody>
      </Card>
    );
  }

  if (events.length === 0) {
    return (
      <Card>
        <CardHeader>
          <span className="flex items-center gap-2 text-sm font-semibold text-theme-text-primary">
            <Clock size={14} /> Execution Timeline
          </span>
        </CardHeader>
        <CardBody>
          <p className="text-xs text-theme-text-secondary py-4 text-center">No events recorded yet.</p>
        </CardBody>
      </Card>
    );
  }

  const sorted = [...events].sort((a, b) => {
    const ta = new Date(a.createdAt).getTime();
    const tb = new Date(b.createdAt).getTime();
    if (ta !== tb) return ta - tb;
    return String(a._id).localeCompare(String(b._id));
  });

  return (
    <Card>
      <CardHeader>
        <span className="flex items-center gap-2 text-sm font-semibold text-theme-text-primary">
          <Clock size={14} /> Execution Timeline
          <span className="text-[10px] px-2 py-0.5 rounded bg-theme-bg-tertiary text-theme-text-secondary font-normal">
            {events.length} events
          </span>
        </span>
      </CardHeader>
      <CardBody>
        <div className="relative pl-6">
          <div className="absolute left-[7px] top-2 bottom-2 w-px bg-theme-border" />
          <div className="space-y-3">
            {sorted.map((event) => {
              const label = EVENT_LABELS[event.type] || event.type;
              const dotColor = EVENT_DOT_COLORS[event.type] || 'bg-theme-text-secondary';
              const bgColor = EVENT_COLORS[event.type];
              return (
                <div key={event._id} className="relative flex items-start gap-3">
                  <div className={`absolute left-[-17px] top-1.5 w-2.5 h-2.5 rounded-full ${dotColor} ring-2 ring-theme-bg-primary`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs font-medium ${bgColor ? `${bgColor}/20 ${bgColor.replace('bg-', 'text-').replace('500', '400')} px-1.5 py-0.5 rounded` : 'text-theme-text-primary'}`}>
                        {label}
                      </span>
                      <span className="text-[10px] text-theme-text-secondary">
                        {formatTime(new Date(event.createdAt))}
                      </span>
                      {event.taskId && (
                        <span className="text-[10px] text-theme-text-secondary font-mono truncate max-w-[120px]">
                          task:{event.taskId.slice(-6)}
                        </span>
                      )}
                    </div>
                    {event.data && typeof event.data === 'object' && Object.keys(event.data).length > 0 && (
                      <div className="text-[10px] text-theme-text-secondary mt-0.5">
                        {Object.entries(event.data).slice(0, 3).map(([k, v]) => (
                          <span key={k} className="mr-2">
                            {k}: {typeof v === 'string' ? v : JSON.stringify(v)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CardBody>
    </Card>
  );
};
