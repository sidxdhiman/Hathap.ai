import EvaluationRun, { IEvaluationRun } from '../models/EvaluationRun';
import EvaluationCaseResult, { IEvaluationCaseResult } from '../models/EvaluationCaseResult';
import Execution from '../models/Execution';
import Task from '../models/Task';
import Outcome from '../models/Outcome';
import Evidence from '../models/Evidence';
import Claim from '../models/Claim';
import ReconciliationResult from '../models/ReconciliationResult';
import { rubricService } from './rubricService';
import { benchmarkService } from './benchmarkService';
import { qualityEvaluator } from './qualityEvaluator';
import { evaluateStructure } from './structuralEvaluator';
import { buildComposite, efficiencyMetrics } from './metrics';
import { emitEvaluationEvent } from './evaluationEvents';
import { makeEvaluationPolicy, sanitizeSignal } from './evaluationPolicy';
import {
  CompositeMetrics,
  CriterionKey,
  EfficiencyEvaluation,
  EvaluationArtifact,
  EvaluationCaseResultData,
  EvaluationLimits,
  EvaluationRunKind,
  EvaluationRunSnapshot,
  OutcomeEvaluation,
  ReasoningEvaluation,
  RunCaseContext,
  RubricSnapshot,
  StaticProvidedAnswer,
  SystemKind,
  SystemUnderTest,
} from './types';

/**
 * Phase 9 — EvaluationService.
 *
 * Owns the business layer: run creation/validation, single-case evaluation
 * (structural + quality + evidence + reasoning + efficiency + outcome →
 * composite metrics), run aggregation and queries. The EvaluationRunner drives
 * the bounded execution loop and persists each case result through here.
 */

export type RunInput = {
  name: string;
  description?: string;
  benchmarkId: string;
  rubricId?: string;
  kind?: EvaluationRunKind;
  systemUnderTest: SystemUnderTest;
  selectedCaseIds?: string[];
  baseline?: { baselineId?: string; thresholds?: { composite?: number; byCriterion?: Record<string, number> } };
  ablation?: { parentRunId?: string; variantLabel?: string; configPatch?: Record<string, unknown> };
  passThreshold?: number;
  limits?: Partial<EvaluationLimits>;
};

export class EvaluationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EvaluationValidationError';
  }
}

const RUN_KINDS: EvaluationRunKind[] = ['standard', 'baseline', 'ablation'];
const SYSTEM_KINDS: SystemKind[] = ['static', 'decision-engine', 'external'];

