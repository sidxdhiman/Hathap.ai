"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.decisionReportService = exports.DecisionReportService = void 0;
const Decision_1 = __importDefault(require("../models/Decision"));
const Execution_1 = __importDefault(require("../models/Execution"));
const Task_1 = __importDefault(require("../models/Task"));
const Claim_1 = __importDefault(require("../models/Claim"));
const Evidence_1 = __importDefault(require("../models/Evidence"));
const VerificationResult_1 = __importDefault(require("../models/VerificationResult"));
const RedTeamFinding_1 = __importDefault(require("../models/RedTeamFinding"));
const ReconciliationResult_1 = __importDefault(require("../models/ReconciliationResult"));
const ExecutionEvent_1 = __importDefault(require("../models/ExecutionEvent"));
const EvaluationCaseResult_1 = __importDefault(require("../models/EvaluationCaseResult"));
/**
 * Phase 10 — Decision Report service.
 *
 * Renders a Markdown report purely from persisted documents. Reports are a
 * human-facing, exportable artifact and must NEVER leak secrets:
 *   - only model names/providers (never credentials) are included,
 *   - a recursive sanitizer drops any key that looks like a secret,
 *   - a final pass redacts common secret-bearing string patterns.
 *
 * Numeric token/cost figures come from execution usage telemetry only.
 */
