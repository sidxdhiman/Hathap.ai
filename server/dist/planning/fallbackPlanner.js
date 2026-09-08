"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildFallbackPlan = buildFallbackPlan;
exports.buildSimplifiedPlan = buildSimplifiedPlan;
const planningPolicy_1 = require("./planningPolicy");
function buildFallbackPlan(context, options = {}) {
    const policy = (0, planningPolicy_1.makePlanningPolicy)(options.policy);
    const taskList = [];
    const queries = (options.researchQueries || []).filter((q) => q && q.trim());
    const needsResearch = queries.length > 0 ||
        (context.existingEvidence === undefined
            ? options.verification !== false
            : (context.existingEvidence || []).length === 0 && options.verification !== false);
    let researchBudget = policy.maxTotalResearchResults;
    const researchTasks = [];
    if (needsResearch) {
        const count = Math.min(Math.max(queries.length, 1), policy.maxResearchTasks, policy.maxTasksPerExecution - 1);
        const purposes = ['background', 'market_research', 'technical_research', 'competitive_research'];
        for (let i = 0; i < count; i++) {
            const query = queries[i]?.trim() || context.objective;
            if (!query)
                continue;
            const maxResults = Math.min(policy.maxResultsPerResearchTask, Math.max(1, Math.floor(researchBudget / count)));
            researchBudget -= maxResults;
            researchTasks.push({
                tempId: `research-${i + 1}`,
                type: 'research',
                purpose: `Gather external evidence for the decision.`,
                input: {
                    query,
                    purpose: queries.length > 0 ? 'background' : purposes[i % purposes.length],
                    maxResults,
                },
                dependsOn: [],
                priority: 10,
                requirements: ['research'],
            });
        }
    }
    const debate = {
        tempId: 'debate',
        type: 'debate',
        purpose: 'Run the multi-agent debate and produce a candidate decision.',
        input: {
            strategy: 'consensus',
            description: 'Evaluate the available evidence and produce a candidate decision.',
        },
        dependsOn: researchTasks.map((t) => t.tempId),
        priority: 1,
    };
    taskList.push(...researchTasks, debate);
    const verify = options.verification !== false;
    const termination = {
        requiresVerification: verify,
        requiresRedTeam: verify,
        requiresReconciliation: verify,
    };
    return {
        version: '1.0',
        source: options.planSource || 'fallback',
        tasks: taskList,
        termination,
        rationale: {
            summary: verify
                ? 'Conservative baseline plan: research the objective, debate the evidence, then verify, attack and reconcile a final decision.'
                : 'Simplified baseline plan: research the objective when needed, then debate a final decision without a verification stage.',
            research: researchTasks.length > 0
                ? `${researchTasks.length} research task(s) because the decision needs external evidence.`
                : 'No research tasks: the decision has sufficient available evidence or verification is disabled.',
            debate: 'One multi-agent debate to synthesize a candidate decision from the evidence.',
            verification: verify
                ? 'Verification is enabled so factual claims are checked against evidence before a final decision.'
                : 'Verification is disabled for this plan.',
            redTeam: verify
                ? 'Red team is enabled so the candidate decision is adversarially challenged.'
                : 'Red team is disabled for this plan.',
        },
        estimates: {
            estimatedTasks: taskList.length,
            estimatedResearchTasks: researchTasks.length,
            estimatedLLMTasks: verify ? taskList.length : researchTasks.length + 1,
        },
    };
}
/** Debate-only plan for trivially simple decisions (no research, no stage 4). */
function buildSimplifiedPlan(context, options = {}) {
    return buildFallbackPlan(context, { ...options, researchQueries: [], verification: false });
}
