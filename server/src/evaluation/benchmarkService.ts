import Benchmark, { IBenchmark } from '../models/Benchmark';
import BenchmarkCase, { IBenchmarkCase } from '../models/BenchmarkCase';
import Rubric from '../models/Rubric';
import { ExpectedStructure, StaticProvidedAnswer } from './types';
import { DEFAULT_EXPECTED_STRUCTURE, sanitizeSignal } from './evaluationPolicy';
import { executionEventBus } from '../decision/eventBus';

/**
 * Phase 9 — BenchmarkService.
 *
 * CRUD for benchmarks and their cases. A benchmark is a versioned collection of
 * cases; a case declares structural criteria for a satisfactory response plus
 * (optionally) a static artifact to evaluate. Criteria, never ground truth.
 *
 * Every read/write is ownership-scoped → unknown ids surface as `null`/`false`
 * so routes can return 404 without ever leaking another user's objects.
 */

export type BenchmarkInput = {
  name: string;
  description?: string;
  tags?: string[];
  defaultRubricId?: string;
};

export type CaseInput = {
  title: string;
  prompt: string;
  context?: string;
  category?: string;
  tags?: string[];
  difficulty?: 'easy' | 'medium' | 'hard';
  expectedStructure?: Partial<ExpectedStructure>;
  providedAnswer?: StaticProvidedAnswer;
  metadata?: Record<string, unknown>;
  providedAnswerRule?: never;
};

export class BenchmarkValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BenchmarkValidationError';
  }
}

export function cleanBenchmarkInput(body: any): BenchmarkInput {
  if (!body || typeof body !== 'object') {
    throw new BenchmarkValidationError('Invalid benchmark payload.');
  }
  const name = body.name;
  if (typeof name !== 'string' || !name.trim()) {
    throw new BenchmarkValidationError('Benchmark "name" is required.');
  }
  return {
    name: sanitizeSignal(name.trim(), 200),
    description:
      typeof body.description === 'string' ? sanitizeSignal(body.description, 1000) : undefined,
    tags: stringArray(body.tags).map((t) => sanitizeSignal(t, 100)).filter(Boolean),
    defaultRubricId: typeof body.defaultRubricId === 'string' ? body.defaultRubricId : undefined,
  };
}

export function cleanCaseInput(body: any): CaseInput {
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

  const struct = { ...DEFAULT_EXPECTED_STRUCTURE };
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

  let providedAnswer: StaticProvidedAnswer | undefined;
  if (body.providedAnswer && typeof body.providedAnswer === 'object') {
    const pa = body.providedAnswer;
    providedAnswer = {
      answerText: typeof pa.answerText === 'string' ? sanitizeSignal(pa.answerText, 4000) : undefined,
      recommendation:
        typeof pa.recommendation === 'string' ? sanitizeSignal(pa.recommendation, 2000) : undefined,
      rationale:
        typeof pa.rationale === 'string' ? sanitizeSignal(pa.rationale, 4000) : undefined,
      assumptions: stringArray(pa.assumptions).slice(0, 20),
      confidence: typeof pa.confidence === 'number' ? pa.confidence : undefined,
      evidenceRefs: stringArray(pa.evidenceRefs).slice(0, 50),
    };
    if (
      !providedAnswer.answerText &&
      !providedAnswer.recommendation &&
      !providedAnswer.rationale &&
      providedAnswer.assumptions.length === 0
    ) {
      providedAnswer = undefined;
    }
  }

  return {
    title: sanitizeSignal(title.trim(), 200),
    prompt: sanitizeSignal(prompt.trim(), 4000),
    context: typeof body.context === 'string' ? sanitizeSignal(body.context, 4000) : undefined,
    category: typeof body.category === 'string' ? sanitizeSignal(body.category, 120) : undefined,
    tags: stringArray(body.tags).slice(0, 20),
    difficulty: ['easy', 'medium', 'hard'].includes(body.difficulty) ? body.difficulty : undefined,
    expectedStructure: struct,
    providedAnswer,
    metadata: body.metadata && typeof body.metadata === 'object' ? scrubMetadata(body.metadata) : undefined,
  };
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

function scrubMetadata(value: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof v === 'string') out[k] = sanitizeSignal(v, 500);
    else if (typeof v === 'number' || typeof v === 'boolean' || v === null) out[k] = v;
  }
  return out;
}

export class BenchmarkService {
  // ---- Benchmarks ----

  async createBenchmark(userId: string, input: BenchmarkInput): Promise<IBenchmark> {
    const created = await Benchmark.create({ userId, ...input });
    executionEventBus.emit({
      type: 'evaluation.benchmark.created',
      decisionId: undefined,
      data: { benchmarkId: created._id.toString(), userId },
    });
    return created;
  }