export function cleanRunInput(body: any): Omit<RunInput, 'benchmarkId' | 'systemUnderTest'> & {
  benchmarkId: string;
  systemUnderTest: SystemUnderTest;
} {
  if (!body || typeof body !== 'object') {
    throw new EvaluationValidationError('Invalid evaluation run payload.');
  }
  const name = body.name;
  if (typeof name !== 'string' || !name.trim()) {
    throw new EvaluationValidationError('Run "name" is required.');
  }
  const benchmarkId = body.benchmarkId;
  if (typeof benchmarkId !== 'string' || !benchmarkId.trim()) {
    throw new EvaluationValidationError('Run "benchmarkId" is required.');
  }

  const sut = body.systemUnderTest;
  if (!sut || typeof sut !== 'object') {
    throw new EvaluationValidationError('Run "systemUnderTest" is required.');
  }
  const kind: SystemKind = SYSTEM_KINDS.includes(sut.kind) ? sut.kind : 'static';

  const kindType: EvaluationRunKind =
    body.kind !== undefined && RUN_KINDS.includes(body.kind) ? body.kind : 'standard';

  const systemUnderTest: SystemUnderTest = {
    kind,
    label:
      typeof sut.label === 'string' && sut.label.trim()
        ? sanitizeSignal(sut.label.trim(), 200)
        : kind === 'decision-engine'
          ? 'Hathap decision engine'
          : 'Static artifact',
    description:
      typeof sut.description === 'string' ? sanitizeSignal(sut.description, 1000) : undefined,
    decisionSettings:
      sut.decisionSettings && typeof sut.decisionSettings === 'object'
        ? {
            planningMode:
              sut.decisionSettings.planningMode === 'intelligent'
                ? 'intelligent'
                : 'fixed',
            routingMode:
              sut.decisionSettings.routingMode === 'manual' ? 'manual' : 'auto',
            verificationEnabled:
              typeof sut.decisionSettings.verificationEnabled === 'boolean'
                ? sut.decisionSettings.verificationEnabled
                : undefined,
            researchQueries: Array.isArray(sut.decisionSettings.researchQueries)
              ? sut.decisionSettings.researchQueries
                  .filter((q: unknown): q is string => typeof q === 'string' && q.trim().length > 0)
                  .slice(0, 5)
              : undefined,
          }
        : undefined,
  };

  const blanket = { ...makeEvaluationPolicy() };
  return {
    name: sanitizeSignal(name.trim(), 200),
    description:
      typeof body.description === 'string' ? sanitizeSignal(body.description, 1000) : undefined,
    benchmarkId,
    rubricId: typeof body.rubricId === 'string' ? body.rubricId : undefined,
    kind: kindType,
    systemUnderTest,
    selectedCaseIds: Array.isArray(body.selectedCaseIds)
      ? body.selectedCaseIds.filter((s: unknown): s is string => typeof s === 'string').slice(0, blanket.limits.maxCasesPerRun)
      : undefined,
    baseline:
      body.baseline && typeof body.baseline === 'object'
        ? {
            baselineId: typeof body.baseline.baselineId === 'string' ? body.baseline.baselineId : undefined,
            thresholds: body.baseline.thresholds || undefined,
          }
        : undefined,
    ablation:
      body.ablation && typeof body.ablation === 'object'
        ? {
            parentRunId:
              typeof body.ablation.parentRunId === 'string' ? body.ablation.parentRunId : undefined,
            variantLabel:
              typeof body.ablation.variantLabel === 'string' ? body.ablation.variantLabel : undefined,
            configPatch:
              body.ablation.configPatch && typeof body.ablation.configPatch === 'object'
                ? body.ablation.configPatch
                : undefined,
          }
        : undefined,
    passThreshold:
      typeof body.passThreshold === 'number'
        ? Math.min(1, Math.max(0, body.passThreshold))
        : undefined,
    limits: body.limits && typeof body.limits === 'object' ? body.limits : undefined,
  };
}

export class EvaluationService {
  // ---- Runs ----

  async createRun(userId: string, input: Omit<RunInput, 'userId'>): Promise<IEvaluationRun> {
    const benchmark = await benchmarkService.getBenchmark(userId, input.benchmarkId);
    if (!benchmark) {
      throw new EvaluationValidationError('Benchmark not found.');
    }
    const activeCount = await benchmarkService.activeCaseCount(input.benchmarkId);
    if (activeCount === 0) {
      throw new EvaluationValidationError('Benchmark has no active cases — add cases before running an evaluation.');
    }

    const policy = makeEvaluationPolicy(input.limits);

    if (input.kind === 'ablation') {
      if (!input.ablation?.parentRunId) {
        throw new EvaluationValidationError('Ablation runs require a "parentRunId".');
      }
      const parent = await EvaluationRun.findOne({ _id: input.ablation.parentRunId, userId });
      if (!parent) {
        throw new EvaluationValidationError('Ablation parent run not found.');
      }
    }

    // Resolve rubric (explicit → benchmark default → seeded default rubric).
    let rubricId = input.rubricId;
    let rubricVersion: number | undefined;
    let rubric: RubricSnapshot | null = null;
    if (rubricId) {
      rubric = await rubricService.getRubricSnapshot(userId, rubricId);
      if (!rubric) throw new EvaluationValidationError('Rubric not found.');
      rubricVersion = rubric.version;
    } else {
      const defaultId = await benchmarkService.resolveDefaultRubricId(userId, input.benchmarkId);
      if (defaultId) {
        rubric = await rubricService.getRubricSnapshot(userId, defaultId);
        rubricId = defaultId;
        rubricVersion = rubric?.version;
      }
    }

    // Deterministic ordering: keep the prompt insertion order.
    const cases = await benchmarkService.activeCases(input.benchmarkId, input.selectedCaseIds);
    const selectedCaseIds = cases
      .slice(0, policy.limits.maxCasesPerRun)
      .map((c) => String(c._id));

    const run = await EvaluationRun.create({
      userId,
      benchmarkId: input.benchmarkId,
      rubricId,
      rubricVersion,
      name: input.name,
      description: input.description,
      kind: input.kind || 'standard',
      status: 'draft',
      systemUnderTest: input.systemUnderTest,
      baseline: input.baseline
        ? {
            baselineId: input.baseline.baselineId,
            thresholds: {
              composite: input.baseline.thresholds?.composite,
              byCriterion: input.baseline.thresholds?.byCriterion,
            },
          }
        : undefined,
      ablation: input.ablation
        ? {
            parentRunId: input.ablation.parentRunId,
            variantLabel: input.ablation.variantLabel,
            configPatch: input.ablation.configPatch,
          }
        : undefined,
      selectedCaseIds,
      limits: policy.limits,
      passThreshold:
        input.passThreshold ?? policy.defaultBaselineThresholds.composite ?? 0.6,
      progress: { total: selectedCaseIds.length, completed: 0, failed: 0, error: 0 },
    });

    emitEvaluationEvent({
      type: 'evaluation.run.created',
      runId: String(run._id),
      userId,
      data: {
        benchmarkId: input.benchmarkId,
        kind: run.kind,
        totalCases: selectedCaseIds.length,
        systemKind: input.systemUnderTest.kind,
        rubricVersion,
      },
    });

    return run;
  }

