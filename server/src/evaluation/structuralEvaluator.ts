import { EvaluationArtifact, ExpectedStructure, StructuralCheck, StructuralEvaluation } from './types';
import { DEFAULT_EXPECTED_STRUCTURE } from './evaluationPolicy';
import { sanitizeSignal } from './evaluationPolicy';
import { tokenize } from './metrics';

/**
 * Phase 9 — StructuralEvaluator.
 *
 * Deterministic structural evaluation of an artifact against the case's
 * declared structural criteria. A case states what a satisfactory response must
 * CONTAIN (a recommendation, evidence references, assumptions, confidence,
 * length) — never what it must SAY. This keeps the benchmark free of fabricated
 * ground truth while remaining fully reproducible without an LLM.
 */

export interface EvaluateStructureArgs {
  artifact: EvaluationArtifact;
  expectedStructure?: ExpectedStructure;
}

export function evaluateStructure(args: EvaluateStructureArgs): StructuralEvaluation {
  const expected = { ...DEFAULT_EXPECTED_STRUCTURE, ...(args.expectedStructure || {}) };
  const a = args.artifact;
  const text = [a.answerText, a.recommendation, a.rationale].filter(Boolean).join('\n');
  const checks: StructuralCheck[] = [];

  const check = (key: string, label: string, passed: boolean, detail?: string) => {
    checks.push({
      key,
      label,
      passed,
      detail: detail ? sanitizeSignal(detail, 300) : undefined,
    });
  };

  if (expected.requiresRecommendation) {
    const rec = nonEmpty(a.recommendation);
    check('recommendation', 'Contains a recommendation', rec, rec ? undefined : 'No non-empty recommendation.');
  }

  if (expected.requiresEvidence) {
    const refs = a.evidenceRefs.length > 0 || a.evidenceIds.length > 0;
    check('evidence', 'References evidence', refs, refs ? undefined : 'No evidence references.');
  }

  if (expected.requiresAssumptions) {
    const assumptions = Array.isArray(a.assumptions) && a.assumptions.length > 0;
    check('assumptions', 'States assumptions', assumptions, assumptions ? undefined : 'No assumptions listed.');
  }

  if (expected.requiresConfidence) {
    const conf =
      typeof a.confidence === 'number' &&
      Number.isFinite(a.confidence) &&
      a.confidence >= 0 &&
      a.confidence <= 1;
    const confAlt =
      typeof a.confidence === 'number' &&
      Number.isFinite(a.confidence) &&
      a.confidence > 1 &&
      a.confidence <= 100;
    check('confidence', 'Includes a confidence score', conf || confAlt, conf || confAlt ? undefined : 'No confidence score.');
  }

  const minLen = Math.max(0, expected.minAnswerLength || 0);
  if (minLen > 0) {
    const lengthOk = text.trim().length >= minLen;
    check('length', `Answer length >= ${minLen}`, lengthOk, lengthOk ? undefined : `Answer is ${text.trim().length} chars (min ${minLen}).`);
  }

  if (typeof expected.maxAnswerLength === 'number' && expected.maxAnswerLength > 0) {
    const maxOk = text.trim().length <= expected.maxAnswerLength;
    check('maxLength', `Answer length <= ${expected.maxAnswerLength}`, maxOk, maxOk ? undefined : `Answer exceeds max length ${expected.maxAnswerLength}.`);
  }

  for (const mention of expected.mustMention || []) {
    if (!mention || !mention.trim()) continue;
    const found = text.toLowerCase().includes(mention.toLowerCase());
    check(`mention:${mention}`, `Mentions "${mention}"`, found, found ? undefined : `Missing mention "${mention}".`);
  }

  const applicable = checks.length > 0;
  const score = applicable ? checks.filter((c) => c.passed).length / checks.length : undefined;

  return { enabled: true, applicable, score, checks };
}

export function nonEmpty(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Deterministic lexical relevance of the artifact to the case prompt. */
export function promptRelevance(prompt: string, artifact: EvaluationArtifact): number | undefined {
  if (!prompt || !prompt.trim()) return undefined;
  const text = [artifact.answerText, artifact.recommendation, artifact.rationale].filter(Boolean).join(' ');
  if (!text.trim()) return undefined;
  const promptTokens = tokenize(prompt);
  const textTokens = tokenize(text);
  if (promptTokens.size === 0) return undefined;
  let hits = 0;
  for (const t of promptTokens) if (textTokens.has(t)) hits++;
  return Math.min(1, hits / promptTokens.size);
}