import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Play,
  Pause,
  RotateCcw,
  XCircle,
  Gauge,
} from 'lucide-react';
import { Header } from '../components/layout/Header';
import { Layout, Container } from '../components/layout/Layout';
import { Card, CardBody } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Alert } from '../components/ui/Alert';
import { useApp } from '../context/AppContext';
import { formatDate, getStatusColor, getStatusText } from '../utils/helpers';
import { DecisionSnapshot, ResearchTaskSummary, DecisionPlan, PlanningMode, RoutingMode, RoutingPreview, DecisionEvent, MemoryView, MemoryRetrievalResult, OutcomesResponse, DecisionFeedback, DecisionLesson, OutcomeInput, FeedbackInput, LessonInput } from '../types';
import { ExecutiveSummary } from '../components/decision/ExecutiveSummary';
import { ExecutionTimeline } from '../components/decision/ExecutionTimeline';
import { TaskGraph } from '../components/decision/TaskGraph';
import { TaskList } from '../components/decision/TaskList';
import { EvidenceExplorer } from '../components/decision/EvidenceExplorer';
import { ClaimExplorer } from '../components/decision/ClaimExplorer';
import { VerificationPanel } from '../components/decision/VerificationPanel';
import { RedTeamPanel } from '../components/decision/RedTeamPanel';
import { ReconciliationPanel } from '../components/decision/ReconciliationPanel';
import { RoutingPanel } from '../components/decision/RoutingPanel';
import { CostPanel } from '../components/decision/CostPanel';
import { EventStream } from '../components/decision/EventStream';
import { ResearchPanel } from '../components/decision/ResearchPanel';
import { PlanPanel } from '../components/decision/PlanPanel';
import { StartDecisionPanel } from '../components/decision/StartDecisionPanel';
import { MemoryPanel } from '../components/decision/MemoryPanel';
import { OutcomePanel } from '../components/decision/OutcomePanel';
import { FeedbackPanel } from '../components/decision/FeedbackPanel';
import { LessonsPanel } from '../components/decision/LessonsPanel';

const POLL_INTERVAL_MS = 3000;

const ACTIVE_STATUSES = ['investigating', 'reasoning', 'debating', 'verifying', 'awaiting_review'];

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-theme-text-secondary mb-2 mt-8 first:mt-0">
    <span className="h-3 w-1 rounded bg-sky-500" />
    {children}
  </div>
);

