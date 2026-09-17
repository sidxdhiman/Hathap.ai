import EvaluationRun, { IEvaluationRun } from '../models/EvaluationRun';
import EvaluationCaseResult from '../models/EvaluationCaseResult';
import Execution from '../models/Execution';
import { evaluationService } from './evaluationService';
import { benchmarkService } from './benchmarkService';
import { rubricService } from './rubricService';
import { emitEvaluationEvent } from './evaluationEvents';
import { sanitizeSignal } from './evaluationPolicy';
import { EvaluationValidationError } from './evaluationService';
import {
  CaseSnapshot,
  EvaluationArtifact,
  EvaluationCaseResultData,
  RubricSnapshot,
  SystemUnderTest,
} from './types';

/**
 * Phase 9 — EvaluationRunner.
 *
 * The bounded execution driver. Responsibilities:
 *   - Deterministic case ordering (benchmark insertion order).
 *   - Strict budgets: max cases, max wall-clock, per-case slice, bounded
 *     decision-engine wait.
 *   - Idempotency: re-executing a completed/failed run is a no-op; re-entry
 *     while running uses a lock; interrupted runs (stale lock) resume from the
 *     first unfinished case.
 *   - Failure isolation: one bad case never aborts the whole run — it becomes
 *     an `error` result and the run finishes as `partial`.
 *   - No chain-of-thought / no secrets: error messages are sanitized before
 *     they are stored.
 */

export const STALE_LOCK_MS = 5 * 60 * 1000;

export class EvaluationRunner {
  /**
   * Kick a run off in the background. Returns the persisted queued run — never
   * pretends execution already completed.
   */
  async startRun(userId: string, runId: string): Promise<IEvaluationRun> {
    const run = await evaluationService.getRun(userId, runId);
    if (!run) throw new EvaluationValidationError('Evaluation run not found.');
    if (run.status !== 'draft') {
      throw new EvaluationValidationError(`Run is in state "${run.status}" and cannot be started.`);
    }
    run.status = 'queued';
    await run.save();

    void this.executeRun(userId, runId).catch((err: any) => {
      console.error(`[EvaluationRunner] run ${runId} crashed`, err?.message || err);
    });
    return run;
  }

  /** Execute a run to completion synchronously (also used by tests). */
  async executeRun(userId: string, runId: string): Promise<IEvaluationRun> {
    const run = await EvaluationRun.findById(runId);
    if (!run) throw new EvaluationValidationError('Evaluation run not found.');
    if (String(run.userId) !== userId) {
      throw new EvaluationValidationError('Evaluation run not found.');
    }

    // Idempotency: terminal runs are not re-executed.
    if (['completed', 'failed', 'cancelled'].includes(run.status)) return run;

    // Single-flight: another caller is already running this run.
    if (
      run.status === 'running' &&
      run.lockedAt &&
      Date.now() - run.lockedAt.getTime() < STALE_LOCK_MS
    ) {
      throw new EvaluationValidationError('Evaluation run is already executing.');
    }

    await this.acquireLock(run);

    try {
      const cases = await benchmarkService.activeCases(String(run.benchmarkId), run.selectedCaseIds);
      const rubric: RubricSnapshot | null = run.rubricId
        ? await rubricService.getRubricSnapshot(userId, String(run.rubricId))
        : null;

      const snapshot = await evaluationService.toSnapshot(run);
      const deadline = Date.now() + run.limits.maxDurationMs;

      const existing = await EvaluationCaseResult.find({ runId: run._id });
      const done = new Set(existing.map((r) => String(r.caseId)));
      const sortedCases = cases
        .map((c): CaseSnapshot => ({
          caseId: String(c._id),
          title: c.title,
          version: c.version,
          prompt: c.prompt,
          expectedStructure: c.expectedStructure,
          providedAnswer: c.providedAnswer,
        }))
        .sort((a, b) => a.caseId.localeCompare(b.caseId));

      for (const caseDef of sortedCases) {
        const freshRun = await EvaluationRun.findById(run._id);
        if (!freshRun) break;
        if (freshRun.status === 'cancelled') break;

        if (done.has(caseDef.caseId)) continue;

        if (Date.now() > deadline) {
          await this.finalizeRun(run._id, 'partial', 'Run exceeded its time budget.');
          return (await EvaluationRun.findById(run._id)) as IEvaluationRun;
        }

        const sliceDeadline = Date.now() + freshRun.limits.maxSliceMs;
        try {
          const artifact = await this.resolveArtifact(userId, freshRun, caseDef, sliceDeadline);
          const data = await evaluationService.runCase({
            userId,
            run: snapshot,
            caseDef,
            artifact,
            rubric,
            limits: freshRun.limits,
          });
          await evaluationService.persistCaseResult(data);
          done.add(caseDef.caseId);
          await this.bumpProgress(run._id, data.status);
          emitEvaluationEvent({
            type: 'evaluation.run.case_completed',
            runId: String(run._id),
            userId,
            caseId: caseDef.caseId,
            decisionId: data.artifact?.decisionId,
            data: { status: data.status, score: data.metrics?.score ?? null },
          });
        } catch (err: any) {
          const message = sanitizeSignal(err?.message || 'Unknown evaluation error', 500);
          const errorData: EvaluationCaseResultData = {
            runId: String(run._id),
            userId,
            benchmarkId: String(freshRun.benchmarkId),
            caseId: caseDef.caseId,
            caseTitle: caseDef.title,
            caseVersion: caseDef.version,
            status: 'error',
            error: { message, phase: 'system' },
            startedAt: new Date(Date.now() - 1),
            completedAt: new Date(),
          };
          await evaluationService.persistCaseResult(errorData);
          done.add(caseDef.caseId);
          await this.bumpProgress(run._id, 'error');
          emitEvaluationEvent({
            type: 'evaluation.run.case_error',
            runId: String(run._id),
            userId,
            caseId: caseDef.caseId,
            data: { message },
          });
        }
      }

      const fresh = (await EvaluationRun.findById(run._id)) as IEvaluationRun;
      const status =
        fresh.progress.total > 0 &&
        fresh.progress.completed + fresh.progress.error >= fresh.progress.total
          ? fresh.progress.error === fresh.progress.total
            ? 'failed'
            : fresh.progress.error > 0
              ? 'partial'
              : 'completed'
          : 'partial';
      await this.finalizeRun(run._id, status);
      return (await EvaluationRun.findById(run._id)) as IEvaluationRun;
    } catch (err: any) {
      const message = sanitizeSignal(err?.message || 'Evaluation run failed.', 500);
      await this.finalizeRun(run._id, 'failed', message);
      return (await EvaluationRun.findById(run._id)) as IEvaluationRun;
    }
  }

