"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.structuredSimilarityProvider = exports.StructuredSimilarityProvider = void 0;
/**
 * Phase 8 — deterministic structured similarity.
 *
 * No vector database. Relevance is computed from explicit, explainable signals
 * (category, domain, problem type, tags, entities, time range) plus a simple
 * token-overlap text score on the problem description. The default provider is
 * fully functional offline; an embedding provider can be swapped in later
 * behind the same interface without changing consumers.
 */
const TOKEN_SPLIT = /\w+/g;
function tokens(value) {
    return new Set((value || '').toLowerCase().match(TOKEN_SPLIT) || []);
}
function shared(setA, setB) {
    const out = [];
    for (const t of setA) {
        if (setB.has(t))
            out.push(t);
    }
    return out;
}
function jaccard(a, b) {
    if (a.size === 0 && b.size === 0)
        return 0;
    const union = new Set([...a, ...b]);
    if (union.size === 0)
        return 0;
    let inter = 0;
    for (const t of a)
        if (b.has(t))
            inter++;
    return inter / union.size;
}
function same(a, b) {
    if (!a || !b)
        return false;
    return a.toLowerCase() === b.toLowerCase();
}
const WEIGHTS = {
    category: 0.25,
    domain: 0.2,
    problemType: 0.2,
    tags: 0.2,
    entities: 0.1,
    text: 0.25,
};
const TAG_WEIGHT_PER_TAG = 0.05;
const ENTITY_WEIGHT_PER_ENTITY = 0.033;
const TIME_RANGE_BONUS = 0.05;
class StructuredSimilarityProvider {
    constructor() {
        this.kind = 'structured';
    }
    scorableText(query) {
        return [query.title, query.objective, query.description].filter(Boolean).join(' ');
    }
    textScore(memory, query) {
        const queryText = this.scorableText(query);
        if (!queryText.trim())
            return 0;
        const memoryText = [memory.title, memory.objective].filter(Boolean).join(' ');
        return jaccard(tokens(queryText), tokens(memoryText));
    }
    score(memory, query) {
        let total = 0;
        if (same(memory.category, query.category))
            total += WEIGHTS.category;
        if (same(memory.domain, query.domain))
            total += WEIGHTS.domain;
        if (same(memory.problemType, query.problemType))
            total += WEIGHTS.problemType;
        if (query.tags && query.tags.length) {
            const queryTags = query.tags.map((t) => t.toLowerCase());
            const matchCount = (memory.tags || []).filter((t) => queryTags.includes(t.toLowerCase())).length;
            total += Math.min(WEIGHTS.tags, matchCount * TAG_WEIGHT_PER_TAG);
        }
        if (query.entities && query.entities.length) {
            const queryEntities = query.entities.map((e) => e.toLowerCase());
            const matchCount = (memory.entities || []).filter((e) => queryEntities.includes(e.toLowerCase())).length;
            total += Math.min(WEIGHTS.entities, matchCount * ENTITY_WEIGHT_PER_ENTITY);
        }
        const text = this.textScore(memory, query);
        total += WEIGHTS.text * text;
        if (query.timeRange?.from || query.timeRange?.to) {
            const observedAt = memory.outcome?.observedAt || memory.updatedAt || memory.createdAt;
            if (observedAt) {
                const ts = new Date(observedAt).getTime();
                const from = query.timeRange.from ? query.timeRange.from.getTime() : -Infinity;
                const to = query.timeRange.to ? query.timeRange.to.getTime() : Infinity;
                if (ts >= from && ts <= to)
                    total += TIME_RANGE_BONUS;
            }
        }
        if (query.outputType && memory.outcome?.status) {
            if (query.outputType === memory.outcome.status)
                total += 0.1;
        }
        return Math.min(1, total);
    }
    explain(memory, query) {
        const reasons = [];
        if (same(memory.category, query.category))
            reasons.push(`same decision category: ${memory.category}`);
        if (same(memory.domain, query.domain))
            reasons.push(`same domain: ${memory.domain}`);
        if (same(memory.problemType, query.problemType))
            reasons.push(`same problem type: ${memory.problemType}`);
        if (query.tags?.length) {
            const queryTags = query.tags.map((t) => t.toLowerCase());
            for (const tag of (memory.tags || []).filter((t) => queryTags.includes(t.toLowerCase()))) {
                reasons.push(`shared tag: "${tag}"`);
            }
        }
        if (query.entities?.length) {
            const queryEntities = query.entities.map((e) => e.toLowerCase());
            for (const entity of (memory.entities || []).filter((e) => queryEntities.includes(e.toLowerCase()))) {
                reasons.push(`shared entity: "${entity}"`);
            }
        }
        if (query.timeRange?.from || query.timeRange?.to) {
            const observedAt = memory.outcome?.observedAt || memory.updatedAt || memory.createdAt;
            if (observedAt) {
                const ts = new Date(observedAt).getTime();
                const from = query.timeRange.from ? query.timeRange.from.getTime() : -Infinity;
                const to = query.timeRange.to ? query.timeRange.to.getTime() : Infinity;
                if (ts >= from && ts <= to)
                    reasons.push('within requested time range');
            }
        }
        if (this.textScore(memory, query) > 0 && !reasons.length) {
            reasons.push('similar problem description');
        }
        if (!reasons.length)
            reasons.push('lowest-ranked candidate');
        return reasons;
    }
}
exports.StructuredSimilarityProvider = StructuredSimilarityProvider;
exports.structuredSimilarityProvider = new StructuredSimilarityProvider();
