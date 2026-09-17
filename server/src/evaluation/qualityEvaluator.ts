import Evidence from '../models/Evidence';
import Claim from '../models/Claim';
import Execution from '../models/Execution';
import Task from '../models/Task';
import VerificationResult from '../models/VerificationResult';
import RedTeamFinding from '../models/RedTeamFinding';
import ReconciliationResult from '../models/ReconciliationResult';
import DecisionPlan from '../models/DecisionPlan';
import Outcome from '../models/Outcome';
import { outcomeService } from '../memory/outcomeService';
import {
  EvaluationArtifact,
  EvidenceEvaluation,
  EvidenceStats,
  OutcomeEvaluation,
  OutcomeEvaluationSignal,
  QualityEvaluation,
  QualitySignals,
  ReasoningEvaluation,
} from './types';
import { nonEmpty, promptRelevance } from './structuralEvaluator';
import { mean } from './metrics';

/**
 * Phase 9 — QualityEvaluator.
 *
 * Deterministic quality evaluation of the artifact under test and its real-world
 * backing data. Like every evaluator here it:
 *   - never invents a missing measurement (returns `applicable: false`),
 *   - never stores internal reasoning,
 *   - reads only ownership-scoped documents.
 */

export interface QualityScoreOptions {
  prompt?: string;
  expectedMinAnswerLength?: number;
  expectedMaxAnswerLength?: number;
}

export class QualityEvaluator {
  /**
   * Answer quality from the artifact itself (plus, when a real decision is
   * referenced, Phase 8 decision-quality signals reported separately).
   */
  async evaluateArtifactQuality(
    userId: string,
    artifact: EvaluationArtifact,
    opts: QualityScoreOptions = {}
  ): Promise<QualityEvaluation> {
    const text = [artifact.answerText, artifact.recommendation, artifact.rationale].filter(Boolean).join(' ');

    const signals: QualitySignals = {
      recommendationPresent: nonEmpty(artifact.recommendation),
      rationalePresent: nonEmpty(artifact.rationale),
      rationaleLength: artifact.rationale ? artifact.rationale.trim().length : undefined,
      confidencePresent:
        typeof artifact.confidence === 'number' &&
        Number.isFinite(artifact.confidence) &&
        artifact.confidence >= 0 &&
        artifact.confidence <= 100,
      grounded: artifact.evidenceRefs.length > 0 || artifact.evidenceIds.length > 0,
    };

    const relevance = opts.prompt ? promptRelevance(opts.prompt, artifact) : undefined;
    signals.objectiveRelevance = relevance;

    const minLen = opts.expectedMinAnswerLength ?? 60;
    const maxLen = opts.expectedMaxAnswerLength;
    const len = text.trim().length;
    signals.verbosityInRange = len >= Math.max(1, minLen) && (maxLen ? len <= maxLen : true);

    if (artifact.decisionId) {
      try {
        const { decisionMemoryService } = await import('../memory/decisionMemoryService');
        const dq = await decisionMemoryService.getDecisionQuality(artifact.decisionId, userId);
        signals.decisionQuality = {
          outcomeAchieved: dq.outcomeAchieved,
          recommendationAccepted: dq.recommendationAccepted,
          outcomeConfirmed: dq.outcomeConfirmed,
          expectedVsActualComputed: dq.expectedVsActualComputed,
        };
      } catch {
        /* best-effort: quality signals are a bonus, never a blocker */
      }
    }

    const weighted = [
      { w: 0.25, pass: signals.recommendationPresent, label: 'recommendation' },
      { w: 0.2, pass: signals.rationalePresent, label: 'rationale' },
      { w: 0.15, pass: signals.confidencePresent, label: 'confidence' },
      { w: 0.15, pass: signals.grounded, label: 'grounded' },
      {
        w: 0.15,
        pass: typeof relevance === 'number' && relevance >= 0.15,
        label: 'relevance',
      },
      { w: 0.1, pass: !!signals.verbosityInRange, label: 'verbosity' },
    ];
    const applicable = weighted.some((s) => s.pass);
    const score = applicable
      ? weighted.filter((s) => s.pass).reduce((sum, s) => sum + s.w, 0) /
        weighted.reduce((sum, s) => sum + s.w, 0)
      : undefined;

    return { enabled: true, applicable, score, signals };
  }

