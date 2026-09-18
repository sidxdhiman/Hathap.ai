import React, { useMemo, useState } from 'react';
import {
  FlaskConical,
  Play,
  Loader,
  Trash2,
  ChevronDown,
  ChevronRight,
  Plus,
  Download,
  X,
  Gauge,
  AlertTriangle,
  CheckCircle,
  FileText,
} from 'lucide-react';
import { Header } from '../components/layout/Header';
import { Layout, Container, PageHeader } from '../components/layout/Layout';
import { Card, CardBody, CardHeader, CardFooter } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input, TextArea, Select } from '../components/ui/Input';
import { useEvaluation } from '../context/EvaluationContext';
import { useApp } from '../context/AppContext';
import { formatDate } from '../utils/helpers';
import { Benchmark, BenchmarkCase, EvaluationRun, EvaluationCaseResult, Baseline, Comparison } from '../types';

const RUN_STATUS_STYLES: Record<string, string> = {
  draft: 'bg-slate-500/20 text-slate-300 border-slate-600',
  queued: 'bg-amber-500/20 text-amber-300 border-amber-600',
  running: 'bg-sky-500/20 text-sky-300 border-sky-600',
  completed: 'bg-green-500/20 text-green-300 border-green-600',
  failed: 'bg-red-500/20 text-red-300 border-red-600',
  partial: 'bg-orange-500/20 text-orange-300 border-orange-600',
  cancelled: 'bg-slate-500/20 text-slate-400 border-slate-600',
};

const CASE_STATUS_STYLES: Record<string, string> = {
  passed: 'text-green-400',
  failed: 'text-red-400',
  error: 'text-orange-400',
  skipped: 'text-slate-400',
};

type Tab = 'benchmarks' | 'runs' | 'baselines' | 'comparisons';

