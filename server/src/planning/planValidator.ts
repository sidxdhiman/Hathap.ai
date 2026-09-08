import {
  DecisionPlan,
  PlannedTask,
  PlanTermination,
  PlannedTaskType,
} from './planTypes';
import {
  PlanningPolicy,
  makePlanningPolicy,
  isAllowedTaskType,
  isKnownCapability,
} from './planningPolicy';

export interface PlanValidationResult {
  valid: boolean;
  errors: string[];
  plan?: DecisionPlan;
}

/**
 * Phase 5 — deterministic plan validator.
 *
 * LLM output is UNTRUSTED. This module decides whether a proposed plan may be
 * compiled into real Task documents. Every structural, lexicographic and
 * security check lives here so the compiler can trust the plan it receives.
 *
 * Key rules:
 *   - Only allowlisted task types may appear; unknown types are rejected.
 *   - Only `research` and `debate` may be planner-proposed. `verify_claim`,
 *     `red_team` and `reconciliation` are system-generated from the plan's
 *     termination flags because they can only reference claim/candidate IDs
 *     that do not exist at plan time. A proposal that fabricates claim IDs
 *     or tries to schedule them directly is rejected.
 *   - Dependencies must reference existing tempIds, acyclic, within depth.
 *   - Hard per-execution/type/count/results limits are enforced.
 *   - Dangerous payloads (arbitrary tools, URLs, code/shell, credentials,
 *     DB/collection references) are rejected.
 *   - Declared capability requirements must be recognizable capabilities.
 */

const SYSTEM_GENERATED_TYPES: PlannedTaskType[] = ['verify_claim', 'red_team', 'reconciliation'];

// Keys present here (in a task input) are always suspicious because this system
// never executes arbitrary tools/commands/fetches, never touches raw DB ops,
// and never receives credentials.
const SSRF_OR_EXECUTION_KEYS = [
  'url', 'baseUrl', 'endpoint', 'host', 'tool', 'tools', 'toolName', 'toolInput',
  'shell', 'command', 'cmd', 'exec', 'eval', 'code', 'script', 'function',
  'sql', 'mongo', 'collection', 'collectionName', 'db', 'database',
];

const CREDENTIAL_KEYS = [
  'apiKey', 'api_key', 'apikey', 'token', 'authToken', 'secret', 'password', 'pass', 'secretKey',
  'authorization', 'bearer', 'cookie', 'credential', 'credentials',
];

const CALLBACK_KEYS = ['callback', 'webhook', 'onComplete', 'onSuccess'];

/** Research inputs intentionally include these keys. */
const ALLOWED_RESEARCH_INPUT_KEYS = ['query', 'purpose', 'maxResults'];
/** Debate inputs intentionally include these keys. */
const ALLOWED_DEBATE_INPUT_KEYS = [
  'strategy', 'description', 'constraints', 'focus', 'additionalEvidence',
];

