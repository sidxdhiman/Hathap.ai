"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.seedBenchmarkCaseCount = void 0;
exports.ensureInitialSeed = ensureInitialSeed;
const Benchmark_1 = __importDefault(require("../models/Benchmark"));
const BenchmarkCase_1 = __importDefault(require("../models/BenchmarkCase"));
const Rubric_1 = __importDefault(require("../models/Rubric"));
const rubricService_1 = require("./rubricService");
const benchmarkService_1 = require("./benchmarkService");
/**
 * Phase 9 — initialBenchmark.
 *
 * Seeds a default benchmark (a small deterministic case set) and the default
 * rubric per user on first use. The seed is idempotent: an existing seed for
 * the user is reused rather than duplicated.
 */
const SEED_NAME = 'Seed benchmark — decision basics';
async function ensureInitialSeed(userId) {
    const existing = await Benchmark_1.default.findOne({ userId, name: SEED_NAME });
    if (existing) {
        const rubric = await Rubric_1.default.findOne({ userId, name: 'Default rubric' });
        return {
            benchmarkId: existing._id.toString(),
            caseCount: await BenchmarkCase_1.default.countDocuments({ benchmarkId: existing._id, status: 'active' }),
            rubricId: rubric ? rubric._id.toString() : '',
            rubricVersion: rubric ? rubric.version : 0,
            seeded: true,
            created: false,
        };
    }
    const rubric = await rubricService_1.rubricService.createRubric(userId, {
        name: 'Default rubric',
        description: 'Default evaluator-agnostic scoring criteria.',
    });
    const benchmark = await benchmarkService_1.benchmarkService.createBenchmark(userId, {
        name: SEED_NAME,
        description: 'Starter benchmark exercising structural, quality and outcome criteria without needing an LLM provider.',
        tags: ['seed', 'structural', 'deterministic'],
        defaultRubricId: rubric._id.toString(),
    });
    let caseCount = 0;
    const seedCases = [
        {
            title: 'Confident structured recommendation',
            prompt: 'Should we migrate our payments service to a new provider?',
            expectedStructure: {
                requiresRecommendation: true,
                requiresEvidence: true,
                requiresAssumptions: true,
                requiresConfidence: true,
                minAnswerLength: 80,
                mustMention: ['migrate'],
            },
            providedAnswer: {
                recommendation: 'Yes, migrate the payments service to the new provider after a staged rollout.',
                rationale: 'The new provider meets compliance requirements and our load tests show a 2x throughput headroom; a staged rollout de-risks regression.',
                assumptions: ['The new provider remains available in our region.'],
                confidence: 0.8,
                evidenceRefs: ['load-tests-report', 'compliance-certificate'],
            },
        },
        {
            title: 'Evidence-poor recommendation',
            prompt: 'Should we drop native mobile support?',
            expectedStructure: {
                requiresRecommendation: true,
                requiresEvidence: true,
                requiresAssumptions: false,
                requiresConfidence: true,
                minAnswerLength: 60,
                mustMention: [],
            },
            providedAnswer: {
                recommendation: 'Drop native mobile support.',
                rationale: 'It feels like the roadmap should focus on web.',
                confidence: 0.5,
                assumptions: [],
                evidenceRefs: [],
            },
        },
        {
            title: 'Incomplete answer (missing confidence)',
            prompt: 'Should we adopt a four-day work week?',
            expectedStructure: {
                requiresRecommendation: true,
                requiresEvidence: false,
                requiresAssumptions: false,
                requiresConfidence: true,
                minAnswerLength: 40,
                mustMention: [],
            },
            providedAnswer: {
                recommendation: 'Yes.',
                rationale: 'A four-day week improves retention according to internal surveys.',
                assumptions: [],
                evidenceRefs: ['internal-survey-2026'],
            },
        },
    ];
    for (const c of seedCases) {
        await benchmarkService_1.benchmarkService.addCase(userId, benchmark._id.toString(), c);
        caseCount++;
    }
    return {
        benchmarkId: benchmark._id.toString(),
        caseCount,
        rubricId: rubric._id.toString(),
        rubricVersion: rubric.version,
        seeded: true,
        created: true,
    };
}
exports.seedBenchmarkCaseCount = 3;