const BenchmarkCardBody: React.FC<{ benchmark: Benchmark }> = ({ benchmark }) => {
  const {
    getBenchmarkCases,
    addBenchmarkCase,
    deleteCase,
    createRun,
    startRun,
  } = useEvaluation();
  const { showToast } = useApp();
  const [expanded, setExpanded] = useState(false);
  const [cases, setCases] = useState<BenchmarkCase[]>([]);
  const [loadingCases, setLoadingCases] = useState(false);
  const [showAddCase, setShowAddCase] = useState(false);
  const [caseForm, setCaseForm] = useState({ title: '', prompt: '', context: '', category: '', difficulty: 'medium' as 'easy' | 'medium' | 'hard' });
  const [runName, setRunName] = useState('');

  const toggle = async () => {
    const next = !expanded;
    setExpanded(next);
    if (next && cases.length === 0) {
      setLoadingCases(true);
      try {
        setCases(await getBenchmarkCases(benchmark.id));
      } catch (err: any) {
        showToast('error', err.message);
      } finally {
        setLoadingCases(false);
      }
    }
  };

  const handleAddCase = async () => {
    if (!caseForm.title.trim() || !caseForm.prompt.trim()) return;
    try {
      await addBenchmarkCase(benchmark.id, {
        title: caseForm.title.trim(),
        prompt: caseForm.prompt.trim(),
        context: caseForm.context.trim() || undefined,
        category: caseForm.category.trim() || undefined,
        difficulty: caseForm.difficulty,
      });
      setCaseForm({ title: '', prompt: '', context: '', category: '', difficulty: 'medium' });
      setShowAddCase(false);
      setCases(await getBenchmarkCases(benchmark.id));
      showToast('success', 'Case added');
    } catch (err: any) {
      showToast('error', err.message);
    }
  };

  const handleDeleteCase = async (caseId: string) => {
    try {
      await deleteCase(caseId);
      setCases((prev) => prev.filter((c) => c.id !== caseId));
      showToast('success', 'Case deleted');
    } catch (err: any) {
      showToast('error', err.message);
    }
  };

  const handleRunBenchmark = async () => {
    if (!runName.trim()) return;
    try {
      const run = await createRun({
        name: runName.trim(),
        description: `Run of benchmark "${benchmark.name}"`,
        benchmarkId: benchmark.id,
        kind: 'standard',
        systemUnderTest: {
          kind: 'decision-engine',
          label: 'Hathap decision engine',
          decisionSettings: { planningMode: 'fixed', routingMode: 'auto', verificationEnabled: true },
        },
      });
      setRunName('');
      try {
        await startRun(run.id);
        showToast('success', 'Run started — results stream in as cases complete');
      } catch {
        showToast('info', 'Run created but failed to auto-start; start it from the Runs tab.');
      }
    } catch (err: any) {
      showToast('error', err.message);
    }
  };

  return (
    <div className="mt-3 border-t border-theme-border pt-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" onClick={toggle}>
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          {expanded ? 'Hide cases' : `Cases (${benchmark.caseCount ?? cases.length})`}
        </Button>
        <div className="flex items-center gap-2">
          <Input
            className="w-56"
            value={runName}
            onChange={(e) => setRunName(e.target.value)}
            placeholder="Run name"
          />
          <Button size="sm" onClick={handleRunBenchmark} disabled={!runName.trim()}>
            <Play size={14} /> Run benchmark
          </Button>
        </div>
      </div>
      {expanded && (
        <div className="mt-4 space-y-3">
          {loadingCases && <p className="text-sm text-theme-text-secondary">Loading cases…</p>}
          {!loadingCases && cases.length === 0 && (
            <p className="text-sm text-theme-text-secondary">No cases yet — add one below.</p>
          )}
          {cases.map((c) => (
            <div key={c.id} className="flex items-start justify-between gap-3 p-3 border border-theme-border rounded">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-theme-text-primary">{c.title}</span>
                  {c.difficulty && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-theme-bg-secondary border border-theme-border">{c.difficulty}</span>
                  )}
                  {c.category && <span className="text-xs text-theme-text-secondary">{c.category}</span>}
                </div>
                <p className="text-sm text-theme-text-secondary line-clamp-2 mt-1">{c.prompt}</p>
              </div>
              {c.id && (
                <button
                  className="p-1.5 hover:bg-red-500/10 text-theme-text-secondary hover:text-red-400 transition-colors"
                  onClick={() => handleDeleteCase(c.id)}
                  title="Delete case"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          ))}
          {showAddCase ? (
            <div className="p-3 border border-sky-600/40 rounded space-y-3">
              <Input
                value={caseForm.title}
                onChange={(e) => setCaseForm({ ...caseForm, title: e.target.value })}
                placeholder="Case title"
              />
              <TextArea
                rows={2}
                value={caseForm.prompt}
                onChange={(e) => setCaseForm({ ...caseForm, prompt: e.target.value })}
                placeholder="Prompt evaluated against the system"
              />
              <TextArea
                rows={2}
                value={caseForm.context}
                onChange={(e) => setCaseForm({ ...caseForm, context: e.target.value })}
                placeholder="Context (optional)"
              />
              <div className="flex flex-wrap items-center gap-3">
                <Input
                  className="w-48"
                  value={caseForm.category}
                  onChange={(e) => setCaseForm({ ...caseForm, category: e.target.value })}
                  placeholder="Category (optional)"
                />
                <Select
                  value={caseForm.difficulty}
                  onChange={(e) => setCaseForm({ ...caseForm, difficulty: e.target.value as any })}
                >
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </Select>
                <Button size="sm" onClick={handleAddCase} disabled={!caseForm.title.trim() || !caseForm.prompt.trim()}>
                  Add case
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowAddCase(false)}>
                  <X size={14} /> Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => setShowAddCase(true)}>
              <Plus size={14} /> Add case
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

const RunRow: React.FC<{ run: EvaluationRun }> = ({ run }) => {
  const { getRunResults, cancelRun, deleteRun, getRunAggregate, createBaseline } = useEvaluation();
  const { showToast } = useApp();
  const [expanded, setExpanded] = useState(false);
  const [results, setResults] = useState<EvaluationCaseResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [aggregate, setAggregate] = useState<number | undefined>(undefined);
  const [busy, setBusy] = useState<string | null>(null);

  const toggle = async () => {
    const next = !expanded;
    setExpanded(next);
    if (next && results.length === 0 && (run.status === 'completed' || run.status === 'partial')) {
      setLoading(true);
      try {
        setResults(await getRunResults(run.id));
        const agg = await getRunAggregate(run.id);
        if (typeof agg.score === 'number') setAggregate(agg.score);
      } catch (err: any) {
        showToast('error', err.message);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleCancel = async () => {
    setBusy('cancel');
    try {
      await cancelRun(run.id);
      showToast('info', 'Run cancelled');
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async () => {
    setBusy('delete');
    try {
      await deleteRun(run.id);
      showToast('success', 'Run deleted');
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setBusy(null);
    }
  };

  const handleBaseline = async () => {
    setBusy('baseline');
    try {
      await createBaseline({
        name: `Baseline from "${run.name}"`,
        description: `Created from completed run ${run.id}`,
        runId: run.id,
        strategy: 'priorRun',
      });
      showToast('success', 'Baseline created from this run');
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setBusy(null);
    }
  };

  const p = run.progress ?? { total: 0, completed: 0, error: 0, skipped: 0, running: 0 };
  const passed = results.filter((r) => r.status === 'passed').length;
  const failed = results.filter((r) => r.status === 'failed').length;

  return (
    <Card>
      <button className="w-full text-left" onClick={toggle}>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-theme-text-primary">{run.name}</h3>
              <span className={`text-xs px-2 py-0.5 rounded border ${RUN_STATUS_STYLES[run.status] || RUN_STATUS_STYLES.draft}`}>
                {run.status}
              </span>
              {run.kind !== 'standard' && (
                <span className="text-xs px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-600">
                  {run.kind}
                </span>
              )}
              {aggregate !== undefined && (
                <span className="flex items-center gap-1 text-sm font-medium">
                  <Gauge size={14} /> Aggregate {Math.round(aggregate * 100)}%
                </span>
              )}
            </div>
            <p className="text-sm text-theme-text-secondary mt-1">
              {run.benchmarkTitle || run.benchmarkId} · {run.systemUnderTest?.label || run.systemUnderTest?.kind}
            </p>
            <div className="flex flex-wrap items-center gap-4 mt-2 text-xs text-theme-text-secondary">
              <span>Progress {p.completed + p.error + p.skipped}/{p.total}</span>
              {run.startedAt && <span>Started {formatDate(run.startedAt)}</span>}
              {run.completedAt && <span>Completed {formatDate(run.completedAt)}</span>}
            </div>
          </div>
          <ChevronDown size={20} className={`text-theme-text-secondary shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </div>
      </button>
      {expanded && (
        <div className="mt-4 border-t border-theme-border pt-4 space-y-4">
          {run.status === 'running' || run.status === 'queued' ? (
            <div className="flex items-center gap-2 text-sm text-theme-text-secondary">
              <Loader size={14} className="animate-spin" /> Run in progress — polled from the server.
            </div>
          ) : loading ? (
            <p className="text-sm text-theme-text-secondary">Loading results…</p>
          ) : results.length === 0 ? (
            <p className="text-sm text-theme-text-secondary">
              {run.status === 'completed' || run.status === 'partial'
                ? 'No results returned for this run.'
                : 'Start or execute this run to produce results.'}
            </p>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-4 text-sm">
                <span className="flex items-center gap-1 text-green-400"><CheckCircle size={14} /> {passed} passed</span>
                <span className="flex items-center gap-1 text-red-400"><AlertTriangle size={14} /> {failed} failed</span>
                {results.length > 0 && (
                  <span className="text-theme-text-secondary">Composite available per case below</span>
                )}
              </div>
              {results.map((r) => (
                <div key={r.id} className="p-3 border border-theme-border rounded grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`font-medium ${CASE_STATUS_STYLES[r.status] || ''}`}>{r.caseTitle || r.caseId}</span>
                      <span className="text-xs text-theme-text-secondary">{r.status}</span>
                    </div>
                    {r.error?.message && <p className="text-xs text-red-400 mt-1">{r.error.message}</p>}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-theme-text-secondary md:justify-end">
                    {typeof r.metrics?.score === 'number' && <span>Composite {Math.round(r.metrics.score * 100)}%</span>}
                    {typeof r.structural?.score === 'number' && <span>Structure {Math.round(r.structural.score * 100)}%</span>}
                    {typeof r.quality?.score === 'number' && <span>Quality {Math.round(r.quality.score * 100)}%</span>}
                    {typeof r.evidence?.score === 'number' && <span>Evidence {Math.round(r.evidence.score * 100)}%</span>}
                    {typeof r.reasoning?.score === 'number' && <span>Reasoning {Math.round(r.reasoning.score * 100)}%</span>}
                    {typeof r.outcome?.score === 'number' && <span>Outcome {Math.round(r.outcome.score * 100)}%</span>}
                    {typeof r.efficiency?.score === 'number' && <span>Efficiency {Math.round(r.efficiency.score * 100)}%</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {(run.status === 'completed' || run.status === 'partial') && (
              <Button size="sm" variant="secondary" onClick={handleBaseline} isLoading={busy === 'baseline'}>
                <Download size={14} /> Save as baseline
              </Button>
            )}
            {(run.status === 'draft' || run.status === 'cancelled' || run.status === 'failed') && (
              <Button size="sm" variant="secondary" disabled title="Open the run record on the server">
                <Play size={14} /> Start / execute via API
              </Button>
            )}
            {(run.status === 'running' || run.status === 'queued') && (
              <Button size="sm" variant="danger" onClick={handleCancel} isLoading={busy === 'cancel'}>
                Cancel run
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={handleDelete} isLoading={busy === 'delete'}>
              <Trash2 size={14} /> Delete
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
};

const BaselineRow: React.FC<{ baseline: Baseline; runs: EvaluationRun[] }> = ({ baseline, runs }) => {
  const { deleteBaseline, compareBaseline } = useEvaluation();
  const { showToast } = useApp();
  const [busy, setBusy] = useState(false);
  const [compareAgainst, setCompareAgainst] = useState('');
  const completedRuns = runs.filter((r) => r.status === 'completed');
  const [link, setLink] = useState<Comparison | null>(null);

  const handleDelete = async () => {
    setBusy(true);
    try {
      await deleteBaseline(baseline.id);
      showToast('success', 'Baseline deleted');
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleCompare = async () => {
    if (!compareAgainst) return;
    setBusy(true);
    try {
      const cmp = await compareBaseline(compareAgainst, baseline.id, `vs "Join ${baseline.name}"`);
      setLink(cmp);
      showToast('success', cmp.summary.regressionDetected ? 'Regression detected' : 'No regression detected (or scores missing)');
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-theme-text-primary">{baseline.name}</h3>
            <span className="text-xs px-2 py-0.5 rounded bg-teal-500/20 text-teal-300 border border-teal-600">{baseline.strategy}</span>
            <span className={`text-xs px-2 py-0.5 rounded border ${baseline.status === 'active' ? 'bg-green-500/20 text-green-300 border-green-600' : 'bg-slate-500/20 text-slate-300 border-slate-600'}`}>
              {baseline.status}
            </span>
          </div>
          {baseline.description && <p className="text-sm text-theme-text-secondary mt-1">{baseline.description}</p>}
          <p className="text-xs text-theme-text-secondary mt-1">Created {formatDate(baseline.createdAt)}</p>
        </div>
        <div className="flex items-center gap-2">
          <Select className="w-52" value={compareAgainst} onChange={(e) => setCompareAgainst(e.target.value)} disabled={completedRuns.length === 0 && !link}>
            <option value="">Compare a completed run…</option>
            {completedRuns.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </Select>
          <Button size="sm" variant="secondary" onClick={handleCompare} disabled={!compareAgainst || busy} isLoading={busy && !link}>
            Compare
          </Button>
          <Button size="sm" variant="ghost" onClick={handleDelete} isLoading={busy && !compareAgainst}>
            <Trash2 size={14} />
          </Button>
        </div>
      </div>
      {link && (
        <div className="mt-3 border-t border-theme-border pt-3">
          <div className="flex flex-wrap gap-4 text-sm">
            <span>Aggregate run {typeof link.summary.aggregateA === 'number' ? `${Math.round(link.summary.aggregateA * 100)}%` : 'n/a'}</span>
            <span>Baseline {typeof link.summary.aggregateB === 'number' ? `${Math.round(link.summary.aggregateB * 100)}%` : 'n/a'}</span>
            {typeof link.summary.aggregateDelta === 'number' && (
              <span className={link.summary.regressionDetected ? 'text-red-400' : 'text-green-400'}>
                Delta {link.summary.aggregateDelta > 0 ? '+' : ''}{Math.round(link.summary.aggregateDelta * 100)} pp
              </span>
            )}
          </div>
          {link.summary.note && <p className="text-xs text-theme-text-secondary mt-1">{link.summary.note}</p>}
        </div>
      )}
    </Card>
  );
};

export const EvaluationPage: React.FC = () => {
  const { benchmarks, runs, baselines, comparisons, isLoading, seedBenchmarks, createBenchmark, deleteBenchmark, compareRuns } = useEvaluation();
  const { showToast } = useApp();
  const [tab, setTab] = useState<Tab>('benchmarks');
  const [seeding, setSeeding] = useState(false);
  const [showNewBenchmark, setShowNewBenchmark] = useState(false);
  const [benchForm, setBenchForm] = useState({ name: '', description: '' });
  const [deleting, setDeleting] = useState<string | null>(null);
  const [runA, setRunA] = useState('');
  const [runB, setRunB] = useState('');
  const [comparing, setComparing] = useState(false);

  const completedRuns = useMemo(() => runs.filter((r) => r.status === 'completed'), [runs]);

  const handleSeed = async () => {
    setSeeding(true);
    try {
      const result = await seedBenchmarks();
      showToast('success', result.created ? 'Seeded initial benchmark set' : 'Benchmarks already present');
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setSeeding(false);
    }
  };

  const handleCreateBenchmark = async () => {
    if (!benchForm.name.trim()) return;
    try {
      await createBenchmark({ name: benchForm.name.trim(), description: benchForm.description.trim() || undefined });
      setBenchForm({ name: '', description: '' });
      setShowNewBenchmark(false);
      showToast('success', 'Benchmark created');
    } catch (err: any) {
      showToast('error', err.message);
    }
  };

  const handleDeleteBenchmark = async (id: string) => {
    setDeleting(id);
    try {
      await deleteBenchmark(id);
      showToast('success', 'Benchmark deleted');
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setDeleting(null);
    }
  };

  const handleRunVsRun = async () => {
    if (!runA || !runB) return;
    setComparing(true);
    try {
      await compareRuns(runA, runB, `Compare "${runs.find((r) => r.id === runA)?.name}" vs "${runs.find((r) => r.id === runB)?.name}"`);
      showToast('success', 'Comparison created');
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setComparing(false);
    }
  };

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'benchmarks', label: `Benchmarks (${benchmarks.length})` },
    { id: 'runs', label: `Runs (${runs.length})` },
    { id: 'baselines', label: `Baselines (${baselines.length})` },
    { id: 'comparisons', label: `Comparisons (${comparisons.length})` },
  ];

  return (
    <Layout>
      <Header />
      <Container>
        <PageHeader
          title="Evaluation"
          description="Benchmark the decision engine: run cases, save baselines, and watch for regressions"
          action={
            benchmarks.length === 0 ? (
              <Button onClick={handleSeed} isLoading={seeding}>
                <FlaskConical size={18} /> Seed benchmarks
              </Button>
            ) : undefined
          }
        />

        <div className="flex gap-1 border-b border-theme-border mb-6 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                tab === t.id ? 'border-sky-500 text-sky-300' : 'border-transparent text-theme-text-secondary hover:text-theme-text-primary'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <Card className="text-center py-12">
            <p className="text-theme-text-secondary">Loading evaluation data…</p>
          </Card>
        ) : tab === 'benchmarks' ? (
          <div className="space-y-4">
            {benchmarks.length === 0 ? (
              <Card className="text-center py-12">
                <FlaskConical className="mx-auto mb-4 text-theme-text-secondary" size={48} />
                <p className="text-theme-text-secondary">No benchmarks yet.</p>
                <p className="text-sm text-theme-text-secondary mt-1">
                  Seed the built-in benchmark set to run the engine against known cases.
                </p>
                <div className="mt-4">
                  <Button onClick={handleSeed} isLoading={seeding}>Seed initial benchmarks</Button>
                </div>
              </Card>
            ) : (
              <>
                {!showNewBenchmark ? (
                  <Button size="sm" variant="secondary" onClick={() => setShowNewBenchmark(true)}>
                    <Plus size={16} /> New benchmark
                  </Button>
                ) : (
                  <Card>
                    <CardBody>
                      <Input
                        value={benchForm.name}
                        onChange={(e) => setBenchForm({ ...benchForm, name: e.target.value })}
                        placeholder="Benchmark name"
                      />
                      <TextArea
                        rows={2}
                        value={benchForm.description}
                        onChange={(e) => setBenchForm({ ...benchForm, description: e.target.value })}
                        placeholder="Description (optional)"
                      />
                    </CardBody>
                    <CardFooter>
                      <Button size="sm" onClick={handleCreateBenchmark} disabled={!benchForm.name.trim()}>Create benchmark</Button>
                      <Button size="sm" variant="ghost" onClick={() => setShowNewBenchmark(false)}>Cancel</Button>
                    </CardFooter>
                  </Card>
                )}
                {benchmarks.map((b) => (
                  <Card key={b.id}>
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-theme-text-primary">{b.name}</h3>
                          <span className="text-xs px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-600">{b.status}</span>
                          <span className="text-xs text-theme-text-secondary">{b.caseCount ?? 0} cases</span>
                        </div>
                        {b.description && <p className="text-sm text-theme-text-secondary mt-1">{b.description}</p>}
                        <p className="text-xs text-theme-text-secondary mt-1">Created {b.createdAt ? formatDate(b.createdAt) : '—'}</p>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => handleDeleteBenchmark(b.id)} isLoading={deleting === b.id}>
                        <Trash2 size={14} />
                      </Button>
                    </div>
                    <BenchmarkCardBody benchmark={b} />
                  </Card>
                ))}
              </>
            )}
          </div>
        ) : tab === 'runs' ? (
          <div className="space-y-4">
            {runs.length === 0 ? (
              <Card className="text-center py-12">
                <FileText className="mx-auto mb-4 text-theme-text-secondary" size={48} />
                <p className="text-theme-text-secondary">No evaluation runs yet.</p>
                <p className="text-sm text-theme-text-secondary mt-1">Run a benchmark from the Benchmarks tab.</p>
              </Card>
            ) : (
              runs.map((r) => <RunRow key={r.id} run={r} />)
            )}
          </div>
        ) : tab === 'baselines' ? (
          <div className="space-y-4">
            {baselines.length === 0 ? (
              <Card className="text-center py-12">
                <Download className="mx-auto mb-4 text-theme-text-secondary" size={48} />
                <p className="text-theme-text-secondary">No baselines yet.</p>
                <p className="text-sm text-theme-text-secondary mt-1">
                  Save a completed run as a baseline from the Runs tab, then compare future runs against it.
                </p>
              </Card>
            ) : (
              baselines.map((b) => <BaselineRow key={b.id} baseline={b} runs={runs} />)
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {completedRuns.length >= 2 && (
              <Card>
                <CardBody>
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="flex-1 min-w-[200px]">
                      <label className="block text-sm font-medium mb-1">Run A</label>
                      <Select value={runA} onChange={(e) => setRunA(e.target.value)}>
                        <option value="">Select run…</option>
                        {completedRuns.map((r) => (
                          <option key={r.id} value={r.id}>{r.name}</option>
                        ))}
                      </Select>
                    </div>
                    <div className="flex-1 min-w-[200px]">
                      <label className="block text-sm font-medium mb-1">Run B</label>
                      <Select value={runB} onChange={(e) => setRunB(e.target.value)}>
                        <option value="">Select run…</option>
                        {completedRuns.map((r) => (
                          <option key={r.id} value={r.id}>{r.name}</option>
                        ))}
                      </Select>
                    </div>
                    <Button onClick={handleRunVsRun} disabled={!runA || !runB || comparing} isLoading={comparing}>
                      <Gauge size={16} /> Compare runs
                    </Button>
                  </div>
                </CardBody>
              </Card>
            )}
            {comparisons.length === 0 ? (
              <Card className="text-center py-12">
                <Gauge className="mx-auto mb-4 text-theme-text-secondary" size={48} />
                <p className="text-theme-text-secondary">No comparisons yet.</p>
                <p className="text-sm text-theme-text-secondary mt-1">
                  Compare two completed runs, or a run against a baseline, to detect regressions.
                </p>
              </Card>
            ) : (
              comparisons.map((c, i) => (
                <Card key={c.id || i}>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-theme-text-primary">{c.name || `${c.type}`}</h3>
                        <span className="text-xs px-2 py-0.5 rounded bg-violet-500/20 text-violet-300 border border-violet-600">
                          {c.type === 'run_vs_run' ? 'Run vs Run' : 'Run vs Baseline'}
                        </span>
                        {c.summary.regressionDetected && (
                          <span className="text-xs px-2 py-0.5 rounded bg-red-500/20 text-red-300 border border-red-600">
                            Regression detected
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-4 mt-2 text-sm">
                        <span className="text-theme-text-secondary">Compared {c.summary.compared} cases</span>
                        <span className="text-green-400">+{c.summary.improvements} improved</span>
                        <span className="text-red-400">{c.summary.regressions} regressed</span>
                        <span className="text-slate-400">{c.summary.unchanged} unchanged</span>
                        {typeof c.summary.aggregateDelta === 'number' && (
                          <span className={c.summary.aggregateDelta >= 0 ? 'text-green-400' : 'text-red-400'}>
                            Δ {c.summary.aggregateDelta > 0 ? '+' : ''}{Math.round(c.summary.aggregateDelta * 100)} pp
                          </span>
                        )}
                      </div>
                      {c.summary.note && <p className="text-xs text-theme-text-secondary mt-1">{c.summary.note}</p>}
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>
        )}
      </Container>
    </Layout>
  );
};

export default EvaluationPage;