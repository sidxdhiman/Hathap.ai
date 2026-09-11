import Decision, { IDecision } from '../models/Decision';
import Execution from '../models/Execution';
import Task from '../models/Task';
import Claim from '../models/Claim';
import Evidence from '../models/Evidence';
import ReconciliationResult from '../models/ReconciliationResult';
import DecisionPlan from '../models/DecisionPlan';
import DecisionMemory, { IDecisionMemory } from '../models/DecisionMemory';
import Outcome, { IOutcome } from '../models/Outcome';
import DecisionFeedback, { IDecisionFeedback } from '../models/DecisionFeedback';
import DecisionLesson, { IDecisionLesson } from '../models/DecisionLesson';
import VerificationResult from '../models/VerificationResult';
import { executionEventBus } from '../decision/eventBus';
import {
  DecisionQualitySignals,
  MemoryCreatedVia,
  MemoryLifecycleStatus,
  MemoryRecommendationSource,
} from './types';

const MAX_IMPORTANT_CLAIMS = 12;
const MAX_IMPORTANT_EVIDENCE = 12;
const MAX_AGENTS = 20;
const MAX_MODELS = 20;
const MAX_EXECUTIONS = 20;

/**
 * Phase 8 — DecisionMemoryService.
 *
 * Builds and maintains the structured memory index for one decision. Memory is
 * an index + historical interpretation over the existing execution graph; it
 * intentionally reuses references (claim/evidence/plan ids) instead of copying
 * large content.
 *
 * No LLM is used here. Categories, tags, domains and recommendations are either
 * copied verbatim from persisted data or explicitly marked as unknown — memory
 * never invents meaning.
 */
export class DecisionMemoryService {
  async find(decisionId: string, userId: string): Promise<IDecisionMemory | null> {
    return DecisionMemory.findOne({ decisionId, userId });
  }

  /**
   * Idempotently create or refresh memory for a decision. The lifecycle status
   * is derived from the decision's own status; a draft/in-progress decision is
   * stored as `active` and is NOT retrievable as finished history by default.
   */
  async createForDecision(
    decisionId: string,
    userId: string,
    opts: { via?: MemoryCreatedVia } = {}
  ): Promise<IDecisionMemory | null> {
    const decision = await Decision.findOne({ _id: decisionId, userId });
    if (!decision) return null;

    const [reconciliation, plan, executions] = await Promise.all([
      ReconciliationResult.findOne({ decisionId }).sort({ createdAt: -1 }),
      DecisionPlan.findOne({ decisionId, status: { $in: ['validated', 'compiled'] } }).sort({
        createdAt: -1,
      }),
      Execution.find({ decisionId }).sort({ createdAt: -1 }).limit(MAX_EXECUTIONS),
    ]);

    const importantClaimIds = await this.collectImportantClaims(decisionId, reconciliation);
    const importantEvidenceIds = await this.collectImportantEvidence(
      decisionId,
      importantClaimIds,
      reconciliation
    );
    const { agentsUsed, modelsUsed, executionIds } =
      await this.collectAgentsAndModels(executions, decision);

    const status = this.lifecycleFor(decision.status);

    const payload = {
      userId,
      decisionId,
      status,
      title: decision.title,
      objective: decision.objective,
      category: this.optionalString(decision.metadata?.category),
      domain: this.optionalString(decision.metadata?.domain),
      problemType: this.optionalString(decision.metadata?.problemType),
      tags: this.stringArray(decision.metadata?.tags),
      entities: this.stringArray(decision.metadata?.entities),
      finalRecommendation: reconciliation?.recommendation || decision.metadata?.finalRecommendation,
      recommendationSource: this.recommendationSourceFor((reconciliation?.recommendation as string | undefined), decision),
      selectedPlanId: plan?._id,
      importantClaimIds,
      importantEvidenceIds,
      agentsUsed,
      modelsUsed,
      executionIds,
      completedAt: decision.completedAt || decision.updatedAt,
      createdVia: opts.via || 'on-demand',
      metadata: {
        decisionStatus: decision.status,
        reconciledNeedsMoreResearch: reconciliation?.needsMoreResearch ?? undefined,
      },
    };

    const existing = await DecisionMemory.findOne({ decisionId, userId });
    let saved: IDecisionMemory;
    if (existing) {
      existing.set(payload);
      saved = await existing.save();
    } else {
      saved = await DecisionMemory.create(payload);
      executionEventBus.emit({
        type: 'memory.created',
        decisionId,
        data: {
          memoryId: saved._id.toString(),
          status: saved.status,
          category: saved.category || null,
          hasRecommendation: Boolean(saved.finalRecommendation),
        },
      });
    }
    return saved;
  }

