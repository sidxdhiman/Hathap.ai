import React, { useState } from 'react';
import { Card, CardHeader, CardBody } from '../ui/Card';
import { Button } from '../ui/Button';
import { Target, Plus } from 'lucide-react';
import {
  DecisionOutcome,
  ExpectedVsActualSummary,
  MetricComparison,
  OutcomeInput,
  OutcomeKind,
  OutcomeStatus,
} from '../../types';
import { formatDate } from '../../utils/helpers';

interface OutcomePanelProps {
  outcomes: DecisionOutcome[];
  expectedVsActual: ExpectedVsActualSummary;
  onCreateOutcome?: (input: OutcomeInput) => Promise<void>;
  onUpdateOutcome?: (outcomeId: string, patch: Partial<OutcomeInput>) => Promise<void>;
  busy?: boolean;
}

const OUTCOME_STATUSES: OutcomeStatus[] = ['pending', 'partial', 'success', 'failure', 'unknown', 'cancelled'];

const statusTone = (status: OutcomeStatus) => {
  switch (status) {
    case 'success': return 'bg-green-500/10 border-green-500/20 text-green-400';
    case 'failure': return 'bg-red-500/10 border-red-500/20 text-red-400';
    case 'partial': return 'bg-amber-500/10 border-amber-500/20 text-amber-400';
    case 'cancelled': return 'bg-gray-500/10 border-gray-500/20 text-gray-400';
    case 'unknown': return 'bg-theme-bg-tertiary border-theme-border text-theme-text-secondary';
    default: return 'bg-sky-500/10 border-sky-500/20 text-sky-300';
  }
};

const varianceTone = (cmp: MetricComparison) => {
  if (cmp.achieved === true) return 'text-green-400';
  if (cmp.achieved === false) return 'text-red-400';
  return 'text-theme-text-secondary';
};

