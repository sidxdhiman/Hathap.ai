import Baseline, { IBaseline } from '../models/Baseline';
import EvaluationCaseResult from '../models/EvaluationCaseResult';
import EvaluationRun from '../models/EvaluationRun';
import EvaluationComparison, { IEvaluationComparison } from '../models/EvaluationComparison';
import {
  BaselineThresholds,
  ComparisonCaseRow,
  ComparisonDirection,
  CriterionKey,
  EvaluationComparisonData,
} from './types';
import { DEFAULT_EVALUATION_POLICY, sanitizeSignal } from './evaluationPolicy';
import { executionEventBus } from '../decision/eventBus';

/**
 * Phase 9 — Baselines.
 *
 * A baseline is a named reference for comparisons:
 *   - `priorRun`  — measurements from a completed evaluation run,
 *   - `thresholds`— minimum per-criterion scores an outcome must beat,
 *   - `hybrid`    — both.
 *
 * Comparisons diff two runs (or a run against a baseline) per case and detect
 * regressions deterministically. A regression uses an epsilon: a delta must be
 * meaningfully negative (`< -epsilon`) to count, so noise never triggers alerts.
 */

export type BaselineInput = {
  name: string;
  description?: string;
  runId?: string;
  strategy: 'priorRun' | 'thresholds' | 'hybrid';
  thresholds?: BaselineThresholds;
};

export class BaselineValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BaselineValidationError';
  }
}

export function cleanBaselineInput(body: any): BaselineInput {
  if (!body || typeof body !== 'object') {
    throw new BaselineValidationError('Invalid baseline payload.');
  }
  const name = body.name;
  if (typeof name !== 'string' || !name.trim()) {
    throw new BaselineValidationError('Baseline "name" is required.');
  }
  const strategy: BaselineInput['strategy'] =
    body.strategy === 'priorRun' || body.strategy === 'hybrid' || body.strategy === 'thresholds'
      ? body.strategy
      : body.runId ? 'priorRun' : 'thresholds';

  const thresholds: BaselineThresholds = {};
  if (body.thresholds && typeof body.thresholds === 'object') {
    if (typeof body.thresholds.composite === 'number') {
      thresholds.composite = Math.min(1, Math.max(0, body.thresholds.composite));
    }
    if (body.thresholds.byCriterion && typeof body.thresholds.byCriterion === 'object') {
      thresholds.byCriterion = {};
      for (const [k, v] of Object.entries(body.thresholds.byCriterion)) {
        if (typeof v === 'number') {
          thresholds.byCriterion[k as CriterionKey] = Math.min(1, Math.max(0, v));
        }
      }
    }
  }

  return {
    name: sanitizeSignal(name.trim(), 200),
    description: typeof body.description === 'string' ? sanitizeSignal(body.description, 1000) : undefined,
    runId: typeof body.runId === 'string' ? body.runId : undefined,
    strategy,
    thresholds,
  };
}

export interface AggregateRunScore {
  cases: number;
  included: number;
  score?: number;
}

export class BaselineService {
  // ---- Baselines ----

  async createBaseline(userId: string, input: BaselineInput): Promise<IBaseline> {
    if (input.runId) {
      const run = await EvaluationRun.findOne({ _id: input.runId, userId });
      if (!run) throw new BaselineValidationError('Referenced evaluation run not found.');
    }
    const created = await Baseline.create({
      userId,
      name: input.name,
      description: input.description,
      runId: input.runId,
      strategy: input.strategy,
      thresholds: input.thresholds || DEFAULT_EVALUATION_POLICY.defaultBaselineThresholds,
    });
    executionEventBus.emit({
      type: 'evaluation.baseline.created',
      decisionId: undefined,
      data: { baselineId: created._id.toString(), strategy: created.strategy },
    });
    return created;
  }

  async listBaselines(userId: string): Promise<IBaseline[]> {
    return Baseline.find({ userId, status: 'active' }).sort({ createdAt: -1 });
  }

  async getBaseline(userId: string, baselineId: string): Promise<IBaseline | null> {
    return Baseline.findOne({ _id: baselineId, userId, status: 'active' });
  }

  async deleteBaseline(userId: string, baselineId: string): Promise<boolean> {
    const removed = await Baseline.findOneAndDelete({ _id: baselineId, userId });
    return Boolean(removed);
  }

  // ---- Aggregates ----

