import Outcome, { IOutcome } from '../models/Outcome';
import { executionEventBus } from '../decision/eventBus';
import {
  ExpectedVsActualSummary,
  OutcomeStatus,
  OutcomeMetric,
  MetricDirection,
  OutcomeKind,
  MetricComparison,
} from './types';

export type OutcomeInput = {
  kind: OutcomeKind;
  status: OutcomeStatus;
  description: string;
  observedAt?: string | Date;
  observedMetric?: number;
  metrics?: OutcomeMetric[];
  source?: 'human' | 'system_observed';
  notes?: string;
};

const OUTCOME_KINDS: OutcomeKind[] = ['expected', 'actual'];
const OUTCOME_STATUSES: OutcomeStatus[] = [
  'pending',
  'partial',
  'success',
  'failure',
  'unknown',
  'cancelled',
];
const DIRECTIONS: MetricDirection[] = ['increase', 'decrease', 'neutral', 'unknown'];

export class OutcomeValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OutcomeValidationError';
  }
}

export function validateOutcomeStatus(value: unknown): value is OutcomeStatus {
  return typeof value === 'string' && (OUTCOME_STATUSES as string[]).includes(value);
}

function cleanMetric(raw: any): OutcomeMetric {
  if (!raw || typeof raw !== 'object') {
    throw new OutcomeValidationError('Each metric must be an object with a name.');
  }
  const name = raw.name;
  if (typeof name !== 'string' || !name.trim()) {
    throw new OutcomeValidationError('Each metric requires a "name".');
  }
  const direction: MetricDirection =
    typeof raw.direction === 'string' && (DIRECTIONS as string[]).includes(raw.direction)
      ? raw.direction
      : 'unknown';
  const metric: OutcomeMetric = {
    name: name.trim(),
    unit: typeof raw.unit === 'string' ? raw.unit : undefined,
    baseline: typeof raw.baseline === 'number' ? raw.baseline : undefined,
    target: typeof raw.target === 'number' ? raw.target : undefined,
    actual: typeof raw.actual === 'number' ? raw.actual : undefined,
    direction,
    source: typeof raw.source === 'string' ? raw.source : undefined,
    observedAt: raw.observedAt ? new Date(raw.observedAt) : undefined,
  };
  if (metric.observedAt && Number.isNaN(metric.observedAt.getTime())) {
    throw new OutcomeValidationError(`Metric "${metric.name}" has an invalid observedAt.`);
  }
  return metric;
}

function cleanMetrics(raw: unknown): OutcomeMetric[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new OutcomeValidationError('"metrics" must be an array.');
  return raw.map(cleanMetric);
}

export function cleanOutcomeInput(body: any, initial: OutcomeKind, defaultStatus: OutcomeStatus): OutcomeInput {
  if (!body || typeof body !== 'object') {
    throw new OutcomeValidationError('Invalid outcome payload.');
  }
  const description = body.description;
  if (typeof description !== 'string' || !description.trim()) {
    throw new OutcomeValidationError('Outcome "description" is required.');
  }

  const kind = (body.kind === 'actual' || body.kind === 'expected') ? body.kind : initial;

  let status: OutcomeStatus;
  if (body.status === undefined) {
    status = defaultStatus;
  } else if (validateOutcomeStatus(body.status)) {
    status = body.status;
  } else {
    throw new OutcomeValidationError(
      `Invalid outcome status "${body.status}". Expected one of: ${OUTCOME_STATUSES.join(', ')}.`
    );
  }

  const observedAt = body.observedAt ? new Date(body.observedAt) : undefined;
  if (observedAt && Number.isNaN(observedAt.getTime())) {
    throw new OutcomeValidationError('Outcome observedAt is invalid.');
  }

  return {
    kind,
    status,
    description: description.trim(),
    observedAt,
    observedMetric: typeof body.observedMetric === 'number' ? body.observedMetric : undefined,
    metrics: cleanMetrics(body.metrics),
    source: body.source === 'system_observed' ? 'system_observed' : 'human',
    notes: typeof body.notes === 'string' ? body.notes : undefined,
  };
}

/** Partial validation for PATCH: only validate the fields that were provided. */
export function cleanOutcomePatch(body: any): Partial<OutcomeInput> {
  if (!body || typeof body !== 'object') {
    throw new OutcomeValidationError('Invalid outcome payload.');
  }
  const patch: Partial<OutcomeInput> = {};

  if (body.kind !== undefined) {
    if (body.kind !== 'expected' && body.kind !== 'actual') {
      throw new OutcomeValidationError('Outcome kind must be "expected" or "actual".');
    }
    patch.kind = body.kind;
  }

  if (body.status !== undefined) {
    if (!validateOutcomeStatus(body.status)) {
      throw new OutcomeValidationError(
        `Invalid outcome status "${body.status}". Expected one of: ${OUTCOME_STATUSES.join(', ')}.`
      );
    }
    patch.status = body.status;
  }

  if (body.description !== undefined) {
    if (typeof body.description !== 'string' || !body.description.trim()) {
      throw new OutcomeValidationError('Outcome description must be a non-empty string.');
    }
    patch.description = body.description.trim();
  }

  if (body.observedAt !== undefined) {
    if (typeof body.observedAt !== 'string' && !(body.observedAt instanceof Date)) {
      throw new OutcomeValidationError('Outcome observedAt must be a date.');
    }
    const d = new Date(body.observedAt);
    if (Number.isNaN(d.getTime())) throw new OutcomeValidationError('Outcome observedAt is invalid.');
    patch.observedAt = d;
  }

  if (body.observedMetric !== undefined) {
    if (typeof body.observedMetric !== 'number') {
      throw new OutcomeValidationError('Outcome observedMetric must be a number.');
    }
    patch.observedMetric = body.observedMetric;
  }

  if (body.metrics !== undefined) patch.metrics = cleanMetrics(body.metrics);

  if (body.notes !== undefined) {
    if (typeof body.notes !== 'string') throw new OutcomeValidationError('Outcome notes must be a string.');
    patch.notes = body.notes;
  }

  return patch;
}

