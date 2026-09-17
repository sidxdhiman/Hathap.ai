/**
 * Phase 9 — Evaluation System.
 *
 * Shared types for the evaluation layer:
 *
 *   Benchmark → Cases → System/Baseline → Evaluation Run
 *     → Decision/Execution → Evaluation → Criteria/Metrics → Comparison → Regression
 *
 * Honesty rules encoded here (mirrors the Phase 8 memory layer rules):
 *   - No fabricated ground truth: cases declare *structural criteria* and
 *     evaluation rubrics declare *scoring criteria* — never a "correct answer".
 *   - No chain-of-thought storage: results reference external artifacts
 *     (decision/execution ids) and store bounded signals, not internal reasoning.
 *   - No secrets: stored strings are sanitized (see evaluationPolicy).
 *   - Unknown ≠ bad: a criterion that is disabled or not applicable is excluded
 *     from the composite and reported as such — never scored as zero.
 */

// ---- Lifecycle ----

export type EvaluationRunKind = 'standard' | 'baseline' | 'ablation';

export type EvaluationRunStatus =
  | 'draft'
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'partial'
  | 'cancelled';

export type EvaluationCaseStatus = 'passed' | 'failed' | 'error' | 'skipped';

/** What produced the artifact under evaluation. */
export type SystemKind = 'static' | 'decision-engine' | 'external';

// ---- Criteria / Rubric ----

export type CriterionKey =
  | 'structural'
  | 'quality'
  | 'evidence'
  | 'reasoning'
  | 'efficiency'
  | 'outcome';

export const CRITERION_KEYS: CriterionKey[] = [
  'structural',
  'quality',
  'evidence',
  'reasoning',
  'efficiency',
  'outcome',
];

export interface EvalCriterionConfig {
  key: CriterionKey;
  label: string;
  description?: string;
  /** Relative importance; normalized against other enabled criteria. */
  weight: number;
  enabled: boolean;
}

export const DEFAULT_CRITERIA: EvalCriterionConfig[] = [
  { key: 'structural', label: 'Structural completeness', weight: 0.25, enabled: true },
  { key: 'quality', label: 'Answer quality', weight: 0.25, enabled: true },
  { key: 'evidence', label: 'Evidence quality', weight: 0.15, enabled: true },
  { key: 'reasoning', label: 'Reasoning / process quality', weight: 0.15, enabled: true },
  { key: 'efficiency', label: 'Cost / latency efficiency', weight: 0.1, enabled: true },
  { key: 'outcome', label: 'Real-world outcome', weight: 0.1, enabled: true },
];

// ---- Evaluation limits (bounded execution) ----

export interface EvaluationLimits {
  /** Maximum cases executed in a single run. */
  maxCasesPerRun: number;
  /** Total wall-clock budget for a run, regardless of case count. */
  maxDurationMs: number;
  /** Wall-clock budget per case. */
  maxSliceMs: number;
  /** Budget for waiting on a decision-engine execution to reach terminal state. */
  maxDecisionWaitMs: number;
  /** Maximum LLM-assisted calls per case (0 = deterministic only). */
  maxLlmCallsPerCase: number;
  /** Maximum token budget considered in efficiency scoring. */
  maxTokenBudgetPerCase: number;
  /** Cap on stored result bytes (bounding non-secret signal logs). */
  maxResultBytes: number;
}

// ---- System under test ----

export interface DecisionEngineSettings {
  planningMode?: 'fixed' | 'intelligent';
  routingMode?: 'auto' | 'manual';
  verificationEnabled?: boolean;
  researchQueries?: string[];
}

export interface SystemUnderTest {
  kind: SystemKind;
  label: string;
  description?: string;
  decisionSettings?: DecisionEngineSettings;
}

// ---- Baseline thresholds ----

export interface BaselineThresholds {
  /** Minimum composite score over an evaluated case (0..1). */
  composite?: number;
  /** Per-criterion minimum scores (0..1). */
  byCriterion?: Partial<Record<CriterionKey, number>>;
}

