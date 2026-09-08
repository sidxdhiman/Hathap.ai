"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.decisionOrchestrator = exports.DecisionOrchestrator = void 0;
const Decision_1 = __importDefault(require("../models/Decision"));
const Execution_1 = __importDefault(require("../models/Execution"));
const Task_1 = __importDefault(require("../models/Task"));
const Claim_1 = __importDefault(require("../models/Claim"));
const Evidence_1 = __importDefault(require("../models/Evidence"));
const Courtroom_1 = __importDefault(require("../models/Courtroom"));
const VerificationResult_1 = __importDefault(require("../models/VerificationResult"));
const RedTeamFinding_1 = __importDefault(require("../models/RedTeamFinding"));
const ReconciliationResult_1 = __importDefault(require("../models/ReconciliationResult"));
const stateMachine_1 = require("./stateMachine");
const usage_1 = require("./usage");
const debateValidation_1 = require("../services/debateValidation");
const eventBus_1 = require("./eventBus");
const worker_1 = require("../tasks/worker");
const evidenceGraphService_1 = require("./evidenceGraphService");
/**
 * DecisionOrchestrator — creates and coordinates work for a Decision.
 *
 * Architecture rules that apply here:
 *   - The API must not execute long-running Decisions directly. This class
 *     creates an Execution + initial Tasks and returns immediately; the
 *     background Worker (via the TaskScheduler + TaskExecutor + handlers) does
 *     the actual execution.
 *   - The orchestrator does NOT hard-code state transitions; it routes every
 *     transition through the centralized StateMachine.
 *   - Persistence is the source of truth.
 */