  /** Mean composite over a run's evaluated cases (errors/skips excluded). */
  async aggregateRunScore(runId: string): Promise<AggregateRunScore> {
    const results = await EvaluationCaseResult.find({ runId });
    const scored = results.filter(
      (r) => r.status !== 'error' && r.status !== 'skipped' && typeof r.metrics?.score === 'number'
    );
    const count = scored.length;
    const score =
      count > 0
        ? scored.reduce((sum, r) => sum + (r.metrics?.score as number), 0) / count
        : undefined;
    return { cases: results.length, included: count, score };
  }

  /**
   * Compare two runs case-by-case and detect regressions. `runA` is the
   * reference (past/baseline), `runB` the current run.
   */
  async compareRunVsRun(
    userId: string,
    runAId: string,
    runBId: string,
    opts: { name?: string; persist?: boolean } = {}
  ): Promise<EvaluationComparisonData> {
    const runA = await EvaluationRun.findOne({ _id: runAId, userId });
    const runB = await EvaluationRun.findOne({ _id: runBId, userId });
    if (!runA) throw new BaselineValidationError('Reference run (A) not found.');
    if (!runB) throw new BaselineValidationError('Comparison run (B) not found.');

    const [resultsA, resultsB] = await Promise.all([
      EvaluationCaseResult.find({ runId: runAId }),
      EvaluationCaseResult.find({ runId: runBId }),
    ]);

    const byCase = (results: Array<{ caseId: unknown; metrics?: { score?: number } }>) => {
      const map = new Map<string, number>();
      for (const r of results) {
        if (r.metrics?.score === undefined) continue;
        map.set(String(r.caseId), r.metrics.score);
      }
      return map;
    };

    const scoresA = byCase(resultsA);
    const scoresB = byCase(resultsB);
    const caseIds = new Set<string>([...scoresA.keys(), ...scoresB.keys()]);
    const epsilon = DEFAULT_EVALUATION_POLICY.regressionEpsilon;

    let regressions = 0;
    let improvements = 0;
    let unchanged = 0;
    let missingA = 0;
    let missingB = 0;
    const rows: ComparisonCaseRow[] = [];

    for (const caseId of caseIds) {
      const scoreA = scoresA.get(caseId);
      const scoreB = scoresB.get(caseId);
      let direction: ComparisonDirection = 'missing';
      let delta: number | undefined;
      if (scoreA === undefined) missingA++;
      if (scoreB === undefined) missingB++;
      if (scoreA !== undefined && scoreB !== undefined) {
        delta = scoreB - scoreA;
        if (delta < -epsilon) {
          direction = 'regression';
          regressions++;
        } else if (delta > epsilon) {
          direction = 'improvement';
          improvements++;
        } else {
          direction = 'unchanged';
          unchanged++;
        }
      }
      const resultA = resultsA.find((r) => String(r.caseId) === caseId);
      rows.push({
        caseId,
        caseTitle: resultA?.caseTitle,
        scoreA,
        scoreB,
        delta,
        direction,
      });
    }

    const aggA = meanComposites(resultsA);
    const aggB = meanComposites(resultsB);
    const aggregateDelta =
      aggA !== undefined && aggB !== undefined ? aggB - aggA : undefined;
    const regressionDetected = regressions > 0;

    const data: EvaluationComparisonData = {
      userId,
      name: opts.name,
      runAId,
      runBId,
      type: 'run_vs_run',
      summary: {
        compared: rows.filter((r) => r.scoreA !== undefined && r.scoreB !== undefined).length,
        missingA,
        missingB,
        regressions,
        improvements,
        unchanged,
        aggregateA: aggA,
        aggregateB: aggB,
        aggregateDelta,
        regressionDetected,
        note: regressionDetected
          ? `${regressions} case(s) regressed across the compared runs.`
          : 'No regressions detected across the compared runs.',
      },
      perCase: rows,
    };

    if (opts.persist !== false) {
      await EvaluationComparison.create(data);
    }
    return data;
  }