  async listBenchmarks(userId: string): Promise<IBenchmark[]> {
    return Benchmark.find({ userId }).sort({ createdAt: -1 });
  }

  async getBenchmark(userId: string, benchmarkId: string): Promise<IBenchmark | null> {
    return Benchmark.findOne({ _id: benchmarkId, userId });
  }

  async updateBenchmark(
    userId: string,
    benchmarkId: string,
    input: Partial<BenchmarkInput>
  ): Promise<IBenchmark | null> {
    const update: Record<string, unknown> = {};
    if (input.name !== undefined) update.name = input.name;
    if (input.description !== undefined) update.description = input.description;
    if (input.tags !== undefined) update.tags = input.tags;
    if (input.defaultRubricId !== undefined) update.defaultRubricId = input.defaultRubricId;
    const updated = await Benchmark.findOneAndUpdate({ _id: benchmarkId, userId }, update, {
      new: true,
    });
    if (updated) {
      updated.version = (updated.version || 1) + 1;
      await updated.save();
    }
    return updated;
  }

  async deleteBenchmark(userId: string, benchmarkId: string): Promise<boolean> {
    const benchmark = await Benchmark.findOne({ _id: benchmarkId, userId });
    if (!benchmark) return false;
    await BenchmarkCase.deleteMany({ benchmarkId });
    await benchmark.deleteOne();
    return true;
  }

  /** Count active cases (validates "empty benchmarks can't be run"). */
  async activeCaseCount(benchmarkId: string): Promise<number> {
    return BenchmarkCase.countDocuments({ benchmarkId, status: 'active' });
  }

  // ---- Cases ----

  async addCase(
    userId: string,
    benchmarkId: string,
    input: CaseInput
  ): Promise<IBenchmarkCase | null> {
    const benchmark = await Benchmark.findOne({ _id: benchmarkId, userId });
    if (!benchmark) return null;
    const created = await BenchmarkCase.create({
      userId,
      benchmarkId,
      title: input.title,
      prompt: input.prompt,
      context: input.context,
      category: input.category,
      tags: input.tags || [],
      difficulty: input.difficulty,
      version: 1,
      expectedStructure: input.expectedStructure || DEFAULT_EXPECTED_STRUCTURE,
      providedAnswer: input.providedAnswer,
      metadata: input.metadata,
    });
    benchmark.version = (benchmark.version || 1) + 1;
    await benchmark.save();
    return created;
  }

  async listCases(userId: string, benchmarkId: string): Promise<IBenchmarkCase[]> {
    return BenchmarkCase.find({ benchmarkId, userId }).sort({ createdAt: 1 });
  }

  async getCase(userId: string, caseId: string): Promise<IBenchmarkCase | null> {
    return BenchmarkCase.findOne({ _id: caseId, userId });
  }

  /** Get active cases of a benchmark, optionally limited to selected ids. */
  async activeCases(
    benchmarkId: string,
    selectedCaseIds?: string[]
  ): Promise<IBenchmarkCase[]> {
    const filter: Record<string, unknown> = { benchmarkId, status: 'active' };
    if (Array.isArray(selectedCaseIds) && selectedCaseIds.length) {
      filter._id = { $in: selectedCaseIds };
    }
    return BenchmarkCase.find(filter).sort({ createdAt: 1 });
  }

  async updateCase(
    userId: string,
    caseId: string,
    input: Partial<CaseInput>
  ): Promise<IBenchmarkCase | null> {
    const current = await BenchmarkCase.findOne({ _id: caseId, userId });
    if (!current) return null;
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
    const benchmark = await Benchmark.findById(saved.benchmarkId);
    if (benchmark) {
      benchmark.version = (benchmark.version || 1) + 1;
      await benchmark.save();
    }
    return saved;
  }

  async deleteCase(userId: string, caseId: string): Promise<boolean> {
    const removed = await BenchmarkCase.findOneAndDelete({ _id: caseId, userId });
    return Boolean(removed);
  }

  /** Resolve the benchmark's default rubric if set and owned. */
  async resolveDefaultRubricId(userId: string, benchmarkId: string): Promise<string | undefined> {
    const benchmark = await this.getBenchmark(userId, benchmarkId);
    if (!benchmark?.defaultRubricId) return undefined;
    const rubric = await Rubric.findOne({ _id: benchmark.defaultRubricId, userId });
    return rubric ? String(rubric._id) : undefined;
  }
}

export const benchmarkService = new BenchmarkService();