  async listRuns(userId: string): Promise<IEvaluationRun[]> {
    return EvaluationRun.find({ userId }).sort({ createdAt: -1 });
  }

  async getRun(userId: string, runId: string): Promise<IEvaluationRun | null> {
    return EvaluationRun.findOne({ _id: runId, userId });
  }

  async getRunResults(userId: string, runId: string): Promise<IEvaluationCaseResult[]> {
    const run = await this.getRun(userId, runId);
    if (!run) throw new EvaluationValidationError('Evaluation run not found.');
    return EvaluationCaseResult.find({ runId }).sort({ caseId: 1 });
  }

  async deleteRun(userId: string, runId: string): Promise<boolean> {
    const run = await this.getRun(userId, runId);
    if (!run) return false;
    await EvaluationCaseResult.deleteMany({ runId });
    await run.deleteOne();
    return true;
  }

  async cancelRun(userId: string, runId: string): Promise<IEvaluationRun | null> {
    const run = await this.getRun(userId, runId);
    if (!run) return null;
    if (run.status !== 'queued' && run.status !== 'running' && run.status !== 'draft') {
      throw new EvaluationValidationError(`Run is in state "${run.status}" and cannot be cancelled.`);
    }
    run.status = 'cancelled';
    run.cancelledAt = new Date();
    run.lockedAt = undefined;
    run.lockedBy = undefined;
    const saved = await run.save();
    emitEvaluationEvent({
      type: 'evaluation.run.cancelled',
      runId: String(run._id),
      userId,
    });
    return saved;
  }

  // ---- Single-case evaluation ----

