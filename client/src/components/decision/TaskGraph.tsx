import React from 'react';
import { Card, CardHeader, CardBody } from '../ui/Card';
import { Task } from '../../types';
import { Workflow } from 'lucide-react';

interface TaskGraphProps {
  tasks: Task[];
}

const TYPE_COLORS: Record<string, string> = {
  research: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
  debate: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
  verify_claim: 'bg-green-500/20 text-green-300 border-green-500/30',
  red_team: 'bg-red-500/20 text-red-300 border-red-500/30',
  reconciliation: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  analysis: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  synthesis: 'bg-teal-500/20 text-teal-300 border-teal-500/30',
  challenge: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
};

const STATUS_DOT: Record<string, string> = {
  completed: 'bg-green-400',
  running: 'bg-sky-400 animate-pulse',
  failed: 'bg-red-400',
  retrying: 'bg-amber-400 animate-pulse',
  pending: 'bg-theme-text-secondary',
  ready: 'bg-theme-text-secondary',
  cancelled: 'bg-theme-text-secondary',
  skipped: 'bg-theme-text-secondary',
  paused: 'bg-theme-text-secondary',
};

function computeLayers(tasks: Task[]): string[][] {
  if (tasks.length === 0) return [];
  const idSet = new Set(tasks.map((t) => t.id));
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const placed = new Set<string>();
  const layers: string[][] = [];

  const roots = tasks.filter((t) => !t.dependencies.some((d) => idSet.has(d)));
  if (roots.length === 0) {
    layers.push(tasks.map((t) => t.id));
    return layers;
  }

  let current = roots.map((t) => t.id);
  while (current.length > 0) {
    layers.push(current);
    current.forEach((id) => placed.add(id));
    const next: string[] = [];
    for (const t of tasks) {
      if (placed.has(t.id)) continue;
      const deps = t.dependencies.filter((d) => idSet.has(d));
      if (deps.length > 0 && deps.every((d) => placed.has(d))) {
        next.push(t.id);
      }
    }
    if (next.length === 0) {
      for (const t of tasks) {
        if (!placed.has(t.id)) next.push(t.id);
      }
      if (next.length > 0) layers.push(next);
      break;
    }
    current = next;
  }

  return layers;
}

function GraphNode({ task }: { task: Task }) {
  const color = TYPE_COLORS[task.type] || 'bg-theme-bg-tertiary text-theme-text-secondary border-theme-border';
  const dot = STATUS_DOT[task.status] || 'bg-theme-text-secondary';
  return (
    <div className={`px-3 py-2 rounded border text-xs ${color} min-w-[120px] max-w-[200px]`}>
      <div className="flex items-center gap-1.5 mb-1">
        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
        <span className="font-medium truncate">{task.type}</span>
      </div>
      {task.input && typeof task.input === 'object' && 'query' in task.input && (
        <div className="text-[10px] opacity-75 truncate">{String((task.input as Record<string, unknown>).query)}</div>
      )}
      <div className="text-[10px] opacity-60 mt-0.5">{task.status}</div>
    </div>
  );
}

export const TaskGraph: React.FC<TaskGraphProps> = ({ tasks }) => {
  if (tasks.length === 0) {
    return (
      <Card>
        <CardHeader>
          <span className="flex items-center gap-2 text-sm font-semibold text-theme-text-primary">
            <Workflow size={14} /> Task Graph
          </span>
        </CardHeader>
        <CardBody>
          <p className="text-xs text-theme-text-secondary py-4 text-center">No tasks in this execution.</p>
        </CardBody>
      </Card>
    );
  }

  const layers = computeLayers(tasks);
  const byId = new Map(tasks.map((t) => [t.id, t]));

  return (
    <Card>
      <CardHeader>
        <span className="flex items-center gap-2 text-sm font-semibold text-theme-text-primary">
          <Workflow size={14} /> Task Graph
          <span className="text-[10px] px-2 py-0.5 rounded bg-theme-bg-tertiary text-theme-text-secondary font-normal">
            {tasks.length} tasks · {layers.length} layers
          </span>
        </span>
      </CardHeader>
      <CardBody>
        <div className="overflow-x-auto">
          <div className="flex gap-6 items-start min-w-max py-2">
            {layers.map((layer, li) => (
              <div key={li} className="flex flex-col items-center gap-2 relative">
                {li > 0 && (
                  <div className="absolute -left-6 top-0 bottom-0 flex items-center">
                    <div className="w-6 h-px bg-theme-border" />
                  </div>
                )}
                <div className="text-[10px] text-theme-text-secondary mb-1">Layer {li + 1}</div>
                <div className="flex flex-col gap-2">
                  {layer.map((id) => {
                    const task = byId.get(id);
                    return task ? <GraphNode key={id} task={task} /> : null;
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardBody>
    </Card>
  );
};
