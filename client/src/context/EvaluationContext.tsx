import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import {
  Benchmark,
  BenchmarkCase,
  Rubric,
  EvaluationRun,
  EvaluationCaseResult,
  Baseline,
  Comparison,
  AggregateRunScore,
} from '../types';

type BenchmarkWithCount = Benchmark & { caseCount?: number };

interface EvaluationContextType {
  benchmarks: BenchmarkWithCount[];
  rubrics: Rubric[];
  runs: EvaluationRun[];
  baselines: Baseline[];
  comparisons: Comparison[];
  isLoading: boolean;
  refreshEvaluation: () => Promise<void>;
  seedBenchmarks: () => Promise<{ created: number }>;
  createBenchmark: (input: { name: string; description?: string; tags?: string[] }) => Promise<Benchmark>;
  deleteBenchmark: (id: string) => Promise<void>;
  getBenchmarkCases: (benchmarkId: string) => Promise<BenchmarkCase[]>;
  addBenchmarkCase: (
    benchmarkId: string,
    input: { title: string; prompt: string; context?: string; category?: string; difficulty?: 'easy' | 'medium' | 'hard'; tags?: string[] }
  ) => Promise<BenchmarkCase>;
  updateCase: (caseId: string, patch: Partial<BenchmarkCase>) => Promise<BenchmarkCase>;
  deleteCase: (caseId: string) => Promise<void>;
  createRun: (input: {
    name: string;
    description?: string;
    benchmarkId: string;
    systemUnderTest: { kind: string; label?: string; decisionSettings?: Record<string, unknown> };
    kind?: string;
    selectedCaseIds?: string[];
  }) => Promise<EvaluationRun>;
  getRun: (id: string) => Promise<EvaluationRun>;
  getRunResults: (id: string) => Promise<EvaluationCaseResult[]>;
  startRun: (id: string) => Promise<EvaluationRun>;
  executeRun: (id: string) => Promise<EvaluationRun>;
  cancelRun: (id: string) => Promise<EvaluationRun>;
  deleteRun: (id: string) => Promise<void>;
  getRunAggregate: (id: string) => Promise<AggregateRunScore>;
  createBaseline: (input: { name: string; description?: string; runId?: string; strategy?: string; thresholds?: Record<string, unknown> }) => Promise<Baseline>;
  deleteBaseline: (id: string) => Promise<void>;
  compareRuns: (runAId: string, runBId: string, name?: string) => Promise<Comparison>;
  compareBaseline: (runId: string, baselineId: string, name?: string) => Promise<Comparison>;
}

const EvaluationContext = createContext<EvaluationContextType | undefined>(undefined);

const mapBenchmark = (b: any): BenchmarkWithCount => ({ ...b, id: b._id || b.id });
const mapCase = (c: any): BenchmarkCase => ({ ...c, id: c._id || c.id });
const mapRubric = (r: any): Rubric => ({ ...r, id: r._id || r.id });
const mapRun = (r: any): EvaluationRun => ({ ...r, id: r._id || r.id });
const mapBaseline = (b: any): Baseline => ({ ...b, id: b._id || b.id });
const mapComparison = (c: any): Comparison => ({ ...c, id: c._id || c.id });

