"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.softRequirementsForTaskType = softRequirementsForTaskType;
exports.scoreCandidates = scoreCandidates;
exports.pickBestCandidate = pickBestCandidate;
exports.buildRoutingReasons = buildRoutingReasons;
const routingPolicy_1 = require("./routingPolicy");
/**
 * Phase 6 — deterministic candidate scoring.
 *
 * Every factor is a value in [0,1] where higher is better, combined as a
 * convex-weighted sum (weights sum to 1). Unknowns resolve to neutral priors —
 * never invented quality/benchmark numbers. Ordering is fully deterministic:
 * cost favorability uses min/max of the CURRENT candidate set, and exact ties
 * are broken by a 1e-9-scale epsilon derived from stable candidate ordering.
 */
function softRequirementsForTaskType(taskType) {
    return routingPolicy_1.TASK_TYPE_SOFT_REQUIREMENTS[taskType] || [];
}
function modelLookupKey(model) {
    return model.modelName || model.displayName || '';
}
function jaccard(a, b) {
    if (a.length === 0 && b.length === 0)
        return 0.5;
    const setA = new Set(a);
    const setB = new Set(b);
    let intersection = 0;
    for (const item of setA) {
        if (setB.has(item))
            intersection++;
    }
    const union = new Set([...setA, ...setB]).size;
    if (union === 0)
        return 0.5;
    return intersection / union;
}
function makeFactor(name, value, policy, note) {
    const weight = policy.weights[name];
    return { name, value, weight, contribution: value * weight, note };
}
function costFactorFor(candidates, estimate, policy) {
    const known = candidates
        .filter((c) => c.estimate.pricingKnown)
        .map((c) => c.estimate.estimatedCost);
    if (known.length === 0) {
        return {
            value: policy.neutralQuality,
            note: 'no known per-token pricing for any candidate — cost treated as neutral',
        };
    }
    const min = Math.min(...known);
    const max = Math.max(...known);
    if (!estimate.pricingKnown) {
        return {
            value: policy.neutralQuality,
            note: 'no known per-token pricing for this model — cost treated as neutral',
        };
    }
    const normalized = max > min ? (estimate.estimatedCost - min) / (max - min) : 0;
    return {
        value: 1 - normalized,
        note: `estimated cost ${estimate.estimatedCost.toFixed(6)} within candidate range [${min.toFixed(6)}..${max.toFixed(6)}]`,
    };
}
function scoreCandidates(candidates, input, policy) {
    const allReqs = Array.from(new Set([...input.hard, ...input.soft]));
    return candidates.map((candidate, idx) => {
        const { agent, model } = candidate;
        const agentCaps = agent.capabilities || [];
        const modelName = modelLookupKey(model);
        const factors = [];
        // 1. quality — stable prior/override map, otherwise neutral.
        const quality = policy.qualityOverrides[modelName] ?? policy.qualityOverrides[model.modelName || ''] ?? policy.neutralQuality;
        factors.push(makeFactor('quality', quality, policy, qualityNote(quality, model.modelName, modelName, policy)));
        // 2. capability — soft requirement coverage (gate enforcement lives in the router).
        const softMatched = input.soft.length
            ? input.soft.filter((req) => agentCaps.includes(req)).length / input.soft.length
            : 1;
        factors.push(makeFactor('capability', softMatched, policy, capabilityNote(softMatched, input.soft, agentCaps)));
        // 3. specialization — Jaccard between agent capabilities and task requirements.
        const spec = jaccard(agentCaps, allReqs);
        factors.push(makeFactor('specialization', spec, policy, `capability overlap (${agentCaps.join(', ') || 'none'})`));
        // 4. reliability — model status prior.
        const reliability = policy.reliabilityByStatus[model.status || 'untested'] ?? policy.neutralQuality;
        factors.push(makeFactor('reliability', reliability, policy, `model status "${model.status || 'untested'}"`));
        // 5. cost — rank-normalized within the current candidate set.
        const costFactor = costFactorFor(candidates, candidate.estimate, policy);
        factors.push(makeFactor('cost', costFactor.value, policy, costFactor.note));
        // 6. latency — stable override map, otherwise neutral.
        const latency = policy.latencyOverrides[modelName] ?? policy.latencyOverrides[model.modelName || ''] ?? policy.neutralLatency;
        factors.push(makeFactor('latency', latency, policy, latencyNote(latency, model.modelName, modelName, policy)));
        const weightedSum = factors.reduce((acc, f) => acc + f.contribution, 0);
        // Soft diversity: for adversarial / verification tasks, prefer a provider
        // different from the debate's primary provider. Deliberately small, explicit.
        const isDiversityTask = policy.diversityPreferenceTasks.includes(input.taskType) &&
            Boolean(input.primaryProvider) &&
            Boolean(model.provider && model.provider !== input.primaryProvider);
        const diversityBonus = isDiversityTask ? policy.diversityBonus : 0;
        const tieBreakApplied = policy.tieBreakEpsilon * idx;
        const score = {
            total: Math.min(1, Math.max(0, weightedSum + diversityBonus + tieBreakApplied)),
            factors,
            diversityBonus,
            tieBreakApplied,
        };
        return { ...candidate, score };
    });
}
function qualityNote(value, bareModelName, resolvedKey, policy) {
    if (policy.qualityOverrides[resolvedKey] !== undefined || policy.qualityOverrides[bareModelName] !== undefined) {
        return `quality override configured for "${resolvedKey}" (${value.toFixed(2)})`;
    }
    return `no quality benchmark available — neutral prior ${value.toFixed(2)}`;
}
function capabilityNote(value, soft, caps) {
    if (soft.length === 0)
        return 'no soft requirements for this task type';
    return value === 1
        ? `agent covers all soft requirements: ${soft.join(', ')}`
        : `agent covers ${value * soft.length}/${soft.length} soft requirements (${soft.join(', ')})`;
}
function latencyNote(value, bareModelName, resolvedKey, policy) {
    if (policy.latencyOverrides[resolvedKey] !== undefined || policy.latencyOverrides[bareModelName] !== undefined) {
        return `latency override configured for "${resolvedKey}" (${value.toFixed(2)})`;
    }
    return `no latency measurement for "${resolvedKey}" — neutral prior ${value.toFixed(2)}`;
}
/** Deterministic best candidate: highest score wins; exact ties fall to stable order. */
function pickBestCandidate(candidates) {
    if (candidates.length === 0)
        return undefined;
    return candidates.reduce((best, candidate) => {
        const bestScore = best.score?.total ?? -Infinity;
        const candidateScore = candidate.score?.total ?? -Infinity;
        if (candidateScore > bestScore)
            return candidate;
        return best;
    }, candidates[0]);
}
/** Concise, structured human-legible reasons for the routing decision. */
function buildRoutingReasons(candidate, gateRelaxed, primaryProvider) {
    const reasons = [];
    const { score } = candidate;
    if (!score)
        return reasons;
    for (const factor of score.factors) {
        if (factor.name === 'quality' || factor.name === 'latency' || factor.name === 'cost')
            continue;
        if (factor.note)
            reasons.push(`${factor.name}: ${factor.note}`);
    }
    const model = candidate.model;
    if (gateRelaxed) {
        reasons.push(`no single agent covered all required capabilities — best-overlap agent selected (gate relaxed)`);
    }
    if (score.diversityBonus > 0 && primaryProvider && model.provider) {
        reasons.push(`diversity: provider "${model.provider}" differs from primary "${primaryProvider}" (soft bonus)`);
    }
    return reasons;
}