  /** Run the full criterion stack over one artifact → case result payload. */
  async runCase(ctx: RunCaseContext): Promise<EvaluationCaseResultData> {
    const { artifact, rubric } = ctx;
    const enabled = (key: CriterionKey): boolean => {
      const c = rubric?.criteria?.find((x) => x.key === key);
      return c ? c.enabled !== false : true;
    };
    const weight = (key: CriterionKey): number => {
      const c = rubric?.criteria?.find((x) => x.key === key);
      return c && typeof c.weight === 'number' && c.weight > 0 ? c.weight : 0.1;
    };

    const startedAt = new Date();

    const structural = evaluateStructure({
      artifact,
      expectedStructure: ctx.caseDef.expectedStructure,
    });
    structural.enabled = enabled('structural');

    const quality = await qualityEvaluator.evaluateArtifactQuality(ctx.userId, artifact, {
      prompt: ctx.caseDef.prompt,
      expectedMinAnswerLength: ctx.caseDef.expectedStructure.minAnswerLength,
      expectedMaxAnswerLength: ctx.caseDef.expectedStructure.maxAnswerLength,
    });
    quality.enabled = enabled('quality');

    const evidence = await qualityEvaluator.evaluateEvidence(artifact);
    evidence.enabled = enabled('evidence');

    const reasoning: ReasoningEvaluation = await qualityEvaluator.evaluateReasoningDecision(
      artifact.decisionId || ''
    );
    if (!artifact.decisionId) {
      reasoning.applicable = false;
      reasoning.comments = ['No decision execution to measure.'];
    }
    reasoning.enabled = enabled('reasoning');

    const efficiency = await this.evaluateEfficiency(artifact, ctx.limits);
    efficiency.enabled = enabled('efficiency');

    const outcome: OutcomeEvaluation = await qualityEvaluator.evaluateOutcome(
      ctx.userId,
      artifact.decisionId || ''
    );
    if (!artifact.decisionId) {
      outcome.applicable = false;
      outcome.signals = {
        hasExpected: false,
        hasActual: false,
        meaningfulComparisons: 0,
        achievedComparisons: 0,
        metricComparisons: [],
        outcomeConfirmed: false,
      };
      outcome.notes = ['No decision referenced — outcome evaluation not applicable.'];
    }
    outcome.enabled = enabled('outcome');

    const metrics = buildComposite([
      { key: 'structural', enabled: structural.enabled, applicable: structural.applicable, score: structural.score, weight: weight('structural') },
      { key: 'quality', enabled: quality.enabled, applicable: quality.applicable, score: quality.score, weight: weight('quality') },
      { key: 'evidence', enabled: evidence.enabled, applicable: evidence.applicable, score: evidence.score, weight: weight('evidence') },
      { key: 'reasoning', enabled: reasoning.enabled, applicable: reasoning.applicable, score: reasoning.score, weight: weight('reasoning') },
      { key: 'efficiency', enabled: efficiency.enabled, applicable: efficiency.applicable, score: efficiency.score, weight: weight('efficiency') },
      { key: 'outcome', enabled: outcome.enabled, applicable: outcome.applicable, score: outcome.score, weight: weight('outcome') },
    ]);

    const passThreshold = ctx.run.passThreshold ?? 0.6;
    let status: EvaluationCaseResultData['status'] = 'passed';
    let error: EvaluationCaseResultData['error'];
    if (metrics.score === undefined) {
      status = 'error';
      error = { message: 'No applicable evaluation criteria produced a score.', phase: 'metric' };
    } else {
      status = metrics.score >= passThreshold ? 'passed' : 'failed';
    }

    const data: EvaluationCaseResultData = {
      runId: ctx.run.runId,
      userId: ctx.userId,
      benchmarkId: ctx.run.benchmarkId,
      caseId: ctx.caseDef.caseId,
      caseTitle: ctx.caseDef.title,
      caseVersion: ctx.caseDef.version,
      status,
      artifact,
      structural,
      quality,
      evidence,
      reasoning,
      efficiency,
      outcome,
      metrics,
      error,
      startedAt,
      completedAt: new Date(),
    };
    return data;
  }

  /** Efficiency evaluation measured from the execution backing the artifact. */
  private async evaluateEfficiency(
    artifact: EvaluationArtifact,
    limits: EvaluationLimits
  ): Promise<EfficiencyEvaluation> {
    if (!artifact.executionId) {
      return {
        enabled: true,
        applicable: false,
        stats: { estimatedCost: 0, llmCalls: 0 },
        comments: ['No execution recorded — efficiency not applicable.'],
      };
    }
    const execution = await Execution.findById(artifact.executionId);
    if (!execution) {
      return {
        enabled: true,
        applicable: false,
        stats: { estimatedCost: 0, llmCalls: 0 },
        comments: ['Referenced execution not found.'],
      };
    }

    const llmCalls = await Task.countDocuments({ executionId: execution._id, status: 'completed' });
    const stats = {
      estimatedCost:
        execution.estimatedCost || execution.actualCost || execution.tokenUsage?.estimatedCost || 0,
      latencyMs: execution.tokenUsage?.latencyMs,
      totalTokens: execution.tokenUsage?.totalTokens,
      llmCalls,
    };
    const metrics = efficiencyMetrics(stats, limits);
    return {
      enabled: true,
      applicable: metrics.applicable,
      score: metrics.score,
      stats,
      comments: Object.keys(metrics.subScores).length
        ? [`efficiency sub-scores: ${JSON.stringify(metrics.subScores)}`]
        : [],
    };
  }

