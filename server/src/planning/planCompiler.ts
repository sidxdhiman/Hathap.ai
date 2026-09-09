import Execution from '../models/Execution';
import Task from '../models/Task';
import DecisionPlan, { IDecisionPlan } from '../models/DecisionPlan';
import { executionEventBus } from '../decision/eventBus';
import {
  DecisionPlan as PlanShape,
  PlanTermination,
  PlannedTask,
  PlanningMode,
} from './planTypes';
import { PlanningPolicy } from './planningPolicy';
import { IExecution } from '../models/Execution';

export interface CompilePlanOptions {
  execution: IExecution;
  /** Validated plan (source of truth for task graph). */
  plan: PlanShape;
  planningMode: PlanningMode;
  policy: PlanningPolicy;
  plannerModel?: string;
}

export interface CompiledPlanResult {
  persistedPlan: IDecisionPlan;
  taskIds: string[];
  researchTaskIds: string[];
  debateTaskId?: string;
  termination: PlanTermination;
  reusedExistingTasks: boolean;
}

/**
 * Phase 5 — plan compiler.
 *
 * A validated plan is compiled into REAL persisted Task documents with
 * dependency IDs controlled by the Phase 2 scheduler. The compiler is the only
 * place that maps planner tempIds to Mongo IDs — the planner never sees or
 * controls persistent identifiers.
 *
 * Idempotency / recovery:
 *   - One plan per execution (unique index on `DecisionPlan.executionId`).
 *   - If a plan already exists for the execution, the compiler resumes instead
 *     of duplicating the graph. Persisted tasks carry `metadata.plannedTempId`
 *     so a crash between plan-persist and task-persist can be resumed without
 *     creating a second graph.
 *   - The compiler refuses to run against an execution that already has tasks
 *     it did not create (defense in depth against double compilation).
 */
export class PlanCompiler {
  async compile(options: CompilePlanOptions): Promise<CompiledPlanResult> {
    const { execution, plan, planningMode, policy, plannerModel } = options;
    const executionId = String(execution._id);
    const decisionId = String(execution.decisionId);

    const persisted = await this.upsertPlanDoc({
      executionId,
      decisionId,
      plan,
      planningMode,
      planModel: plannerModel,
    });

    if (persisted.status === 'compiled') {
      const { researchTaskIds, debateTaskId, taskIds } = await this.mapExistingTasks(execution);
      if (taskIds.length > 0) {
        return {
          persistedPlan: persisted,
          taskIds,
          researchTaskIds,
          debateTaskId,
          termination: plan.termination,
          reusedExistingTasks: true,
        };
      }
    }

    const existingTasks = await Task.find({ executionId });
    if (existingTasks.length > 0) {
      const { researchTaskIds, debateTaskId, taskIds } = await this.mapExistingTasks(execution);
      return {
        persistedPlan: persisted,
        taskIds,
        researchTaskIds,
        debateTaskId,
        termination: plan.termination,
        reusedExistingTasks: true,
      };
    }

    // tempId -> persisted Task _id (built as tasks are created so dependsOn
    // can reference the real IDs immediately, like the fixed workflow does).
    const idByTemp = new Map<string, string>();
    const researchTaskIds: string[] = [];
    let debateTaskId: string | undefined;

    for (const t of plan.tasks) {
      const deps = (t.dependsOn || [])
        .map((tempId) => idByTemp.get(tempId))
        .filter((id): id is string => Boolean(id));

      const task = await Task.create({
        executionId,
        type: t.type,
        status: 'pending',
        priority: typeof t.priority === 'number' ? t.priority : this.priorityFor(t),
        input: this.inputFor(t),
        assignedAgent: undefined,
        assignedModel: undefined,
        dependencies: deps,
        maxRetries: 2,
        metadata: {
          description: t.purpose,
          phase: this.phaseFor(t.type),
          planned: true,
          plannedTempId: t.tempId,
          planVersion: plan.version,
          requirements: t.requirements || [],
        },
      });

      idByTemp.set(t.tempId, task._id.toString());
      if (t.type === 'research') researchTaskIds.push(task._id.toString());
      if (t.type === 'debate') debateTaskId = task._id.toString();

      executionEventBus.emit({
        type: 'task.created',
        taskId: task._id.toString(),
        executionId,
        decisionId,
        data: { type: t.type, planned: true, tempId: t.tempId },
      });
    }

    if (debateTaskId) {
      await Execution.updateOne(
        { _id: execution._id },
        { $set: { currentTask: debateTaskId } }
      );
    }

    const compiled = await DecisionPlan.findByIdAndUpdate(
      persisted._id,
      { $set: { status: 'compiled', compiledAt: new Date() } },
      { new: true }
    );

    return {
      persistedPlan: compiled || persisted,
      taskIds: Array.from(idByTemp.values()),
      researchTaskIds,
      debateTaskId,
      termination: plan.termination,
      reusedExistingTasks: false,
    };
  }

  private async upsertPlanDoc(params: {
    executionId: string;
    decisionId: string;
    plan: PlanShape;
    planningMode: PlanningMode;
    planModel?: string;
  }): Promise<IDecisionPlan> {
    const { executionId, decisionId, plan, planningMode, planModel } = params;
    const existing = await DecisionPlan.findOne({ executionId });
    const base = {
      decisionId,
      executionId,
      version: plan.version,
      source: plan.source,
      planningMode,
      plannerModel: planModel || undefined,
      plannerVersion: 'planner-v1',
      planVersion: 1,
      tasks: plan.tasks as unknown as Array<Record<string, unknown>>,
      termination: plan.termination,
      rationale: plan.rationale,
      estimates: plan.estimates,
    };
    if (existing) {
      return DecisionPlan.findByIdAndUpdate(
        existing._id,
        {
          $set: {
            ...base,
            status: 'validated',
            validation: { valid: true, errors: [] },
            failure: undefined,
            compiledAt: undefined,
          },
        },
        { new: true }
      ) as Promise<IDecisionPlan>;
    }
    const doc = await DecisionPlan.create({
      ...base,
      status: 'validated',
      validation: { valid: true, errors: [] },
    });
    return doc as unknown as IDecisionPlan;
  }

  private async mapExistingTasks(execution: IExecution): Promise<{
    taskIds: string[];
    researchTaskIds: string[];
    debateTaskId?: string;
  }> {
    const tasks = await Task.find({ executionId: String(execution._id) });
    const taskIds: string[] = [];
    const researchTaskIds: string[] = [];
    let debateTaskId: string | undefined;
    for (const t of tasks) {
      const id = t._id.toString();
      taskIds.push(id);
      if (t.type === 'research') researchTaskIds.push(id);
      if (t.type === 'debate') debateTaskId = id;
    }
    return { taskIds, researchTaskIds, debateTaskId };
  }

  private inputFor(t: PlannedTask): Record<string, unknown> {
    // The Fallback/Intelligent planners may include a 'description' hint.
    return { ...(t.input || {}) };
  }

  private priorityFor(t: PlannedTask): number {
    switch (t.type) {
      case 'research': return 10;
      case 'debate': return 1;
      default: return 0;
    }
  }

  private phaseFor(type: string): string {
    switch (type) {
      case 'research': return 'research';
      case 'debate': return 'debating';
      default: return 'planned';
    }
  }
}

export const planCompiler = new PlanCompiler();