  /**
   * Compare a run against a baseline. When the baseline references a prior run,
   * its per-case scores are the reference; thresholds are enforced on top.
   */
  async compareRunVsBaseline(
    userId: string,
    runId: string,
    baselineId: string,
    opts: { name?: string; persist?: boolean } = {}
  ): Promise<EvaluationComparisonData> {
    const [run, baseline] = await Promise.all([
      EvaluationRun.findOne({ _id: runId, userId }),
      this.getBaseline(userId, baselineId),
    ]);
    if (!run) throw new BaselineValidationError('Evaluation run not found.');
    if (!baseline) throw new BaselineValidationError('Baseline not found.');

    const resultsB = await EvaluationCaseResult.find({ runId });
    const scoresB = new Map<string, number>();
    for (const r of resultsB) {
      if (r.metrics?.score === undefined) continue;
      scoresB.set(String(r.caseId), r.metrics.score);
    }

    let scoresA = new Map<string, number>();
    if (baseline.runId) {
      const resultsA = await EvaluationCaseResult.find({ runId: baseline.runId });
      for (const r of resultsA) {
        if (r.metrics?.score === undefined) continue;
        scoresA.set(String(r.caseId), r.metrics.score);
      }
    }

    const thresholds = baseline.thresholds || DEFAULT_EVALUATION_POLICY.defaultBaselineThresholds;
    const epsilon = DEFAULT_EVALUATION_POLICY.regressionEpsilon;

    let regressions = 0;
    let improvements = 0;
    let unchanged = 0;
    let missingB = 0;
    const rows: ComparisonCaseRow[] = [];

    const baselineCaseIds = new Set<string>([...scoresA.keys(), ...resultsB.map((r) => String(r.caseId))]);
    for (const caseId of baselineCaseIds) {
      const resultB = resultsB.find((r) => String(r.caseId) === caseId);
      const floor = thresholds.composite ?? 0.6;
      const refScore =
        scoresA.get(caseId) ??
        (resultB?.metrics ? thresholdFloorForCase(resultB.metrics, thresholds) : undefined);

      const scoreB = scoresB.get(caseId);
      let direction: ComparisonDirection = 'missing';
      let delta: number | undefined;
      if (scoreB === undefined) {
        missingB++;
      } else if (refScore === undefined) {
        // Threshold-only baseline: pass/fail against the floor.
        if (scoreB < floor - epsilon) {
          direction = 'regression';
          regressions++;
        } else if (scoreB > floor + epsilon) {
          direction = 'improvement';
          improvements++;
        } else {
          direction = 'unchanged';
          unchanged++;
        }
        delta = scoreB - floor;
      } else {
        delta = scoreB - refScore;
        if (delta < -epsilon) {
          direction = 'regression';
          regressions++;
        } else if (delta > epsilon) {
          direction = 'improvement';
          improvements++;
        } else {
          direction = 'unchanged';
          unchanged++;
        }
      }

      rows.push({
        caseId,
        caseTitle: resultB?.caseTitle,
        scoreA: refScore,
        scoreB,
        delta,
        direction,
      });
    }

    const aggB = meanComposites(resultsB);
    const aggregateDelta = aggB !== undefined && thresholds.composite !== undefined ? aggB - thresholds.composite : undefined;
    const regressionDetected = regressions > 0;

    const data: EvaluationComparisonData = {
      userId,
      name: opts.name,
      runAId: baseline.runId ? String(baseline.runId) : '',
      runBId: runId,
      baselineId,
      type: 'run_vs_baseline',
      summary: {
        compared: rows.filter((r) => r.scoreB !== undefined).length,
        missingA: baseline.runId ? 0 : rows.filter((r) => r.scoreA === undefined).length,
        missingB,
        regressions,
        improvements,
        unchanged,
        aggregateB: aggB,
        aggregateDelta,
        regressionDetected,
        note: regressionDetected
          ? `${regressions} case(s) fell below the baseline.`
          : 'Run meets or exceeds the baseline.',
      },
      perCase: rows,
    };

    if (opts.persist !== false) {
      await EvaluationComparison.create(data);
    }
    return data;
  }

  async listComparisons(userId: string): Promise<IEvaluationComparison[]> {
    return EvaluationComparison.find({ userId }).sort({ createdAt: -1 });
  }

  async getComparison(userId: string, comparisonId: string): Promise<IEvaluationComparison | null> {
    return EvaluationComparison.findOne({ _id: comparisonId, userId });
  }
}

function meanComposites(results: Array<{ metrics?: { score?: number } }>): number | undefined {
  const scored = results.filter(
    (r) => typeof r.metrics?.score === 'number'
  ) as Array<{ metrics: { score: number } }>;
  if (scored.length === 0) return undefined;
  return scored.reduce((sum, r) => sum + (r.metrics?.score as number), 0) / scored.length;
}

function thresholdFloorForCase(
  metrics: { score?: number; categories?: Array<{ key: string; score: number }> },
  thresholds: BaselineThresholds
): number | undefined {
  const floors: number[] = [];
  if (thresholds.composite !== undefined) floors.push(thresholds.composite);
  if (thresholds.byCriterion && metrics.categories) {
    for (const c of metrics.categories) {
      const floor = thresholds.byCriterion[c.key as CriterionKey];
      if (typeof floor === 'number') floors.push(floor);
    }
  }
  return floors.length ? Math.max(...floors) : undefined;
}

export const baselineService = new BaselineService();