const OutcomeForm: React.FC<{
  kind: OutcomeKind;
  onCancel: () => void;
  onSubmit: (input: OutcomeInput) => Promise<void>;
}> = ({ kind, onCancel, onSubmit }) => {
  const [description, setDescription] = useState('');
  const [observedMetric, setObservedMetric] = useState('');
  const [status, setStatus] = useState<OutcomeStatus>(kind === 'expected' ? 'pending' : 'unknown');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!description.trim()) {
      setErr('Outcome description is required.');
      return;
    }
    setSubmitting(true);
    setErr(null);
    try {
      await onSubmit({
        kind,
        description: description.trim(),
        status,
        observedMetric: observedMetric.trim() ? Number(observedMetric) : undefined,
        notes: notes.trim() || undefined,
      });
      onCancel();
    } catch (e: any) {
      setErr(e.message || 'Failed to save outcome.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-3 rounded bg-theme-bg-tertiary border border-theme-border space-y-2">
      <div className="text-[11px] uppercase tracking-wide text-theme-text-secondary">
        Record {kind} outcome
      </div>
      <textarea
        className="w-full bg-theme-bg-secondary border border-theme-border rounded px-2 py-1.5 text-sm text-theme-text-primary focus:outline-none focus:ring-1 focus:ring-sky-500"
        rows={2}
        placeholder={kind === 'expected' ? 'What did we expect to happen?' : 'What actually happened?'}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[11px] text-theme-text-secondary mb-1">Status</label>
          <select
            className="w-full bg-theme-bg-secondary border border-theme-border rounded px-2 py-1.5 text-sm text-theme-text-primary focus:outline-none"
            value={status}
            onChange={(e) => setStatus(e.target.value as OutcomeStatus)}
          >
            {OUTCOME_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[11px] text-theme-text-secondary mb-1">Observed metric (optional)</label>
          <input
            className="w-full bg-theme-bg-secondary border border-theme-border rounded px-2 py-1.5 text-sm text-theme-text-primary focus:outline-none"
            type="number"
            value={observedMetric}
            onChange={(e) => setObservedMetric(e.target.value)}
          />
        </div>
      </div>
      <textarea
        className="w-full bg-theme-bg-secondary border border-theme-border rounded px-2 py-1.5 text-sm text-theme-text-primary focus:outline-none"
        rows={2}
        placeholder="Notes (context, caveats, sources)…"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      {err && <p className="text-xs text-red-400">{err}</p>}
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={handleSubmit} isLoading={submitting}>
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
};

export const OutcomePanel: React.FC<OutcomePanelProps> = ({
  outcomes,
  expectedVsActual,
  onCreateOutcome,
  onUpdateOutcome,
  busy = false,
}) => {
  const [adding, setAdding] = useState<OutcomeKind | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const record = (kind: OutcomeKind, input: OutcomeInput) =>
    onCreateOutcome ? onCreateOutcome(input) : Promise.resolve();
  const update = (id: string, patch: Partial<OutcomeInput>) =>
    onUpdateOutcome ? onUpdateOutcome(id, patch) : Promise.resolve();

  const expected = outcomes.filter((o) => o.kind === 'expected');
  const actual = outcomes.filter((o) => o.kind === 'actual');

  return (
    <Card>
      <CardHeader>
        <span className="flex items-center gap-2 text-sm font-semibold text-theme-text-primary">
          <Target size={14} /> Outcomes
        </span>
      </CardHeader>
      <CardBody className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {expected.length === 0 && actual.length === 0 && (
            <span className="text-[11px] text-theme-text-secondary self-center">
              Record expected and actual outcomes to build the decision's outcome history.
            </span>
          )}
          {onCreateOutcome && !adding && (
            <>
              <Button size="sm" variant="secondary" onClick={() => setAdding('expected')}>
                <Plus size={14} /> Expected
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setAdding('actual')}>
                <Plus size={14} /> Actual
              </Button>
            </>
          )}
        </div>

        {adding && (
          <OutcomeForm
            kind={adding}
            onCancel={() => setAdding(null)}
            onSubmit={(input) => record(adding, input)}
          />
        )}

        {outcomes.length === 0 && !adding && (
          <p className="text-xs text-theme-text-secondary py-3 text-center">No outcomes recorded.</p>
        )}

        {expected.length > 0 && (
          <div>
            <div className="text-[11px] uppercase tracking-wide text-theme-text-secondary mb-2">Expected</div>
            {expected.map((o) => (
              <div key={o.id} className="p-3 rounded bg-theme-bg-tertiary border border-theme-border mb-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-theme-text-primary">{o.description}</span>
                  <span className={`px-2 py-0.5 rounded text-[11px] border ${statusTone(o.status)}`}>{o.status}</span>
                </div>
                <div className="flex items-center gap-3 mt-1 text-[11px] text-theme-text-secondary flex-wrap">
                  {o.observedMetric !== undefined && <span>observed: {o.observedMetric}</span>}
                  {o.observedAt && <span>{formatDate(new Date(o.observedAt))}</span>}
                  {onUpdateOutcome && (
                    <button
                      className="text-sky-400 hover:text-sky-300 focus:outline-none"
                      onClick={() => setUpdatingId(updatingId === o.id ? null : o.id)}
                    >
                      update status
                    </button>
                  )}
                </div>
                {updatingId === o.id && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {OUTCOME_STATUSES.map((s) => (
                      <button
                        key={s}
                        className={`px-2 py-0.5 rounded text-[11px] border ${
                          s === o.status ? 'border-sky-500 text-sky-300' : 'border-theme-border text-theme-text-secondary hover:text-theme-text-primary'
                        }`}
                        onClick={() => {
                          setUpdatingId(null);
                          void update(o.id, { status: s });
                        }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {actual.length > 0 && (
          <div>
            <div className="text-[11px] uppercase tracking-wide text-theme-text-secondary mb-2">Actual</div>
            {actual.map((o) => (
              <div key={o.id} className="p-3 rounded bg-theme-bg-secondary border border-theme-border mb-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-theme-text-primary">{o.description}</span>
                  <span className={`px-2 py-0.5 rounded text-[11px] border ${statusTone(o.status)}`}>{o.status}</span>
                </div>
                <div className="flex items-center gap-3 mt-1 text-[11px] text-theme-text-secondary flex-wrap">
                  {o.observedMetric !== undefined && <span>observed: {o.observedMetric}</span>}
                  <span>{o.source}</span>
                  {o.observedAt && <span>{formatDate(new Date(o.observedAt))}</span>}
                  {onUpdateOutcome && (
                    <button
                      className="text-sky-400 hover:text-sky-300 focus:outline-none"
                      onClick={() => setUpdatingId(updatingId === o.id ? null : o.id)}
                    >
                      update status
                    </button>
                  )}
                </div>
                {updatingId === o.id && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {OUTCOME_STATUSES.map((s) => (
                      <button
                        key={s}
                        className={`px-2 py-0.5 rounded text-[11px] border ${
                          s === o.status ? 'border-sky-500 text-sky-300' : 'border-theme-border text-theme-text-secondary hover:text-theme-text-primary'
                        }`}
                        onClick={() => {
                          setUpdatingId(null);
                          void update(o.id, { status: s });
                        }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {expectedVsActual.metricComparisons.length > 0 && (
          <div className="border-t border-theme-border pt-3">
            <div className="text-[11px] uppercase tracking-wide text-theme-text-secondary mb-2">
              Expected vs actual (metrics)
            </div>
            <div className="space-y-2">
              {expectedVsActual.metricComparisons.map((cmp) => (
                <MetricRow key={cmp.metricName} cmp={cmp} />
              ))}
            </div>
            <p className="text-[11px] text-theme-text-secondary mt-2">
              {expectedVsActual.qualityComputed
                ? 'Variance compares actual to the recorded target. Unknown means no comparable observed value — never failure.'
                : 'Add both expected and actual metrics to compute variance.'}
            </p>
          </div>
        )}

        {busy && <p className="text-[11px] text-theme-text-secondary text-center">Saving…</p>}
      </CardBody>
    </Card>
  );
};

const MetricRow: React.FC<{ cmp: MetricComparison }> = ({ cmp }) => (
  <div className="p-2 rounded bg-theme-bg-tertiary border border-theme-border">
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="font-medium text-theme-text-primary">{cmp.metricName}</span>
      {cmp.meaningful && cmp.variance !== undefined && (
        <span className={`text-xs font-semibold ${varianceTone(cmp)}`}>
          {cmp.variance > 0 ? '+' : ''}{cmp.variance}{cmp.unit ? ` ${cmp.unit}` : ''}
          {cmp.variancePct !== undefined && ` (${cmp.variancePct > 0 ? '+' : ''}${Math.round(cmp.variancePct)}%)`}
        </span>
      )}
    </div>
    <div className="flex items-center gap-2 mt-1 text-[11px] text-theme-text-secondary flex-wrap">
      <span>target: {cmp.target ?? '—'}</span>
      <span>actual: {cmp.actual ?? '—'}</span>
      <span>direction: {cmp.direction}</span>
      {cmp.achieved === true && <span className="text-green-400">achieved</span>}
      {cmp.achieved === false && <span className="text-red-400">missed</span>}
      {cmp.achieved === undefined && cmp.meaningful && <span>unknown outcome</span>}
      {!cmp.meaningful && <span>no comparable value</span>}
    </div>
  </div>
);