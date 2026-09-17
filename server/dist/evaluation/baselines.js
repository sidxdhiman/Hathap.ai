"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.baselineService = exports.BaselineService = exports.BaselineValidationError = void 0;
exports.cleanBaselineInput = cleanBaselineInput;
const Baseline_1 = __importDefault(require("../models/Baseline"));
const EvaluationCaseResult_1 = __importDefault(require("../models/EvaluationCaseResult"));
const EvaluationRun_1 = __importDefault(require("../models/EvaluationRun"));
const EvaluationComparison_1 = __importDefault(require("../models/EvaluationComparison"));
const evaluationPolicy_1 = require("./evaluationPolicy");
const eventBus_1 = require("../decision/eventBus");
class BaselineValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'BaselineValidationError';
    }
}
exports.BaselineValidationError = BaselineValidationError;
function cleanBaselineInput(body) {
    if (!body || typeof body !== 'object') {
        throw new BaselineValidationError('Invalid baseline payload.');
    }
    const name = body.name;
    if (typeof name !== 'string' || !name.trim()) {
        throw new BaselineValidationError('Baseline "name" is required.');
    }
    const strategy = body.strategy === 'priorRun' || body.strategy === 'hybrid' || body.strategy === 'thresholds'
        ? body.strategy
        : body.runId ? 'priorRun' : 'thresholds';
    const thresholds = {};
    if (body.thresholds && typeof body.thresholds === 'object') {
        if (typeof body.thresholds.composite === 'number') {
            thresholds.composite = Math.min(1, Math.max(0, body.thresholds.composite));
        }
        if (body.thresholds.byCriterion && typeof body.thresholds.byCriterion === 'object') {
            thresholds.byCriterion = {};
            for (const [k, v] of Object.entries(body.thresholds.byCriterion)) {
                if (typeof v === 'number') {
                    thresholds.byCriterion[k] = Math.min(1, Math.max(0, v));
                }
            }
        }
    }
    return {
        name: (0, evaluationPolicy_1.sanitizeSignal)(name.trim(), 200),
        description: typeof body.description === 'string' ? (0, evaluationPolicy_1.sanitizeSignal)(body.description, 1000) : undefined,
        runId: typeof body.runId === 'string' ? body.runId : undefined,
        strategy,
        thresholds,
    };
}
class BaselineService {
    // ---- Baselines ----
    async createBaseline(userId, input) {
        if (input.runId) {
            const run = await EvaluationRun_1.default.findOne({ _id: input.runId, userId });
            if (!run)
                throw new BaselineValidationError('Referenced evaluation run not found.');
        }
        const created = await Baseline_1.default.create({
            userId,
            name: input.name,
            description: input.description,
            runId: input.runId,
            strategy: input.strategy,
            thresholds: input.thresholds || evaluationPolicy_1.DEFAULT_EVALUATION_POLICY.defaultBaselineThresholds,
        });
        eventBus_1.executionEventBus.emit({
            type: 'evaluation.baseline.created',
            decisionId: undefined,
            data: { baselineId: created._id.toString(), strategy: created.strategy },
        });
        return created;
    }
    async listBaselines(userId) {
        return Baseline_1.default.find({ userId, status: 'active' }).sort({ createdAt: -1 });
    }
    async getBaseline(userId, baselineId) {
        return Baseline_1.default.findOne({ _id: baselineId, userId, status: 'active' });
    }
    async deleteBaseline(userId, baselineId) {
        const removed = await Baseline_1.default.findOneAndDelete({ _id: baselineId, userId });
        return Boolean(removed);
    }
    // ---- Aggregates ----
    /** Mean composite over a run's evaluated cases (errors/skips excluded). */
    async aggregateRunScore(runId) {
        const results = await EvaluationCaseResult_1.default.find({ runId });
        const scored = results.filter((r) => r.status !== 'error' && r.status !== 'skipped' && typeof r.metrics?.score === 'number');
        const count = scored.length;
        const score = count > 0
            ? scored.reduce((sum, r) => sum + r.metrics?.score, 0) / count
            : undefined;
        return { cases: results.length, included: count, score };
    }
    /**
     * Compare two runs case-by-case and detect regressions. `runA` is the
     * reference (past/baseline), `runB` the current run.
     */
    async compareRunVsRun(userId, runAId, runBId, opts = {}) {
        const runA = await EvaluationRun_1.default.findOne({ _id: runAId, userId });
        const runB = await EvaluationRun_1.default.findOne({ _id: runBId, userId });
        if (!runA)
            throw new BaselineValidationError('Reference run (A) not found.');
        if (!runB)
            throw new BaselineValidationError('Comparison run (B) not found.');
        const [resultsA, resultsB] = await Promise.all([
            EvaluationCaseResult_1.default.find({ runId: runAId }),
            EvaluationCaseResult_1.default.find({ runId: runBId }),
        ]);
        const byCase = (results) => {
            const map = new Map();
            for (const r of results) {
                if (r.metrics?.score === undefined)
                    continue;
                map.set(String(r.caseId), r.metrics.score);
            }
            return map;
        };
        const scoresA = byCase(resultsA);
        const scoresB = byCase(resultsB);
        const caseIds = new Set([...scoresA.keys(), ...scoresB.keys()]);
        const epsilon = evaluationPolicy_1.DEFAULT_EVALUATION_POLICY.regressionEpsilon;
        let regressions = 0;
        let improvements = 0;
        let unchanged = 0;
        let missingA = 0;
        let missingB = 0;
        const rows = [];
        for (const caseId of caseIds) {
            const scoreA = scoresA.get(caseId);
            const scoreB = scoresB.get(caseId);
            let direction = 'missing';
            let delta;
            if (scoreA === undefined)
                missingA++;
            if (scoreB === undefined)
                missingB++;
            if (scoreA !== undefined && scoreB !== undefined) {
                delta = scoreB - scoreA;
                if (delta < -epsilon) {
                    direction = 'regression';
                    regressions++;
                }
                else if (delta > epsilon) {
                    direction = 'improvement';
                    improvements++;
                }
                else {
                    direction = 'unchanged';
                    unchanged++;
                }
            }
            const resultA = resultsA.find((r) => String(r.caseId) === caseId);
            rows.push({
                caseId,
                caseTitle: resultA?.caseTitle,
                scoreA,
                scoreB,
                delta,
                direction,
            });
        }
        const aggA = meanComposites(resultsA);
        const aggB = meanComposites(resultsB);
        const aggregateDelta = aggA !== undefined && aggB !== undefined ? aggB - aggA : undefined;
        const regressionDetected = regressions > 0;
        const data = {
            userId,
            name: opts.name,
            runAId,
            runBId,
            type: 'run_vs_run',
            summary: {
                compared: rows.filter((r) => r.scoreA !== undefined && r.scoreB !== undefined).length,
                missingA,
                missingB,
                regressions,
                improvements,
                unchanged,
                aggregateA: aggA,
                aggregateB: aggB,
                aggregateDelta,
                regressionDetected,
                note: regressionDetected
                    ? `${regressions} case(s) regressed across the compared runs.`
                    : 'No regressions detected across the compared runs.',
            },
            perCase: rows,
        };
        if (opts.persist !== false) {
            await EvaluationComparison_1.default.create(data);
        }
        return data;
    }
    /**
     * Compare a run against a baseline. When the baseline references a prior run,
     * its per-case scores are the reference; thresholds are enforced on top.
     */
    async compareRunVsBaseline(userId, runId, baselineId, opts = {}) {
        const [run, baseline] = await Promise.all([
            EvaluationRun_1.default.findOne({ _id: runId, userId }),
            this.getBaseline(userId, baselineId),
        ]);
        if (!run)
            throw new BaselineValidationError('Evaluation run not found.');
        if (!baseline)
            throw new BaselineValidationError('Baseline not found.');
        const resultsB = await EvaluationCaseResult_1.default.find({ runId });
        const scoresB = new Map();
        for (const r of resultsB) {
            if (r.metrics?.score === undefined)
                continue;
            scoresB.set(String(r.caseId), r.metrics.score);
        }
        let scoresA = new Map();
        if (baseline.runId) {
            const resultsA = await EvaluationCaseResult_1.default.find({ runId: baseline.runId });
            for (const r of resultsA) {
                if (r.metrics?.score === undefined)
                    continue;
                scoresA.set(String(r.caseId), r.metrics.score);
            }
        }
        const thresholds = baseline.thresholds || evaluationPolicy_1.DEFAULT_EVALUATION_POLICY.defaultBaselineThresholds;
        const epsilon = evaluationPolicy_1.DEFAULT_EVALUATION_POLICY.regressionEpsilon;
        let regressions = 0;
        let improvements = 0;
        let unchanged = 0;
        let missingB = 0;
        const rows = [];
        const baselineCaseIds = new Set([...scoresA.keys(), ...resultsB.map((r) => String(r.caseId))]);
        for (const caseId of baselineCaseIds) {
            const resultB = resultsB.find((r) => String(r.caseId) === caseId);
            const floor = thresholds.composite ?? 0.6;
            const refScore = scoresA.get(caseId) ??
                (resultB?.metrics ? thresholdFloorForCase(resultB.metrics, thresholds) : undefined);
            const scoreB = scoresB.get(caseId);
            let direction = 'missing';
            let delta;
            if (scoreB === undefined) {
                missingB++;
            }
            else if (refScore === undefined) {
                // Threshold-only baseline: pass/fail against the floor.
                if (scoreB < floor - epsilon) {
                    direction = 'regression';
                    regressions++;
                }
                else if (scoreB > floor + epsilon) {
                    direction = 'improvement';
                    improvements++;
                }
                else {
                    direction = 'unchanged';
                    unchanged++;
                }
                delta = scoreB - floor;
            }
            else {
                delta = scoreB - refScore;
                if (delta < -epsilon) {
                    direction = 'regression';
                    regressions++;
                }
                else if (delta > epsilon) {
                    direction = 'improvement';
                    improvements++;
                }
                else {
                    direction = 'unchanged';
                    unchanged++;
                }
            }
            rows.push({
                caseId,
                caseTitle: resultB?.caseTitle,
                scoreA: refScore,
                scoreB,
                delta,
                direction,
            });
        }
        const aggB = meanComposites(resultsB);
        const aggregateDelta = aggB !== undefined && thresholds.composite !== undefined ? aggB - thresholds.composite : undefined;
        const regressionDetected = regressions > 0;
        const data = {
            userId,
            name: opts.name,
            runAId: baseline.runId ? String(baseline.runId) : '',
            runBId: runId,
            baselineId,
            type: 'run_vs_baseline',
            summary: {
                compared: rows.filter((r) => r.scoreB !== undefined).length,
                missingA: baseline.runId ? 0 : rows.filter((r) => r.scoreA === undefined).length,
                missingB,
                regressions,
                improvements,
                unchanged,
                aggregateB: aggB,
                aggregateDelta,
                regressionDetected,
                note: regressionDetected
                    ? `${regressions} case(s) fell below the baseline.`
                    : 'Run meets or exceeds the baseline.',
            },
            perCase: rows,
        };
        if (opts.persist !== false) {
            await EvaluationComparison_1.default.create(data);
        }
        return data;
    }
    async listComparisons(userId) {
        return EvaluationComparison_1.default.find({ userId }).sort({ createdAt: -1 });
    }
    async getComparison(userId, comparisonId) {
        return EvaluationComparison_1.default.findOne({ _id: comparisonId, userId });
    }
}
exports.BaselineService = BaselineService;
function meanComposites(results) {
    const scored = results.filter((r) => typeof r.metrics?.score === 'number');
    if (scored.length === 0)
        return undefined;
    return scored.reduce((sum, r) => sum + r.metrics?.score, 0) / scored.length;
}
function thresholdFloorForCase(metrics, thresholds) {
    const floors = [];
    if (thresholds.composite !== undefined)
        floors.push(thresholds.composite);
    if (thresholds.byCriterion && metrics.categories) {
        for (const c of metrics.categories) {
            const floor = thresholds.byCriterion[c.key];
            if (typeof floor === 'number')
                floors.push(floor);
        }
    }
    return floors.length ? Math.max(...floors) : undefined;
}
exports.baselineService = new BaselineService();
