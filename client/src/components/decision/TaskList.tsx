import React from 'react';
import { Card, CardHeader, CardBody } from '../ui/Card';
import { Task, TaskRouting } from '../../types';
import { getStatusColor, getStatusText, formatTime } from '../../utils/helpers';
import { ListChecks } from 'lucide-react';

interface TaskListProps {
  tasks: Task[];
}

const TYPE_ICONS: Record<string, string> = {
  research: 'bg-sky-500/20 text-sky-300',
  debate: 'bg-violet-500/20 text-violet-300',
  verify_claim: 'bg-green-500/20 text-green-300',
  red_team: 'bg-red-500/20 text-red-300',
  reconciliation: 'bg-amber-500/20 text-amber-300',
  analysis: 'bg-purple-500/20 text-purple-300',
  synthesis: 'bg-teal-500/20 text-teal-300',
  challenge: 'bg-orange-500/20 text-orange-300',
};

function formatDuration(start?: string | Date, end?: string | Date): string | null {
  if (!start) return null;
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  const ms = e - s;
  if (ms < 0) return null;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const min = Math.floor(ms / 60000);
  const sec = Math.round((ms % 60000) / 1000);
  return `${min}m ${sec}s`;
}

function renderError(error: unknown): string | null {
  if (!error) return null;
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && 'message' in error) {
    const msg = (error as { message: unknown }).message;
    if (typeof msg === 'string') return msg;
  }
  return null;
}

export const TaskList: React.FC<TaskListProps> = ({ tasks }) => {
  if (tasks.length === 0) {
    return (
      <Card>
        <CardHeader>
          <span className="flex items-center gap-2 text-sm font-semibold text-theme-text-primary">
            <ListChecks size={14} /> Tasks
          </span>
        </CardHeader>
        <CardBody>
          <p className="text-xs text-theme-text-secondary py-4 text-center">No tasks recorded yet.</p>
        </CardBody>
      </Card>
    );
  }

  const sorted = [...tasks].sort((a, b) => {
    const order = { running: 0, pending: 1, ready: 2, retrying: 3, completed: 4, failed: 5, cancelled: 6, skipped: 7, paused: 8 };
    const oa = order[a.status as keyof typeof order] ?? 9;
    const ob = order[b.status as keyof typeof order] ?? 9;
    if (oa !== ob) return oa - ob;
    return a.priority - b.priority;
  });

  return (
    <Card>
      <CardHeader>
        <span className="flex items-center gap-2 text-sm font-semibold text-theme-text-primary">
          <ListChecks size={14} /> Tasks
          <span className="text-[10px] px-2 py-0.5 rounded bg-theme-bg-tertiary text-theme-text-secondary font-normal">
            {tasks.length} total
          </span>
        </span>
      </CardHeader>
      <CardBody className="space-y-2">
        {sorted.map((task) => {
          const routing = task.metadata?.routing as TaskRouting | undefined;
          const sel = routing?.selection;
          const duration = formatDuration(task.startedAt, task.completedAt);
          const typeColor = TYPE_ICONS[task.type] || 'bg-theme-bg-tertiary text-theme-text-secondary';
          return (
            <div key={task.id} className="p-3 rounded bg-theme-bg-secondary border border-theme-border">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${typeColor}`}>
                    {task.type}
                  </span>
                  <span className={`text-[10px] px-2 py-0.5 rounded ${getStatusColor(task.status)} ${getStatusText(task.status)}`}>
                    {task.status}
                  </span>
                  {task.dependencies.length > 0 && (
                    <span className="text-[10px] text-theme-text-secondary">
                      after {task.dependencies.length}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-[10px] text-theme-text-secondary">
                  {duration && <span>{duration}</span>}
                  {renderError(task.error) && (
                    <span className="text-red-400 max-w-[150px] truncate">{renderError(task.error)}</span>
                  )}
                </div>
              </div>
              {sel && sel.status === 'selected' && (
                <div className="mt-1.5 flex items-center gap-2 text-[10px] text-theme-text-secondary flex-wrap">
                  <span>{sel.agent?.name || '—'}</span>
                  <span>→</span>
                  <span>{sel.model.displayName || sel.model.modelName}</span>
                  <span className="text-theme-text-secondary">({sel.model.provider})</span>
                  {sel.fallbackUsed && (
                    <span className="px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-300">fallback</span>
                  )}
                </div>
              )}
              {task.dependencies.length > 0 && (
                <div className="mt-1 text-[10px] text-theme-text-secondary">
                  deps: <span className="font-mono">{task.dependencies.map((d) => d.slice(-6)).join(', ')}</span>
                </div>
              )}
            </div>
          );
        })}
      </CardBody>
    </Card>
  );
};
