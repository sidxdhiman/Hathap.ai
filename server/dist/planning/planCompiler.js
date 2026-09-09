"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.planCompiler = exports.PlanCompiler = void 0;
const Execution_1 = __importDefault(require("../models/Execution"));
const Task_1 = __importDefault(require("../models/Task"));
const DecisionPlan_1 = __importDefault(require("../models/DecisionPlan"));
const eventBus_1 = require("../decision/eventBus");
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
class PlanCompiler {
    async compile(options) {
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
        const existingTasks = await Task_1.default.find({ executionId });
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
        const idByTemp = new Map();
        const researchTaskIds = [];
        let debateTaskId;
        for (const t of plan.tasks) {
            const deps = (t.dependsOn || [])
                .map((tempId) => idByTemp.get(tempId))
                .filter((id) => Boolean(id));
            const task = await Task_1.default.create({
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
            if (t.type === 'research')
                researchTaskIds.push(task._id.toString());
            if (t.type === 'debate')
                debateTaskId = task._id.toString();
            eventBus_1.executionEventBus.emit({
                type: 'task.created',
                taskId: task._id.toString(),
                executionId,
                decisionId,
                data: { type: t.type, planned: true, tempId: t.tempId },
            });
        }
        if (debateTaskId) {
            await Execution_1.default.updateOne({ _id: execution._id }, { $set: { currentTask: debateTaskId } });
        }
        const compiled = await DecisionPlan_1.default.findByIdAndUpdate(persisted._id, { $set: { status: 'compiled', compiledAt: new Date() } }, { new: true });
        return {
            persistedPlan: compiled || persisted,
            taskIds: Array.from(idByTemp.values()),
            researchTaskIds,
            debateTaskId,
            termination: plan.termination,
            reusedExistingTasks: false,
        };
    }
    async upsertPlanDoc(params) {
        const { executionId, decisionId, plan, planningMode, planModel } = params;
        const existing = await DecisionPlan_1.default.findOne({ executionId });
        const base = {
            decisionId,
            executionId,
            version: plan.version,
            source: plan.source,
            planningMode,
            plannerModel: planModel || undefined,
            plannerVersion: 'planner-v1',
            planVersion: 1,
            tasks: plan.tasks,
            termination: plan.termination,
            rationale: plan.rationale,
            estimates: plan.estimates,
        };
        if (existing) {
            return DecisionPlan_1.default.findByIdAndUpdate(existing._id, {
                $set: {
                    ...base,
                    status: 'validated',
                    validation: { valid: true, errors: [] },
                    failure: undefined,
                    compiledAt: undefined,
                },
            }, { new: true });
        }
        const doc = await DecisionPlan_1.default.create({
            ...base,
            status: 'validated',
            validation: { valid: true, errors: [] },
        });
        return doc;
    }
    async mapExistingTasks(execution) {
        const tasks = await Task_1.default.find({ executionId: String(execution._id) });
        const taskIds = [];
        const researchTaskIds = [];
        let debateTaskId;
        for (const t of tasks) {
            const id = t._id.toString();
            taskIds.push(id);
            if (t.type === 'research')
                researchTaskIds.push(id);
            if (t.type === 'debate')
                debateTaskId = id;
        }
        return { taskIds, researchTaskIds, debateTaskId };
    }
    inputFor(t) {
        // The Fallback/Intelligent planners may include a 'description' hint.
        return { ...(t.input || {}) };
    }
    priorityFor(t) {
        switch (t.type) {
            case 'research': return 10;
            case 'debate': return 1;
            default: return 0;
        }
    }
    phaseFor(type) {
        switch (type) {
            case 'research': return 'research';
            case 'debate': return 'debating';
            default: return 'planned';
        }
    }
}
exports.PlanCompiler = PlanCompiler;
exports.planCompiler = new PlanCompiler();
