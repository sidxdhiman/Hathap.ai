import express from 'express';
import { requireAuth, AuthRequest } from '../middleware/authMiddleware';
import { benchmarkService, cleanBenchmarkInput, cleanCaseInput } from '../evaluation/benchmarkService';
import { rubricService, cleanRubricInput } from '../evaluation/rubricService';
import { baselineService, cleanBaselineInput } from '../evaluation/baselines';
import { evaluationService, cleanRunInput } from '../evaluation/evaluationService';
import { evaluationRunner } from '../evaluation/evaluationRunner';
import { qualityEvaluator } from '../evaluation/qualityEvaluator';
import { ensureInitialSeed } from '../evaluation/initialBenchmark';
import { EVALUATION_POLICY_VERSION, DEFAULT_EXPECTED_STRUCTURE, sanitizeSignal } from '../evaluation/evaluationPolicy';
import { evaluateStructure } from '../evaluation/structuralEvaluator';

const router = express.Router();

/** Lax patch cleaner: PATCH updates any subset of a case's fields. */
function cleanCasePatch(body: any): Record<string, unknown> {
  if (!body || typeof body !== 'object') return {};
  const out: Record<string, unknown> = {};
  if (typeof body.title === 'string' && body.title.trim()) out.title = sanitizeSignal(body.title.trim(), 200);
  if (typeof body.prompt === 'string') out.prompt = sanitizeSignal(body.prompt, 4000);
  if (typeof body.context === 'string') out.context = sanitizeSignal(body.context, 4000);
  if (typeof body.category === 'string') out.category = sanitizeSignal(body.category, 100);
  if (Array.isArray(body.tags)) out.tags = body.tags.map((t: unknown) => sanitizeSignal(String(t), 100));
  if (['easy', 'medium', 'hard'].includes(body.difficulty)) out.difficulty = body.difficulty;
  if (body.expectedStructure !== undefined) out.expectedStructure = body.expectedStructure;
  if (body.providedAnswer !== undefined) out.providedAnswer = body.providedAnswer;
  return out;
}

// ---- Meta ----

router.get('/meta', requireAuth, (_req: AuthRequest, res) => {
  res.json({ policyVersion: EVALUATION_POLICY_VERSION });
});

// ---- Seed ----

router.post('/seed', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!req.userId) return res.status(401).json({ error: 'Unauthorized.' });
    const result = await ensureInitialSeed(req.userId);
    res.status(result.created ? 201 : 200).json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// ---- Benchmarks ----