const PipelineOverview: React.FC = () => (
  <Card>
    <CardBody>
      <div className="flex items-center justify-center gap-1.5 flex-wrap text-[10px] text-theme-text-secondary">
        {['Research', 'Claims', 'Verify', 'Red Team', 'Reconciliation', 'Final'].map((stage, i, arr) => (
          <React.Fragment key={stage}>
            <span className="px-2 py-1 rounded bg-theme-bg-secondary border border-theme-border text-theme-text-primary">
              {stage}
            </span>
            {i < arr.length - 1 && <span className="text-theme-text-secondary">→</span>}
          </React.Fragment>
        ))}
      </div>
    </CardBody>
  </Card>
);

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
    getDecisionEvents,
    getDecisionMemory,
    getRelatedDecisions,
    getOutcomes,
    createOutcome,
    updateOutcome,
    getFeedback,
    submitFeedback,
    getLessons,
    createLesson,
    updateLesson,
    showToast,
  } = useApp();

  const [snapshot, setSnapshot] = useState<DecisionSnapshot | null>(null);
  const [research, setResearch] = useState<ResearchTaskSummary[]>([]);
  const [plans, setPlans] = useState<DecisionPlan[]>([]);
  const [events, setEvents] = useState<DecisionEvent[]>([]);
  const [memory, setMemory] = useState<MemoryView | null>(null);
  const [outcomes, setOutcomes] = useState<OutcomesResponse>({ outcomes: [], expectedVsActual: { metricComparisons: [], qualityComputed: false } });
  const [feedback, setFeedback] = useState<DecisionFeedback | null>(null);
  const [lessons, setLessons] = useState<DecisionLesson[]>([]);
  const [related, setRelated] = useState<MemoryRetrievalResult | null>(null);
  const [memoryBusy, setMemoryBusy] = useState(false);
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
      const [snap, res, planList, evts, mem, outs, fb, lss, rel] = await Promise.all([
        getDecisionSnapshot(id),
        getDecisionResearch(id),
        getPlans(id),
        getDecisionEvents(id),
        getDecisionMemory(id),
        getOutcomes(id),
        getFeedback(id),
        getLessons(id),
        getRelatedDecisions(id),
      ]);
      setSnapshot(snap);
      setResearch(res);
      setPlans(planList);
      setEvents(evts);
      setMemory(mem);
      setOutcomes(outs);
      setFeedback(fb);
      setLessons(lss);
      setRelated(rel);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load decision');
    } finally {
      setLoading(false);
    }
  }, [id, getDecisionSnapshot, getDecisionResearch, getPlans, getDecisionEvents, getDecisionMemory, getOutcomes, getFeedback, getLessons, getRelatedDecisions]);

  const refreshRelated = useCallback(async () => {
    if (!id) return;
    try {
      const rel = await getRelatedDecisions(id);
      setRelated(rel);
    } catch (err: any) {
      showToast('error', err.message || 'Failed to fetch related decisions');
    }
  }, [id, getRelatedDecisions, showToast]);

  const saveOutcome = useCallback(async (input: OutcomeInput) => {
    if (!id) return;
    setMemoryBusy(true);
    try {
      await createOutcome(id, input);
      const outs = await getOutcomes(id);
      setOutcomes(outs);
      showToast('success', 'Outcome recorded');
    } catch (err: any) {
      showToast('error', err.message || 'Failed to record outcome');
    } finally {
      setMemoryBusy(false);
    }
  }, [id, createOutcome, getOutcomes, showToast]);

  const patchOutcome = useCallback(async (outcomeId: string, patch: Partial<OutcomeInput>) => {
    if (!id) return;
    setMemoryBusy(true);
    try {
      await updateOutcome(id, outcomeId, patch);
      const outs = await getOutcomes(id);
      setOutcomes(outs);
      showToast('success', 'Outcome updated');
    } catch (err: any) {
      showToast('error', err.message || 'Failed to update outcome');
    } finally {
      setMemoryBusy(false);
    }
  }, [id, updateOutcome, getOutcomes, showToast]);

  const saveFeedback = useCallback(async (input: FeedbackInput) => {
    if (!id) return;
    try {
      const fb = await submitFeedback(id, input);
      setFeedback(fb);
      showToast('success', 'Feedback saved');
    } catch (err: any) {
      showToast('error', err.message || 'Failed to save feedback');
      throw err;
    }
  }, [id, submitFeedback, showToast]);

  const saveLesson = useCallback(async (input: LessonInput) => {
    if (!id) return;
    try {
      await createLesson(id, input);
      const lss = await getLessons(id);
      setLessons(lss);
      showToast('success', 'Lesson saved');
    } catch (err: any) {
      showToast('error', err.message || 'Failed to save lesson');
      throw err;
    }
  }, [id, createLesson, getLessons, showToast]);

  const confirmLesson = useCallback(async (lessonId: string, patch: Partial<LessonInput>) => {
    if (!id) return;
    try {
      await updateLesson(id, lessonId, patch);
      const lss = await getLessons(id);
      setLessons(lss);
      showToast('success', 'Lesson confirmed');
    } catch (err: any) {
      showToast('error', err.message || 'Failed to update lesson');
    }
  }, [id, updateLesson, getLessons, showToast]);

  useEffect(() => {
    setLoading(true);
    if (!decision && id) {
      fetchDecision(id).catch(() => {});
    }
    load();
  }, [id]);

  const status = snapshot?.status || decision?.status || 'draft';

  useEffect(() => {
    const isActive = ACTIVE_STATUSES.includes(status);
    if (isActive && !pollRef.current) {
      pollRef.current = setInterval(() => { load(); }, POLL_INTERVAL_MS);
    }
    if (!isActive && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [status, load]);

  const handleStart = async () => {
    if (!id) return;
    try {
      const queries = researchInput
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((q) => ({ query: q }));
      await startDecision(id, queries, planningMode, routingMode, routingModelId || undefined);
      showToast('success', 'Decision execution started');
      setResearchInput('');
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

  const isActive = ACTIVE_STATUSES.includes(status);
  const latestExec = snapshot?.executions?.[0];
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

  const hasIntelligence = Boolean(
    snapshot?.claims?.length ||
    snapshot?.evidence?.length ||
    snapshot?.verifications?.length ||
    snapshot?.redTeamFindings?.length ||
    snapshot?.reconciliation
  );

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
                    {Math.round(snapshot.confidence * 100)}% confidence
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {status === 'draft' && (
              <Button onClick={handleStart} size="sm">
                <Play size={16} /> Start
              </Button>
            )}
            {isActive && (
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

        {/* Draft decisions: start controls */}
        {status === 'draft' && (
          <StartDecisionPanel
            planningMode={planningMode}
            routingMode={routingMode}
            routingModelId={routingModelId}
            models={models}
            plannerRunning={plannerRunning}
            researchInput={researchInput}
            onPlanningModeChange={setPlanningMode}
            onRoutingModeChange={setRoutingMode}
            onRoutingModelChange={setRoutingModelId}
            onResearchInputChange={setResearchInput}
            onPreviewPlan={handleRunPlanner}
            onStart={handleStart}
          />
        )}

        {/* Decision plan + estimated routing */}
        <PlanPanel
          plans={plans}
          routingPreview={routingPreview}
          previewLoading={previewLoading}
          onFetchRoutingPreview={handleRoutingPreview}
        />

        {/* Decision Intelligence */}
        <SectionTitle>Decision Intelligence</SectionTitle>
        <div className="space-y-6">
          {hasIntelligence && <PipelineOverview />}
          {snapshot && <ExecutiveSummary snapshot={snapshot} />}

          {research.length > 0 && <ResearchPanel research={research} loading={false} />}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {snapshot && (
              <EvidenceExplorer
                evidence={snapshot.evidence}
                relationships={snapshot.evidenceRelationships}
                loading={false}
              />
            )}
            {snapshot && (
              <ClaimExplorer
                claims={snapshot.claims}
                relationships={snapshot.evidenceRelationships}
                verifications={snapshot.verifications}
                loading={false}
              />
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {snapshot && (
              <VerificationPanel verifications={snapshot.verifications} loading={false} />
            )}
            {snapshot && (
              <RedTeamPanel findings={snapshot.redTeamFindings} loading={false} />
            )}
          </div>

          {snapshot && <ReconciliationPanel reconciliation={snapshot.reconciliation} loading={false} />}
        </div>

        {/* Execution */}
        <SectionTitle>Execution</SectionTitle>
        <div className="space-y-6">
          {snapshot?.tasks && snapshot.tasks.length > 0 && <TaskGraph tasks={snapshot.tasks} />}
          {snapshot?.tasks && <TaskList tasks={snapshot.tasks} />}
          {snapshot?.tasks && <RoutingPanel tasks={snapshot.tasks} loading={false} />}
        </div>

        {/* Cost & Performance */}
        <SectionTitle>Cost &amp; Performance</SectionTitle>
        <CostPanel executions={snapshot?.executions || []} loading={false} />

        {/* Memory & Outcomes */}
        <SectionTitle>Memory &amp; Outcomes</SectionTitle>
        <div className="space-y-6">
          <MemoryPanel
            memory={memory?.memory ?? null}
            quality={memory?.quality ?? null}
            related={related}
            relatedLoading={memoryBusy && !related}
            onRefreshRelated={refreshRelated}
          />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <OutcomePanel
              outcomes={outcomes.outcomes}
              expectedVsActual={outcomes.expectedVsActual}
              onCreateOutcome={saveOutcome}
              onUpdateOutcome={patchOutcome}
              busy={memoryBusy}
            />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <FeedbackPanel feedback={feedback} onSubmit={saveFeedback} />
            <LessonsPanel
              lessons={lessons}
              onCreateLesson={saveLesson}
              onUpdateLesson={confirmLesson}
            />
          </div>
        </div>

        {/* Observability */}
        <SectionTitle>Observability</SectionTitle>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ExecutionTimeline events={events} loading={loading && !snapshot} />
          <EventStream events={events} loading={loading && !snapshot} />
        </div>
      </Container>
    </Layout>
  );
};

export default DecisionDetailPage;