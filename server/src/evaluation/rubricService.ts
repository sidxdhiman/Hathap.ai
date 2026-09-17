import Rubric, { IRubric, IRubricVersion } from '../models/Rubric';
import { CRITERION_KEYS, DEFAULT_CRITERIA, EvalCriterionConfig, RubricSnapshot } from './types';
import { normalizeCriteria, sanitizeSignal } from './evaluationPolicy';

/**
 * Phase 9 — RubricService.
 *
 * Rubrics define weighted scoring criteria. Every update bumps the version and
 * appends to a bounded history so evaluation runs stay pinned to the exact
 * criterion set they were scored against (rubric/version tracking).
 */

export const MAX_RUBRIC_VERSIONS = 20;
export const DEFAULT_RUBRIC_NAME = 'Default rubric';

export type RubricInput = {
  name: string;
  description?: string;
  criteria?: EvalCriterionConfig[];
};

export class RubricValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RubricValidationError';
  }
}

export function cleanRubricInput(body: any): RubricInput {
  if (!body || typeof body !== 'object') {
    throw new RubricValidationError('Invalid rubric payload.');
  }
  const name = body.name;
  if (typeof name !== 'string' || !name.trim()) {
    throw new RubricValidationError('Rubric "name" is required.');
  }
  let criteria: EvalCriterionConfig[] | undefined;
  if (body.criteria !== undefined) {
    if (!Array.isArray(body.criteria) || body.criteria.length === 0) {
      throw new RubricValidationError('Rubric "criteria" must be a non-empty array.');
    }
    const normalized = normalizeCriteria(body.criteria);
    const allowed = new Set(CRITERION_KEYS);
    for (const c of normalized) {
      if (!allowed.has(c.key)) {
        throw new RubricValidationError(`Unknown criterion key "${c.key}".`);
      }
    }
    criteria = normalized;
  }
  return {
    name: sanitizeSignal(name.trim(), 200),
    description: typeof body.description === 'string' ? sanitizeSignal(body.description, 1000) : undefined,
    criteria,
  };
}

export class RubricService {
  getDefaultRubric(userId: string): IRubric {
    return new Rubric({
      userId,
      name: DEFAULT_RUBRIC_NAME,
      description: 'Default evaluator-agnostic scoring criteria.',
      version: 1,
      status: 'active',
      criteria: DEFAULT_CRITERIA,
      versions: [],
    }) as IRubric;
  }

  async createRubric(userId: string, input: RubricInput): Promise<IRubric> {
    const criteria = input.criteria && Array.isArray(input.criteria) ? input.criteria : DEFAULT_CRITERIA;
    const rubric = await Rubric.create({
      userId,
      name: input.name,
      description: input.description,
      version: 1,
      status: 'active',
      criteria,
      versions: [],
    });
    return rubric;
  }

  async listRubrics(userId: string): Promise<IRubric[]> {
    return Rubric.find({ userId }).sort({ updatedAt: -1 });
  }

  async getRubric(userId: string, rubricId: string): Promise<IRubric | null> {
    return Rubric.findOne({ _id: rubricId, userId });
  }

  async getRubricSnapshot(userId: string, rubricId: string): Promise<RubricSnapshot | null> {
    const rubric = await this.getRubric(userId, rubricId);
    if (!rubric) return null;
    const raw = this.rubricVersionCriteria(rubric, rubric.version);
    if (!raw) return null;
    return { rubricId: String(rubric._id), version: rubric.version, criteria: raw };
  }

  /**
   * Update a rubric → version advances by 1 and the previous criteria set is
   * appended to the (bounded) version history for reproducibility.
   */
  async updateRubric(
    userId: string,
    rubricId: string,
    input: Partial<RubricInput>
  ): Promise<IRubric | null> {
    const rubric = await this.getRubric(userId, rubricId);
    if (!rubric) return null;

    const snapshot: IRubricVersion = {
      version: rubric.version,
      criteria: rubric.criteria.map((c) => ({ ...c })),
      createdAt: new Date(),
    };

    if (input.name !== undefined) rubric.name = input.name;
    if (input.description !== undefined) rubric.description = input.description;
    if (input.criteria !== undefined && Array.isArray(input.criteria) && input.criteria.length) {
      rubric.criteria = input.criteria;
    }

    rubric.version = (rubric.version || 1) + 1;
    const history = [...(rubric.versions || []), snapshot];
    rubric.versions = history.slice(-MAX_RUBRIC_VERSIONS);
    const saved = await rubric.save();
    return saved;
  }

  async deleteRubric(userId: string, rubricId: string): Promise<boolean> {
    const removed = await Rubric.findOneAndDelete({ _id: rubricId, userId });
    return Boolean(removed);
  }

  /** Look up criteria for a pinned version (falls back to the latest). */
  private rubricVersionCriteria(
    rubric: IRubric,
    version?: number
  ): EvalCriterionConfig[] | null {
    if (!version || version === rubric.version) return rubric.criteria;
    const historical = (rubric.versions || []).find((v) => v.version === version);
    return historical ? historical.criteria : rubric.criteria;
  }
}

export const rubricService = new RubricService();