  /** Evidence quality from the evidence documents backing the artifact. The
   *  artifact's decisionId (or evidenceIds) already points at an ownership-
   *  scoped decision — evidence has no userId of its own. */
  async evaluateEvidence(artifact: EvaluationArtifact): Promise<EvidenceEvaluation> {
    const stats: EvidenceStats = { count: 0, withReliability: 0, categories: {} };

    let docs: Array<{ sourceReliability?: string; relevanceScore?: number; sourceType?: string }> = [];
    if (artifact.evidenceIds.length > 0) {
      docs = await Evidence.find({ _id: { $in: artifact.evidenceIds } }).limit(50);
    } else if (artifact.decisionId) {
      docs = await Evidence.find({ decisionId: artifact.decisionId }).limit(50);
    }

    stats.count = docs.length;
    stats.withReliability = docs.filter((d) => typeof d.sourceReliability === 'string').length;
    const reliables = docs.filter((d) => d.sourceReliability === 'high').length;
    stats.highReliabilityRatio = stats.count > 0 ? reliables / stats.count : undefined;
    const relevant = docs
      .map((d) => d.relevanceScore)
      .filter((r): r is number => typeof r === 'number' && Number.isFinite(r));
    stats.avgRelevance = relevant.length > 0 ? mean(relevant) : undefined;
    for (const d of docs) {
      const key = d.sourceType || 'unknown';
      stats.categories[key] = (stats.categories[key] || 0) + 1;
    }

    const applicable = stats.count > 0;
    let score: number | undefined;
    if (applicable) {
      const parts: number[] = [];
      parts.push(stats.count >= 1 ? 1 : 0);
      if (stats.highReliabilityRatio !== undefined) parts.push(stats.highReliabilityRatio);
      if (stats.avgRelevance !== undefined) parts.push(stats.avgRelevance);
      score = mean(parts);
    }
    return { enabled: true, applicable, score, stats };
  }

  /** Reasoning / process quality from the execution graph of a real decision. */
  async evaluateReasoningDecision(decisionId: string): Promise<ReasoningEvaluation> {
    if (!decisionId || !decisionId.trim()) {
      return {
        enabled: true,
        applicable: false,
        stats: {
          executions: 0,
          totalTasks: 0,
          completedTasks: 0,
          failedTasks: 0,
          cancelledTasks: 0,
          retriedTasks: 0,
          hasPlan: false,
          planValidated: false,
          hasVerification: false,
          hasRedTeam: false,
          hasReconciliation: false,
        },
        comments: ['No decision execution to measure.'],
      };
    }
    const executions = await Execution.find({ decisionId }).sort({ createdAt: 1 });
    const comments: string[] = [];

    if (executions.length === 0) {
      return {
        enabled: true,
        applicable: false,
        stats: {
          executions: 0,
          totalTasks: 0,
          completedTasks: 0,
          failedTasks: 0,
          cancelledTasks: 0,
          retriedTasks: 0,
          hasPlan: false,
          planValidated: false,
          hasVerification: false,
          hasRedTeam: false,
          hasReconciliation: false,
        },
        comments,
      };
    }

    const execIds = executions.map((e) => e._id);
    const tasks = await Task.find({ executionId: { $in: execIds } });
    const completed = tasks.filter((t) => t.status === 'completed').length;
    const failed = tasks.filter((t) => t.status === 'failed').length;
    const cancelled = tasks.filter((t) => t.status === 'cancelled' || t.status === 'skipped').length;
    const retried = tasks.filter((t) => (t.retryCount || 0) > 0).length;
    const total = tasks.length || 1;

    const [plan, verification, redTeam, reconciliation] = await Promise.all([
      DecisionPlan.findOne({ decisionId, status: { $in: ['validated', 'compiled'] } }),
      VerificationResult.countDocuments({ decisionId }),
      RedTeamFinding.countDocuments({ decisionId }),
      ReconciliationResult.findOne({ decisionId }),
    ]);

    const stats: ReasoningEvaluation['stats'] = {
      executions: executions.length,
      totalTasks: tasks.length,
      completedTasks: completed,
      failedTasks: failed,
      cancelledTasks: cancelled,
      retriedTasks: retried,
      hasPlan: Boolean(plan),
      planValidated: Boolean(plan && plan.status === 'validated'),
      hasVerification: verification > 0,
      hasRedTeam: redTeam > 0,
      hasReconciliation: Boolean(reconciliation),
      needsMoreResearch: reconciliation?.needsMoreResearch,
    };

    if (failed === 0 && tasks.length === 0) comments.push('No tasks recorded for the decision.');

    const parts: number[] = [];
    parts.push(completed / total);
    if (stats.hasPlan) parts.push(1);
    if (stats.planValidated) parts.push(1);
    if (stats.hasVerification) parts.push(1);
    if (stats.hasRedTeam) parts.push(1);
    if (stats.hasReconciliation) parts.push(1);
    const base = parts.length > 0 ? mean(parts) : 0;
    const penalty = 0.1 * failed + 0.05 * retried;
    const score = Math.max(0, Math.min(1, base - penalty));

    if (failed > 0) comments.push(`${failed} task(s) failed.`);
    if (retried > 0) comments.push(`${retried} task(s) required retries.`);

    return { enabled: true, applicable: true, score, stats, comments };
  }