  /**
   * On-demand memory: return existing, or build lazily for a decision that has
   * reached a terminal state. Non-terminal decisions return null — memory cannot
   * be fabricated for an in-flight decision.
   */
  async ensureMemory(decisionId: string, userId: string): Promise<IDecisionMemory | null> {
    const existing = await this.find(decisionId, userId);
    if (existing) return existing;
    const decision = await Decision.findOne({ _id: decisionId, userId });
    if (!decision) return null;
    if (!this.isTerminal(decision.status)) return null;
    return this.createForDecision(decisionId, userId, { via: 'on-demand' });
  }

  async lifecycleStatus(decisionId: string, userId: string): Promise<MemoryLifecycleStatus | null> {
    const existing = await this.find(decisionId, userId);
    if (existing) return existing.status;
    const decision = await Decision.findOne({ _id: decisionId, userId });
    if (!decision) return null;
    return this.lifecycleFor(decision.status);
  }

  // ---- quality signals (data foundation for Phase 9) ----

  async getDecisionQuality(decisionId: string, userId: string): Promise<DecisionQualitySignals> {
    const [feedback, outcomes, reconciliation, decision] = await Promise.all([
      DecisionFeedback.findOne({ decisionId, userId }),
      Outcome.find({ decisionId, userId }).sort({ createdAt: 1 }),
      ReconciliationResult.findOne({ decisionId }),
      Decision.findOne({ _id: decisionId, userId }),
    ]);
    const latestActual = outcomes.filter((o) => o.kind === 'actual').pop() as IOutcome | undefined;
    const expected = outcomes.find((o) => o.kind === 'expected');

    const { evidenceCount, claimCount } = await this.counts(decisionId);

    return {
      recommendationAccepted: feedback
        ? feedback.recommendationStatus === 'accepted' || feedback.recommendationStatus === 'modified'
        : undefined,
      outcomeAchieved: latestActual
        ? this.outcomeAchieved(latestActual)
        : undefined,
      expectedVsActualComputed: Boolean(expected && latestActual),
      outcomeConfirmed: Boolean(latestActual && latestActual.source === 'human'),
      hasHumanFeedback: Boolean(feedback),
      evidenceCompleteness: {
        hasEvidence: evidenceCount > 0,
        hasClaims: claimCount > 0,
        hasVerifications: (await VerificationResult.countDocuments({ decisionId })) > 0,
        hasReconciliation: Boolean(reconciliation),
        verificationStatusPresent: Boolean(await VerificationResult.countDocuments({ decisionId })),
      },
      recommendationKnown: Boolean(reconciliation?.recommendation || decision?.metadata?.finalRecommendation),
    };
  }

  private outcomeAchieved(outcome: IOutcome): boolean | undefined {
    // Only explicit success/failure read as achieved/not — partial, unknown,
    // pending and cancelled remain undefined (honest uncertainty).
    if (outcome.status === 'success') return true;
    if (outcome.status === 'failure') return false;
    return undefined;
  }

  // ---- internals ----

  private isTerminal(status: string): boolean {
    return status === 'completed' || status === 'cancelled' || status === 'failed';
  }

  private lifecycleFor(decisionStatus: string): MemoryLifecycleStatus {
    switch (decisionStatus) {
      case 'completed':
        return 'completed';
      case 'cancelled':
        return 'cancelled';
      case 'failed':
        return 'failed';
      default:
        return 'active';
    }
  }

