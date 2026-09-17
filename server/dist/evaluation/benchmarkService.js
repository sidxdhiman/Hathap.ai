"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.benchmarkService = exports.BenchmarkService = exports.BenchmarkValidationError = void 0;
exports.cleanBenchmarkInput = cleanBenchmarkInput;
exports.cleanCaseInput = cleanCaseInput;
const Benchmark_1 = __importDefault(require("../models/Benchmark"));
const BenchmarkCase_1 = __importDefault(require("../models/BenchmarkCase"));
const Rubric_1 = __importDefault(require("../models/Rubric"));
const evaluationPolicy_1 = require("./evaluationPolicy");
const eventBus_1 = require("../decision/eventBus");
class BenchmarkValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'BenchmarkValidationError';
    }
}
exports.BenchmarkValidationError = BenchmarkValidationError;
function cleanBenchmarkInput(body) {
    if (!body || typeof body !== 'object') {
        throw new BenchmarkValidationError('Invalid benchmark payload.');
    }
    const name = body.name;
    if (typeof name !== 'string' || !name.trim()) {
        throw new BenchmarkValidationError('Benchmark "name" is required.');
    }
    return {
        name: (0, evaluationPolicy_1.sanitizeSignal)(name.trim(), 200),
        description: typeof body.description === 'string' ? (0, evaluationPolicy_1.sanitizeSignal)(body.description, 1000) : undefined,
        tags: stringArray(body.tags).map((t) => (0, evaluationPolicy_1.sanitizeSignal)(t, 100)).filter(Boolean),
        defaultRubricId: typeof body.defaultRubricId === 'string' ? body.defaultRubricId : undefined,
    };
}
function cleanCaseInput(body) {
    if (!body || typeof body !== 'object') {
        throw new BenchmarkValidationError('Invalid case payload.');
    }
    const title = body.title;
    const prompt = body.prompt;
    if (typeof title !== 'string' || !title.trim()) {
        throw new BenchmarkValidationError('Case "title" is required.');
    }
    if (typeof prompt !== 'string' || !prompt.trim()) {
        throw new BenchmarkValidationError('Case "prompt" is required.');
    }
    const struct = { ...evaluationPolicy_1.DEFAULT_EXPECTED_STRUCTURE };
    if (body.expectedStructure && typeof body.expectedStructure === 'object') {
        if (typeof body.expectedStructure.requiresRecommendation === 'boolean') {
            struct.requiresRecommendation = body.expectedStructure.requiresRecommendation;
        }
        if (typeof body.expectedStructure.requiresEvidence === 'boolean') {
            struct.requiresEvidence = body.expectedStructure.requiresEvidence;
        }
        if (typeof body.expectedStructure.requiresAssumptions === 'boolean') {
            struct.requiresAssumptions = body.expectedStructure.requiresAssumptions;
        }
        if (typeof body.expectedStructure.requiresConfidence === 'boolean') {
            struct.requiresConfidence = body.expectedStructure.requiresConfidence;
        }
        if (typeof body.expectedStructure.minAnswerLength === 'number') {
            struct.minAnswerLength = Math.max(0, body.expectedStructure.minAnswerLength);
        }
        if (typeof body.expectedStructure.maxAnswerLength === 'number') {
            struct.maxAnswerLength = Math.max(0, body.expectedStructure.maxAnswerLength);
        }
        if (Array.isArray(body.expectedStructure.mustMention)) {
            struct.mustMention = stringArray(body.expectedStructure.mustMention).slice(0, 10);
        }
    }
    let providedAnswer;
    if (body.providedAnswer && typeof body.providedAnswer === 'object') {
        const pa = body.providedAnswer;
        providedAnswer = {
            answerText: typeof pa.answerText === 'string' ? (0, evaluationPolicy_1.sanitizeSignal)(pa.answerText, 4000) : undefined,
            recommendation: typeof pa.recommendation === 'string' ? (0, evaluationPolicy_1.sanitizeSignal)(pa.recommendation, 2000) : undefined,
            rationale: typeof pa.rationale === 'string' ? (0, evaluationPolicy_1.sanitizeSignal)(pa.rationale, 4000) : undefined,
            assumptions: stringArray(pa.assumptions).slice(0, 20),
            confidence: typeof pa.confidence === 'number' ? pa.confidence : undefined,
            evidenceRefs: stringArray(pa.evidenceRefs).slice(0, 50),
        };
        if (!providedAnswer.answerText &&
            !providedAnswer.recommendation &&
            !providedAnswer.rationale &&
            providedAnswer.assumptions.length === 0) {
            providedAnswer = undefined;
        }
    }
    return {
        title: (0, evaluationPolicy_1.sanitizeSignal)(title.trim(), 200),
        prompt: (0, evaluationPolicy_1.sanitizeSignal)(prompt.trim(), 4000),
        context: typeof body.context === 'string' ? (0, evaluationPolicy_1.sanitizeSignal)(body.context, 4000) : undefined,
        category: typeof body.category === 'string' ? (0, evaluationPolicy_1.sanitizeSignal)(body.category, 120) : undefined,
        tags: stringArray(body.tags).slice(0, 20),
        difficulty: ['easy', 'medium', 'hard'].includes(body.difficulty) ? body.difficulty : undefined,
        expectedStructure: struct,
        providedAnswer,
        metadata: body.metadata && typeof body.metadata === 'object' ? scrubMetadata(body.metadata) : undefined,
    };
}
function stringArray(value) {
    if (!Array.isArray(value))
        return [];
    return value.filter((v) => typeof v === 'string');
}
function scrubMetadata(value) {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
        if (typeof v === 'string')
            out[k] = (0, evaluationPolicy_1.sanitizeSignal)(v, 500);
        else if (typeof v === 'number' || typeof v === 'boolean' || v === null)
            out[k] = v;
    }
    return out;
}
class BenchmarkService {
    // ---- Benchmarks ----
    async createBenchmark(userId, input) {
        const created = await Benchmark_1.default.create({ userId, ...input });
        eventBus_1.executionEventBus.emit({
            type: 'evaluation.benchmark.created',
            decisionId: undefined,
            data: { benchmarkId: created._id.toString(), userId },
        });
        return created;
    }
    async listBenchmarks(userId) {
        return Benchmark_1.default.find({ userId }).sort({ createdAt: -1 });
    }
    async getBenchmark(userId, benchmarkId) {
        return Benchmark_1.default.findOne({ _id: benchmarkId, userId });
    }
    async updateBenchmark(userId, benchmarkId, input) {
        const update = {};
        if (input.name !== undefined)
            update.name = input.name;
        if (input.description !== undefined)
            update.description = input.description;
        if (input.tags !== undefined)
            update.tags = input.tags;
        if (input.defaultRubricId !== undefined)
            update.defaultRubricId = input.defaultRubricId;
        const updated = await Benchmark_1.default.findOneAndUpdate({ _id: benchmarkId, userId }, update, {
            new: true,
        });
        if (updated) {
            updated.version = (updated.version || 1) + 1;
            await updated.save();
        }
        return updated;
    }
    async deleteBenchmark(userId, benchmarkId) {
        const benchmark = await Benchmark_1.default.findOne({ _id: benchmarkId, userId });
        if (!benchmark)
            return false;
        await BenchmarkCase_1.default.deleteMany({ benchmarkId });
        await benchmark.deleteOne();
        return true;
    }
    /** Count active cases (validates "empty benchmarks can't be run"). */
    async activeCaseCount(benchmarkId) {
        return BenchmarkCase_1.default.countDocuments({ benchmarkId, status: 'active' });
    }
    // ---- Cases ----
    async addCase(userId, benchmarkId, input) {
        const benchmark = await Benchmark_1.default.findOne({ _id: benchmarkId, userId });
        if (!benchmark)
            return null;
        const created = await BenchmarkCase_1.default.create({
            userId,
            benchmarkId,
            title: input.title,
            prompt: input.prompt,
            context: input.context,
            category: input.category,
            tags: input.tags || [],
            difficulty: input.difficulty,
            version: 1,
            expectedStructure: input.expectedStructure || evaluationPolicy_1.DEFAULT_EXPECTED_STRUCTURE,
            providedAnswer: input.providedAnswer,
            metadata: input.metadata,
        });
        benchmark.version = (benchmark.version || 1) + 1;
        await benchmark.save();
        return created;
    }
    async listCases(userId, benchmarkId) {
        return BenchmarkCase_1.default.find({ benchmarkId, userId }).sort({ createdAt: 1 });
    }
    async getCase(userId, caseId) {
        return BenchmarkCase_1.default.findOne({ _id: caseId, userId });
    }
    /** Get active cases of a benchmark, optionally limited to selected ids. */
    async activeCases(benchmarkId, selectedCaseIds) {
        const filter = { benchmarkId, status: 'active' };
        if (Array.isArray(selectedCaseIds) && selectedCaseIds.length) {
            filter._id = { $in: selectedCaseIds };
        }
        return BenchmarkCase_1.default.find(filter).sort({ createdAt: 1 });
    }
    async updateCase(userId, caseId, input) {
        const current = await BenchmarkCase_1.default.findOne({ _id: caseId, userId });
        if (!current)
            return null;
        current.set({
            ...(input.title !== undefined ? { title: input.title } : {}),
            ...(input.prompt !== undefined ? { prompt: input.prompt } : {}),
            ...(input.context !== undefined ? { context: input.context } : {}),
            ...(input.category !== undefined ? { category: input.category } : {}),
            ...(input.tags !== undefined ? { tags: input.tags } : {}),
            ...(input.difficulty !== undefined ? { difficulty: input.difficulty } : {}),
            ...(input.expectedStructure !== undefined ? { expectedStructure: input.expectedStructure } : {}),
            ...(input.providedAnswer !== undefined ? { providedAnswer: input.providedAnswer } : {}),
        });
        current.version = (current.version || 1) + 1;
        const saved = await current.save();
        const benchmark = await Benchmark_1.default.findById(saved.benchmarkId);
        if (benchmark) {
            benchmark.version = (benchmark.version || 1) + 1;
            await benchmark.save();
        }
        return saved;
    }
    async deleteCase(userId, caseId) {
        const removed = await BenchmarkCase_1.default.findOneAndDelete({ _id: caseId, userId });
        return Boolean(removed);
    }
    /** Resolve the benchmark's default rubric if set and owned. */
    async resolveDefaultRubricId(userId, benchmarkId) {
        const benchmark = await this.getBenchmark(userId, benchmarkId);
        if (!benchmark?.defaultRubricId)
            return undefined;
        const rubric = await Rubric_1.default.findOne({ _id: benchmark.defaultRubricId, userId });
        return rubric ? String(rubric._id) : undefined;
    }
}
exports.BenchmarkService = BenchmarkService;
exports.benchmarkService = new BenchmarkService();
