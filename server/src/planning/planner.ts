import Model, { IModel } from '../models/Model';
import Execution from '../models/Execution';
import ExecutionPlan from '../models/DecisionPlan';
import { callLLM } from '../engine/llmClient';
import { executionEventBus } from '../decision/eventBus';
import { aggregateUsage } from '../decision/usage';
import { TokenUsage } from '../decision/types';
import {
  DecisionPlan,
  PlanContext,
  PlanCallFunction,
  PlanSource,
  PlannerProvenance,
  PlanningMode,
} from './planTypes';
import { PlanningPolicy, makePlanningPolicy, estimatePlanSize } from './planningPolicy';
import { validatePlan } from './planValidator';
import { buildFallbackPlan } from './fallbackPlanner';
import { planCompiler, CompiledPlanResult } from './planCompiler';
import { IExecution } from '../models/Execution';

export interface PlanExecutionOptions {
  executionId: string;
  userId: string;
  planningMode: PlanningMode;
  researchQueries?: string[];
  /** Inject a planner call for tests. Defaults to the real LLM planner. */
  planCall?: PlanCallFunction;
  policy?: PlanningPolicy;
}

export interface PlanExecutionResult {
  executionId: string;
  plan: DecisionPlan;
  planSource: PlanSource;
  plannerModel?: string;
  compiled: CompiledPlanResult;
  retriesUsed: number;
  reusedExisting: boolean;
}

export class PlanningError extends Error {
  constructor(
    public code: 'PLAN_REJECTED' | 'PLAN_NOT_POSSIBLE' | 'NO_MODEL',
    message: string
  ) {
    super(message);
    this.name = 'PlanningError';
  }
}

/**
 * Phase 5 — DecisionPlanner.
 *
 * Orchestrates one planning run for an execution:
 *
 *   build context → (LLM propose → parse → validate)* bounded → fallback
 *   → persist plan → compile real tasks.
 *
 * Guarantees:
 *   - Never blocks forever: each attempt is timeout-capped, attempts are
 *     bounded by `maxPlanningRetries`, and a deterministic fallback always
 *     exists when the intelligent attempt fails or is rejected.
 *   - An invalid proposal is NEVER executed — the validator gates compilation.
 *   - Re-entry is idempotent per execution (one plan per execution).
 *   - Planner usage flows through the existing usage accounting on the
 *     Execution (no separate ledger, no API keys stored).
 */
export class DecisionPlanner {
  private readonly policy: PlanningPolicy;
  private readonly injectedPlanCall?: PlanCallFunction;

  constructor(options: { planCall?: PlanCallFunction; policy?: PlanningPolicy } = {}) {
    this.policy = makePlanningPolicy(options.policy);
    this.injectedPlanCall = options.planCall;
  }