const DANGEROUS_VALUE_PATTERNS = [
  /https?:\/\//i,
  /require\(/,
  /\bimport\s+[\w{*]/,
  /\beval\s*\(/,
  /\bfetch\s*\(/,
  /\bexec\s*\(/,
  /\bchild_process\b/,
  /process\.\w+/,
  /`[^`]*`/,
  /;\s*(?:rm|rm -rf|curl|wget|nc|chmod|\/bin\/|\/etc\/)/,
];

export function validatePlan(
  proposal: unknown,
  options: { policy?: PlanningPolicy } = {}
): PlanValidationResult {
  const policy = makePlanningPolicy(options.policy);
  const errors: string[] = [];

  if (!proposal || typeof proposal !== 'object') {
    return { valid: false, errors: ['Plan proposal must be an object.'] };
  }
  const plan = proposal as Partial<DecisionPlan>;

  if (typeof plan.version !== 'string' || !/^\d+\.\d+$/.test(plan.version)) {
    errors.push('Plan must declare a "version" string (e.g. "1.0").');
  }

  if (!Array.isArray(plan.tasks)) {
    return { valid: false, errors: [...errors, 'Plan must contain a "tasks" array.'] };
  }

  const termination = (plan.termination || {}) as Partial<PlanTermination>;
  if (
    typeof termination.requiresVerification !== 'boolean' ||
    typeof termination.requiresRedTeam !== 'boolean' ||
    typeof termination.requiresReconciliation !== 'boolean'
  ) {
    errors.push(
      'Plan "termination" must declare requiresVerification, requiresRedTeam and requiresReconciliation booleans.'
    );
  }

  const taskCount = (plan.tasks as PlannedTask[]).length;
  if (taskCount === 0) {
    errors.push('Plan must propose at least one task.');
  } else if (taskCount > policy.maxTasksPerExecution) {
    errors.push(
      `Plan proposes ${taskCount} tasks — exceeds maxTasksPerExecution (${policy.maxTasksPerExecution}).`
    );
  }

  const ids = new Set<string>();
  const byId = new Map<string, PlannedTask>();
  let researchCount = 0;
  let verificationCount = 0;
  let researchResults = 0;

  for (let i = 0; i < (plan.tasks as PlannedTask[]).length; i++) {
    const t = (plan.tasks as PlannedTask[])[i];
    const label = `task[${i}]`;

    if (!t || typeof t !== 'object') {
      errors.push(`${label} must be an object.`);
      continue;
    }

    // tempId
    if (typeof t.tempId !== 'string' || t.tempId.trim().length === 0) {
      errors.push(`${label} must declare a non-empty "tempId".`);
    } else {
      if (ids.has(t.tempId)) errors.push(`${label} duplicates tempId "${t.tempId}".`);
      ids.add(t.tempId);
      byId.set(t.tempId, t);
    }

    // type
    if (!isAllowedTaskType(t.type)) {
      errors.push(`${label} uses unknown task type "${String(t.type)}".`);
    } else if (SYSTEM_GENERATED_TYPES.includes(t.type)) {
      errors.push(
        `${label} (${t.type}) may not be planner-proposed: verification, red team and reconciliation are system-generated from the plan termination flags.`
      );
    }

    // purpose
    if (typeof t.purpose !== 'string' || t.purpose.trim().length === 0) {
      errors.push(`${label} must declare a one-line "purpose".`);
    } else if (thisIsDangerousText(t.purpose)) {
      errors.push(`${label} purpose contains disallowed content.`);
    }

    // input
    if (!t.input || typeof t.input !== 'object' || Array.isArray(t.input)) {
      errors.push(`${label} must declare an object "input".`);
    } else {
      const inputErrors = validateTaskInput(t.type, t.input, label);
      for (const e of inputErrors) errors.push(e);
    }

    // requirements
    if (Array.isArray(t.requirements)) {
      for (const req of t.requirements) {
        if (typeof req !== 'string' || !isKnownCapability(req)) {
          errors.push(`${label} declares unknown capability requirement "${String(req)}".`);
        }
      }
    }

    // per-type counts and research result budget
    if (t.type === 'research') {
      researchCount++;
      const maxResults =
        t.input && typeof (t.input as any).maxResults === 'number'
          ? (t.input as any).maxResults
          : 0;
      researchResults += maxResults;
    }
    if (t.type === 'verify_claim') verificationCount++;
  }

  if (researchCount > policy.maxResearchTasks) {
    errors.push(
      `Plan proposes ${researchCount} research tasks — exceeds maxResearchTasks (${policy.maxResearchTasks}).`
    );
  }
  if (verificationCount > policy.maxVerificationTasks) {
    errors.push(
      `Plan proposes ${verificationCount} verify_claim tasks — exceeds maxVerificationTasks (${policy.maxVerificationTasks}).`
    );
  }
  if (researchResults > policy.maxTotalResearchResults) {
    errors.push(
      `Plan research maxResults total ${researchResults} exceeds maxTotalResearchResults (${policy.maxTotalResearchResults}).`
    );
  }

  // Dependency integrity + depth + cycle detection over tempId graph.
  const depthErrors = validateDependencies((plan.tasks as PlannedTask[]) || [], byId, policy);
  for (const e of depthErrors) errors.push(e);

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const normalized: DecisionPlan = {
    version: plan.version as string,
    // Preserve the source the proposal declared (fallback/baseline plans are
    // validated through the same path); default LLM proposals to 'intelligent'.
    source:
      plan.source === 'fallback' || plan.source === 'baseline' ? plan.source : 'intelligent',
    tasks: (plan.tasks as PlannedTask[]).map((t) => ({
      ...t,
      dependsOn: t.dependsOn || [],
    })),
    termination: {
      requiresVerification: !!termination.requiresVerification,
      requiresRedTeam: !!termination.requiresRedTeam,
      requiresReconciliation: !!termination.requiresReconciliation,
    },
    rationale: plan.rationale as DecisionPlan['rationale'],
    estimates: (plan.estimates as DecisionPlan['estimates']) || {
      estimatedTasks: 0,
      estimatedResearchTasks: 0,
      estimatedLLMTasks: 0,
    },
  };

  return { valid: true, errors: [], plan: normalized };
}

function validateTaskInput(
  type: PlannedTaskType,
  input: Record<string, unknown>,
  label: string
): string[] {
  const errors: string[] = [];
  const keys = Object.keys(input);

  for (const key of keys) {
    if (
      SSRF_OR_EXECUTION_KEYS.includes(key) ||
      CREDENTIAL_KEYS.includes(key) ||
      CALLBACK_KEYS.includes(key)
    ) {
      errors.push(`${label} input declares disallowed field "${key}".`);
    }
  }

  const allowedKeys =
    type === 'research'
      ? ALLOWED_RESEARCH_INPUT_KEYS
      : type === 'debate'
        ? ALLOWED_DEBATE_INPUT_KEYS
        : [];

  for (const key of keys) {
    if (allowedKeys.length > 0 && !allowedKeys.includes(key)) {
      errors.push(`${label} (${type}) input uses unexpected field "${key}" (allowed: ${allowedKeys.join(', ')}).`);
    }
  }

  if (type === 'research') {
    const query = input.query;
    if (typeof query !== 'string' || query.trim().length === 0) {
      errors.push(`${label} (research) input requires a non-empty "query" string.`);
    }
    if (input.maxResults !== undefined) {
      if (
        typeof input.maxResults !== 'number' ||
        !Number.isInteger(input.maxResults) ||
        input.maxResults < 1
      ) {
        errors.push(`${label} (research) maxResults must be a positive integer.`);
      }
    }
    for (const [k, v] of Object.entries(input)) {
      if (k === 'query' && typeof v === 'string' && thisIsDangerousText(v as string)) {
        errors.push(`${label} (research) query contains URL/command-like content.`);
      }
    }
  }

  if (type === 'debate') {
    if (input.strategy !== undefined && typeof input.strategy !== 'string') {
      errors.push(`${label} (debate) strategy must be a string.`);
    }
    for (const [k, v] of Object.entries(input)) {
      if (typeof v === 'string' && thisIsDangerousText(v as string)) {
        errors.push(`${label} (debate) field "${k}" contains disallowed content.`);
      }
    }
  }

  for (const v of Object.values(input)) {
    const nested = scanNestedValues(v);
    for (let i = 0; i < nested.length; i++) {
      const n = nested[i];
      if (
        SSRF_OR_EXECUTION_KEYS.includes(n.key) ||
        CREDENTIAL_KEYS.includes(n.key) ||
        CALLBACK_KEYS.includes(n.key) ||
        (typeof n.value === 'string' && thisIsDangerousText(n.value as string))
      ) {
        errors.push(`${label} input contains disallowed nested field "${n.key}".`);
        break;
      }
    }
  }

  return errors;
}

/** Reject planner proposals that try to escape the task graph. */
export function validateDependencies(
  tasks: PlannedTask[],
  byId: Map<string, PlannedTask>,
  policy: PlanningPolicy
): string[] {
  const errors: string[] = [];
  const byTemp = new Map<string, PlannedTask>();
  for (const t of tasks) {
    if (typeof t.tempId === 'string') byTemp.set(t.tempId, t);
  }

  for (const t of tasks) {
    const label = `task[${t.tempId || '?'}]`;
    const deps = Array.isArray(t.dependsOn) ? t.dependsOn : [];
    if (!Array.isArray(t.dependsOn)) {
      errors.push(`${label} "dependsOn" must be an array of tempIds.`);
      continue;
    }
    for (const d of deps) {
      if (typeof d !== 'string') {
        errors.push(`${label} "dependsOn" includes a non-string reference.`);
        continue;
      }
      if (d === t.tempId) {
        errors.push(`${label} depends on itself (${d}).`);
        continue;
      }
      if (!byTemp.has(d)) {
        errors.push(`${label} depends on unknown tempId "${d}".`);
      }
    }
  }

  // Depth: longest dependency chain rooted at each task. Also detects cycles.
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const depth = new Map<string, number>();

  const depthOf = (id: string): number | { cycle: string } => {
    if (depth.has(id)) return depth.get(id)!;
    if (visiting.has(id)) return { cycle: id };
    if (!byTemp.has(id)) return 0;
    visiting.add(id);
    const deps = byTemp.get(id)!.dependsOn || [];
    let max = 0;
    for (const d of deps) {
      if (!byTemp.has(d)) continue;
      const sub = depthOf(d);
      if (typeof sub === 'object') {
        visiting.delete(id);
        return sub;
      }
      max = Math.max(max, sub);
    }
    visiting.delete(id);
    visited.add(id);
    depth.set(id, max + 1);
    return max + 1;
  };

  for (const t of tasks) {
    const d = depthOf(t.tempId);
    if (typeof d === 'object') {
      errors.push(`Dependency cycle detected involving tempId "${d.cycle}".`);
      break;
    }
  }
  for (const t of tasks) {
    const td = depth.get(t.tempId) || (t.tempId && byTemp.has(t.tempId) ? 1 : 0);
    if (td > policy.maxPlanDepth) {
      errors.push(
        `Plan chain depth ${td} for tempId "${t.tempId}" exceeds maxPlanDepth (${policy.maxPlanDepth}).`
      );
    }
  }

  return errors;
}

function thisIsDangerousText(value: string): boolean {
  if (value.trim().length === 0) return false;
  if (DANGEROUS_VALUE_PATTERNS.some((re) => re.test(value))) return true;
  const lower = value.toLowerCase();
  return (
    lower.includes('api_key') ||
    lower.includes('apikey') ||
    lower.includes('authorization: bearer') ||
    lower.includes('child_process')
  );
}

function scanNestedValues(
  value: unknown,
  key = ''
): Array<{ key: string; value: unknown }> {
  if (Array.isArray(value)) {
    const out: Array<{ key: string; value: unknown }> = [];
    for (const item of value) {
      for (const n of scanNestedValues(item, key)) out.push(n);
    }
    return out;
  }
  if (value && typeof value === 'object') {
    const out: Array<{ key: string; value: unknown }> = [];
    for (const [k, v] of Object.entries(value as any)) {
      out.push({ key: k, value: v });
      for (const n of scanNestedValues(v, k)) out.push(n);
    }
    return out;
  }
  return key ? [{ key, value }] : [];
}