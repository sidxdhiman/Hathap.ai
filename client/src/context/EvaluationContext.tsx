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
import { apiFetch, apiJson, readJson, toApiError } from '../api/client';

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

  const isActiveRun = (r: EvaluationRun) =>
    r.status === 'running' || r.status === 'queued';

  const refreshEvaluation = useCallback(async () => {
    try {
      const [bRes, rRes, ruRes, baRes, cRes] = await Promise.all([
        apiJson<any[]>('/api/evaluations/benchmarks', { fallback: [] }).then((list) =>
          Array.isArray(list) ? list.map(mapBenchmark) : []
        ),
        apiJson<any[]>('/api/evaluations/rubrics', { fallback: [] }).then((list) =>
          Array.isArray(list) ? list.map(mapRubric) : []
        ),
        apiJson<any[]>('/api/evaluations/runs', { fallback: [] }).then((list) =>
          Array.isArray(list) ? list.map(mapRun) : []
        ),
        apiJson<any[]>('/api/evaluations/baselines', { fallback: [] }).then((list) =>
          Array.isArray(list) ? list.map(mapBaseline) : []
        ),
        apiJson<any[]>('/api/evaluations/comparisons', { fallback: [] }).then((list) =>
          Array.isArray(list) ? list.map(mapComparison) : []
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
    // A successful "already seeded" response carries `created: 0`, which is not
    // a failure — only a non-ok response without `created` is.
    const res = await apiFetch('/api/evaluations/seed', { method: 'POST' });
    const data = await readJson<any>(res, {});
    if (!res.ok && !data?.created) {
      throw toApiError(res, data, 'Failed to seed benchmarks');
    }
    await refreshEvaluation();
    return data;
  };

  const createBenchmark = async (input: { name: string; description?: string; tags?: string[] }) => {
    const data = await apiJson<Benchmark>('/api/evaluations/benchmarks', {
      method: 'POST',
      json: input,
      errorMessage: 'Failed to create benchmark',
    });
    const saved = mapBenchmark(data);
    setBenchmarks((prev) => [...prev, saved]);
    return saved;
  };

  const deleteBenchmark = async (id: string) => {
    await apiJson(`/api/evaluations/benchmarks/${id}`, {
      method: 'DELETE',
      errorMessage: 'Failed to delete benchmark',
    });
    setBenchmarks((prev) => prev.filter((b) => b.id !== id));
  };

  const getBenchmarkCases = async (benchmarkId: string) => {
    const data = await apiJson<BenchmarkCase[]>(`/api/evaluations/benchmarks/${benchmarkId}/cases`, {
      errorMessage: 'Failed to load cases',
    });
    return Array.isArray(data) ? data.map(mapCase) : [];
  };

  const addBenchmarkCase = async (
    benchmarkId: string,
    input: { title: string; prompt: string; context?: string; category?: string; difficulty?: 'easy' | 'medium' | 'hard'; tags?: string[] }
  ) => {
    const data = await apiJson<BenchmarkCase>(`/api/evaluations/benchmarks/${benchmarkId}/cases`, {
      method: 'POST',
      json: input,
      errorMessage: 'Failed to add case',
    });
    return mapCase(data);
  };

  const updateCase = async (caseId: string, patch: Partial<BenchmarkCase>) => {
    const data = await apiJson<BenchmarkCase>(`/api/evaluations/cases/${caseId}`, {
      method: 'PATCH',
      json: patch,
      errorMessage: 'Failed to update case',
    });
    return mapCase(data);
  };

  const deleteCase = async (caseId: string) => {
    await apiJson(`/api/evaluations/cases/${caseId}`, {
      method: 'DELETE',
      errorMessage: 'Failed to delete case',
    });
  };

  const createRun = async (input: {
    name: string;
    description?: string;
    benchmarkId: string;
    systemUnderTest: { kind: string; label?: string; decisionSettings?: Record<string, unknown> };
    kind?: string;
    selectedCaseIds?: string[];
  }) => {
    const data = await apiJson<EvaluationRun>('/api/evaluations/runs', {
      method: 'POST',
      json: input,
      errorMessage: 'Failed to create run',
    });
    const saved = mapRun(data);
    setRuns((prev) => [...prev, saved]);
    return saved;
  };

  const getRun = async (id: string) => {
    const data = await apiJson<EvaluationRun>(`/api/evaluations/runs/${id}`, {
      errorMessage: 'Failed to load run',
    });
    return mapRun(data);
  };

  const getRunResults = async (id: string) => {
    const data = await apiJson<EvaluationCaseResult[]>(`/api/evaluations/runs/${id}/results`, {
      errorMessage: 'Failed to load results',
    });
    return Array.isArray(data) ? data.map((c: any) => ({ ...c, id: c._id || c.id })) : [];
  };

  const startRun = async (id: string) => {
    const data = await apiJson<EvaluationRun>(`/api/evaluations/runs/${id}/start`, {
      method: 'POST',
      errorMessage: 'Failed to start run',
    });
    const saved = mapRun(data);
    setRuns((prev) => prev.map((r) => (r.id === id ? saved : r)));
    return saved;
  };

  const executeRun = async (id: string) => {
    const data = await apiJson<EvaluationRun>(`/api/evaluations/runs/${id}/execute`, {
      method: 'POST',
      errorMessage: 'Failed to execute run',
    });
    const saved = mapRun(data);
    setRuns((prev) => prev.map((r) => (r.id === id ? saved : r)));
    return saved;
  };

  const cancelRun = async (id: string) => {
    const data = await apiJson<EvaluationRun>(`/api/evaluations/runs/${id}/cancel`, {
      method: 'POST',
      errorMessage: 'Failed to cancel run',
    });
    const saved = mapRun(data);
    setRuns((prev) => prev.map((r) => (r.id === id ? saved : r)));
    return saved;
  };

  const deleteRun = async (id: string) => {
    await apiJson(`/api/evaluations/runs/${id}`, {
      method: 'DELETE',
      errorMessage: 'Failed to delete run',
    });
    setRuns((prev) => prev.filter((r) => r.id !== id));
  };

  const getRunAggregate = async (id: string) => {
    return apiJson<AggregateRunScore>(`/api/evaluations/runs/${id}/aggregate`, {
      errorMessage: 'Failed to load aggregate',
    });
  };

  const createBaseline = async (input: { name: string; description?: string; runId?: string; strategy?: string; thresholds?: Record<string, unknown> }) => {
    const data = await apiJson<Baseline>('/api/evaluations/baselines', {
      method: 'POST',
      json: input,
      errorMessage: 'Failed to create baseline',
    });
    const saved = mapBaseline(data);
    setBaselines((prev) => [...prev, saved]);
    return saved;
  };

  const deleteBaseline = async (id: string) => {
    await apiJson(`/api/evaluations/baselines/${id}`, {
      method: 'DELETE',
      errorMessage: 'Failed to delete baseline',
    });
    setBaselines((prev) => prev.filter((b) => b.id !== id));
  };

  const compareRuns = async (runAId: string, runBId: string, name?: string) => {
    const data = await apiJson<Comparison>('/api/evaluations/compare-runs', {
      method: 'POST',
      json: { runAId, runBId, name, persist: true },
      errorMessage: 'Failed to compare runs',
    });
    const saved = mapComparison(data);
    setComparisons((prev) => [saved, ...prev]);
    return saved;
  };

  const compareBaseline = async (runId: string, baselineId: string, name?: string) => {
    const data = await apiJson<Comparison>('/api/evaluations/compare-baseline', {
      method: 'POST',
      json: { runId, baselineId, name },
      errorMessage: 'Failed to compare against baseline',
    });
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