  async planExecution(options: PlanExecutionOptions): Promise<PlanExecutionResult> {
    const execution = await Execution.findById(options.executionId);
    if (!execution) {
      throw new PlanningError('PLAN_NOT_POSSIBLE', 'Execution not found.');
    }

    const decisionId = String(execution.decisionId);

    // Idempotency: an execution that already reached `planned` with a compiled
    // plan does not get planned again.
    const existing = await this.tryResumeExisting(execution);
    if (existing) return existing;

    const startedAt = Date.now();
    executionEventBus.emit({
      type: 'planning.started',
      executionId: String(execution._id),
      decisionId,
      data: { mode: options.planningMode },
    });

    const context = await this.buildContext(execution, options);
    const { plannerModel, provenance } = await this.buildProvenance(execution, options);

    const planCall =
      options.planCall || this.injectedPlanCall || this.buildRealPlanCall(options.userId);
    const canAttemptIntelligent = !!(options.planCall || this.injectedPlanCall || provenance.plannerModel);
    let accepted: DecisionPlan | null = null;
    let fallback: DecisionPlan | null = null;
    let retriesUsed = 0;
    const usageRecords: TokenUsage[] = [];

    if (options.planningMode === 'intelligent' && canAttemptIntelligent) {
      let attempts = 0;
      const maxAttempts = 1 + this.policy.maxPlanningRetries;

      while (attempts < maxAttempts && !accepted) {
        attempts++;
        const attempt = await this.runAttempt(
          context,
          provenance,
          planCall,
          this.policy.planningTimeoutMs
        );

        if (!attempt.ok) {
          executionEventBus.emit({
            type: 'planning.failed',
            executionId: String(execution._id),
            decisionId,
            data: { attempt: attempts, error: attempt.error, retryable: attempt.retryable },
          });
          // Provider unavailability should fall back immediately; only
          // retryable blips get extra attempts.
          if (attempt.retryable && attempts < maxAttempts) {
            retriesUsed = attempts;
            continue;
          }
          retriesUsed = attempts;
          break;
        }

        retriesUsed = attempts - 1;
        let parsed: unknown;
        try {
          parsed = this.parseProposal(attempt.text);
        } catch (err: any) {
          executionEventBus.emit({
            type: 'plan.rejected',
            executionId: String(execution._id),
            decisionId,
            data: {
              attempt: attempts,
              errors: [err?.message || 'Planner output was not valid JSON.'],
              plannerModel: provenance.plannerModel,
            },
          });
          if (attempts >= maxAttempts) break;
          continue;
        }
        const validation = validatePlan(parsed, { policy: this.policy });

        if (validation.valid && validation.plan) {
          accepted = validation.plan;
          executionEventBus.emit({
            type: 'plan.validated',
            executionId: String(execution._id),
            decisionId,
            data: {
              source: 'intelligent',
              taskCount: validation.plan.tasks.length,
              plannerModel: provenance.plannerModel,
            },
          });
        } else {
          executionEventBus.emit({
            type: 'plan.rejected',
            executionId: String(execution._id),
            decisionId,
            data: {
              attempt: attempts,
              errors: validation.errors.slice(0, 10),
              plannerModel: provenance.plannerModel,
            },
          });
          if (attempts >= maxAttempts) break;
        }
      }
    } else if (options.planningMode === 'intelligent') {
      executionEventBus.emit({
        type: 'planning.failed',
        executionId: String(execution._id),
        decisionId,
        data: { error: 'No enabled model available for the intelligent planner.', retryable: false },
      });
    }

    if (!accepted) {
      fallback = buildFallbackPlan(context, {
        planSource: provenance.plannerModel ? 'fallback' : 'baseline',
        researchQueries: options.researchQueries,
        policy: this.policy,
      });
      const fallbackValidation = validatePlan(fallback, { policy: this.policy });
      if (!fallbackValidation.valid || !fallbackValidation.plan) {
        await this.failPlanning(
          execution,
          {
            code: 'PLAN_NOT_POSSIBLE',
            message: `Fallback plan itself failed validation: ${fallbackValidation.errors.join('; ')}`,
            reason: 'fallback-validation-failed',
          },
          usageRecords,
          startedAt
        );
        throw new PlanningError(
          'PLAN_NOT_POSSIBLE',
          `No valid plan could be produced. ${fallbackValidation.errors.join('; ')}`
        );
      }
      accepted = fallbackValidation.plan;
      executionEventBus.emit({
        type: 'plan.validated',
        executionId: String(execution._id),
        decisionId,
        data: { source: accepted.source, taskCount: accepted.tasks.length, fallback: true },
      });
    }

    // Persist + compile. The compiler is idempotent; if a crash left a plan
    // or tasks behind, it resumes rather than duplicating the graph.
    const compiled = await planCompiler.compile({
      execution,
      plan: accepted,
      planningMode: options.planningMode,
      policy: this.policy,
      plannerModel: provenance.plannerModel,
    });

    if (compiled.persistedPlan) {
      await Execution.updateOne(
        { _id: execution._id },
        {
          $set: {
            planningStatus: 'planned',
            planId: compiled.persistedPlan._id,
            planningMode: options.planningMode,
            planningStartedAt: new Date(startedAt),
            planningCompletedAt: new Date(),
            metadata: {
              ...(execution.metadata || {}),
              plannerModel: provenance.plannerModel,
              planVersion: accepted.version,
              planSource: accepted.source,
            },
          },
        }
      );
    }

    executionEventBus.emit({
      type: 'plan.compiled',
      executionId: String(execution._id),
      decisionId,
      data: {
        source: accepted.source,
        planId: compiled.persistedPlan?._id?.toString(),
        taskCount: compiled.taskIds.length,
        plannerModel: provenance.plannerModel,
        durationMs: Date.now() - startedAt,
      },
    });
    executionEventBus.emit({
      type: 'planning.completed',
      executionId: String(execution._id),
      decisionId,
      data: {
        mode: options.planningMode,
        status: 'planned',
        plannerModel: provenance.plannerModel,
        taskCount: compiled.taskIds.length,
        durationMs: Date.now() - startedAt,
      },
    });

    return {
      executionId: String(execution._id),
      plan: accepted,
      planSource: accepted.source,
      plannerModel: provenance.plannerModel,
      compiled,
      retriesUsed,
      reusedExisting: false,
    };
  }

