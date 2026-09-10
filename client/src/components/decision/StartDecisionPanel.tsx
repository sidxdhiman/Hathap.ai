import React from 'react';
import { Card, CardHeader, CardBody } from '../ui/Card';
import { Button } from '../ui/Button';
import { Model, PlanningMode, RoutingMode } from '../../types';
import { Workflow, Play } from 'lucide-react';

interface StartDecisionPanelProps {
  planningMode: PlanningMode;
  routingMode: RoutingMode;
  routingModelId: string;
  models: Model[];
  plannerRunning: boolean;
  researchInput: string;
  onPlanningModeChange: (mode: PlanningMode) => void;
  onRoutingModeChange: (mode: RoutingMode) => void;
  onRoutingModelChange: (modelId: string) => void;
  onResearchInputChange: (input: string) => void;
  onPreviewPlan: () => void;
  onStart: () => void;
}

export const StartDecisionPanel: React.FC<StartDecisionPanelProps> = ({
  planningMode,
  routingMode,
  routingModelId,
  models,
  plannerRunning,
  researchInput,
  onPlanningModeChange,
  onRoutingModeChange,
  onRoutingModelChange,
  onResearchInputChange,
  onPreviewPlan,
  onStart,
}) => {
  return (
    <Card className="mb-6">
      <CardHeader>
        <span className="text-sm font-medium text-theme-text-primary">Research Queries (optional)</span>
      </CardHeader>
      <CardBody className="space-y-3">
        <p className="text-xs text-theme-text-secondary">
          Enter one query per line. The decision will begin research, then the debate will use the gathered evidence.
        </p>
        <textarea
          value={researchInput}
          onChange={(e) => onResearchInputChange(e.target.value)}
          placeholder={"example:\nmarket size for decentralized AI\nregulatory landscape 2025"}
          className="w-full h-28 p-3 rounded bg-theme-bg-secondary border border-theme-border text-theme-text-primary text-sm placeholder-theme-text-secondary resize-none focus:outline-sky-500"
        />
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-theme-text-secondary">Planning mode:</span>
            <button
              type="button"
              onClick={() => onPlanningModeChange('fixed')}
              className={`text-xs px-2.5 py-1 rounded border ${
                planningMode === 'fixed'
                  ? 'border-sky-500 bg-sky-500/10 text-sky-300'
                  : 'border-theme-border text-theme-text-secondary hover:bg-theme-bg-secondary'
              }`}
            >
              Standard (fixed)
            </button>
            <button
              type="button"
              onClick={() => onPlanningModeChange('intelligent')}
              className={`text-xs px-2.5 py-1 rounded border ${
                planningMode === 'intelligent'
                  ? 'border-sky-500 bg-sky-500/10 text-sky-300'
                  : 'border-theme-border text-theme-text-secondary hover:bg-theme-bg-secondary'
              }`}
            >
              Intelligent
            </button>
            <span className="text-[11px] text-theme-text-secondary hidden sm:inline">
              Intelligent lets the planner tailor the task graph before execution.
            </span>
          </div>
          <Button onClick={onPreviewPlan} size="sm" variant="secondary" disabled={plannerRunning}>
            <Workflow size={14} /> {plannerRunning ? 'Planning…' : 'Preview plan'}
          </Button>
        </div>

        <div className="flex items-center gap-3 flex-wrap border-t border-theme-border pt-3">
          <span className="text-xs text-theme-text-secondary">Routing:</span>
          <button
            type="button"
            onClick={() => onRoutingModeChange('auto')}
            className={`text-xs px-2.5 py-1 rounded border ${
              routingMode === 'auto'
                ? 'border-violet-500 bg-violet-500/10 text-violet-300'
                : 'border-theme-border text-theme-text-secondary hover:bg-theme-bg-secondary'
            }`}
          >
            Auto
          </button>
          <button
            type="button"
            onClick={() => onRoutingModeChange('manual')}
            className={`text-xs px-2.5 py-1 rounded border ${
              routingMode === 'manual'
                ? 'border-violet-500 bg-violet-500/10 text-violet-300'
                : 'border-theme-border text-theme-text-secondary hover:bg-theme-bg-secondary'
            }`}
          >
            Manual
          </button>
          {routingMode === 'manual' && (
            <select
              value={routingModelId}
              onChange={(e) => onRoutingModelChange(e.target.value)}
              className="text-xs px-2 py-1 rounded bg-theme-bg-secondary border border-theme-border text-theme-text-primary focus:outline-sky-500"
            >
              <option value="">Select a model…</option>
              {models.filter((m) => m.enabled).map((m) => (
                <option key={m.id} value={m.id}>{m.displayName || m.modelName}</option>
              ))}
            </select>
          )}
          <span className="text-[11px] text-theme-text-secondary hidden sm:inline">
            Auto routes each planned task to the best available agent + model; Manual pins one model.
          </span>
        </div>

        <div className="flex justify-end border-t border-theme-border pt-3">
          <Button onClick={onStart} size="sm">
            <Play size={16} /> Start Execution
          </Button>
        </div>
      </CardBody>
    </Card>
  );
};