// ---- Artifacts (what gets evaluated) ----

export interface StaticProvidedAnswer {
  answerText?: string;
  recommendation?: string;
  rationale?: string;
  assumptions: string[];
  confidence?: number;
  evidenceRefs: string[];
}

/**
 * Snapshot of the artifact under evaluation. For real decisions this is a set
 * of references plus the small derived signals we are allowed to store — the
 * full execution graph stays in the Decision/Execution/Outcome collections.
 */
export interface EvaluationArtifact {
  decisionId?: string;
  executionId?: string;
  answerText?: string;
  recommendation?: string;
  rationale?: string;
  assumptions: string[];
  confidence?: number;
  evidenceRefs: string[];
  evidenceIds: string[];
  claimIds: string[];
  outcomeIds: string[];
}

// ---- Per-criterion evaluation outputs ----

export interface StructuralCheck {
  key: string;
  label: string;
  passed: boolean;
  detail?: string;
}

export interface StructuralEvaluation {
  enabled: boolean;
  applicable: boolean;
  score?: number;
  checks: StructuralCheck[];
}

export interface QualitySignals {
  recommendationPresent: boolean;
  rationalePresent: boolean;
  rationaleLength?: number;
  confidencePresent: boolean;
  objectiveRelevance?: number;
  grounded: boolean;
  verbosityInRange?: boolean;
  /** Phase 8 decision-quality signals when a real decision is referenced. */
  decisionQuality?: {
    outcomeAchieved?: boolean;
    recommendationAccepted?: boolean;
    outcomeConfirmed: boolean;
    expectedVsActualComputed: boolean;
  };
}

export interface QualityEvaluation {
  enabled: boolean;
  applicable: boolean;
  score?: number;
  signals: QualitySignals;
}

export interface EvidenceStats {
  count: number;
  withReliability: number;
  highReliabilityRatio?: number;
  avgRelevance?: number;
  categories: Record<string, number>;
}

export interface EvidenceEvaluation {
  enabled: boolean;
  applicable: boolean;
  score?: number;
  stats: EvidenceStats;
}

export interface ProcessStats {
  executions: number;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  cancelledTasks: number;
  retriedTasks: number;
  hasPlan: boolean;
  planValidated: boolean;
  hasVerification: boolean;
  hasRedTeam: boolean;
  hasReconciliation: boolean;
  needsMoreResearch?: boolean;
}

export interface ReasoningEvaluation {
  enabled: boolean;
  applicable: boolean;
  score?: number;
  stats: ProcessStats;
  comments: string[];
}

export interface EfficiencyStats {
  estimatedCost: number;
  latencyMs?: number;
  totalTokens?: number;
  llmCalls: number;
}

export interface EfficiencyEvaluation {
  enabled: boolean;
  applicable: boolean;
  score?: number;
  stats: EfficiencyStats;
  comments: string[];
}

export interface OutcomeEvaluationSignal {
  hasExpected: boolean;
  hasActual: boolean;
  actualStatus?: string;
  expectedStatus?: string;
  meaningfulComparisons: number;
  achievedComparisons: number;
  metricComparisons: Array<{ metricName: string; achieved?: boolean; meaningful: boolean }>;
  /** True only when an explicit success/failure actual outcome exists. */
  outcomeAchieved?: boolean;
  outcomeConfirmed: boolean;
}

export interface OutcomeEvaluation {
  enabled: boolean;
  applicable: boolean;
  score?: number;
  signals: OutcomeEvaluationSignal;
  notes: string[];
}

// ---- Composite metrics ----

export interface CompositeCategory {
  key: CriterionKey;
  score: number;
  weight: number;
  included: boolean;
  applicable: boolean;
  enabled: boolean;
}

export type CompositeExclusionReason = 'disabled' | 'not-applicable' | 'error';