  private async tryResumeExisting(
    execution: IExecution
  ): Promise<PlanExecutionResult | null> {
    const exec = execution as IExecution & { planningStatus?: string; planId?: string };
    if (exec.planningStatus === 'planned' && exec.planId) {
      const plan = await ExecutionPlan.findOne({ executionId: String(execution._id) });
      if (plan && (plan.status === 'validated' || plan.status === 'compiled')) {
        const compiled = await planCompiler.compile({
          execution,
          plan: this.persistedToPlan(plan),
          planningMode: (exec.planningMode as PlanningMode) || 'intelligent',
          policy: this.policy,
        });
        return {
          executionId: String(execution._id),
          plan: this.persistedToPlan(plan),
          planSource: plan.source,
          plannerModel: plan.plannerModel,
          compiled,
          retriesUsed: 0,
          reusedExisting: true,
        };
      }
    }
    return null;
  }

  private persistedToPlan(doc: any): DecisionPlan {
    return {
      version: doc.version,
      source: doc.source,
      tasks: doc.tasks as DecisionPlan['tasks'],
      termination: doc.termination,
      rationale: doc.rationale,
      estimates: doc.estimates || { estimatedTasks: 0, estimatedResearchTasks: 0, estimatedLLMTasks: 0 },
    };
  }

  private async runAttempt(
    context: PlanContext,
    provenance: PlannerProvenance,
    planCall: PlanCallFunction,
    timeoutMs: number
  ): Promise<Awaited<ReturnType<PlanCallFunction>>> {
    let timer: NodeJS.Timeout | undefined;
    const withTimeout = new Promise<Awaited<ReturnType<PlanCallFunction>>>((resolve) => {
      timer = setTimeout(() => {
        resolve({ ok: false, error: `Planning attempt timed out after ${timeoutMs}ms.`, retryable: true });
      }, timeoutMs);
    });

    try {
      const outcome = await Promise.race([
        planCall({ context, provenance }),
        withTimeout,
      ]);
      return outcome;
    } catch (err: any) {
      return { ok: false, error: err?.message || 'Planning call failed.', retryable: true };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private parseProposal(text: string): unknown {
    try {
      return JSON.parse(text);
    } catch {
      // The model may wrap JSON in code fences or prose. Extract the first
      // balanced object as a last resort.
      const match = text.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]);
      throw new Error('Planner output was not valid JSON.');
    }
  }

  private async failPlanning(
    execution: IExecution,
    failure: { code: string; message: string; reason: string },
    usageRecords: TokenUsage[],
    startedAt: number
  ): Promise<void> {
    await this.recordUsage(execution, usageRecords);
    await Execution.updateOne(
      { _id: execution._id },
      {
        $set: {
          planningStatus: 'failed',
          planningMode: 'intelligent',
          status: 'failed',
          error: {
            code: failure.code as any,
            message: failure.message,
            retryable: false,
            createdAt: new Date(),
          },
          completedAt: new Date(),
        },
      }
    );
    executionEventBus.emit({
      type: 'planning.failed',
      executionId: String(execution._id),
      decisionId: String(execution.decisionId),
      data: { error: failure.message, reason: failure.reason, durationMs: Date.now() - startedAt },
    });
  }

  private async recordUsage(execution: IExecution, records: TokenUsage[]): Promise<void> {
    if (!records.length) return;
    const agg = aggregateUsage(records);
    const current = execution.tokenUsage || { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCost: 0 };
    const newCost = (current.estimatedCost || 0) + agg.estimatedCost;
    await Execution.updateOne(
      { _id: execution._id },
      {
        $set: {
          tokenUsage: {
            inputTokens: (current.inputTokens || 0) + agg.inputTokens,
            outputTokens: (current.outputTokens || 0) + agg.outputTokens,
            totalTokens: (current.totalTokens || 0) + agg.totalTokens,
            estimatedCost: newCost,
            model: agg.model || current.model,
            provider: agg.provider || current.provider,
          },
          estimatedCost: newCost,
          actualCost: newCost,
        },
      }
    );
    execution.tokenUsage = (execution.tokenUsage as any) || {};
  }

  private async buildContext(
    execution: IExecution,
    options: PlanExecutionOptions
  ): Promise<PlanContext> {
    const Decision = (await import('../models/Decision')).default;
    const Evidence = (await import('../models/Evidence')).default;
    const Claim = (await import('../models/Claim')).default;

    const decision = await Decision.findById(execution.decisionId);
    const evidence = await Evidence.find({ decisionId: String(execution.decisionId) })
      .select('title sourceReliability relevanceScore')
      .sort({ createdAt: 1 })
      .limit(20);
    const claimCount = await Claim.countDocuments({ decisionId: String(execution.decisionId) });

    const participantCaps = (decision?.participants || [])
      .map((p: any) => p?.capabilities || p?.capability || [])
      .flat()
      .filter((c: any) => typeof c === 'string');

    const existingEvidence = evidence.map((e: any) => ({
      id: e._id.toString(),
      title: e.title,
      sourceReliability: e.sourceReliability,
    }));

    return {
      decisionId: String(execution.decisionId),
      objective: decision?.objective || '',
      description: decision?.context || undefined,
      constraints: Array.isArray(decision?.assumptions) ? decision.assumptions : undefined,
      existingEvidence,
      existingClaimCount: claimCount,
      availableCapabilities: participantCaps.length > 0 ? participantCaps : undefined,
      researchQueries: options.researchQueries,
    };
  }