  /**
   * Real-world outcome evaluation built on the Phase 8 outcome layer. Only an
   * explicit actual outcome makes this applicable; missing outcomes are never
   * penalized.
   */
  async evaluateOutcome(userId: string, decisionId: string): Promise<OutcomeEvaluation> {
    const signal: OutcomeEvaluationSignal = {
      hasExpected: false,
      hasActual: false,
      meaningfulComparisons: 0,
      achievedComparisons: 0,
      metricComparisons: [],
      outcomeConfirmed: false,
    };
    if (!decisionId || !decisionId.trim()) {
      return {
        enabled: true,
        applicable: false,
        signals: signal,
        notes: ['No decision referenced — outcome evaluation not applicable.'],
      };
    }
    const outcomes = await Outcome.find({ decisionId, userId }).sort({ createdAt: 1 });
    const notes: string[] = [];
    signal.hasExpected = outcomes.some((o) => o.kind === 'expected');
    signal.hasActual = outcomes.some((o) => o.kind === 'actual');

    if (!signal.hasActual) {
      return {
        enabled: true,
        applicable: false,
        signals: signal,
        notes: ['No actual outcome recorded — outcome evaluation not applicable.'],
      };
    }

    const { expectedVsActual } = outcomeService;
    const summary = await expectedVsActual(userId, decisionId);
    signal.expectedStatus = summary.expected?.status || signal.expectedStatus;
    signal.actualStatus = summary.actual?.status || signal.actualStatus;

    const latestActual = outcomes.filter((o) => o.kind === 'actual').pop();
    if (latestActual) {
      signal.outcomeConfirmed = latestActual.source === 'human';
      if (latestActual.status === 'success') signal.outcomeAchieved = true;
      else if (latestActual.status === 'failure') signal.outcomeAchieved = false;
    }

    signal.metricComparisons = summary.metricComparisons
      .filter((m) => m.meaningful)
      .map((m) => ({ metricName: m.metricName, achieved: m.achieved, meaningful: true }));
    signal.meaningfulComparisons = signal.metricComparisons.length;
    signal.achievedComparisons = signal.metricComparisons.filter((m) => m.achieved === true).length;

    const parts: number[] = [];
    if (summary.qualityComputed && signal.meaningfulComparisons > 0) {
      parts.push(signal.achievedComparisons / signal.meaningfulComparisons);
    }
    if (signal.outcomeAchieved !== undefined) {
      parts.push(signal.outcomeAchieved ? 1 : 0);
    }

    const applicable = signal.hasActual && parts.length > 0;
    const score = applicable ? mean(parts) : undefined;
    if (signal.outcomeAchieved === undefined && signal.meaningfulComparisons === 0) {
      notes.push('Actual outcome recorded without a success/failure status or metrics.');
    } else if (signal.outcomeAchieved === true) {
      notes.push('Actual outcome reached success.');
    } else if (signal.outcomeAchieved === false) {
      notes.push('Actual outcome was a failure.');
    }

    return { enabled: true, applicable, score, signals: signal, notes };
  }
}

export const qualityEvaluator = new QualityEvaluator();

/** Re-export the deterministic metric pairing so consumers keep one import path. */
export { pairMetrics } from '../memory/outcomeService';