  /** Resolve the artifact under evaluation for one case. */
  private async resolveArtifact(
    userId: string,
    run: IEvaluationRun,
    caseDef: CaseSnapshot,
    sliceDeadline: number
  ): Promise<EvaluationArtifact> {
    const sut: SystemUnderTest = run.systemUnderTest;

    if (sut.kind === 'decision-engine') {
      const artifact = await this.runDecisionEngine(userId, run, caseDef, sliceDeadline);
      if (!artifact) throw new Error('Decision-engine produced no evaluable artifact.');
      return artifact;
    }

    // static / external → evaluate the case's provided artifact.
    const artifact = evaluationService.artifactFromProvidedAnswer(caseDef.providedAnswer, caseDef.caseId);
    if (!artifact) {
      throw new Error(
        'Case has no artifact to evaluate. Provide "providedAnswer" for static runs, or use an "decision-engine" run to generate one.'
      );
    }
    return artifact;
  }

  /**
   * Provider-dependent path: create a real Hathap decision from the case prompt
   * and wait (bounded) for it to reach a terminal execution state.
   */
  private async runDecisionEngine(
    userId: string,
    run: IEvaluationRun,
    caseDef: CaseSnapshot,
    sliceDeadline: number
  ): Promise<EvaluationArtifact | null> {
    const deadline = Math.min(
      sliceDeadline,
      Date.now() + run.limits.maxDecisionWaitMs
    );
    const { decisionOrchestrator } = await import('../decision/orchestrator');
    const settings = run.systemUnderTest.decisionSettings || {};

    const decision = await decisionOrchestrator.createDecision({
      userId,
      title: caseDef.title || 'Evaluation case',
      objective: caseDef.prompt,
      context: caseDef.prompt,
      configuration: {
        verificationEnabled: settings.verificationEnabled ?? false,
      },
      metadata: {
        evaluationRunId: String(run._id),
        evaluationCaseId: caseDef.caseId,
      },
    });

    await decisionOrchestrator.startDecision(String(decision._id), userId, {
      planningMode: settings.planningMode || 'fixed',
      routingMode: settings.routingMode || 'auto',
      researchQueries: settings.researchQueries
        ? settings.researchQueries.map((q: string) => ({ query: q }))
        : [],
    });

    while (Date.now() < deadline) {
      const execution = await Execution.findOne({
        decisionId: decision._id,
      }).sort({ createdAt: -1 });
      if (execution && ['completed', 'failed', 'cancelled', 'partial'].includes(execution.status)) {
        if (execution.status === 'failed' || execution.status === 'cancelled') {
          throw new Error(`Decision execution ${execution.status}: ${execution.error?.message || 'no detail'}`);
        }
        return evaluationService.collectDecisionArtifact(userId, String(decision._id));
      }
      await new Promise((r) => setTimeout(r, 750));
    }

    // Cancelling an evaluation-created decision keeps it honest: it never
    // becomes persisted history masquerading as a finished decision.
    try {
      await decisionOrchestrator.cancelDecision(String(decision._id), userId);
    } catch {
      /* best-effort */
    }
    throw new Error('Decision-engine case exceeded its evaluation budget.');
  }

  private async acquireLock(run: IEvaluationRun): Promise<void> {
    run.status = 'running';
    run.lockedAt = new Date();
    run.lockedBy = `runner-${process.pid}-${Date.now()}`;
    run.startedAt = run.startedAt || new Date();
    run.error = undefined;
    await run.save();
    emitEvaluationEvent({
      type: 'evaluation.run.started',
      runId: String(run._id),
      userId: String(run.userId),
    });
  }

  private async bumpProgress(runId: unknown, status: string): Promise<void> {
    const inc: Record<string, number> =
      status === 'error' ? { 'progress.error': 1 } : { 'progress.completed': 1 };
    await EvaluationRun.updateOne({ _id: runId }, { $inc: inc });
  }

  private async finalizeRun(runId: unknown, status: 'completed' | 'failed' | 'partial' | 'cancelled', message?: string): Promise<void> {
    const update: Record<string, unknown> = {
      status,
      lockedAt: undefined,
      lockedBy: undefined,
      completedAt: status === 'completed' || status === 'failed' || status === 'partial' ? new Date() : undefined,
    };
    if (message) update.error = { message };
    await EvaluationRun.updateOne({ _id: runId }, { $set: update });
    emitEvaluationEvent({
      type:
        status === 'completed'
          ? 'evaluation.run.completed'
          : status === 'failed'
            ? 'evaluation.run.failed'
            : status === 'partial'
              ? 'evaluation.run.partial'
              : 'evaluation.run.cancelled',
      runId: String(runId),
      data: { status, message },
    });
  }
}

export const evaluationRunner = new EvaluationRunner();