  private async buildProvenance(
    execution: IExecution,
    options: PlanExecutionOptions
  ): Promise<{ plannerModel: string | undefined; provenance: PlannerProvenance }> {
    // Deterministic planner model selection: first-enabled model.
    let plannerModel: string | undefined;
    if (options.planningMode === 'intelligent') {
      const model = await Model.find({ userId: options.userId, enabled: true })
        .sort({ createdAt: 1 })
        .limit(1);
      plannerModel = model[0]?.modelName || model[0]?.displayName || undefined;
    }
    return {
      plannerModel,
      provenance: {
        plannerModel: plannerModel || '',
        plannerVersion: 'planner-v1',
        planVersion: 1,
        decisionId: String(execution.decisionId),
        executionId: String(execution._id),
        createdAt: new Date(),
      },
    };
  }

  /**
   * Default planner call: a dedicated strict-JSON, system-prompts-only call to
   * the user's first-enabled model. Records usage via `onUsage`, which the
   * planner aggregates into the Execution token ledger. No credentials are
   * passed into the prompt and no chain-of-thought is requested or stored.
   */
  private buildRealPlanCall(userId: string): PlanCallFunction {
    return async (input: { context: PlanContext; provenance: PlannerProvenance }) => {
      const model = await Model.find({ userId, enabled: true }).sort({ createdAt: 1 }).limit(1);
      const m = model[0];
      if (!m) {
        return { ok: false, error: 'No enabled model configured for planning.', retryable: false };
      }

      const usageRecords: TokenUsage[] = [];

      try {
        const system = this.buildPlannerSystemPrompt();
        const user = JSON.stringify(input.context, null, 2);
        const text = await callLLM(m, [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ], {
          responseFormatJson: true,
          maxTokens: 1600,
          onUsage: (usage) => usageRecords.push(usage),
        });
        // Push planner usage into the execution ledger immediately.
        const exec = await Execution.findById(input.provenance.executionId);
        if (exec) await this.recordUsage(exec, usageRecords);
        return { ok: true, text };
      } catch (err: any) {
        return { ok: false, error: err?.message || 'Planner call failed.', retryable: true };
      }
    };
  }

  private buildPlannerSystemPrompt(): string {
    return [
      'You are the intelligent decision planner for Hathap.AI.',
      'You analyze ONE decision and propose a plan as strict JSON. You never run tools, never reference databases, never use URLs, never emit code or shell commands, and never refer to credentials.',
      '',
      'Output exactly one JSON object matching this schema:',
      JSON.stringify({
        version: '1.0',
        tasks: [{
          tempId: 'string (unique, e.g. research-1, debate)',
          type: 'research | debate',
          purpose: 'One line explaining why this task exists',
          input: {
            research: { query: 'the search query', purpose: 'background|fact_check|market_research|technical_research|competitive_research|custom', maxResults: 'integer 1-12' },
            debate: { strategy: 'consensus|majority|devils_advocate|judge|open', description: 'what to weigh in the debate' },
          },
          dependsOn: ['tempIds this task depends on'],
          priority: 'optional integer',
          requirements: ['optional known capability, e.g. financial_analysis, technical_analysis, legal_analysis, security_review'],
        }],
        termination: {
          requiresVerification: true,
          requiresRedTeam: true,
          requiresReconciliation: true,
        },
        rationale: {
          summary: '1-2 sentences',
          research: 'how many research tasks and why',
          debate: 'why debate is needed',
          verification: 'why verification on/off',
          redTeam: 'why red team on/off',
        },
      }, null, 2),
      '',
      'Rules:',
      '- ONLY research and debate tasks may be proposed. Verification, red team and reconciliation are scheduled automatically based on the termination flags.',
      '- Skip unnecessary work: a simple decision may omit research and set verification/redTeam false. Never pad the plan with busywork.',
      '- Research tasks must be independent (no dependencies between them) and run in parallel.',
      '- The debate depends on any research tasks.',
      '- Do not exceed 5 research tasks, 12 tasks total, or 60 total maxResults.',
      '- research purpose must be one of: background, fact_check, market_research, technical_research, competitive_research, custom.',
      '- A concise rationale explains WHY this plan was chosen. Never reveal private chain-of-thought; the rationale is what users and auditors see.',
      '- Respond with the JSON object only.',
    ].join('\n');
  }
}

export const decisionPlanner = new DecisionPlanner();