export const EvaluationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [benchmarks, setBenchmarks] = useState<BenchmarkWithCount[]>([]);
  const [rubrics, setRubrics] = useState<Rubric[]>([]);
  const [runs, setRuns] = useState<EvaluationRun[]>([]);
  const [baselines, setBaselines] = useState<Baseline[]>([]);
  const [comparisons, setComparisons] = useState<Comparison[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const getHeaders = () => {
    const API = (import.meta.env.VITE_API_URL as string) || '';
    const token = localStorage.getItem('hathap_token');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return { API, headers };
  };

  const isActiveRun = (r: EvaluationRun) =>
    r.status === 'running' || r.status === 'queued';

  const refreshEvaluation = useCallback(async () => {
    const { API, headers } = getHeaders();
    try {
      const [bRes, rRes, ruRes, baRes, cRes] = await Promise.all([
        fetch(`${API}/api/evaluations/benchmarks`, { headers }).then((r) =>
          r.ok ? r.json().then((list: any[]) => list.map(mapBenchmark)) : []
        ),
        fetch(`${API}/api/evaluations/rubrics`, { headers }).then((r) =>
          r.ok ? r.json().then((list: any[]) => list.map(mapRubric)) : []
        ),
        fetch(`${API}/api/evaluations/runs`, { headers }).then((r) =>
          r.ok ? r.json().then((list: any[]) => list.map(mapRun)) : []
        ),
        fetch(`${API}/api/evaluations/baselines`, { headers }).then((r) =>
          r.ok ? r.json().then((list: any[]) => list.map(mapBaseline)) : []
        ),
        fetch(`${API}/api/evaluations/comparisons`, { headers }).then((r) =>
          r.ok ? r.json().then((list: any[]) => list.map(mapComparison)) : []
        ),
      ]);
      setBenchmarks(bRes);
      setRubrics(rRes);
      setRuns(ruRes);
      setBaselines(baRes);
      setComparisons(cRes);
    } catch (e) {
      console.error('Failed to refresh evaluation data', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshEvaluation();
  }, [refreshEvaluation]);

  const seedBenchmarks = async () => {
    const { API, headers } = getHeaders();
    const res = await fetch(`${API}/api/evaluations/seed`, { method: 'POST', headers });
    const data = await res.json();
    if (!res.ok && !data.created) throw new Error(data.error || 'Failed to seed benchmarks');
    await refreshEvaluation();
    return data;
  };

  const createBenchmark = async (input: { name: string; description?: string; tags?: string[] }) => {
    const { API, headers } = getHeaders();
    const res = await fetch(`${API}/api/evaluations/benchmarks`, {
      method: 'POST',
      headers,
      body: JSON.stringify(input),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create benchmark');
    const saved = mapBenchmark(data);
    setBenchmarks((prev) => [...prev, saved]);
    return saved;
  };

  const deleteBenchmark = async (id: string) => {
    const { API, headers } = getHeaders();
    const res = await fetch(`${API}/api/evaluations/benchmarks/${id}`, { method: 'DELETE', headers });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to delete benchmark');
    }
    setBenchmarks((prev) => prev.filter((b) => b.id !== id));
  };

  const getBenchmarkCases = async (benchmarkId: string) => {
    const { API, headers } = getHeaders();
    const res = await fetch(`${API}/api/evaluations/benchmarks/${benchmarkId}/cases`, { headers });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load cases');
    return Array.isArray(data) ? data.map(mapCase) : [];
  };

  const addBenchmarkCase = async (
    benchmarkId: string,
    input: { title: string; prompt: string; context?: string; category?: string; difficulty?: 'easy' | 'medium' | 'hard'; tags?: string[] }
  ) => {
    const { API, headers } = getHeaders();
    const res = await fetch(`${API}/api/evaluations/benchmarks/${benchmarkId}/cases`, {
      method: 'POST',
      headers,
      body: JSON.stringify(input),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to add case');
    return mapCase(data);
  };

  const updateCase = async (caseId: string, patch: Partial<BenchmarkCase>) => {
    const { API, headers } = getHeaders();
    const res = await fetch(`${API}/api/evaluations/cases/${caseId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update case');
    return mapCase(data);
  };

  const deleteCase = async (caseId: string) => {
    const { API, headers } = getHeaders();
    const res = await fetch(`${API}/api/evaluations/cases/${caseId}`, { method: 'DELETE', headers });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to delete case');
    }
  };

  const createRun = async (input: {
    name: string;
    description?: string;
    benchmarkId: string;
    systemUnderTest: { kind: string; label?: string; decisionSettings?: Record<string, unknown> };
    kind?: string;
    selectedCaseIds?: string[];
  }) => {
    const { API, headers } = getHeaders();
    const res = await fetch(`${API}/api/evaluations/runs`, {
      method: 'POST',
      headers,
      body: JSON.stringify(input),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create run');
    const saved = mapRun(data);
    setRuns((prev) => [...prev, saved]);
    return saved;
  };

  const getRun = async (id: string) => {
    const { API, headers } = getHeaders();
    const res = await fetch(`${API}/api/evaluations/runs/${id}`, { headers });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load run');
    return mapRun(data);
  };

  const getRunResults = async (id: string) => {
    const { API, headers } = getHeaders();
    const res = await fetch(`${API}/api/evaluations/runs/${id}/results`, { headers });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load results');
    return Array.isArray(data) ? data.map((c: any) => ({ ...c, id: c._id || c.id })) : [];
  };

  const startRun = async (id: string) => {
    const { API, headers } = getHeaders();
    const res = await fetch(`${API}/api/evaluations/runs/${id}/start`, { method: 'POST', headers });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to start run');
    const saved = mapRun(data);
    setRuns((prev) => prev.map((r) => (r.id === id ? saved : r)));
    return saved;
  };

  const executeRun = async (id: string) => {
    const { API, headers } = getHeaders();
    const res = await fetch(`${API}/api/evaluations/runs/${id}/execute`, { method: 'POST', headers });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to execute run');
    const saved = mapRun(data);
    setRuns((prev) => prev.map((r) => (r.id === id ? saved : r)));
    return saved;
  };

  const cancelRun = async (id: string) => {
    const { API, headers } = getHeaders();
    const res = await fetch(`${API}/api/evaluations/runs/${id}/cancel`, { method: 'POST', headers });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to cancel run');
    const saved = mapRun(data);
    setRuns((prev) => prev.map((r) => (r.id === id ? saved : r)));
    return saved;
  };

  const deleteRun = async (id: string) => {
    const { API, headers } = getHeaders();
    const res = await fetch(`${API}/api/evaluations/runs/${id}`, { method: 'DELETE', headers });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to delete run');
    }
    setRuns((prev) => prev.filter((r) => r.id !== id));
  };

  const getRunAggregate = async (id: string) => {
    const { API, headers } = getHeaders();
    const res = await fetch(`${API}/api/evaluations/runs/${id}/aggregate`, { headers });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load aggregate');
    return data;
  };

  const createBaseline = async (input: { name: string; description?: string; runId?: string; strategy?: string; thresholds?: Record<string, unknown> }) => {
    const { API, headers } = getHeaders();
    const res = await fetch(`${API}/api/evaluations/baselines`, {
      method: 'POST',
      headers,
      body: JSON.stringify(input),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create baseline');
    const saved = mapBaseline(data);
    setBaselines((prev) => [...prev, saved]);
    return saved;
  };

  const deleteBaseline = async (id: string) => {
    const { API, headers } = getHeaders();
    const res = await fetch(`${API}/api/evaluations/baselines/${id}`, { method: 'DELETE', headers });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to delete baseline');
    }
    setBaselines((prev) => prev.filter((b) => b.id !== id));
  };

  const compareRuns = async (runAId: string, runBId: string, name?: string) => {
    const { API, headers } = getHeaders();
    const res = await fetch(`${API}/api/evaluations/compare-runs`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ runAId, runBId, name, persist: true }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to compare runs');
    const saved = mapComparison(data);
    setComparisons((prev) => [saved, ...prev]);
    return saved;
  };

  const compareBaseline = async (runId: string, baselineId: string, name?: string) => {
    const { API, headers } = getHeaders();
    const res = await fetch(`${API}/api/evaluations/compare-baseline`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ runId, baselineId, name }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to compare against baseline');
    const saved = mapComparison(data);
    setComparisons((prev) => [saved, ...prev]);
    return saved;
  };

  // Poll runs while any are active so the list reflects progress without SSE.
  useEffect(() => {
    if (!isLoading && runs.some(isActiveRun)) {
      const t = setInterval(() => {
        void refreshEvaluation();
      }, 5000);
      return () => clearInterval(t);
    }
    return;
  }, [isLoading, runs, refreshEvaluation]);

  return (
    <EvaluationContext.Provider
      value={{
        benchmarks,
        rubrics,
        runs,
        baselines,
        comparisons,
        isLoading,
        refreshEvaluation,
        seedBenchmarks,
        createBenchmark,
        deleteBenchmark,
        getBenchmarkCases,
        addBenchmarkCase,
        updateCase,
        deleteCase,
        createRun,
        getRun,
        getRunResults,
        startRun,
        executeRun,
        cancelRun,
        deleteRun,
        getRunAggregate,
        createBaseline,
        deleteBaseline,
        compareRuns,
        compareBaseline,
      }}
    >
      {children}
    </EvaluationContext.Provider>
  );
};

export const useEvaluation = () => {
  const ctx = useContext(EvaluationContext);
  if (!ctx) throw new Error('useEvaluation must be used within EvaluationProvider');
  return ctx;
};