class DecisionOrchestrator {
    async createDecision(input) {
        const decision = new Decision_1.default({
            userId: input.userId,
            title: input.title,
            objective: input.objective,
            context: input.context,
            status: 'draft',
            currentPhase: 'draft',
            configuration: {
                strategy: input.configuration?.strategy || 'consensus',
                maxRounds: input.configuration?.maxRounds || 3,
                maxAgents: input.configuration?.maxAgents || 10,
                pauseOnAgreement: input.configuration?.pauseOnAgreement ?? true,
                verificationEnabled: input.configuration?.verificationEnabled ?? false,
            },
            participants: input.participants || [],
            assumptions: input.assumptions || [],
            metadata: input.metadata,
        });
        await decision.save();
        await this.recordEvidence({
            decisionId: decision._id.toString(),
            type: 'objective',
            title: 'Decision Objective',
            content: input.objective,
            sourceType: 'user_input',
            retrievedAt: new Date(),
        });
        return decision;
    }
    /**
     * Asynchronously start a Decision.
     *
     * This method:
     *   1. Validates the Decision belongs to the user.
     *   2. Creates a persistent Execution in `queued` state.
     *   3. Creates the initial Task graph (analysis -> debate -> synthesis,
     *      dependency-linked). When `researchQueries` are provided, parallel
     *      research tasks run first and the debate task depends on them.
     *   4. Returns the Execution immediately.
     *
     * The actual execution happens independently in the background Worker. The
     * HTTP request does NOT wait for the Decision to finish.
     */
    async startDecision(decisionId, userId, opts = {}) {
        const decision = await Decision_1.default.findOne({ _id: decisionId, userId });
        if (!decision) {
            throw new Error('Decision not found.');
        }
        if (!stateMachine_1.StateMachine.canTransitionDecision(decision.status, 'debating').valid) {
            throw new Error(`Decision cannot be started from state "${decision.status}".`);
        }
        stateMachine_1.StateMachine.transitionDecision(decision.status, 'debating');
        decision.status = 'debating';
        decision.currentPhase = 'debating';
        await decision.save();
        const execution = new Execution_1.default({
            decisionId,
            status: 'queued',
            startedAt: new Date(),
            currentPhase: 'debating',
            progress: 0,
            totalTasks: 0,
            completedTasks: 0,
            failedTasks: 0,
            runningTasks: 0,
            pendingTasks: 0,
        });
        await execution.save();
        eventBus_1.executionEventBus.emit({
            type: 'execution.queued',
            executionId: execution._id.toString(),
            decisionId,
        });
        const strategy = (0, debateValidation_1.normalizeDebateMode)(decision.configuration?.strategy || 'consensus');
        // Build the task graph. Phase 4 execution:
        //   Research (parallel) → Debate (synthesizes candidate verdict)
        //   → Verify Claims (parallel per claim) + Red Team (parallel with verify)
        //   → Reconciliation → Final
        //
        // Phase 2/3 backward compatibility: when no researchQueries and no
        // verification config, just create the single debate task (original behavior).
        const researchQueries = (opts.researchQueries || []).filter((q) => q && q.query && q.query.trim());
        const verificationEnabled = decision.configuration?.verificationEnabled ?? false;
        const researchTaskIds = [];
        for (const rq of researchQueries) {
            const rt = await this.createTask(execution._id.toString(), {
                type: 'research',
                input: {
                    query: rq.query.trim(),
                    purpose: rq.purpose || 'background',
                    maxResults: typeof rq.maxResults === 'number' ? rq.maxResults : undefined,
                },
                priority: 10,
                metadata: { description: 'Gather external evidence for this decision.', phase: 'research' },
            });
            researchTaskIds.push(rt._id.toString());
        }
        const debateTask = await this.createTask(execution._id.toString(), {
            type: 'debate',
            input: {
                strategy,
                description: 'Run the multi-agent debate for this decision. Produces a candidate verdict.',
            },
            priority: 1,
            dependencies: researchTaskIds,
            metadata: {
                strategy,
                participants: decision.participants,
                researchCount: researchTaskIds.length,
                isCandidateVerdict: true,
            },
        });
        await Execution_1.default.updateOne({ _id: execution._id }, { $set: { currentTask: debateTask._id.toString() } });
        eventBus_1.executionEventBus.emit({
            type: 'execution.started',
            executionId: execution._id.toString(),
            decisionId,
        });
        // Wake the worker so the execution begins promptly.
        worker_1.worker.wake();
        // Refresh the document so the returned execution reflects latest state.
        const fresh = await Execution_1.default.findById(execution._id);
        return fresh || execution;
    }
    async pauseDecision(decisionId, userId) {
        const decision = await Decision_1.default.findOne({ _id: decisionId, userId });
        if (!decision)
            throw new Error('Decision not found.');
        if (!stateMachine_1.StateMachine.canTransitionDecision(decision.status, 'paused').valid) {
            throw new Error(`Decision cannot be paused from state "${decision.status}".`);
        }
        stateMachine_1.StateMachine.transitionDecision(decision.status, 'paused');
        decision.status = 'paused';
        await decision.save();
        // Pause the active execution(s). The Worker will stop dispatching new tasks
        // because the owning decision is paused. Currently-running LLM calls are
        // allowed to finish; the scheduler stops after that.
        await Execution_1.default.updateMany({ decisionId, status: { $in: ['queued', 'running'] } }, { $set: { status: 'paused' } });
        const execs = await Execution_1.default.find({ decisionId, status: 'paused' });
        for (const e of execs) {
            eventBus_1.executionEventBus.emit({
                type: 'execution.paused',
                executionId: e._id.toString(),
                decisionId,
            });
        }
    }
    async resumeDecision(decisionId, userId) {
        const decision = await Decision_1.default.findOne({ _id: decisionId, userId });
        if (!decision)
            throw new Error('Decision not found.');
        if (!stateMachine_1.StateMachine.canTransitionDecision(decision.status, 'debating').valid) {
            throw new Error(`Decision cannot be resumed from state "${decision.status}".`);
        }
        stateMachine_1.StateMachine.transitionDecision(decision.status, 'debating');
        decision.status = 'debating';
        decision.currentPhase = 'debating';
        await decision.save();
        // Resume paused executions back to queued so the scheduler picks them up
        // and continues the existing run.
        await Execution_1.default.updateMany({ decisionId, status: 'paused' }, { $set: { status: 'queued' } });
        const execs = await Execution_1.default.find({ decisionId, status: 'queued' });
        for (const e of execs) {
            eventBus_1.executionEventBus.emit({
                type: 'execution.resumed',
                executionId: e._id.toString(),
                decisionId,
            });
        }
        worker_1.worker.wake();
    }
    async cancelDecision(decisionId, userId) {
        const decision = await Decision_1.default.findOne({ _id: decisionId, userId });
        if (!decision)
            throw new Error('Decision not found.');
        if (!stateMachine_1.StateMachine.canTransitionDecision(decision.status, 'cancelled').valid) {
            throw new Error(`Decision cannot be cancelled from state "${decision.status}".`);
        }
        stateMachine_1.StateMachine.transitionDecision(decision.status, 'cancelled');
        decision.status = 'cancelled';
        decision.currentPhase = 'failed';
        decision.completedAt = new Date();
        await decision.save();
        // Mark active executions cancelled. Running tasks are allowed to finish or
        // are marked for cancellation; pending/ready tasks are cancelled outright.
        await Execution_1.default.updateMany({ decisionId, status: { $in: ['queued', 'running', 'paused'] } }, { $set: { status: 'cancelled', cancelledAt: new Date(), completedAt: new Date() } });
        const execs = await Execution_1.default.find({ decisionId, status: 'cancelled' });
        for (const e of execs) {
            await Task_1.default.updateMany({ executionId: e._id, status: { $in: ['pending', 'ready', 'retrying'] } }, { $set: { status: 'cancelled', completedAt: new Date(), workerId: undefined, leasedAt: undefined } });
            eventBus_1.executionEventBus.emit({
                type: 'execution.cancelled',
                executionId: e._id.toString(),
                decisionId,
            });
        }
    }
    async getSnapshot(decisionId, userId) {
        const decision = await Decision_1.default.findOne({ _id: decisionId, userId });
        if (!decision)
            throw new Error('Decision not found.');
        const executions = await Execution_1.default.find({ decisionId }).sort({ createdAt: -1 });
        const tasks = await Task_1.default.find({
            executionId: { $in: executions.map((e) => e._id) },
        }).sort({ priority: 1, createdAt: 1 });
        const claims = await Claim_1.default.find({ decisionId });
        const evidence = await Evidence_1.default.find({ decisionId });
        const evidenceRelationships = await evidenceGraphService_1.evidenceGraphService.getRelationshipsForDecision(decisionId);
        const verifications = await VerificationResult_1.default.find({ decisionId });
        const redTeamFindings = await RedTeamFinding_1.default.find({ decisionId });
        const reconciliation = await ReconciliationResult_1.default.findOne({ decisionId });
        const activeExec = executions.find((e) => ['queued', 'running', 'paused'].includes(e.status)) || executions[0];
        const progress = activeExec ? this.computeProgress(tasks) : undefined;
        return {
            id: decision._id.toString(),
            status: decision.status,
            currentPhase: decision.currentPhase,
            confidence: decision.confidence,
            executions,
            tasks,
            claims,
            evidence,
            progress,
            evidenceRelationships,
            verifications,
            redTeamFindings,
            reconciliation,
        };
    }
    async createCourthouseExecution(courtroomId, userId, result, usageRecords) {
        const courtroom = await Courtroom_1.default.findOne({ _id: courtroomId, userId });
        if (!courtroom)
            return null;
        const decision = await this.linkFromCourtroom(courtroom, null, result.messages || [], result.verdict, usageRecords);
        const totalUsage = (0, usage_1.aggregateUsage)(usageRecords);
        const execution = new Execution_1.default({
            decisionId: decision?._id,
            status: 'completed',
            startedAt: new Date(),
            completedAt: new Date(),
            currentPhase: 'completed',
            progress: 100,
            totalTasks: 0,
            completedTasks: 0,
            tokenUsage: totalUsage,
            estimatedCost: totalUsage.estimatedCost,
            actualCost: totalUsage.estimatedCost,
            metadata: { courtroomId },
        });
        await execution.save();
        return execution;
    }
    async linkFromCourtroom(courtroom, execution, messages, verdict, usageRecords) {
        const existing = await Decision_1.default.findOne({ courtroomId: courtroom._id });
        if (existing)
            return existing;
        const decision = new Decision_1.default({
            userId: courtroom.userId,
            courtroomId: courtroom._id,
            title: courtroom.name || 'Untitled Decision',
            objective: courtroom.objective || '',
            status: 'completed',
            currentPhase: 'completed',
            completedAt: new Date(),
            configuration: {
                strategy: courtroom.mode || 'consensus',
                maxRounds: 3,
                participants: courtroom.participants,
            },
            participants: courtroom.participants,
            confidence: verdict?.confidenceScore,
            metadata: { linkedFromCourtroom: true },
        });
        const saved = await decision.save();
        await this.recordEvidence({
            decisionId: saved._id.toString(),
            type: 'objective',
            title: 'Decision Objective',
            content: courtroom.objective || '',
            sourceType: 'user_input',
            retrievedAt: new Date(),
        });
        await this.recordEvidence({
            decisionId: saved._id.toString(),
            type: 'verdict',
            title: 'Synthesized Verdict',
            content: verdict?.recommendation || '',
            sourceType: 'agent_generated',
            retrievedAt: new Date(),
        });
        for (const msg of messages) {
            if (msg.parsedResponse) {
                await this.persistClaimsFromMessage(saved, msg);
            }
        }
        return saved;
    }
    async createTask(executionId, definition) {
        const task = new Task_1.default({
            executionId,
            type: definition.type,
            status: 'pending',
            priority: definition.priority || 0,
            input: definition.input || {},
            assignedAgent: definition.assignedAgent,
            assignedModel: definition.assignedModel,
            dependencies: definition.dependencies || [],
            maxRetries: definition.metadata?.maxRetries || 2,
            metadata: definition.metadata,
        });
        await task.save();
        eventBus_1.executionEventBus.emit({
            type: 'task.created',
            taskId: task._id.toString(),
            executionId,
        });
        return task;
    }
    async persistClaimsFromMessage(decision, msg) {
        const parsed = msg.parsedResponse;
        if (!parsed)
            return;
        const claims = [];
        if (parsed.position && typeof parsed.position === 'string') {
            claims.push({ text: parsed.position, type: 'opinion' });
        }
        if (Array.isArray(parsed.arguments)) {
            for (const arg of parsed.arguments) {
                claims.push({ text: String(arg), type: 'inference' });
            }
        }
        if (Array.isArray(parsed.risks)) {
            for (const risk of parsed.risks) {
                claims.push({ text: String(risk), type: 'risk' });
            }
        }
        if (parsed.recommendation && typeof parsed.recommendation === 'string') {
            claims.push({ text: parsed.recommendation, type: 'recommendation' });
        }
        for (const c of claims) {
            const claim = new Claim_1.default({
                decisionId: decision._id.toString(),
                agentId: msg.agentId || msg.agentName,
                text: c.text,
                type: c.type,
                status: 'proposed',
                evidenceIds: [],
                sourceAgentId: msg.agentId,
            });
            await claim.save();
        }
    }
    async recordEvidence(params) {
        const evidence = new Evidence_1.default({
            decisionId: params.decisionId,
            type: params.type,
            title: params.title,
            content: params.content,
            sourceType: params.sourceType,
            source: params.source,
            retrievedAt: params.retrievedAt,
            metadata: params.metadata,
        });
        await evidence.save();
        return evidence;
    }
    computeProgress(tasks) {
        const totalTasks = tasks.length || 0;
        if (totalTasks === 0) {
            return { totalTasks: 0, completedTasks: 0, failedTasks: 0, runningTasks: 0, pendingTasks: 0, readyTasks: 0, progress: 0 };
        }
        const completedTasks = tasks.filter((t) => t.status === 'completed').length;
        const failedTasks = tasks.filter((t) => t.status === 'failed' || t.status === 'cancelled' || t.status === 'skipped').length;
        const runningTasks = tasks.filter((t) => t.status === 'running').length;
        const pendingTasks = tasks.filter((t) => t.status === 'pending' || t.status === 'retrying').length;
        const readyTasks = tasks.filter((t) => t.status === 'ready').length;
        const progress = Math.round(((completedTasks + failedTasks) / totalTasks) * 100);
        const active = tasks.find((t) => t.status === 'running' || t.status === 'ready');
        return {
            totalTasks,
            completedTasks,
            failedTasks,
            runningTasks,
            pendingTasks,
            readyTasks,
            progress,
            currentPhase: active ? this.phaseForType(active.type) : undefined,
        };
    }
    phaseForType(type) {
        switch (type) {
            case 'debate': return 'debating';
            case 'analysis': return 'reasoning';
            case 'synthesis': return 'awaiting_review';
            case 'verification':
            case 'verify_claim': return 'verifying';
            case 'red_team': return 'verifying';
            case 'reconciliation': return 'verifying';
            case 'research': return 'investigating';
            default: return type;
        }
    }
}
exports.DecisionOrchestrator = DecisionOrchestrator;
exports.decisionOrchestrator = new DecisionOrchestrator();