  private optionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private stringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((v): v is string => typeof v === 'string').slice(0, 30);
  }

  private recommendationSourceFor(
    reconciliationRecommendation: string | undefined,
    decision: IDecision
  ): MemoryRecommendationSource {
    if (reconciliationRecommendation) return 'reconciliation';
    if (decision.metadata?.linkedFromCourtroom) return 'courtroom';
    return 'none';
  }

  private async collectImportantClaims(
    decisionId: string,
    reconciliation: { survivingClaimIds?: string[]; uncertainClaimIds?: string[] } | null
  ): Promise<string[]> {
    const preferred: string[] = [];
    if (reconciliation?.survivingClaimIds?.length) preferred.push(...reconciliation.survivingClaimIds);
    if (reconciliation?.uncertainClaimIds?.length) preferred.push(...reconciliation.uncertainClaimIds);
    if (preferred.length) return preferred.slice(0, MAX_IMPORTANT_CLAIMS);

    const claims = await Claim.find({ decisionId, status: { $in: ['accepted', 'verified'] } })
      .sort({ createdAt: 1 })
      .limit(MAX_IMPORTANT_CLAIMS);
    return claims.map((c) => String(c._id));
  }

  private async collectImportantEvidence(
    decisionId: string,
    claimIds: string[],
    reconciliation: { survivingClaimIds?: string[] } | null
  ): Promise<string[]> {
    const ids = new Set<string>();
    if (claimIds.length) {
      const claims = await Claim.find({ _id: { $in: claimIds } }).select('evidenceIds supportingEvidenceIds');
      for (const c of claims) {
        for (const eid of [...(c.evidenceIds || []), ...(c.supportingEvidenceIds || [])]) {
          if (ids.size < MAX_IMPORTANT_EVIDENCE) ids.add(String(eid));
        }
      }
    }
    if (ids.size < MAX_IMPORTANT_EVIDENCE) {
      const related = await Evidence.find({ decisionId })
        .sort({ relevanceScore: -1, createdAt: 1 })
        .limit(MAX_IMPORTANT_EVIDENCE - ids.size);
      for (const e of related) ids.add(String(e._id));
    }
    return [...ids];
  }

  private async collectAgentsAndModels(
    executions: any[],
    decision: { participants?: any[]; metadata?: Record<string, unknown> }
  ): Promise<{ agentsUsed: string[]; modelsUsed: string[]; executionIds: string[] }> {
    const agents = new Set<string>();
    const models = new Set<string>();
    const executionIds: string[] = [];

    for (const p of decision.participants || []) {
      const name = p?.name || p?.agentName || p?.role;
      if (typeof name === 'string' && name) agents.add(name);
    }

    const plannerModel = this.optionalString(decision.metadata?.plannerModel);
    if (plannerModel) models.add(plannerModel);

    for (const e of executions) {
      if (executionIds.length < MAX_EXECUTIONS) executionIds.push(String(e._id));
      if (e.tokenUsage?.model) models.add(String(e.tokenUsage.model));
      if (e.metadata?.plannerModel) models.add(String(e.metadata.plannerModel));
      if (e.metadata?.courtroomId && !agents.size) agents.add('courtroom');
    }

    const taskIdsByExec = await Task.find({
      executionId: { $in: executions.map((e) => e._id) },
    })
      .select('assignedAgent assignedModel metadata')
      .limit(200);
    for (const t of taskIdsByExec) {
      if (t.assignedAgent) agents.add(String(t.assignedAgent));
      if (t.assignedModel) models.add(String(t.assignedModel));
      const routingModel = (t.metadata?.routing as any)?.selection?.model?.modelName;
      if (routingModel) models.add(String(routingModel));
    }

    return {
      agentsUsed: [...agents].slice(0, MAX_AGENTS),
      modelsUsed: [...models].slice(0, MAX_MODELS),
      executionIds,
    };
  }

  private async counts(decisionId: string): Promise<{ evidenceCount: number; claimCount: number }> {
    const [evidenceCount, claimCount] = await Promise.all([
      Evidence.countDocuments({ decisionId }),
      Claim.countDocuments({ decisionId }),
    ]);
    return { evidenceCount, claimCount };
  }
}

export const decisionMemoryService = new DecisionMemoryService();