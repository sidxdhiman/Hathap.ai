import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Play,
  Pause,
  RotateCcw,
  XCircle,
  FileText,
  ExternalLink,
  Gauge,
  ShieldCheck,
  ShieldAlert,
  GitMerge,
  Workflow,
  Route,
} from 'lucide-react';
import { Header } from '../components/layout/Header';
import { Layout, Container } from '../components/layout/Layout';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Alert } from '../components/ui/Alert';
import { useApp } from '../context/AppContext';
import {
  formatDate,
  formatDateTime,
  getStatusColor,
  getStatusText,
} from '../utils/helpers';
import { DecisionSnapshot, ResearchTaskSummary, ResearchQueryInput, DecisionPlan, PlanningMode, RoutingMode, RoutingPreview, TaskRouting } from '../types';

const POLL_INTERVAL_MS = 3000;

export const DecisionDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    decisions,
    models,
    fetchDecision,
    startDecision,
    pauseDecision,
    resumeDecision,
    cancelDecision,
    getDecisionSnapshot,
    getDecisionResearch,
    getPlans,
    runPlan,
    getRoutingPreview,
    showToast,
  } = useApp();

  const [snapshot, setSnapshot] = useState<DecisionSnapshot | null>(null);
  const [research, setResearch] = useState<ResearchTaskSummary[]>([]);
  const [plans, setPlans] = useState<DecisionPlan[]>([]);
  const [planningMode, setPlanningMode] = useState<PlanningMode>('fixed');
  const [routingMode, setRoutingMode] = useState<RoutingMode>('auto');
  const [routingModelId, setRoutingModelId] = useState<string>('');
  const [plannerRunning, setPlannerRunning] = useState(false);
  const [routingPreview, setRoutingPreview] = useState<RoutingPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [researchInput, setResearchInput] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const decision = decisions.find((d) => d.id === id);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [snap, res, planList] = await Promise.all([
        getDecisionSnapshot(id),
        getDecisionResearch(id),
        getPlans(id),
      ]);
      setSnapshot(snap);
      setResearch(res);
      setPlans(planList);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load decision');
    } finally {
      setLoading(false);
    }
  }, [id, getDecisionSnapshot, getDecisionResearch, getPlans]);

  useEffect(() => {
    setLoading(true);
    if (!decision && id) {
      fetchDecision(id).catch(() => {});
    }
    load();
  }, [id]);

  useEffect(() => {
    const isActive = snapshot?.status === 'debating';
    if (isActive && !pollRef.current) {
      pollRef.current = setInterval(() => { load(); }, POLL_INTERVAL_MS);
    }
    if (!isActive && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [snapshot?.status]);

  const handleStart = async () => {
    if (!id) return;
    try {
      const queries: ResearchQueryInput[] = researchInput
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((q) => ({ query: q }));
      await startDecision(id, queries, planningMode, routingMode, routingModelId || undefined);
      showToast('success', 'Decision execution started');
      await load();
    } catch (err: any) {
      showToast('error', err.message || 'Failed to start decision');
    }
  };

  const handleRunPlanner = async () => {
    if (!id) return;
    setPlannerRunning(true);
    try {
      const res = await runPlan(id);
      showToast('success', `Planner ran (${res.source || 'plan'} generated)`);
      await load();
    } catch (err: any) {
      showToast('error', err.message || 'Failed to run planner');
    } finally {
      setPlannerRunning(false);
    }
  };

  const handleRoutingPreview = async () => {
    const plan = plans[0];
    if (!id || !plan) return;
    setPreviewLoading(true);
    try {
      const preview = await getRoutingPreview(id, plan.id);
      setRoutingPreview(preview);
    } catch (err: any) {
      showToast('error', err.message || 'Failed to fetch routing preview');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handlePause = async () => {
    if (!id) return;
    await pauseDecision(id);
    showToast('info', 'Decision paused');
    await load();
  };

  const handleResume = async () => {
    if (!id) return;
    await resumeDecision(id);
    showToast('info', 'Decision resumed');
    await load();
  };

  const handleCancel = async () => {
    if (!id) return;
    await cancelDecision(id);
    showToast('warning', 'Decision cancelled');
    await load();
  };

  if (!id) return null;

  const status = snapshot?.status || decision?.status || 'draft';
  const isActive = status === 'debating';
  const latestExec = snapshot?.executions?.[0];
  const latestPlan = plans[0];
  const progress = snapshot?.progress ?? {
    progress: latestExec?.progress ?? 0,
    currentPhase: latestExec?.currentPhase,
    totalTasks: latestExec?.totalTasks ?? 0,
    completedTasks: latestExec?.completedTasks ?? 0,
    runningTasks: latestExec?.runningTasks ?? 0,
    pendingTasks: latestExec?.pendingTasks ?? 0,
  };

  if (loading && !snapshot) {
    return (
      <Layout>
        <Header />
        <Container>
          <p className="text-theme-text-secondary py-12 text-center">Loading decision…</p>
        </Container>
      </Layout>
    );
  }

  if (error && !snapshot) {
    return (
      <Layout>
        <Header />
        <Container>
          <Alert variant="error">{error}</Alert>
          <Button onClick={() => navigate('/decisions')} className="mt-4">
            <ArrowLeft size={16} /> Back to Decisions
          </Button>
        </Container>
      </Layout>
    );
  }

  const evidenceCount = snapshot?.evidence?.length || 0;
  const claimCount = snapshot?.claims?.length || 0;
  const researchTasksCount = research.length;

  return (
    <Layout>
      <Header />
      <Container>
        {/* Header */}
        <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
          <div className="flex items-start gap-3">
            <button onClick={() => navigate('/decisions')} className="p-2 hover:bg-theme-bg-secondary transition-colors text-theme-text-secondary">
              <ArrowLeft size={20} />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-theme-text-primary">
                {decision?.title || 'Decision'}
              </h1>
              <p className="text-theme-text-secondary text-sm mt-1 max-w-2xl">
                {decision?.objective}
              </p>
              <div className="flex items-center gap-4 mt-2 text-xs text-theme-text-secondary flex-wrap">
                <span className={`px-2 py-0.5 rounded ${getStatusColor(status)} ${getStatusText(status)}`}>
                  {status}
                </span>
                <span>Created {decision ? formatDate(decision.createdAt) : '—'}</span>
                {typeof snapshot?.confidence === 'number' && (
                  <span className="flex items-center gap-1">
                    <Gauge size={12} />
                    {Math.round(snapshot.confidence * 100)}%
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {(status === 'draft') && (
              <Button onClick={handleStart} size="sm">
                <Play size={16} /> Start
              </Button>
            )}
            {(status === 'debating') && (
              <>
                <Button onClick={handlePause} size="sm" variant="secondary">
                  <Pause size={16} /> Pause
                </Button>
                <Button onClick={handleCancel} size="sm" variant="danger">
                  <XCircle size={16} /> Cancel
                </Button>
              </>
            )}
            {status === 'paused' && (
              <>
                <Button onClick={handleResume} size="sm">
                  <RotateCcw size={16} /> Resume
                </Button>
                <Button onClick={handleCancel} size="sm" variant="danger">
                  <XCircle size={16} /> Cancel
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Progress bar */}
        {isActive && progress && (
          <Card className="mb-6">
            <CardBody className="p-4">
              <div className="flex items-center justify-between text-xs text-theme-text-secondary mb-2">
                <span className="font-medium">Progress — {progress.currentPhase || status}</span>
                <span>{progress.progress || 0}%</span>
              </div>
              <div className="w-full bg-theme-bg-tertiary h-2 rounded">
                <div
                  className="bg-sky-500 h-2 rounded transition-all duration-500"
                  style={{ width: `${Math.min(progress.progress || 0, 100)}%` }}
                />
              </div>
              <div className="grid grid-cols-4 gap-4 mt-3 text-xs">
                <div className="text-theme-text-secondary">Completed <span className="text-theme-text-primary ml-1">{progress.completedTasks || 0}</span></div>
                <div className="text-theme-text-secondary">Running <span className="text-theme-text-primary ml-1">{progress.runningTasks || 0}</span></div>
                <div className="text-theme-text-secondary">Pending <span className="text-theme-text-primary ml-1">{progress.pendingTasks || 0}</span></div>
                <div className="text-theme-text-secondary">Total <span className="text-theme-text-primary ml-1">{progress.totalTasks || 0}</span></div>
              </div>
            </CardBody>
          </Card>
        )}

        {/* Start with research queries */}
        {status === 'draft' && (
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
                onChange={(e) => setResearchInput(e.target.value)}
                placeholder={"example:\nmarket size for decentralized AI\nregulatory landscape 2025"}
                className="w-full h-28 p-3 rounded bg-theme-bg-secondary border border-theme-border text-theme-text-primary text-sm placeholder-theme-text-secondary resize-none focus:outline-sky-500"
              />
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-theme-text-secondary">Planning mode:</span>
                  <button
                    type="button"
                    onClick={() => setPlanningMode('fixed')}
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
                    onClick={() => setPlanningMode('intelligent')}
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
                <Button onClick={handleRunPlanner} size="sm" variant="secondary" disabled={plannerRunning}>
                  <Workflow size={14} /> {plannerRunning ? 'Planning…' : 'Preview plan'}
                </Button>
              </div>

              <div className="flex items-center gap-3 flex-wrap border-t border-theme-border pt-3">
                <span className="text-xs text-theme-text-secondary">Routing:</span>
                <button
                  type="button"
                  onClick={() => setRoutingMode('auto')}
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
                  onClick={() => setRoutingMode('manual')}
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
                    onChange={(e) => setRoutingModelId(e.target.value)}
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
            </CardBody>
          </Card>
        )}

        {/* Phase 5: Plan (intelligent decision planner) */}
        {plans.length > 0 && (
          <Card className="mb-6">
            <CardHeader>
              <span className="flex items-center gap-2 text-sm font-medium text-theme-text-primary">
                <Workflow size={16} /> Decision Plan
                {latestPlan && (
                  <span className={`text-[10px] px-2 py-0.5 rounded ${getStatusColor(latestPlan.status)} ${getStatusText(latestPlan.status)}`}>
                    {latestPlan.status}
                  </span>
                )}
              </span>
            </CardHeader>
            <CardBody className="space-y-4">
              {latestPlan ? (
                <>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-theme-text-secondary">
                    <span>
                      source: <span className="font-mono text-theme-text-primary">{latestPlan.source}</span>
                    </span>
                    {latestPlan.plannerModel && <span>planner: {latestPlan.plannerModel}</span>}
                    <span>mode: {latestPlan.planningMode}</span>
                    <span>plan v{latestPlan.planVersion}</span>
                    <span>{formatDateTime(latestPlan.createdAt)}</span>
                    {latestPlan.estimates && (
                      <span>
                        est. {latestPlan.estimates.estimatedTasks} tasks ·{' '}
                        {latestPlan.estimates.estimatedResearchTasks} research ·{' '}
                        {latestPlan.estimates.estimatedLLMTasks} llm
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {latestPlan.termination.requiresVerification ? (
                      <span className="text-[11px] px-2 py-0.5 rounded bg-green-500/20 text-green-400">verification on</span>
                    ) : (
                      <span className="text-[11px] px-2 py-0.5 rounded bg-theme-bg-tertiary text-theme-text-secondary">verification off</span>
                    )}
                    {latestPlan.termination.requiresRedTeam ? (
                      <span className="text-[11px] px-2 py-0.5 rounded bg-green-500/20 text-green-400">red team on</span>
                    ) : (
                      <span className="text-[11px] px-2 py-0.5 rounded bg-theme-bg-tertiary text-theme-text-secondary">red team off</span>
                    )}
                    {latestPlan.termination.requiresReconciliation ? (
                      <span className="text-[11px] px-2 py-0.5 rounded bg-green-500/20 text-green-400">reconciliation on</span>
                    ) : (
                      <span className="text-[11px] px-2 py-0.5 rounded bg-theme-bg-tertiary text-theme-text-secondary">reconciliation off</span>
                    )}
                  </div>

                  {latestPlan.rationale?.summary && (
                    <p className="text-sm text-theme-text-secondary">{latestPlan.rationale.summary}</p>
                  )}

                  {latestPlan.tasks.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-[11px] uppercase tracking-wide text-theme-text-secondary">
                        Task graph ({latestPlan.tasks.length})
                      </div>
                      {latestPlan.tasks.map((t, i) => (
                        <div key={`${t.tempId}-${i}`} className="p-3 rounded bg-theme-bg-secondary border border-theme-border">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${
                              t.type === 'research' ? 'bg-sky-500/20 text-sky-300' :
                              t.type === 'debate' ? 'bg-violet-500/20 text-violet-300' :
                              t.type === 'verify_claim' ? 'bg-green-500/20 text-green-300' :
                              t.type === 'red_team' ? 'bg-red-500/20 text-red-300' :
                              'bg-amber-500/20 text-amber-300'
                            }`}>
                              {t.type}
                            </span>
                            <span className="font-mono text-[10px] text-theme-text-secondary">{t.tempId}</span>
                            {typeof t.priority === 'number' && (
                              <span className="text-[10px] text-theme-text-secondary">priority {t.priority}</span>
                            )}
                          </div>
                          <p className="text-xs text-theme-text-primary mt-1">{t.purpose}</p>
                          {t.dependsOn.length > 0 && (
                            <div className="text-[10px] text-theme-text-secondary mt-1">
                              after: <span className="font-mono">{t.dependsOn.join(', ')}</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {latestPlan.rationale && (latestPlan.rationale.research || latestPlan.rationale.verification) && (
                    <div className="text-[11px] text-theme-text-secondary space-y-1">
                      {latestPlan.rationale.research && <div>Research: {latestPlan.rationale.research}</div>}
                      {latestPlan.rationale.debate && <div>Debate: {latestPlan.rationale.debate}</div>}
                      {latestPlan.rationale.verification && <div>Verification: {latestPlan.rationale.verification}</div>}
                      {latestPlan.rationale.redTeam && <div>Red team: {latestPlan.rationale.redTeam}</div>}
                    </div>
                  )}

                  {(latestPlan.validation?.errors?.length || 0) > 0 && (
                    <div className="text-xs text-red-400 space-y-1">
                      {latestPlan.validation!.errors!.slice(0, 5).map((e, i) => <div key={i}>• {e}</div>)}
                    </div>
                  )}

                  {/* Phase 6: routing preview (estimated) */}
                  <div className="flex items-center gap-3 border-t border-theme-border pt-3">
                    <Button onClick={handleRoutingPreview} size="sm" variant="secondary" disabled={previewLoading}>
                      <Route size={14} /> {previewLoading ? 'Computing…' : (routingPreview ? 'Refresh routing preview' : 'Routing preview (estimated)')}
                    </Button>
                    {routingPreview && (
                      <span className="text-[11px] text-theme-text-secondary">
                        policy {routingPreview.policyVersion} · <span className="text-amber-300/90">estimated — not yet persisted</span>
                      </span>
                    )}
                  </div>

                  {routingPreview && (
                    <div className="space-y-2">
                      <div className="text-[11px] uppercase tracking-wide text-theme-text-secondary">
                        Estimated / planned routing ({routingPreview.tasks.length})
                      </div>
                      {routingPreview.tasks.map((t, i) => (
                        <div key={`${t.tempId || t.type}-${i}`} className="p-3 rounded bg-theme-bg-secondary border border-theme-border">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${
                              t.type === 'research' ? 'bg-sky-500/20 text-sky-300' :
                              t.type === 'debate' ? 'bg-violet-500/20 text-violet-300' :
                              t.type === 'verify_claim' ? 'bg-green-500/20 text-green-300' :
                              t.type === 'red_team' ? 'bg-red-500/20 text-red-300' :
                              'bg-amber-500/20 text-amber-300'
                            }`}>
                              {t.type}
                            </span>
                            {t.requirements && t.requirements.length > 0 && (
                              <span className="text-[10px] text-theme-text-secondary">
                                requires: <span className="font-mono">{t.requirements.join(', ')}</span>
                              </span>
                            )}
                            {t.status === 'selected' ? (
                              <span className="text-[10px] px-2 py-0.5 rounded bg-green-500/20 text-green-400">
                                {t.agent?.name || '—'} → {t.model?.displayName || t.model?.modelName}
                              </span>
                            ) : (
                              <span className="text-[10px] px-2 py-0.5 rounded bg-theme-bg-tertiary text-theme-text-secondary">
                                {t.status === 'skipped' ? 'skipped' : 'failed'}
                              </span>
                            )}
                            {typeof t.score === 'number' && (
                              <span className="text-[10px] font-mono text-theme-text-secondary">
                                score {t.score.toFixed(4)}
                              </span>
                            )}
                            {typeof t.estimatedCost === 'number' && t.pricingKnown && (
                              <span className="text-[10px] text-theme-text-secondary">
                                est. cost ${t.estimatedCost.toFixed(6)}
                              </span>
                            )}
                          </div>
                          {t.reason && <p className="text-[11px] text-amber-300/90 mt-1">{t.reason}</p>}
                          {t.status !== 'selected' && !t.reason && (
                            <p className="text-[11px] text-theme-text-secondary mt-1">
                              Estimated routing is best-effort; attribution appears after execution.
                            </p>
                          )}
                          {t.reasons && t.reasons.length > 0 && (
                            <div className="text-[10px] text-theme-text-secondary mt-1 space-y-0.5">
                              {t.reasons.map((r, j) => <div key={j}>• {r}</div>)}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-xs text-theme-text-secondary">No plan has been generated yet.</p>
              )}
            </CardBody>
          </Card>
        )}

        {/* Phase 6: actual routing per task */}
        {(() => {
          const routedTasks = (snapshot?.tasks || []).filter((t) => {
            const routing = (t.metadata?.routing as TaskRouting | undefined);
            return routing?.selection?.status === 'selected';
          });
          if (routedTasks.length === 0) return null;
          return (
            <Card className="mb-6">
              <CardHeader>
                <span className="flex items-center gap-2 text-sm font-medium text-theme-text-primary">
                  <Route size={16} /> Model &amp; Agent Routing ({routedTasks.length})
                  <span className="text-[10px] px-2 py-0.5 rounded bg-theme-bg-tertiary text-theme-text-secondary">persisted</span>
                </span>
              </CardHeader>
              <CardBody className="space-y-3">
                {routedTasks.map((t) => {
                  const routing = (t.metadata?.routing as TaskRouting | undefined);
                  const sel = routing?.selection;
                  if (!sel) return null;
                  return (
                    <div key={t.id} className="p-3 rounded bg-theme-bg-secondary border border-theme-border">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${
                          t.type === 'research' ? 'bg-sky-500/20 text-sky-300' :
                          t.type === 'debate' ? 'bg-violet-500/20 text-violet-300' :
                          t.type === 'verify_claim' ? 'bg-green-500/20 text-green-300' :
                          t.type === 'red_team' ? 'bg-red-500/20 text-red-300' :
                          'bg-amber-500/20 text-amber-300'
                        }`}>{t.type}</span>
                        <span className="text-xs text-theme-text-primary">
                          {sel.agent?.name || <span className="text-theme-text-secondary">—</span>}
                          <span className="text-theme-text-secondary mx-1">→</span>
                          {sel.model.displayName || sel.model.modelName}
                          <span className="text-[10px] text-theme-text-secondary ml-1">({sel.model.provider})</span>
                        </span>
                        <span className="text-[10px] font-mono text-theme-text-secondary">
                          score {sel.score.total.toFixed(4)}
                        </span>
                        {sel.capabilityGateRelaxed && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">gate relaxed</span>
                        )}
                        {sel.fallbackUsed && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-300">fallback</span>
                        )}
                        <span className={`text-[10px] px-2 py-0.5 rounded ${getStatusColor(t.status)} ${getStatusText(t.status)}`}>
                          {t.status}
                        </span>
                      </div>
                      <div className="text-[10px] text-theme-text-secondary mt-1 flex items-center gap-3 flex-wrap">
                        <span>mode {routing?.mode || 'auto'}</span>
                        <span>policy {sel.policyVersion}</span>
                        <span>{sel.candidateCount} candidates</span>
                        <span>{sel.estimate.pricingKnown ? `est. cost $${sel.estimate.estimatedCost.toFixed(6)}` : 'cost unknown'}</span>
                      </div>
                      {sel.reasons.length > 0 && (
                        <div className="text-[10px] text-theme-text-secondary mt-1 space-y-0.5">
                          {sel.reasons.map((r, i) => <div key={i}>• {r}</div>)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </CardBody>
            </Card>
          );
        })()}

        {/* Research tasks */}
        {researchTasksCount > 0 && (
          <Card className="mb-6">
            <CardHeader>
              <span className="text-sm font-medium text-theme-text-primary">Research Tasks ({researchTasksCount})</span>
            </CardHeader>
            <CardBody className="space-y-4">
              {research.map((rt) => (
                <div key={rt.taskId} className="p-3 rounded bg-theme-bg-secondary border border-theme-border">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <span className="text-xs font-mono text-theme-text-secondary">query:</span>{' '}
                      <span className="text-sm text-theme-text-primary">{String(rt.input?.query || '—')}</span>
                      {rt.input?.purpose && rt.input.purpose !== 'background' && (
                        <span className="text-xs text-theme-text-secondary ml-2">({String(rt.input.purpose)})</span>
                      )}
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded ${getStatusColor(rt.status)} ${getStatusText(rt.status)}`}>
                      {rt.status}
                    </span>
                  </div>
                  {rt.error && (
                    <p className="text-xs text-red-400 mt-2 break-all">{String(rt.error.message || rt.error)}</p>
                  )}
                  {rt.evidence.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {rt.evidence.map((ev) => (
                        <div key={ev.id} className="flex items-start gap-2 text-xs">
                          <FileText size={14} className="shrink-0 mt-0.5 text-theme-text-secondary" />
                          <div className="min-w-0">
                            <div className="text-theme-text-primary truncate">
                              {ev.title}
                              {ev.sourceUrl && (
                                <a
                                  href={ev.sourceUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex ml-1 text-sky-400 hover:text-sky-300"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <ExternalLink size={11} />
                                </a>
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
        )}

        {/* Evidence list */}
        {evidenceCount > 0 && (
          <Card className="mb-6">
            <CardHeader>
              <span className="text-sm font-medium text-theme-text-primary">Evidence ({evidenceCount})</span>
            </CardHeader>
            <CardBody className="space-y-4">
              {snapshot!.evidence.slice(0, 50).map((ev) => (
                <div key={ev.id} className="p-3 rounded bg-theme-bg-secondary border border-theme-border">
                  <div className="flex items-start gap-2">
                    <FileText size={16} className="shrink-0 mt-0.5 text-theme-text-secondary" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm font-medium text-theme-text-primary truncate">{ev.title}</h4>
                        {ev.provenanceKind && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-theme-bg-tertiary text-theme-text-secondary">
                            {ev.provenanceKind}
                          </span>
                        )}
                        {ev.sourceReliability && ev.sourceReliability !== 'medium' && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${ev.sourceReliability === 'high' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                            {ev.sourceReliability}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-theme-text-secondary mt-1 flex items-center gap-2 flex-wrap">
                        {ev.sourceName && <span>{ev.sourceName}</span>}
                        {ev.sourceUrl && (
                          <a
                            href={ev.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sky-400 hover:text-sky-300 inline-flex items-center gap-0.5"
                          >
                            {new URL(ev.sourceUrl).hostname}
                            <ExternalLink size={10} />
                          </a>
                        )}
                        <span>·</span>
                        <span>{formatDate(ev.retrievedAt)}</span>
                        {typeof ev.relevanceScore === 'number' && (
                          <>
                            <span>·</span>
                            <span>{Math.round(ev.relevanceScore * 100)}% relevance</span>
                          </>
                        )}
                      </div>
                      {(ev.snippet || ev.content) && (
                        <p className="text-xs text-theme-text-secondary mt-2 line-clamp-3">
                          {ev.snippet || ev.content}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </CardBody>
          </Card>
        )}

        {/* Claims list */}
        {claimCount > 0 && (
          <Card className="mb-6">
            <CardHeader>
              <span className="text-sm font-medium text-theme-text-primary">Claims ({claimCount})</span>
            </CardHeader>
            <CardBody className="space-y-3">
              {snapshot!.claims.slice(0, 50).map((cl) => (
                <div key={cl.id} className="p-3 rounded bg-theme-bg-secondary border border-theme-border">
                  <div className="flex items-start gap-2 text-sm">
                    <span className={`shrink-0 px-2 py-0.5 rounded text-[11px] font-medium ${
                      cl.type === 'fact' ? 'bg-sky-500/20 text-sky-300' :
                      cl.type === 'risk' ? 'bg-red-500/20 text-red-400' :
                      cl.type === 'recommendation' ? 'bg-green-500/20 text-green-400' :
                      'bg-theme-bg-tertiary text-theme-text-secondary'
                    }`}>
                      {cl.type}
                    </span>
                    <p className="text-theme-text-primary leading-snug">{cl.text}</p>
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-[11px] text-theme-text-secondary flex-wrap">
                    <span className={`px-1.5 py-0.5 rounded ${getStatusColor(cl.status)} ${getStatusText(cl.status)}`}>
                      {cl.status}
                    </span>
                    {cl.provenanceKind && <span>provenance: {cl.provenanceKind}</span>}
                    {(cl.supportingEvidenceIds || []).length > 0 && (
                      <span>supports {cl.supportingEvidenceIds!.length} evidence</span>
                    )}
                    {cl.attribution?.sourceName && (
                      <span className="truncate max-w-[200px]">source: {cl.attribution.sourceName}</span>
                    )}
                  </div>
                </div>
              ))}
            </CardBody>
          </Card>
        )}

        {/* Phase 4: Reconciliation */}
        {snapshot?.reconciliation && (
          <Card className="mb-6">
            <CardHeader>
              <span className="flex items-center gap-2 text-sm font-medium text-theme-text-primary">
                <GitMerge size={16} /> Reconciliation
              </span>
            </CardHeader>
            <CardBody className="space-y-4">
              <div>
                <div className="text-[11px] uppercase tracking-wide text-theme-text-secondary mb-1">Final recommendation</div>
                <p className="text-theme-text-primary text-sm">{snapshot.reconciliation.recommendation}</p>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div className="p-3 rounded bg-green-500/10 border border-green-500/20">
                  <div className="text-lg font-semibold text-green-400">{snapshot.reconciliation.survivingClaimIds.length}</div>
                  <div className="text-[11px] text-theme-text-secondary">surviving</div>
                </div>
                <div className="p-3 rounded bg-red-500/10 border border-red-500/20">
                  <div className="text-lg font-semibold text-red-400">{snapshot.reconciliation.rejectedClaimIds.length}</div>
                  <div className="text-[11px] text-theme-text-secondary">rejected</div>
                </div>
                <div className="p-3 rounded bg-amber-500/10 border border-amber-500/20">
                  <div className="text-lg font-semibold text-amber-400">{snapshot.reconciliation.uncertainClaimIds.length}</div>
                  <div className="text-[11px] text-theme-text-secondary">uncertain</div>
                </div>
                <div className="p-3 rounded bg-theme-bg-tertiary border border-theme-border">
                  <div className="text-lg font-semibold text-theme-text-primary">{snapshot.reconciliation.redTeamFindingIds.length}</div>
                  <div className="text-[11px] text-theme-text-secondary">red-team findings</div>
                </div>
              </div>
              {snapshot.reconciliation.needsMoreResearch && (
                <div className="flex items-start gap-2 p-3 rounded bg-amber-500/10 border border-amber-500/20 text-sm text-amber-300">
                  <ShieldAlert size={16} className="mt-0.5 shrink-0" />
                  <div>
                    <div className="font-medium">Needs more research</div>
                    {(snapshot.reconciliation.researchQuestions || []).map((q, i) => (
                      <div key={i} className="text-xs text-amber-200/90 mt-1">• {q}</div>
                    ))}
                  </div>
                </div>
              )}
              <p className="text-xs text-theme-text-secondary">{snapshot.reconciliation.rationale}</p>
            </CardBody>
          </Card>
        )}

        {/* Phase 4: Verification */}
        {(snapshot?.verifications?.length || 0) > 0 && (
          <Card className="mb-6">
            <CardHeader>
              <span className="flex items-center gap-2 text-sm font-medium text-theme-text-primary">
                <ShieldCheck size={16} /> Claim Verification ({snapshot!.verifications!.length})
              </span>
            </CardHeader>
            <CardBody className="space-y-2">
              {snapshot!.verifications!.map((v) => (
                <div key={v.id} className="p-3 rounded bg-theme-bg-secondary border border-theme-border">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                        v.status === 'supported' ? 'bg-green-500/20 text-green-300' :
                        v.status === 'contradicted' ? 'bg-red-500/20 text-red-400' :
                        v.status === 'unsupported' ? 'bg-amber-500/20 text-amber-300' :
                        'bg-theme-bg-tertiary text-theme-text-secondary'
                      }`}>{v.status}</span>
                      <span className="text-[11px] text-theme-text-secondary">mode: {v.mode}</span>
                      {typeof v.confidence === 'number' && (
                        <span className="text-[11px] text-theme-text-secondary">confidence: {Math.round(v.confidence * 100)}%</span>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-theme-text-primary mt-1">{v.claimStatement}</p>
                  {(v.supportingEvidenceIds.length > 0 || v.contradictingEvidenceIds.length > 0) && (
                    <div className="flex gap-4 mt-1 text-[11px] text-theme-text-secondary">
                      {v.supportingEvidenceIds.length > 0 && <span>supports: {v.supportingEvidenceIds.length}</span>}
                      {v.contradictingEvidenceIds.length > 0 && <span>contradicts: {v.contradictingEvidenceIds.length}</span>}
                      {v.relatedEvidenceIds.length > 0 && <span>related: {v.relatedEvidenceIds.length}</span>}
                    </div>
                  )}
                  <p className="text-xs text-theme-text-secondary mt-1">{v.rationale}</p>
                </div>
              ))}
            </CardBody>
          </Card>
        )}

        {/* Phase 4: Red team */}
        {(snapshot?.redTeamFindings?.length || 0) > 0 && (
          <Card className="mb-6">
            <CardHeader>
              <span className="flex items-center gap-2 text-sm font-medium text-theme-text-primary">
                <ShieldAlert size={16} /> Red Team Findings ({snapshot!.redTeamFindings!.length})
              </span>
            </CardHeader>
            <CardBody className="space-y-2">
              {snapshot!.redTeamFindings!.map((f) => (
                <div key={f.id} className="p-3 rounded bg-theme-bg-secondary border border-theme-border">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                      f.severity === 'critical' || f.severity === 'high' ? 'bg-red-500/20 text-red-400' :
                      f.severity === 'medium' ? 'bg-amber-500/20 text-amber-300' :
                      'bg-theme-bg-tertiary text-theme-text-secondary'
                    }`}>{f.severity}</span>
                    <span className="text-[11px] text-theme-text-secondary">{f.type}</span>
                  </div>
                  <p className="text-sm text-theme-text-primary mt-1">{f.description}</p>
                  {f.suggestedAction && (
                    <p className="text-xs text-theme-text-secondary mt-1">Suggested: {f.suggestedAction}</p>
                  )}
                </div>
              ))}
            </CardBody>
          </Card>
        )}
      </Container>
    </Layout>
  );
};