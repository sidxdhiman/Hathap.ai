"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const authMiddleware_1 = require("../middleware/authMiddleware");
const benchmarkService_1 = require("../evaluation/benchmarkService");
const rubricService_1 = require("../evaluation/rubricService");
const baselines_1 = require("../evaluation/baselines");
const evaluationService_1 = require("../evaluation/evaluationService");
const evaluationRunner_1 = require("../evaluation/evaluationRunner");
const qualityEvaluator_1 = require("../evaluation/qualityEvaluator");
const initialBenchmark_1 = require("../evaluation/initialBenchmark");
const evaluationPolicy_1 = require("../evaluation/evaluationPolicy");
const structuralEvaluator_1 = require("../evaluation/structuralEvaluator");
const router = express_1.default.Router();
/** Lax patch cleaner: PATCH updates any subset of a case's fields. */
function cleanCasePatch(body) {
    if (!body || typeof body !== 'object')
        return {};
    const out = {};
    if (typeof body.title === 'string' && body.title.trim())
        out.title = (0, evaluationPolicy_1.sanitizeSignal)(body.title.trim(), 200);
    if (typeof body.prompt === 'string')
        out.prompt = (0, evaluationPolicy_1.sanitizeSignal)(body.prompt, 4000);
    if (typeof body.context === 'string')
        out.context = (0, evaluationPolicy_1.sanitizeSignal)(body.context, 4000);
    if (typeof body.category === 'string')
        out.category = (0, evaluationPolicy_1.sanitizeSignal)(body.category, 100);
    if (Array.isArray(body.tags))
        out.tags = body.tags.map((t) => (0, evaluationPolicy_1.sanitizeSignal)(String(t), 100));
    if (['easy', 'medium', 'hard'].includes(body.difficulty))
        out.difficulty = body.difficulty;
    if (body.expectedStructure !== undefined)
        out.expectedStructure = body.expectedStructure;
    if (body.providedAnswer !== undefined)
        out.providedAnswer = body.providedAnswer;
    return out;
}
// ---- Meta ----
router.get('/meta', authMiddleware_1.requireAuth, (_req, res) => {
    res.json({ policyVersion: evaluationPolicy_1.EVALUATION_POLICY_VERSION });
});
// ---- Seed ----
router.post('/seed', authMiddleware_1.requireAuth, async (req, res) => {
    try {
        if (!req.userId)
            return res.status(401).json({ error: 'Unauthorized.' });
        const result = await (0, initialBenchmark_1.ensureInitialSeed)(req.userId);
        res.status(result.created ? 201 : 200).json(result);
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
// ---- Benchmarks ----
router.get('/benchmarks', authMiddleware_1.requireAuth, async (req, res) => {
    try {
        if (!req.userId)
            return res.status(401).json({ error: 'Unauthorized.' });
        const items = await benchmarkService_1.benchmarkService.listBenchmarks(req.userId);
        res.json(items);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
router.post('/benchmarks', authMiddleware_1.requireAuth, async (req, res) => {
    try {
        if (!req.userId)
            return res.status(401).json({ error: 'Unauthorized.' });
        const input = (0, benchmarkService_1.cleanBenchmarkInput)(req.body);
        const benchmark = await benchmarkService_1.benchmarkService.createBenchmark(req.userId, input);
        res.status(201).json(benchmark);
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
router.get('/benchmarks/:benchmarkId', authMiddleware_1.requireAuth, async (req, res) => {
    try {
        if (!req.userId)
            return res.status(401).json({ error: 'Unauthorized.' });
        const benchmark = await benchmarkService_1.benchmarkService.getBenchmark(req.userId, req.params.benchmarkId);
        if (!benchmark)
            return res.status(404).json({ error: 'Benchmark not found.' });
        const caseCount = await benchmarkService_1.benchmarkService.activeCaseCount(req.params.benchmarkId);
        res.json({ ...benchmark.toObject(), caseCount });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
router.patch('/benchmarks/:benchmarkId', authMiddleware_1.requireAuth, async (req, res) => {
    try {
        if (!req.userId)
            return res.status(401).json({ error: 'Unauthorized.' });
        const input = (0, benchmarkService_1.cleanBenchmarkInput)(req.body);
        const benchmark = await benchmarkService_1.benchmarkService.updateBenchmark(req.userId, req.params.benchmarkId, input);
        if (!benchmark)
            return res.status(404).json({ error: 'Benchmark not found.' });
        res.json(benchmark);
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
router.delete('/benchmarks/:benchmarkId', authMiddleware_1.requireAuth, async (req, res) => {
    try {
        if (!req.userId)
            return res.status(401).json({ error: 'Unauthorized.' });
        const deleted = await benchmarkService_1.benchmarkService.deleteBenchmark(req.userId, req.params.benchmarkId);
        if (!deleted)
            return res.status(404).json({ error: 'Benchmark not found.' });
        res.json({ deleted: true });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// ---- Benchmark cases ----
router.get('/benchmarks/:benchmarkId/cases', authMiddleware_1.requireAuth, async (req, res) => {
    try {
        if (!req.userId)
            return res.status(401).json({ error: 'Unauthorized.' });
        const cases = await benchmarkService_1.benchmarkService.listCases(req.userId, req.params.benchmarkId);
        res.json(cases);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
router.post('/benchmarks/:benchmarkId/cases', authMiddleware_1.requireAuth, async (req, res) => {
    try {
        if (!req.userId)
            return res.status(401).json({ error: 'Unauthorized.' });
        const input = (0, benchmarkService_1.cleanCaseInput)(req.body);
        const result = await benchmarkService_1.benchmarkService.addCase(req.userId, req.params.benchmarkId, input);
        res.status(201).json(result);
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
router.patch('/cases/:caseId', authMiddleware_1.requireAuth, async (req, res) => {
    try {
        if (!req.userId)
            return res.status(401).json({ error: 'Unauthorized.' });
        const input = cleanCasePatch(req.body);
        const updated = await benchmarkService_1.benchmarkService.updateCase(req.userId, req.params.caseId, input);
        if (!updated)
            return res.status(404).json({ error: 'Case not found.' });
        res.json(updated);
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
router.delete('/cases/:caseId', authMiddleware_1.requireAuth, async (req, res) => {
    try {
        if (!req.userId)
            return res.status(401).json({ error: 'Unauthorized.' });
        const deleted = await benchmarkService_1.benchmarkService.deleteCase(req.userId, req.params.caseId);
        if (!deleted)
            return res.status(404).json({ error: 'Case not found.' });
        res.json({ deleted: true });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// ---- Rubrics ----
router.get('/rubrics', authMiddleware_1.requireAuth, async (req, res) => {
    try {
        if (!req.userId)
            return res.status(401).json({ error: 'Unauthorized.' });
        res.json(await rubricService_1.rubricService.listRubrics(req.userId));
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
router.post('/rubrics', authMiddleware_1.requireAuth, async (req, res) => {
    try {
        if (!req.userId)
            return res.status(401).json({ error: 'Unauthorized.' });
        const input = (0, rubricService_1.cleanRubricInput)(req.body);
        res.status(201).json(await rubricService_1.rubricService.createRubric(req.userId, input));
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
router.get('/rubrics/:rubricId', authMiddleware_1.requireAuth, async (req, res) => {
    try {
        if (!req.userId)
            return res.status(401).json({ error: 'Unauthorized.' });
        const rubric = await rubricService_1.rubricService.getRubric(req.userId, req.params.rubricId);
        if (!rubric)
            return res.status(404).json({ error: 'Rubric not found.' });
        res.json(rubric);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
router.patch('/rubrics/:rubricId', authMiddleware_1.requireAuth, async (req, res) => {
    try {
        if (!req.userId)
            return res.status(401).json({ error: 'Unauthorized.' });
        const input = (0, rubricService_1.cleanRubricInput)(req.body);
        const rubric = await rubricService_1.rubricService.updateRubric(req.userId, req.params.rubricId, input);
        if (!rubric)
            return res.status(404).json({ error: 'Rubric not found.' });
        res.json(rubric);
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
router.delete('/rubrics/:rubricId', authMiddleware_1.requireAuth, async (req, res) => {
    try {
        if (!req.userId)
            return res.status(401).json({ error: 'Unauthorized.' });
        const deleted = await rubricService_1.rubricService.deleteRubric(req.userId, req.params.rubricId);
        if (!deleted)
            return res.status(404).json({ error: 'Rubric not found.' });
        res.json({ deleted: true });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// ---- Baselines ----
router.get('/baselines', authMiddleware_1.requireAuth, async (req, res) => {
    try {
        if (!req.userId)
            return res.status(401).json({ error: 'Unauthorized.' });
        res.json(await baselines_1.baselineService.listBaselines(req.userId));
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
router.post('/baselines', authMiddleware_1.requireAuth, async (req, res) => {
    try {
        if (!req.userId)
            return res.status(401).json({ error: 'Unauthorized.' });
        const input = (0, baselines_1.cleanBaselineInput)(req.body);
        res.status(201).json(await baselines_1.baselineService.createBaseline(req.userId, input));
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
router.get('/baselines/:baselineId', authMiddleware_1.requireAuth, async (req, res) => {
    try {
        if (!req.userId)
            return res.status(401).json({ error: 'Unauthorized.' });
        const baseline = await baselines_1.baselineService.getBaseline(req.userId, req.params.baselineId);
        if (!baseline)
            return res.status(404).json({ error: 'Baseline not found.' });
        res.json(baseline);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
router.delete('/baselines/:baselineId', authMiddleware_1.requireAuth, async (req, res) => {
    try {
        if (!req.userId)
            return res.status(401).json({ error: 'Unauthorized.' });
        const deleted = await baselines_1.baselineService.deleteBaseline(req.userId, req.params.baselineId);
        if (!deleted)
            return res.status(404).json({ error: 'Baseline not found.' });
        res.json({ deleted: true });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// ---- Run aggregates & comparisons ----
router.get('/runs/:runId/aggregate', authMiddleware_1.requireAuth, async (req, res) => {
    try {
        if (!req.userId)
            return res.status(401).json({ error: 'Unauthorized.' });
        const run = await evaluationService_1.evaluationService.getRun(req.userId, req.params.runId);
        if (!run)
            return res.status(404).json({ error: 'Evaluation run not found.' });
        res.json(await baselines_1.baselineService.aggregateRunScore(req.params.runId));
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
router.post('/compare-runs', authMiddleware_1.requireAuth, async (req, res) => {
    try {
        if (!req.userId)
            return res.status(401).json({ error: 'Unauthorized.' });
        const { runAId, runBId, name } = req.body;
        if (!runAId || !runBId) {
            return res.status(400).json({ error: 'runAId and runBId are required.' });
        }
        const comparison = await baselines_1.baselineService.compareRunVsRun(req.userId, runAId, runBId, {
            name,
            persist: req.body.persist !== false,
        });
        res.json(comparison);
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
router.post('/compare-baseline', authMiddleware_1.requireAuth, async (req, res) => {
    try {
        if (!req.userId)
            return res.status(401).json({ error: 'Unauthorized.' });
        const { runId, baselineId, name } = req.body;
        if (!runId || !baselineId) {
            return res.status(400).json({ error: 'runId and baselineId are required.' });
        }
        const comparison = await baselines_1.baselineService.compareRunVsBaseline(req.userId, runId, baselineId, { name });
        res.json(comparison);
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
router.get('/comparisons', authMiddleware_1.requireAuth, async (req, res) => {
    try {
        if (!req.userId)
            return res.status(401).json({ error: 'Unauthorized.' });
        res.json(await baselines_1.baselineService.listComparisons(req.userId));
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
router.get('/comparisons/:comparisonId', authMiddleware_1.requireAuth, async (req, res) => {
    try {
        if (!req.userId)
            return res.status(401).json({ error: 'Unauthorized.' });
        const comparison = await baselines_1.baselineService.getComparison(req.userId, req.params.comparisonId);
        if (!comparison)
            return res.status(404).json({ error: 'Comparison not found.' });
        res.json(comparison);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// ---- Single artifact evaluation (does not persist a run) ----
router.post('/evaluate-decision', authMiddleware_1.requireAuth, async (req, res) => {
    try {
        if (!req.userId)
            return res.status(401).json({ error: 'Unauthorized.' });
        const decisionId = req.body?.decisionId;
        const rubricId = req.body?.rubricId;
        if (typeof decisionId !== 'string' || !decisionId) {
            return res.status(400).json({ error: 'decisionId is required.' });
        }
        const artifact = await evaluationService_1.evaluationService.collectDecisionArtifact(req.userId, decisionId);
        if (!artifact) {
            return res.status(422).json({
                error: 'No evaluable artifact found. Evidence stage requires a completed or reconciled decision.',
            });
        }
        if (!artifact.executionId && !artifact.answerText && !artifact.recommendation) {
            return res.status(422).json({
                error: 'Decision has no evaluation-ready output yet. Run the decision to completion before evaluating it.',
            });
        }
        const rubric = rubricId ? await rubricService_1.rubricService.getRubricSnapshot(req.userId, rubricId) : null;
        if (rubricId && !rubric)
            return res.status(404).json({ error: 'Rubric not found.' });
        const analysis = {
            structural: (0, structuralEvaluator_1.evaluateStructure)({
                expectedStructure: evaluationPolicy_1.DEFAULT_EXPECTED_STRUCTURE,
                artifact,
            }),
        };
        analysis.quality = await qualityEvaluator_1.qualityEvaluator.evaluateArtifactQuality(req.userId, artifact, {});
        analysis.evidence = await qualityEvaluator_1.qualityEvaluator.evaluateEvidence(artifact);
        if (artifact.decisionId) {
            analysis.reasoning = await qualityEvaluator_1.qualityEvaluator.evaluateReasoningDecision(artifact.decisionId);
            analysis.outcome = await qualityEvaluator_1.qualityEvaluator.evaluateOutcome(req.userId, artifact.decisionId);
        }
        res.json({ artifact: { decisionId: artifact.decisionId, executionId: artifact.executionId }, analysis });
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
// ---- Evaluation runs ----
router.get('/runs', authMiddleware_1.requireAuth, async (req, res) => {
    try {
        if (!req.userId)
            return res.status(401).json({ error: 'Unauthorized.' });
        res.json(await evaluationService_1.evaluationService.listRuns(req.userId));
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
router.post('/runs', authMiddleware_1.requireAuth, async (req, res) => {
    try {
        if (!req.userId)
            return res.status(401).json({ error: 'Unauthorized.' });
        const input = (0, evaluationService_1.cleanRunInput)(req.body);
        const run = await evaluationService_1.evaluationService.createRun(req.userId, input);
        res.status(201).json(run);
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
router.get('/runs/:runId', authMiddleware_1.requireAuth, async (req, res) => {
    try {
        if (!req.userId)
            return res.status(401).json({ error: 'Unauthorized.' });
        const run = await evaluationService_1.evaluationService.getRun(req.userId, req.params.runId);
        if (!run)
            return res.status(404).json({ error: 'Evaluation run not found.' });
        res.json(run);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
router.get('/runs/:runId/results', authMiddleware_1.requireAuth, async (req, res) => {
    try {
        if (!req.userId)
            return res.status(401).json({ error: 'Unauthorized.' });
        const results = await evaluationService_1.evaluationService.getRunResults(req.userId, req.params.runId);
        res.json(results);
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
router.post('/runs/:runId/start', authMiddleware_1.requireAuth, async (req, res) => {
    try {
        if (!req.userId)
            return res.status(401).json({ error: 'Unauthorized.' });
        const run = await evaluationRunner_1.evaluationRunner.startRun(req.userId, req.params.runId);
        res.json(run);
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
/** Synchronous execution — used by tests and CI-style evaluation. */
router.post('/runs/:runId/execute', authMiddleware_1.requireAuth, async (req, res) => {
    try {
        if (!req.userId)
            return res.status(401).json({ error: 'Unauthorized.' });
        const run = await evaluationRunner_1.evaluationRunner.executeRun(req.userId, req.params.runId);
        res.json(run);
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
router.post('/runs/:runId/cancel', authMiddleware_1.requireAuth, async (req, res) => {
    try {
        if (!req.userId)
            return res.status(401).json({ error: 'Unauthorized.' });
        const run = await evaluationService_1.evaluationService.cancelRun(req.userId, req.params.runId);
        if (!run)
            return res.status(404).json({ error: 'Evaluation run not found.' });
        res.json(run);
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
router.delete('/runs/:runId', authMiddleware_1.requireAuth, async (req, res) => {
    try {
        if (!req.userId)
            return res.status(401).json({ error: 'Unauthorized.' });
        const deleted = await evaluationService_1.evaluationService.deleteRun(req.userId, req.params.runId);
        if (!deleted)
            return res.status(404).json({ error: 'Evaluation run not found.' });
        res.json({ deleted: true });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
exports.default = router;