const SECRET_KEY_PATTERNS = /(api[_-]?key|apikey|secret|token|credential|authorization|auth[_-]?header|password|passwd|private[_-]?key|access[_-]?key|bearer)/i;
const SECRET_VALUE_PATTERNS = [
    /sk-[A-Za-z0-9_-]{8,}/g,
    /Bearer\s+[A-Za-z0-9._-]{20,}/gi,
    /[A-Za-z0-9]{40,}(?=\s|"|'|$)/g,
    /key:\s*["']?[A-Za-z0-9_-]{16,}["']?/gi,
];
function redactSecrets(input, depth = 0) {
    if (depth > 12)
        return '[too-deep]';
    if (typeof input === 'string') {
        if (input.length > 100000)
            return '[truncated]';
        let out = input;
        for (const re of SECRET_VALUE_PATTERNS)
            out = out.replace(re, '[redacted]');
        return out;
    }
    if (Array.isArray(input))
        return input.map((v) => redactSecrets(v, depth + 1));
    if (input && typeof input === 'object') {
        const out = {};
        for (const [key, value] of Object.entries(input)) {
            if (SECRET_KEY_PATTERNS.test(key)) {
                out[key] = '[redacted]';
                continue;
            }
            out[key] = redactSecrets(value, depth + 1);
        }
        return out;
    }
    return input;
}
function redactMarkdown(text) {
    let out = text;
    for (const re of SECRET_VALUE_PATTERNS)
        out = out.replace(re, '[redacted]');
    return out;
}
const truncate = (s, max) => {
    if (!s)
        return '';
    return s.length > max ? `${s.slice(0, max)}…` : s;
};
class DecisionReportService {
    async generate(userId, decisionId) {
        const decision = await Decision_1.default.findOne({ _id: decisionId, userId });
        if (!decision)
            throw new Error('Decision not found.');
        const decisionIdStr = decision._id.toString();
        const [executions, tasks, claims, evidenceList, verifications, findings, reconciliation, events, evalResults,] = await Promise.all([
            Execution_1.default.find({ decisionId }).sort({ createdAt: 1 }),
            Task_1.default.find({
                executionId: { $in: (await Execution_1.default.find({ decisionId })).map((e) => e._id) },
            }).sort({ priority: 1, createdAt: 1 }),
            Claim_1.default.find({ decisionId }).sort({ createdAt: 1 }),
            Evidence_1.default.find({ decisionId }).sort({ createdAt: 1 }),
            VerificationResult_1.default.find({ decisionId }).sort({ createdAt: 1 }),
            RedTeamFinding_1.default.find({ decisionId }).sort({ createdAt: 1 }),
            ReconciliationResult_1.default.findOne({ decisionId }),
            ExecutionEvent_1.default.find({ decisionId }).sort({ createdAt: 1 }),
            EvaluationCaseResult_1.default.find({ 'artifact.decisionId': decisionIdStr }).sort({ createdAt: 1 }),
        ]);
        const md = [];
        md.push(`# Decision Report`);
        md.push('');
        md.push(`Generated ${new Date().toISOString()} · Decision \`${decisionIdStr}\` · Status **${decision.status}**`);
        md.push('');
        // 1. Problem
        md.push(`## 1. Problem`);
        md.push('');
        md.push(`**Title:** ${truncate(String(decision.title), 200)}`);
        md.push('');
        md.push(truncate(String(decision.objective || 'No objective recorded.'), 4000));
        if (decision.context) {
            md.push('');
            md.push(`### Context`);
            md.push('');
            md.push(truncate(String(decision.context), 4000));
        }
        // 2. Recommendation
        md.push('');
        md.push(`## 2. Recommendation`);
        md.push('');
        const recommendation = reconciliation?.recommendation ||
            (typeof decision.metadata?.finalRecommendation === 'string'
                ? decision.metadata.finalRecommendation
                : undefined);
        if (recommendation && recommendation.trim()) {
            md.push(truncate(recommendation, 4000));
        }
        else {
            md.push('_No recommendation has been produced yet. The decision has not been reconciled, so any verdict below would be unverified._');
        }
        if (typeof decision.confidence === 'number') {
            md.push('');
            md.push(`**Confidence:** ${Math.round(decision.confidence * 100)}%`);
        }
        // 3. Executive summary
        md.push('');
        md.push(`## 3. Executive Summary`);
        md.push('');
        if (reconciliation?.rationale && reconciliation.rationale.trim()) {
            md.push(truncate(reconciliation.rationale, 4000));
        }
        else {
            const verdictEvidence = evidenceList.find((e) => e.type === 'verdict');
            if (verdictEvidence?.content)
                md.push(truncate(verdictEvidence.content, 4000));
            else
                md.push('_No executive summary is available until the decision is reconciled._');
        }
        // 4. Evidence
        md.push('');
        md.push(`## 4. Evidence (${evidenceList.length})`);
        md.push('');
        if (evidenceList.length === 0) {
            md.push('_No evidence was recorded._');
        }
        else {
            evidenceList.slice(0, 50).forEach((e, i) => {
                md.push(`### ${i + 1}. ${truncate(e.title, 200)}`);
                if (e.sourceName || e.sourceUrl) {
                    const src = [e.sourceName, e.sourceUrl].filter(Boolean).join(' · ');
                    md.push(`- **Source:** ${truncate(src, 400)}`);
                }
                md.push(`- **Type:** ${e.sourceType}`);
                if (e.provider)
                    md.push(`- **Provider:** ${e.provider === 'mock' ? 'mock (synthetic — not real web research)' : e.provider}`);
                if (e.retrievedAt)
                    md.push(`- **Retrieved:** ${new Date(e.retrievedAt).toISOString()}`);
                if (e.sourceReliability)
                    md.push(`- **Reliability:** ${e.sourceReliability}`);
                if (typeof e.relevanceScore === 'number') {
                    md.push(`- **Relevance:** ${Math.round(e.relevanceScore * 100)}%`);
                }
                md.push('');
                md.push(truncate(e.content || e.snippet, 600));
                md.push('');
            });
            if (evidenceList.length > 50) {
                md.push(`_${evidenceList.length - 50} further evidence items omitted._`);
            }
        }
        // 5. Claims
        md.push(`## 5. Claims (${claims.length})`);
        md.push('');
        if (claims.length === 0) {
            md.push('_No claims were recorded._');
        }
        else {
            claims.slice(0, 100).forEach((c, i) => {
                md.push(`${i + 1}. **${c.status}** (${c.type})${typeof c.confidence === 'number' ? `, confidence ${Math.round(c.confidence * 100)}%` : ''}: ${truncate(c.text, 400)}`);
            });
            if (claims.length > 100) {
                md.push(`_${claims.length - 100} further claims omitted._`);
            }
        }
        // 6. Verification
        md.push('');
        md.push(`## 6. Verification (${verifications.length})`);
        md.push('');
        if (verifications.length === 0) {
            md.push('_No verification results were recorded._');
        }
        else {
            verifications.slice(0, 100).forEach((v, i) => {
                md.push(`${i + 1}. **${v.status}** (mode: ${v.mode}) — ${truncate(v.claimStatement, 300)}`);
                if (v.rationale)
                    md.push(`   - ${truncate(v.rationale, 400)}`);
            });
        }
        // 7. Red team
        md.push('');
        md.push(`## 7. Red Team Findings (${findings.length})`);
        md.push('');
        if (findings.length === 0) {
            md.push('_No red-team findings were recorded._');
        }
        else {
            findings.slice(0, 100).forEach((f, i) => {
                md.push(`${i + 1}. **${f.severity}** / ${f.type} — ${truncate(f.description, 400)}`);
                if (f.suggestedAction)
                    md.push(`   - Suggested action: ${truncate(f.suggestedAction, 300)}`);
            });
        }
        // 8. Reconciliation
        md.push('');
        md.push(`## 8. Reconciliation`);
        md.push('');
        if (!reconciliation) {
            md.push('_No reconciliation has been completed for this decision._');
        }
        else {
            md.push(`- **Surviving claims:** ${reconciliation.survivingClaimIds.length}\n` +
                `- **Rejected claims:** ${reconciliation.rejectedClaimIds.length}\n` +
                `- **Uncertain claims:** ${reconciliation.uncertainClaimIds.length}\n` +
                `- **Unresolved conflicts:** ${reconciliation.unresolvedConflictIds.length}\n` +
                `- **Needs more research:** ${reconciliation.needsMoreResearch ? 'yes' : 'no'}`);
            if (reconciliation.researchQuestions?.length) {
                md.push('');
                md.push(`**Open research questions:**`);
                reconciliation.researchQuestions.slice(0, 20).forEach((q) => md.push(`- ${truncate(q, 300)}`));
            }
            if (reconciliation.rationale) {
                md.push('');
                md.push(`**Rationale:** ${truncate(reconciliation.rationale, 2000)}`);
            }
        }
        // 9. Models & routing
        md.push('');
        md.push(`## 9. Models & Routing`);
        md.push('');
        const routingModels = new Set();
        for (const t of tasks) {
            const selection = t.metadata?.routing?.selection;
            const modelName = selection?.model?.modelName || t.assignedModel;
            const agentName = t.metadata?.routing?.selection?.agent?.name || t.assignedAgent;
            if (modelName) {
                routingModels.add(`${modelName}${selection?.model?.provider ? ` (${selection.model.provider})` : ''}`);
            }
            if (agentName)
                routingModels.add(`agent: ${agentName}`);
        }
        if (routingModels.size === 0) {
            md.push('_No model/agent routing selections were recorded._');
        }
        else {
            for (const r of Array.from(routingModels).sort())
                md.push(`- ${r}`);
        }
        const manualModelId = executions[0]?.metadata?.routing?.modelId;
        if (manualModelId)
            md.push(`\nRouting mode: manual (requested model \`${manualModelId}\`)`);
        // 10. Cost & usage
        md.push('');
        md.push(`## 10. Cost & Usage`);
        md.push('');
        if (executions.length === 0) {
            md.push('_No execution has been run for this decision yet._');
        }
        else {
            let totalTokens = 0;
            let totalCost = 0;
            for (const e of executions) {
                const usage = e.tokenUsage || {};
                totalTokens += Number(usage.totalTokens) || 0;
                totalCost += Number(e.estimatedCost ?? e.actualCost ?? 0) || 0;
            }
            md.push(`- **Executions:** ${executions.length}`);
            md.push(`- **Total input tokens:** ${totalTokens}`);
            md.push(`- **Estimated cost:** $${totalCost.toFixed(4)}`);
            for (const e of executions.slice(0, 10)) {
                const usage = e.tokenUsage || {};
                const modelLine = [usage.model, usage.provider].filter(Boolean).join(' · ');
                md.push(`- Execution \`${e._id}\` (${e.status}): ${Math.round(e.progress ?? 0)}% · totalTokens ${usage.totalTokens ?? 0}${modelLine ? ` · ${modelLine}` : ''}`);
            }
        }
        // 11. Evaluation
        md.push('');
        md.push(`## 11. Evaluation`);
        md.push('');
        if (evalResults.length === 0) {
            md.push('_No automated evaluation results reference this decision. Run an evaluation benchmark (decision-engine mode) that uses this artifact to populate this section._');
        }
        else {
            for (const r of evalResults.slice(0, 10)) {
                const score = r.metrics?.score;
                md.push(`- **${r.caseTitle || r.caseId}** — status ${r.status}${typeof score === 'number' ? `, composite score ${(score * 100).toFixed(1)}%` : ''} (run \`${r.runId}\`)`);
            }
        }
        // 12. Provenance
        md.push('');
        md.push(`## 12. Provenance`);
        md.push('');
        md.push(`- **Decision ID:** \`${decisionIdStr}\``);
        md.push(`- **Status:** ${decision.status}`);
        md.push(`- **Current phase:** ${decision.currentPhase}`);
        md.push(`- **Created:** ${decision.createdAt ? decision.createdAt.toISOString() : '—'}`);
        md.push(`- **Updated:** ${decision.updatedAt ? decision.updatedAt.toISOString() : '—'}`);
        if (decision.completedAt)
            md.push(`- **Completed:** ${decision.completedAt.toISOString()}`);
        for (const e of executions) {
            md.push(`- **Execution** \`${e._id}\` — ${e.status}${e.startedAt ? `, started ${e.startedAt.toISOString()}` : ''}${e.completedAt ? `, completed ${e.completedAt.toISOString()}` : ''}`);
        }
        md.push(`- **Task graph:** ${tasks.length} tasks (${tasks.filter((t) => t.status === 'completed').length} completed)`);
        md.push(`- **Event log:** ${events.length} events`);
        const markdown = redactMarkdown(md.join('\n'));
        return {
            markdown,
            fileName: `decision-report-${decisionIdStr}.md`,
            generatedAt: new Date(),
            decisionId: decisionIdStr,
        };
    }
}
exports.DecisionReportService = DecisionReportService;
exports.decisionReportService = new DecisionReportService();