export interface CompositeMetrics {
  categories: CompositeCategory[];
  /** Weighted mean over the included categories; undefined when none included. */
  score?: number;
  includedCategories: CriterionKey[];
  excludedCategories: Array<{ key: CriterionKey; reason: CompositeExclusionReason }>;
  /** Normalized weights used for the included categories. */
  coefficients: Partial<Record<CriterionKey, number>>;
}

// ---- Case result ----

export interface EvaluationCaseError {
  message: string;
  phase?: string;
}

export interface EvaluationCaseResultData {
  runId: string;
  userId: string;
  benchmarkId?: string;
  caseId: string;
  caseTitle?: string;
  caseVersion?: number;
  status: EvaluationCaseStatus;
  artifact?: EvaluationArtifact;
  structural?: StructuralEvaluation;
  quality?: QualityEvaluation;
  evidence?: EvidenceEvaluation;
  reasoning?: ReasoningEvaluation;
  efficiency?: EfficiencyEvaluation;
  outcome?: OutcomeEvaluation;
  metrics?: CompositeMetrics;
  error?: EvaluationCaseError;
  startedAt?: Date;
  completedAt?: Date;
}

/** Decision passed to `evaluationService.runCase`. */
export interface RunCaseContext {
  userId: string;
  run: EvaluationRunSnapshot;
  caseDef: CaseSnapshot;
  artifact: EvaluationArtifact;
  rubric?: RubricSnapshot | null;
  limits: EvaluationLimits;
}

// ---- Snapshots (service-layer payloads, no mongoose docs) ----

export interface EvaluationRunSnapshot {
  runId: string;
  benchmarkId: string;
  rubricId?: string;
  rubricVersion?: number;
  kind: EvaluationRunKind;
  systemUnderTest: SystemUnderTest;
  baseline?: { baselineId?: string; thresholds: BaselineThresholds };
  ablation?: { parentRunId?: string; variantLabel?: string; configPatch?: Record<string, unknown> };
  limits: EvaluationLimits;
  /** Minimum composite score for a case to count as "passed". */
  passThreshold?: number;
}

export interface CaseSnapshot {
  caseId: string;
  title?: string;
  version?: number;
  prompt: string;
  expectedStructure: ExpectedStructure;
  providedAnswer?: StaticProvidedAnswer;
}

export interface ExpectedStructure {
  requiresRecommendation: boolean;
  requiresEvidence: boolean;
  requiresAssumptions: boolean;
  requiresConfidence: boolean;
  minAnswerLength: number;
  maxAnswerLength?: number;
  mustMention: string[];
}

export interface RubricSnapshot {
  rubricId?: string;
  version?: number;
  criteria: EvalCriterionConfig[];
}

// ---- Comparison / regression ----

export type ComparisonDirection = 'improvement' | 'regression' | 'unchanged' | 'missing';

export interface ComparisonCaseRow {
  caseId: string;
  caseTitle?: string;
  scoreA?: number;
  scoreB?: number;
  delta?: number;
  direction?: ComparisonDirection;
}

export interface ComparisonSummary {
  compared: number;
  missingA: number;
  missingB: number;
  regressions: number;
  improvements: number;
  unchanged: number;
  aggregateA?: number;
  aggregateB?: number;
  aggregateDelta?: number;
  regressionDetected: boolean;
  note?: string;
}

export interface EvaluationComparisonData {
  userId: string;
  name?: string;
  runAId: string;
  runBId?: string;
  baselineId?: string;
  type: 'run_vs_run' | 'run_vs_baseline';
  summary: ComparisonSummary;
  perCase: ComparisonCaseRow[];
}

// ---- Seeds ----

export interface InitialSeedResult {
  benchmarkId: string;
  caseCount: number;
  rubricId: string;
  rubricVersion: number;
  /** True when the seed content exists for this user after this call. */
  seeded: boolean;
  /** True when this call actually created the seed content. */
  created: boolean;
}