  // ---- Decision artifact collection ----

  /** Snapshot the small, allowed signals of a real decision for evaluation. */
  async collectDecisionArtifact(userId: string, decisionId: string): Promise<EvaluationArtifact | null> {
    const decision = await import('../models/Decision').then((m) => m.default.findOne({ _id: decisionId, userId }));
    if (!decision) return null;

    const [reconciliation, evidence, claims, outcomes, execution] = await Promise.all([
      ReconciliationResult.findOne({ decisionId }).sort({ createdAt: -1 }),
      Evidence.find({ decisionId }).limit(50),
      Claim.find({ decisionId }).limit(100),
      Outcome.find({ decisionId, userId }).limit(20),
      Execution.findOne({ decisionId }).sort({ createdAt: -1 }),
    ]);

    return {
      decisionId: String(decision._id),
      executionId: execution ? String(execution._id) : undefined,
      answerText: reconciliation?.rationale || undefined,
      recommendation:
        reconciliation?.recommendation ||
        (typeof decision.metadata?.finalRecommendation === 'string'
          ? (decision.metadata.finalRecommendation as string)
          : undefined),
      rationale: reconciliation?.rationale || undefined,
      assumptions: Array.isArray(decision.assumptions) ? decision.assumptions.map(String) : [],
      confidence:
        typeof decision.confidence === 'number' ? decision.confidence / 100 : undefined,
      evidenceRefs: evidence.map((e) => String(e._id)),
      evidenceIds: evidence.map((e) => String(e._id)),
      claimIds: claims.map((c) => String(c._id)),
      outcomeIds: outcomes.map((o) => String(o._id)),
    };
  }

  /** Build the artifact for a static run from the case's provided answer. */
  artifactFromProvidedAnswer(
    answer: StaticProvidedAnswer | undefined,
    caseId: string
  ): EvaluationArtifact | null {
    if (!answer) return null;
    if (
      !answer.answerText &&
      !answer.recommendation &&
      !answer.rationale &&
      (!answer.assumptions || answer.assumptions.length === 0)
    ) {
      return null;
    }
    return {
      answerText: answer.answerText,
      recommendation: answer.recommendation,
      rationale: answer.rationale,
      assumptions: answer.assumptions || [],
      confidence: answer.confidence,
      evidenceRefs: answer.evidenceRefs || [],
      evidenceIds: [],
      claimIds: [],
      outcomeIds: [],
    };
  }

  /** Snapshot its persisted evaluation run in a bounded shape for the runner. */
  async toSnapshot(run: IEvaluationRun): Promise<EvaluationRunSnapshot> {
    return {
      runId: String(run._id),
      benchmarkId: String(run.benchmarkId),
      rubricId: run.rubricId ? String(run.rubricId) : undefined,
      rubricVersion: run.rubricVersion,
      kind: run.kind,
      systemUnderTest: run.systemUnderTest,
      baseline: run.baseline,
      ablation: run.ablation,
      limits: run.limits,
      passThreshold: run.passThreshold,
    };
  }

  async persistCaseResult(data: EvaluationCaseResultData): Promise<IEvaluationCaseResult> {
    const existing = await EvaluationCaseResult.findOne({ runId: data.runId, caseId: data.caseId });
    if (existing) {
      existing.set({ ...data, runId: data.runId, caseId: data.caseId });
      return existing.save();
    }
    return EvaluationCaseResult.create(data);
  }
}

export const evaluationService = new EvaluationService();