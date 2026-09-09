import {
  TaskHandler,
  TaskHandlerContext,
  TaskHandlerResult,
} from '../../decision/types';
import { researchService } from '../../research/researchService';
import { persistClaimsFromMessages } from '../../decision/claimPersistence';
import { evidenceGraphService } from '../../decision/evidenceGraphService';
import Task from '../../models/Task';
import Claim from '../../models/Claim';
import Evidence from '../../models/Evidence';

/**
 * Phase 4 — deterministic claim selection for verification.
 *
 * We do NOT verify every string in the system. We prioritize:
 *   1. factual claims
 *   2. high-impact claims
 *   3. claims directly supporting the recommendation
 *   4. claims with evidence
 *   5. assumptions
 *
 * This simple deterministic selection avoids wasting compute on trivial prose.
 * Returns at most `maxClaims` claim documents.
 */
export async function selectClaimsForVerification(
  decisionId: string,
  maxClaims = 8
): Promise<Array<{ id: string; text: string; type: string; evidenceIds: string[] }>> {
  const claims = await Claim.find({ decisionId }).sort({ createdAt: 1 });

  const scored = claims
    .map((c) => {
      let score = 0;
      if (c.type === 'fact') score += 5;
      if (c.type === 'assumption') score += 4;
      if (c.type === 'recommendation') score += 3;
      if (c.type === 'inference') score += 2;
      if ((c.evidenceIds as string[] || []).length > 0) score += 2;
      return { claim: c, score };
    })
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, maxClaims).map((s) => ({
    id: s.claim._id.toString(),
    text: s.claim.text,
    type: s.claim.type,
    evidenceIds: s.claim.evidenceIds as string[] || [],
  }));
}

/**
 * Schedule the Phase 4 downstream task graph after the debate produces a
 * candidate verdict:
 *
 *   Candidate Verdict
 *        │
 *   ┌────┴────┐
 *   ▼         ▼
 * Verify   Red Team
 *   │         │
 *   └────┬────┘
 *        ▼
 * Reconciliation
 *
 * All tasks are real persisted Task documents with real dependency IDs
 * controlled by the Phase 2 scheduler. Verification and Red Team run in
 * parallel; Reconciliation depends on all of them.
 */
export async function schedulePhase4DownstreamTasks(
  context: TaskHandlerContext,
  result: any,
  decision: any
): Promise<Record<string, unknown>>;
export async function schedulePhase4DownstreamTasks(
  context: TaskHandlerContext,
  result: any,
  decision: any,
  options?: { verify: boolean; redTeam: boolean; reconciliation: boolean }
): Promise<Record<string, unknown>>;
/**
 * Schedule the Phase 4 downstream task graph after the debate produces a
 * candidate verdict:
 *
 *   Candidate Verdict
 *        │
 *   ┌────┴────┐
 *   ▼         ▼
 *   Verify   Red Team
 *   │         │
 *   └────┬────┘
 *        ▼
 *   Reconciliation
 *
 * All tasks are real persisted Task documents with real dependency IDs
 * controlled by the Phase 2 scheduler. Verification and Red Team run in
 * parallel; Reconciliation depends on all of them.
 *
 * Phase 5: when called from the intelligent planner path, the plan's
 * termination flags decide which stages actually run. A simple decision may
 * skip verification/red team and go straight to reconciliation, or stop at the
 * debate entirely.
 */
export async function schedulePhase4DownstreamTasks(
  context: TaskHandlerContext,
  result: any,
  decision: any,
  options?: { verify: boolean; redTeam: boolean; reconciliation: boolean }
): Promise<Record<string, unknown>> {
  const verify = options?.verify ?? true;
  const redTeam = options?.redTeam ?? true;
  const reconciliation = options?.reconciliation ?? true;
  const debateTaskId = context.taskId;

  const claims = await Claim.find({ decisionId: context.decisionId });
  const evidence = await Evidence.find({ decisionId: context.decisionId });

  const claimIdStrs = claims.map((c) => c._id.toString());
  const allEvidenceIds = evidence.map((e) => e._id.toString());

  const selectedClaims = await selectClaimsForVerification(context.decisionId, 8);

  const candidateRecommendation =
    result?.verdict?.recommendation || 'Further analysis needed.';

  const selectedClaimIds = selectedClaims.map((c) => c.id);

  const verifyClaimTaskIds: string[] = [];

  // 1. Verification tasks (one per selected claim, parallel). Skipped when the
  //    plan does not require verification.
  if (verify) {
    for (const claim of selectedClaims) {
      const vcTask = await Task.create({
        executionId: context.executionId,
        type: 'verify_claim',
        status: 'pending',
        priority: 5,
        input: {
          claimId: claim.id,
          claimStatement: claim.text,
          evidenceIds: (claim.evidenceIds || []).length > 0
            ? claim.evidenceIds
            : allEvidenceIds.slice(0, 3),
          decisionId: context.decisionId,
          executionId: context.executionId,
          verificationMode: 'evidence',
        },
        dependencies: [debateTaskId],
        metadata: {
          description: `Verify claim: ${claim.text.slice(0, 80)}`,
          phase: 'verification',
          claimId: claim.id,
        },
      });
      verifyClaimTaskIds.push(vcTask._id.toString());
    }
  }

  // 2. Red-team task (parallel with verification). Only when the plan requires it.
  let redTeamTaskId: string | undefined;
  if (redTeam) {
    const redTeamTask = await Task.create({
      executionId: context.executionId,
      type: 'red_team',
      status: 'pending',
      priority: 5,
      input: {
        decisionId: context.decisionId,
        candidateRecommendation,
        claimIds: selectedClaimIds,
        evidenceIds: allEvidenceIds,
        assumptions: (decision?.assumptions as string[]) || [],
      },
      dependencies: [debateTaskId],
      metadata: {
        description: 'Adversarially analyze the candidate decision.',
        phase: 'red_team',
        candidateRecommendation,
      },
    });
    redTeamTaskId = redTeamTask._id.toString();
  }

  const downstreamDeps = [...verifyClaimTaskIds, ...(redTeamTaskId ? [redTeamTaskId] : [])];

  // 3. Reconciliation depends on the debate plus any downstream tasks that ran.
  let reconciliationTaskId: string | undefined;
  if (reconciliation) {
    const reconciliationTask = await Task.create({
      executionId: context.executionId,
      type: 'reconciliation',
      status: 'pending',
      priority: 1,
      input: {
        decisionId: context.decisionId,
        candidateRecommendation,
        claimIds: claimIdStrs,
        verifyClaimTaskIds,
        redTeamTaskId,
      },
      dependencies: downstreamDeps.length > 0 ? downstreamDeps : [debateTaskId],
      metadata: {
        description: 'Merge verification and red-team results into a final decision.',
        phase: 'reconciliation',
      },
    });
    reconciliationTaskId = reconciliationTask._id.toString();
  }

  return {
    verificationTaskIds: verifyClaimTaskIds,
    redTeamTaskId,
    reconciliationTaskId,
    selectedClaimCount: verify ? selectedClaims.length : 0,
  };
}

