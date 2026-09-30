import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { Model, AgentTemplate, Courtroom, Decision, ResearchTaskSummary, ResearchStatus, WebGroundedDemoRequest, WebGroundedDemoResult, VerificationResult, RedTeamFinding, ReconciliationResult, EvidenceRelationship, DecisionPlan, PlanningMode, RoutingMode, RoutingPreview, DecisionEvent, MemoryView, MemoryRetrievalResult, OutcomesResponse, DecisionOutcome, OutcomeInput, DecisionFeedback, FeedbackInput, DecisionLesson, LessonInput } from '../types';
import { apiFetch, apiJson, apiText, readJson, toApiError } from '../api/client';

export type Toast = {
  id: string;
  variant: 'success' | 'error' | 'info' | 'warning';
  message: string;
};

interface AppContextType {
  models: Model[];
  agentTemplates: AgentTemplate[];
  courtrooms: Courtroom[];
  decisions: Decision[];
  isLoading: boolean;
  needsOnboarding: boolean;
  toasts: Toast[];
  showToast: (variant: Toast['variant'], message: string) => void;
  dismissToast: (id: string) => void;
  addModel: (model: Omit<Model, 'id' | 'status'> & { apiKey: string }) => Promise<Model>;
  updateModel: (id: string, model: Partial<Model> & { apiKey?: string }) => Promise<void>;
  deleteModel: (id: string) => void;
  testModel: (id: string) => Promise<{ success: boolean; error?: string }>;
  addAgentTemplate: (agent: AgentTemplate) => void;
  updateAgentTemplate: (id: string, agent: Partial<AgentTemplate>) => void;
  deleteAgentTemplate: (id: string) => void;
  addCourtroom: (courtroom: Omit<Courtroom, 'id'>) => Promise<Courtroom>;
  updateCourtroom: (id: string, courtroom: Partial<Courtroom>) => void;
  deleteCourtroom: (id: string) => Promise<void>;
  refreshData: () => Promise<void>;
  refreshDecisions: () => Promise<void>;
  getDecision: (id: string) => Decision | undefined;
  fetchDecision: (id: string) => Promise<Decision>;
  createDecision: (input: { title: string; objective: string; context?: string; configuration?: any; participants?: any[] }) => Promise<Decision>;
  startDecision: (id: string, researchQueries?: any[], planningMode?: PlanningMode, routingMode?: RoutingMode, routingModelId?: string) => Promise<any>;
  pauseDecision: (id: string) => Promise<void>;
  resumeDecision: (id: string) => Promise<void>;
  cancelDecision: (id: string) => Promise<void>;
  getDecisionSnapshot: (id: string) => Promise<any>;
  getDecisionResearch: (id: string) => Promise<ResearchTaskSummary[]>;
  getResearchStatus: () => Promise<ResearchStatus>;
  runWebGroundedDemo: (input: WebGroundedDemoRequest) => Promise<WebGroundedDemoResult>;
  getVerifications: (id: string) => Promise<VerificationResult[]>;
  getRedTeamFindings: (id: string) => Promise<RedTeamFinding[]>;
  getReconciliation: (id: string) => Promise<ReconciliationResult | null>;
  getEvidenceGraph: (id: string) => Promise<EvidenceRelationship[]>;
  getPlans: (id: string) => Promise<DecisionPlan[]>;
  runPlan: (id: string) => Promise<any>;
  getRoutingPreview: (id: string, planId: string) => Promise<RoutingPreview>;
  getDecisionEvents: (id: string) => Promise<DecisionEvent[]>;
  getDecisionReport: (id: string) => Promise<string>;
  getDecisionMemory: (id: string) => Promise<MemoryView>;
  getRelatedDecisions: (id: string) => Promise<MemoryRetrievalResult>;
  getOutcomes: (id: string) => Promise<OutcomesResponse>;
  createOutcome: (id: string, input: OutcomeInput) => Promise<DecisionOutcome>;
  updateOutcome: (id: string, outcomeId: string, patch: Partial<OutcomeInput>) => Promise<DecisionOutcome>;
  getFeedback: (id: string) => Promise<DecisionFeedback | null>;
  submitFeedback: (id: string, input: FeedbackInput) => Promise<DecisionFeedback>;
  getLessons: (id: string) => Promise<DecisionLesson[]>;
  createLesson: (id: string, input: LessonInput) => Promise<DecisionLesson>;
  updateLesson: (id: string, lessonId: string, patch: Partial<LessonInput>) => Promise<DecisionLesson>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const mapModel = (m: any): Model => ({
  ...m,
  id: m._id || m.id,
  apiKey: m.apiKey || 'Not set',
  hasApiKey: m.hasApiKey ?? Boolean(m.apiKey && m.apiKey !== 'Not set'),
});

const mapAgent = (a: any): AgentTemplate => ({ ...a, id: a._id || a.id });
const mapCourtroom = (c: any): Courtroom => ({ ...c, id: c._id || c.id });
const mapDecision = (d: any): Decision => ({ ...d, id: d._id || d.id });

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [models, setModels] = useState<Model[]>([]);
  const [agentTemplates, setAgentTemplates] = useState<AgentTemplate[]>([]);
  const [courtrooms, setCourtrooms] = useState<Courtroom[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((variant: Toast['variant'], message: string) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev, { id, variant, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const refreshData = useCallback(async () => {
    try {
      const [mRes, aRes, cRes] = await Promise.all([
        apiJson<Model[]>('/api/models', { fallback: [] }),
        apiJson<AgentTemplate[]>('/api/agents', { fallback: [] }),
        apiJson<Courtroom[]>('/api/courtrooms', { fallback: [] }),
      ]);
      setModels(Array.isArray(mRes) ? mRes.map(mapModel) : []);
      setAgentTemplates(Array.isArray(aRes) ? aRes.map(mapAgent) : []);
      setCourtrooms(Array.isArray(cRes) ? cRes.map(mapCourtroom) : []);
    } catch (e) {
      console.error('Failed to refresh data', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  const needsOnboarding =
    !isLoading && (models.length === 0 || models.every((model) => !model.hasApiKey));

  const addModel = async (model: Omit<Model, 'id' | 'status'> & { apiKey: string }) => {
    const data = await apiJson<Model>('/api/models', {
      method: 'POST',
      json: model,
      errorMessage: 'Failed to add model',
    });
    const saved = mapModel(data);
    setModels((prev) => [...prev, saved]);
    return saved;
  };

  const updateModel = async (id: string, updates: Partial<Model> & { apiKey?: string }) => {
    const data = await apiJson<Model>(`/api/models/${id}`, {
      method: 'PUT',
      json: updates,
      errorMessage: 'Failed to update model',
    });
    const saved = mapModel(data);
    setModels((prev) => prev.map((m) => (m.id === id ? saved : m)));
  };

  const testModel = async (id: string) => {
    // A failed connection test is a result, not an exception: the caller shows
    // `success` / `error` rather than catching.
    const data = await apiJson<{ model?: any; success?: boolean; error?: string }>(
      `/api/models/${id}/test`,
      { method: 'POST', fallback: {} as { success?: boolean; error?: string } }
    );
    if (data.model) {
      const saved = mapModel(data.model);
      setModels((prev) => prev.map((m) => (m.id === id ? saved : m)));
    }
    return { success: Boolean(data.success), error: data.error };
  };

  const deleteModel = (id: string) => {
    setModels((prev) => prev.filter((m) => m.id !== id));
    void apiFetch(`/api/models/${id}`, { method: 'DELETE' }).catch(() => {});
  };

  const addAgentTemplate = (agent: AgentTemplate) => {
    setAgentTemplates((prev) => [...prev, agent]);
    void apiFetch('/api/agents', { method: 'POST', json: agent }).catch(() => {});
  };

  const updateAgentTemplate = (id: string, updates: Partial<AgentTemplate>) => {
    setAgentTemplates((prev) => prev.map((a) => (a.id === id ? { ...a, ...updates } : a)));
    void apiFetch(`/api/agents/${id}`, { method: 'PUT', json: updates }).catch(() => {});
  };

  const deleteAgentTemplate = (id: string) => {
    setAgentTemplates((prev) => prev.filter((a) => a.id !== id));
    void apiFetch(`/api/agents/${id}`, { method: 'DELETE' }).catch(() => {});
  };

  const addCourtroom = async (courtroom: Omit<Courtroom, 'id'>) => {
    const data = await apiJson<Courtroom>('/api/courtrooms', {
      method: 'POST',
      json: courtroom,
      errorMessage: 'Failed to create courtroom',
    });
    const saved = mapCourtroom(data);
    setCourtrooms((prev) => [...prev, saved]);
    return saved;
  };

  const updateCourtroom = (id: string, updates: Partial<Courtroom>) => {
    setCourtrooms((prev) => prev.map((c) => (c.id === id ? { ...c, ...updates } : c)));
    void apiFetch(`/api/courtrooms/${id}`, { method: 'PUT', json: updates })
      .then(async (r) => {
        if (!r.ok) {
          const data = await readJson<unknown>(r, {});
          showToast('error', toApiError(r, data, 'Failed to update courtroom').message);
          await refreshData();
        }
      })
      .catch(() => {});
  };

  const deleteCourtroom = async (id: string) => {
    setCourtrooms((prev) => prev.filter((c) => c.id !== id));
    const res = await apiFetch(`/api/courtrooms/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      await refreshData();
      const data = await readJson<unknown>(res, {});
      throw toApiError(res, data, 'Failed to delete courtroom');
    }
  };

  const refreshDecisions = useCallback(async () => {
    try {
      const res = await apiJson<Decision[]>('/api/decisions', { fallback: [] });
      setDecisions(Array.isArray(res) ? res.map(mapDecision) : []);
    } catch (e) {
      console.error('Failed to refresh decisions', e);
    }
  }, []);

  const getDecision = (id: string) => decisions.find((d) => d.id === id);

  const fetchDecision = async (id: string): Promise<Decision> => {
    const data = await apiJson<Decision>(`/api/decisions/${id}`, {
      errorMessage: 'Failed to fetch decision',
    });
    const saved = mapDecision(data);
    setDecisions((prev) => {
      const exists = prev.some((d) => d.id === saved.id);
      return exists ? prev.map((d) => (d.id === saved.id ? saved : d)) : [saved, ...prev];
    });
    return saved;
  };

  const createDecision = async (input: {
    title: string;
    objective: string;
    context?: string;
    configuration?: any;
    participants?: any[];
  }): Promise<Decision> => {
    const data = await apiJson<Decision>('/api/decisions', {
      method: 'POST',
      json: input,
      errorMessage: 'Failed to create decision',
    });
    const saved = mapDecision(data);
    setDecisions((prev) => [saved, ...prev]);
    return saved;
  };

  const startDecision = async (id: string, researchQueries: any[] = [], planningMode: PlanningMode = 'fixed', routingMode: RoutingMode = 'auto', routingModelId?: string): Promise<any> => {
    const data = await apiJson(`/api/decisions/${id}/start`, {
      method: 'POST',
      json: { researchQueries, planningMode, routingMode, routingModelId },
      errorMessage: 'Failed to start decision',
    });
    refreshDecisions();
    return data;
  };

  const pauseDecision = async (id: string): Promise<void> => {
    await apiJson(`/api/decisions/${id}/pause`, {
      method: 'POST',
      errorMessage: 'Failed to pause decision',
    });
    refreshDecisions();
  };

  const resumeDecision = async (id: string): Promise<void> => {
    await apiJson(`/api/decisions/${id}/resume`, {
      method: 'POST',
      errorMessage: 'Failed to resume decision',
    });
    refreshDecisions();
  };

  const getDecisionSnapshot = async (id: string): Promise<any> => {
    return apiJson(`/api/decisions/${id}/snapshot`, {
      errorMessage: 'Failed to fetch decision snapshot',
    });
  };

  const getDecisionResearch = async (id: string): Promise<ResearchTaskSummary[]> => {
    const data = await apiJson<ResearchTaskSummary[]>(`/api/decisions/${id}/research`, {
      errorMessage: 'Failed to fetch decision research',
    });
    return Array.isArray(data) ? data : [];
  };

  const getResearchStatus = async (): Promise<ResearchStatus> => {
    const res = await apiFetch('/api/research/status');
    if (res.status === 404) {
      // Research status endpoint not available on older servers — never leak keys here.
      return { provider: 'auto', real: false, mock: false, configured: false, mode: 'auto' };
    }
    const data = await readJson<ResearchStatus>(res, {} as ResearchStatus);
    if (!res.ok) throw toApiError(res, data, 'Failed to fetch research status');
    return data;
  };

  const runWebGroundedDemo = async (input: WebGroundedDemoRequest): Promise<WebGroundedDemoResult> => {
    const res = await apiFetch('/api/research/demo', { method: 'POST', json: input });
    const data = await readJson<any>(res, {});
    if (!res.ok && !data?.ok) {
      // Demo intentionally returns a structured 400 (never a silent mock) when
      // no real provider is configured — surface the setup guidance to the UI.
      return {
        ok: false,
        provider: data?.provider,
        error: data?.error || { code: 'PROVIDER_UNAVAILABLE', message: 'Web-grounded demo is unavailable' },
        researchSetupInstructions: data?.researchSetupInstructions,
      };
    }
    return data;
  };

  const getVerifications = async (id: string): Promise<VerificationResult[]> => {
    const data = await apiJson<VerificationResult[]>(`/api/decisions/${id}/verifications`, {
      errorMessage: 'Failed to fetch verifications',
    });
    return Array.isArray(data) ? data : [];
  };

  const getRedTeamFindings = async (id: string): Promise<RedTeamFinding[]> => {
    const data = await apiJson<RedTeamFinding[]>(`/api/decisions/${id}/red-team`, {
      errorMessage: 'Failed to fetch red-team findings',
    });
    return Array.isArray(data) ? data : [];
  };

  const getReconciliation = async (id: string): Promise<ReconciliationResult | null> => {
    const res = await apiFetch(`/api/decisions/${id}/reconciliation`);
    if (res.status === 404) return null;
    const data = await readJson<ReconciliationResult>(res, {} as ReconciliationResult);
    if (!res.ok) throw toApiError(res, data, 'Failed to fetch reconciliation');
    return data;
  };

  const getEvidenceGraph = async (id: string): Promise<EvidenceRelationship[]> => {
    const data = await apiJson<EvidenceRelationship[]>(`/api/decisions/${id}/evidence-graph`, {
      errorMessage: 'Failed to fetch evidence graph',
    });
    return Array.isArray(data) ? data : [];
  };

  const getPlans = async (id: string): Promise<DecisionPlan[]> => {
    const data = await apiJson<DecisionPlan[]>(`/api/decisions/${id}/plans`, {
      errorMessage: 'Failed to fetch plans',
    });
    return Array.isArray(data)
      ? data.map((p: any) => ({ ...p, id: p._id || p.id }))
      : [];
  };

  const runPlan = async (id: string): Promise<any> => {
    const data = await apiJson(`/api/decisions/${id}/plan`, {
      method: 'POST',
      errorMessage: 'Failed to run planner',
    });
    refreshDecisions();
    return data;
  };

  const getRoutingPreview = async (id: string, planId: string): Promise<RoutingPreview> => {
    return apiJson<RoutingPreview>(`/api/decisions/${id}/plans/${planId}/routing-preview`, {
      errorMessage: 'Failed to fetch routing preview',
    });
  };

  const getDecisionEvents = async (id: string): Promise<DecisionEvent[]> => {
    const data = await apiJson<DecisionEvent[]>(`/api/decisions/${id}/events`, {
      errorMessage: 'Failed to fetch decision events',
    });
    return Array.isArray(data) ? data : [];
  };

  const getDecisionReport = async (id: string): Promise<string> => {
    return apiText(`/api/decisions/${id}/report`, {
      errorMessage: 'Failed to fetch decision report',
    });
  };

  const cancelDecision = async (id: string): Promise<void> => {
    await apiJson(`/api/decisions/${id}/cancel`, {
      method: 'POST',
      errorMessage: 'Failed to cancel decision',
    });
    refreshDecisions();
  };

  const mapOutcome = (o: any): DecisionOutcome => ({ ...o, id: o._id || o.id });
  const mapLesson = (l: any): DecisionLesson => ({ ...l, id: l._id || l.id });
  const mapFeedback = (f: any): DecisionFeedback | null =>
    f ? { ...f, id: f._id || f.id } : null;

  const getDecisionMemory = async (id: string): Promise<MemoryView> => {
    return apiJson<MemoryView>(`/api/decisions/${id}/memory`, {
      errorMessage: 'Failed to fetch decision memory',
    });
  };

  const getRelatedDecisions = async (id: string): Promise<MemoryRetrievalResult> => {
    const data = await apiJson<any>(`/api/decisions/${id}/related`, {
      errorMessage: 'Failed to fetch related decisions',
    });
    return Array.isArray(data) ? { memories: data, totalMatches: 0, truncated: false, policyVersion: '', provider: 'structured' } : data;
  };

  const getOutcomes = async (id: string): Promise<OutcomesResponse> => {
    const data = await apiJson<any>(`/api/decisions/${id}/outcomes`, {
      errorMessage: 'Failed to fetch outcomes',
    });
    return { outcomes: Array.isArray(data.outcomes) ? data.outcomes.map(mapOutcome) : [], expectedVsActual: data.expectedVsActual || { metricComparisons: [], qualityComputed: false } };
  };

  const postJson = async (path: string, body: unknown, method: string, errorMsg: string) => {
    return apiJson(path, { method, json: body, errorMessage: errorMsg });
  };

  const createOutcome = async (id: string, input: OutcomeInput): Promise<DecisionOutcome> => {
    const data = await postJson(`/api/decisions/${id}/outcomes`, input, 'POST', 'Failed to create outcome');
    return mapOutcome(data);
  };

  const updateOutcome = async (id: string, outcomeId: string, patch: Partial<OutcomeInput>): Promise<DecisionOutcome> => {
    const data = await postJson(`/api/decisions/${id}/outcomes/${outcomeId}`, patch, 'PATCH', 'Failed to update outcome');
    return mapOutcome(data);
  };

  const getFeedback = async (id: string): Promise<DecisionFeedback | null> => {
    const data = await apiJson<any>(`/api/decisions/${id}/feedback`, {
      errorMessage: 'Failed to fetch feedback',
    });
    return mapFeedback(data);
  };

  const submitFeedback = async (id: string, input: FeedbackInput): Promise<DecisionFeedback> => {
    const data = await postJson(`/api/decisions/${id}/feedback`, input, 'POST', 'Failed to submit feedback');
    return mapFeedback(data)!;
  };

  const getLessons = async (id: string): Promise<DecisionLesson[]> => {
    const data = await apiJson<DecisionLesson[]>(`/api/decisions/${id}/lessons`, {
      errorMessage: 'Failed to fetch lessons',
    });
    return Array.isArray(data) ? data.map(mapLesson) : [];
  };

  const createLesson = async (id: string, input: LessonInput): Promise<DecisionLesson> => {
    const data = await postJson(`/api/decisions/${id}/lessons`, input, 'POST', 'Failed to create lesson');
    return mapLesson(data);
  };

  const updateLesson = async (id: string, lessonId: string, patch: Partial<LessonInput>): Promise<DecisionLesson> => {
    const data = await postJson(`/api/decisions/${id}/lessons/${lessonId}`, patch, 'PATCH', 'Failed to update lesson');
    return mapLesson(data);
  };

  return (
    <AppContext.Provider
      value={{
        models,
        agentTemplates,
        courtrooms,
        decisions,
        isLoading,
        needsOnboarding,
        toasts,
        showToast,
        dismissToast,
        addModel,
        updateModel,
        deleteModel,
        testModel,
        addAgentTemplate,
        updateAgentTemplate,
        deleteAgentTemplate,
        addCourtroom,
        updateCourtroom,
        deleteCourtroom,
        refreshData,
        refreshDecisions,
        getDecision,
        fetchDecision,
        createDecision,
        startDecision,
        pauseDecision,
        resumeDecision,
        cancelDecision,
        getDecisionSnapshot,
        getDecisionResearch,
        getResearchStatus,
        runWebGroundedDemo,
        getVerifications,
        getRedTeamFindings,
        getReconciliation,
        getEvidenceGraph,
        getPlans,
        runPlan,
        getRoutingPreview,
        getDecisionEvents,
        getDecisionReport,
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
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
};