/**
 * Phase 8 — OutcomeService.
 *
 * Persists human-entered expected/actual outcomes and computes the expected-vs-
 * actual comparison. Variance is only produced when both a target and an actual
 * value exist; otherwise the comparison is honestly "unavailable".
 */
export class OutcomeService {
  async create(
    userId: string,
    decisionId: string,
    input: OutcomeInput
  ): Promise<IOutcome> {
    const created = await Outcome.create({
      userId,
      decisionId,
      kind: input.kind,
      status: input.status,
      description: input.description,
      observedAt: input.observedAt,
      observedMetric: input.observedMetric,
      metrics: input.metrics || [],
      source: input.source || 'human',
      notes: input.notes,
    });
    executionEventBus.emit({
      type: 'outcome.created',
      decisionId,
      data: {
        outcomeId: created._id.toString(),
        kind: created.kind,
        status: created.status,
      },
    });
    return created;
  }

  async update(
    userId: string,
    decisionId: string,
    outcomeId: string,
    input: Partial<OutcomeInput>
  ): Promise<IOutcome | null> {
    const outcome = await Outcome.findOne({ _id: outcomeId, decisionId, userId });
    if (!outcome) return null;
    outcome.set({
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.observedAt !== undefined ? { observedAt: input.observedAt } : {}),
      ...(input.observedMetric !== undefined ? { observedMetric: input.observedMetric } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.metrics !== undefined ? { metrics: input.metrics } : {}),
    });
    const saved = await outcome.save();
    executionEventBus.emit({
      type: 'outcome.updated',
      decisionId,
      data: {
        outcomeId: saved._id.toString(),
        kind: saved.kind,
        status: saved.status,
      },
    });
    return saved;
  }

  async list(userId: string, decisionId: string): Promise<IOutcome[]> {
    return Outcome.find({ decisionId, userId }).sort({ createdAt: 1 });
  }

  async findOne(
    userId: string,
    decisionId: string,
    outcomeId: string
  ): Promise<IOutcome | null> {
    return Outcome.findOne({ _id: outcomeId, decisionId, userId });
  }

  /**
   * Expected-vs-actual, computed as an explicit pairing:
   *   What did Hathap expect? What happened? How close was reality?
   *
   * Uses the most recent expected outcome (one expected snapshot per decision)
   * and the most recent actual observation. Metrics pair by name.
   */
  async expectedVsActual(userId: string, decisionId: string): Promise<ExpectedVsActualSummary> {
    const outcomes = await Outcome.find({ decisionId, userId }).sort({ createdAt: 1 });
    const expected = outcomes.filter((o) => o.kind === 'expected').pop();
    const actual = outcomes.filter((o) => o.kind === 'actual').pop();

    const summary: ExpectedVsActualSummary = {
      metricComparisons: [],
      qualityComputed: false,
    };

    if (expected) {
      summary.expected = {
        outcomeId: expected._id.toString(),
        status: expected.status,
        description: expected.description,
        observedAt: expected.observedAt,
      };
    }
    if (actual) {
      summary.actual = {
        outcomeId: actual._id.toString(),
        status: actual.status,
        description: actual.description,
        observedAt: actual.observedAt,
      };
    }
    if (expected && actual) {
      summary.metricComparisons = pairMetrics(expected.metrics || [], actual.metrics || []);
      summary.qualityComputed = summary.metricComparisons.some((m) => m.meaningful);
    }
    return summary;
  }
}

export function pairMetrics(
  expectedMetrics: OutcomeMetric[],
  actualMetrics: OutcomeMetric[]
): MetricComparison[] {
  const comparisons: MetricComparison[] = [];
  const expectedByName = new Map<string, OutcomeMetric>();
  for (const m of expectedMetrics) {
    const key = m.name.toLowerCase();
    if (!expectedByName.has(key)) expectedByName.set(key, m);
  }
  const actualByName = new Map<string, OutcomeMetric>();
  for (const m of actualMetrics) {
    const key = m.name.toLowerCase();
    if (!actualByName.has(key)) actualByName.set(key, m);
  }

  const names = new Set<string>([...expectedByName.keys(), ...actualByName.keys()]);
  for (const name of names) {
    const expected = expectedByName.get(name);
    const actual = actualByName.get(name);
    const target = expected?.target;
    const actualValue = actual?.actual;
    const baseline = expected?.baseline ?? actual?.baseline;
    const direction = actual?.direction || expected?.direction || 'unknown';
    const meaningful = target !== undefined && actualValue !== undefined;

    let variance: number | undefined;
    let variancePct: number | undefined;
    let achieved: boolean | undefined;
    if (meaningful && target !== undefined && actualValue !== undefined) {
      variance = actualValue - target;
      if (target !== 0) variancePct = ((actualValue - target) / Math.abs(target)) * 100;
      if (direction === 'increase') achieved = actualValue >= target;
      else if (direction === 'decrease') achieved = actualValue <= target;
      else if (direction === 'neutral') achieved = actualValue === target;
    }

    const canonicalName =
      expected?.name || actual?.name || name;
    comparisons.push({
      metricName: canonicalName,
      unit: expected?.unit || actual?.unit,
      baseline,
      target,
      actual: actualValue,
      direction,
      variance,
      variancePct,
      achieved,
      meaningful,
      observedAt: actual?.observedAt,
    });
  }
  return comparisons;
}

export const outcomeService = new OutcomeService();