/**
 * Debate handler — executes a debate through the existing (proven) DebateEngine
 * and the configured strategy (Consensus / Majority Vote / Devil's Advocate /
 * Judge / Open Debate). It does NOT rewrite the debate logic.
 *
 * Phase 3: when the decision has research evidence, a bounded, provenance-tagged
 * evidence bundle is passed to the engine (injected as untrusted data in agent
 * prompts) and claims produced by the debate are persisted with that bundle's
 * evidence IDs (coarse attribution, always `proposed`).
 *
 * Phase 4: after the debate produces a candidate verdict and persists claims,
 * it seeds the explicit evidence graph (supports/contradicts/related) and
 * schedules the downstream verification, red-team, and reconciliation stages.
 */
export const debateHandler: TaskHandler = {
  type: 'debate',
  canHandle(type) {
    return type === 'debate';
  },
  async execute(task, context: TaskHandlerContext): Promise<TaskHandlerResult> {
    const { debateEngine } = await import('../../engine/debateEngine');
    const Decision = (await import('../../models/Decision')).default;
    const Execution = (await import('../../models/Execution')).default;
    const DecisionPlan = (await import('../../models/DecisionPlan')).default;

    const decision = await Decision.findById(context.decisionId);
    if (!decision) {
      throw new Error('Decision not found for debate task.');
    }

    const strategy =
      (task.input?.strategy as string) || decision.configuration?.strategy || 'consensus';

    const evidence = await researchService.getEvidenceViews(context.decisionId);

    const result = await debateEngine.executeForDecision({
      decisionId: context.decisionId,
      userId: context.userId,
      strategy,
      participants: decision.participants,
      objective: decision.objective,
      onUsage: context.onUsage,
      evidence,
      routing: context.routing
        ? {
            agentId: context.routing.agentId,
            modelId: context.routing.modelId,
          }
        : undefined,
    });

    const claimIds = await persistClaimsFromMessages({
      decisionId: context.decisionId,
      messages: result.messages,
      executionId: context.executionId,
      taskId: context.taskId,
      evidenceIds: evidence.map((e) => e.id),
    });

    // ---- Phase 4: Seed the explicit evidence graph from coarse attribution ----
    await evidenceGraphService.seedFromExistingClaims(
      context.decisionId,
      context.executionId
    );

    // ---- Phase 4/5: Schedule downstream verification / red team / reconciliation ----
    // Phase 5 intelligent plans gate these stages via the plan's termination
    // flags. Legacy (fixed-mode) executions without a plan get the full Phase 4
    // graph, exactly as before.
    const termination = await resolvePlanTermination(context.executionId);
    const phase4TaskIds = await schedulePhase4DownstreamTasks(
      context,
      result,
      decision,
      termination
    );

    return {
      output: {
        strategy,
        messages: result.messages,
        verdict: result.verdict,
        evidenceCount: evidence.length,
        claimIds: claimIds.map((c) => c._id.toString()),
        candidateVerdict: result.verdict,
        phase4: phase4TaskIds,
      },
    };
  },
};

/**
 * Resolve the termination flags that control the Phase 4 downstream graph.
 * Fixed-mode executions (no plan) keep the legacy behavior (all stages on).
 * Intelligent-mode executions honor the plan's termination flags.
 */
async function resolvePlanTermination(
  executionId: string
): Promise<{ verify: boolean; redTeam: boolean; reconciliation: boolean }> {
  try {
    const Execution = (await import('../../models/Execution')).default;
    const DecisionPlan = (await import('../../models/DecisionPlan')).default;
    const execution = await Execution.findById(executionId);
    const planId = execution?.planId;
    if (!planId) return { verify: true, redTeam: true, reconciliation: true };
    const plan = await DecisionPlan.findById(planId);
    if (!plan?.termination) return { verify: true, redTeam: true, reconciliation: true };
    return {
      verify: plan.termination.requiresVerification !== false,
      redTeam: plan.termination.requiresRedTeam !== false,
      reconciliation: plan.termination.requiresReconciliation !== false,
    };
  } catch {
    return { verify: true, redTeam: true, reconciliation: true };
  }
}