router.get('/benchmarks', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!req.userId) return res.status(401).json({ error: 'Unauthorized.' });
    const items = await benchmarkService.listBenchmarks(req.userId);
    res.json(items);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/benchmarks', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!req.userId) return res.status(401).json({ error: 'Unauthorized.' });
    const input = cleanBenchmarkInput(req.body);
    const benchmark = await benchmarkService.createBenchmark(req.userId, input);
    res.status(201).json(benchmark);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/benchmarks/:benchmarkId', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!req.userId) return res.status(401).json({ error: 'Unauthorized.' });
    const benchmark = await benchmarkService.getBenchmark(req.userId, req.params.benchmarkId);
    if (!benchmark) return res.status(404).json({ error: 'Benchmark not found.' });
    const caseCount = await benchmarkService.activeCaseCount(req.params.benchmarkId);
    res.json({ ...benchmark.toObject(), caseCount });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.patch('/benchmarks/:benchmarkId', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!req.userId) return res.status(401).json({ error: 'Unauthorized.' });
    const input = cleanBenchmarkInput(req.body);
    const benchmark = await benchmarkService.updateBenchmark(req.userId, req.params.benchmarkId, input);
    if (!benchmark) return res.status(404).json({ error: 'Benchmark not found.' });
    res.json(benchmark);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/benchmarks/:benchmarkId', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!req.userId) return res.status(401).json({ error: 'Unauthorized.' });
    const deleted = await benchmarkService.deleteBenchmark(req.userId, req.params.benchmarkId);
    if (!deleted) return res.status(404).json({ error: 'Benchmark not found.' });
    res.json({ deleted: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ---- Benchmark cases ----

router.get('/benchmarks/:benchmarkId/cases', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!req.userId) return res.status(401).json({ error: 'Unauthorized.' });
    const cases = await benchmarkService.listCases(req.userId, req.params.benchmarkId);
    res.json(cases);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/benchmarks/:benchmarkId/cases', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!req.userId) return res.status(401).json({ error: 'Unauthorized.' });
    const input = cleanCaseInput(req.body);
    const result = await benchmarkService.addCase(req.userId, req.params.benchmarkId, input);
    res.status(201).json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.patch('/cases/:caseId', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!req.userId) return res.status(401).json({ error: 'Unauthorized.' });
    const input = cleanCasePatch(req.body);
    const updated = await benchmarkService.updateCase(req.userId, req.params.caseId, input);
    if (!updated) return res.status(404).json({ error: 'Case not found.' });
    res.json(updated);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/cases/:caseId', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!req.userId) return res.status(401).json({ error: 'Unauthorized.' });
    const deleted = await benchmarkService.deleteCase(req.userId, req.params.caseId);
    if (!deleted) return res.status(404).json({ error: 'Case not found.' });
    res.json({ deleted: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ---- Rubrics ----

router.get('/rubrics', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!req.userId) return res.status(401).json({ error: 'Unauthorized.' });
    res.json(await rubricService.listRubrics(req.userId));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/rubrics', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!req.userId) return res.status(401).json({ error: 'Unauthorized.' });
    const input = cleanRubricInput(req.body);
    res.status(201).json(await rubricService.createRubric(req.userId, input));
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/rubrics/:rubricId', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!req.userId) return res.status(401).json({ error: 'Unauthorized.' });
    const rubric = await rubricService.getRubric(req.userId, req.params.rubricId);
    if (!rubric) return res.status(404).json({ error: 'Rubric not found.' });
    res.json(rubric);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.patch('/rubrics/:rubricId', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!req.userId) return res.status(401).json({ error: 'Unauthorized.' });
    const input = cleanRubricInput(req.body);
    const rubric = await rubricService.updateRubric(req.userId, req.params.rubricId, input);
    if (!rubric) return res.status(404).json({ error: 'Rubric not found.' });
    res.json(rubric);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/rubrics/:rubricId', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!req.userId) return res.status(401).json({ error: 'Unauthorized.' });
    const deleted = await rubricService.deleteRubric(req.userId, req.params.rubricId);
    if (!deleted) return res.status(404).json({ error: 'Rubric not found.' });
    res.json({ deleted: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ---- Baselines ----

router.get('/baselines', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!req.userId) return res.status(401).json({ error: 'Unauthorized.' });
    res.json(await baselineService.listBaselines(req.userId));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/baselines', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!req.userId) return res.status(401).json({ error: 'Unauthorized.' });
    const input = cleanBaselineInput(req.body);
    res.status(201).json(await baselineService.createBaseline(req.userId, input));
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/baselines/:baselineId', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!req.userId) return res.status(401).json({ error: 'Unauthorized.' });
    const baseline = await baselineService.getBaseline(req.userId, req.params.baselineId);
    if (!baseline) return res.status(404).json({ error: 'Baseline not found.' });
    res.json(baseline);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/baselines/:baselineId', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!req.userId) return res.status(401).json({ error: 'Unauthorized.' });
    const deleted = await baselineService.deleteBaseline(req.userId, req.params.baselineId);
    if (!deleted) return res.status(404).json({ error: 'Baseline not found.' });
    res.json({ deleted: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ---- Run aggregates & comparisons ----

router.get('/runs/:runId/aggregate', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!req.userId) return res.status(401).json({ error: 'Unauthorized.' });
    const run = await evaluationService.getRun(req.userId, req.params.runId);
    if (!run) return res.status(404).json({ error: 'Evaluation run not found.' });
    res.json(await baselineService.aggregateRunScore(req.params.runId));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/compare-runs', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!req.userId) return res.status(401).json({ error: 'Unauthorized.' });
    const { runAId, runBId, name } = req.body;
    if (!runAId || !runBId) {
      return res.status(400).json({ error: 'runAId and runBId are required.' });
    }
    const comparison = await baselineService.compareRunVsRun(req.userId, runAId, runBId, {
      name,
      persist: req.body.persist !== false,
    });
    res.json(comparison);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/compare-baseline', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!req.userId) return res.status(401).json({ error: 'Unauthorized.' });
    const { runId, baselineId, name } = req.body;
    if (!runId || !baselineId) {
      return res.status(400).json({ error: 'runId and baselineId are required.' });
    }
    const comparison = await baselineService.compareRunVsBaseline(req.userId, runId, baselineId, { name });
    res.json(comparison);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/comparisons', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!req.userId) return res.status(401).json({ error: 'Unauthorized.' });
    res.json(await baselineService.listComparisons(req.userId));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/comparisons/:comparisonId', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!req.userId) return res.status(401).json({ error: 'Unauthorized.' });
    const comparison = await baselineService.getComparison(req.userId, req.params.comparisonId);
    if (!comparison) return res.status(404).json({ error: 'Comparison not found.' });
    res.json(comparison);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ---- Single artifact evaluation (does not persist a run) ----

router.post('/evaluate-decision', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!req.userId) return res.status(401).json({ error: 'Unauthorized.' });
    const decisionId = req.body?.decisionId;
    const rubricId = req.body?.rubricId;
    if (typeof decisionId !== 'string' || !decisionId) {
      return res.status(400).json({ error: 'decisionId is required.' });
    }
    const artifact = await evaluationService.collectDecisionArtifact(req.userId, decisionId);
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
    const rubric = rubricId ? await rubricService.getRubricSnapshot(req.userId, rubricId) : null;
    if (rubricId && !rubric) return res.status(404).json({ error: 'Rubric not found.' });
    const analysis: Record<string, unknown> = {
      structural: evaluateStructure({
        expectedStructure: DEFAULT_EXPECTED_STRUCTURE,
        artifact,
      }),
    };
    analysis.quality = await qualityEvaluator.evaluateArtifactQuality(req.userId, artifact, {});
    analysis.evidence = await qualityEvaluator.evaluateEvidence(artifact);
    if (artifact.decisionId) {
      analysis.reasoning = await qualityEvaluator.evaluateReasoningDecision(artifact.decisionId);
      analysis.outcome = await qualityEvaluator.evaluateOutcome(req.userId, artifact.decisionId);
    }
    res.json({ artifact: { decisionId: artifact.decisionId, executionId: artifact.executionId }, analysis });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// ---- Evaluation runs ----

router.get('/runs', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!req.userId) return res.status(401).json({ error: 'Unauthorized.' });
    res.json(await evaluationService.listRuns(req.userId));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/runs', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!req.userId) return res.status(401).json({ error: 'Unauthorized.' });
    const input = cleanRunInput(req.body);
    const run = await evaluationService.createRun(req.userId, input);
    res.status(201).json(run);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/runs/:runId', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!req.userId) return res.status(401).json({ error: 'Unauthorized.' });
    const run = await evaluationService.getRun(req.userId, req.params.runId);
    if (!run) return res.status(404).json({ error: 'Evaluation run not found.' });
    res.json(run);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/runs/:runId/results', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!req.userId) return res.status(401).json({ error: 'Unauthorized.' });
    const results = await evaluationService.getRunResults(req.userId, req.params.runId);
    res.json(results);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/runs/:runId/start', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!req.userId) return res.status(401).json({ error: 'Unauthorized.' });
    const run = await evaluationRunner.startRun(req.userId, req.params.runId);
    res.json(run);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

/** Synchronous execution — used by tests and CI-style evaluation. */
router.post('/runs/:runId/execute', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!req.userId) return res.status(401).json({ error: 'Unauthorized.' });
    const run = await evaluationRunner.executeRun(req.userId, req.params.runId);
    res.json(run);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/runs/:runId/cancel', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!req.userId) return res.status(401).json({ error: 'Unauthorized.' });
    const run = await evaluationService.cancelRun(req.userId, req.params.runId);
    if (!run) return res.status(404).json({ error: 'Evaluation run not found.' });
    res.json(run);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/runs/:runId', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!req.userId) return res.status(401).json({ error: 'Unauthorized.' });
    const deleted = await evaluationService.deleteRun(req.userId, req.params.runId);
    if (!deleted) return res.status(404).json({ error: 'Evaluation run not found.' });
    res.json({ deleted: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;