import Decision, { IDecision } from '../models/Decision';
import Execution, { IExecution } from '../models/Execution';
import Task, { ITask } from '../models/Task';
import Claim, { IClaim } from '../models/Claim';
import Evidence, { IEvidence } from '../models/Evidence';
import Courtroom from '../models/Courtroom';
import VerificationResult, { IVerificationResult } from '../models/VerificationResult';
import RedTeamFinding, { IRedTeamFinding } from '../models/RedTeamFinding';
import ReconciliationResult, { IReconciliationResult } from '../models/ReconciliationResult';
import EvidenceRelationship, { IEvidenceRelationship } from '../models/EvidenceRelationship';
import {
  DecisionConfiguration,
  DecisionStatus,
  TaskDefinition,
  TokenUsage,
  ProgressSummary,
} from './types';
import { StateMachine } from './stateMachine';
import { aggregateUsage } from './usage';
import { normalizeDebateMode } from '../services/debateValidation';
import { executionEventBus } from './eventBus';
import { worker } from '../tasks/worker';
import { evidenceGraphService } from './evidenceGraphService';

export interface CreateDecisionInput {
  userId: string;
  title: string;
  objective: string;
  context?: string;
  configuration?: Partial<DecisionConfiguration>;
  participants?: any[];
  assumptions?: string[];
  metadata?: Record<string, unknown>;
}

export interface DecisionSnapshot {
  id: string;
  status: DecisionStatus;
  currentPhase: string;
  confidence?: number;
  executions: IExecution[];
  tasks: ITask[];
  claims: IClaim[];
  evidence: IEvidence[];
  progress?: ProgressSummary;
  evidenceRelationships?: IEvidenceRelationship[];
  verifications?: IVerificationResult[];
  redTeamFindings?: IRedTeamFinding[];
  reconciliation?: IReconciliationResult | null;
}

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
export class DecisionOrchestrator {
  async createDecision(input: CreateDecisionInput): Promise<IDecision> {
    const decision = new Decision({
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
      sourceType: 'user_input' as const,
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
  async startDecision(
    decisionId: string,
    userId: string,
    opts: {
      researchQueries?: Array<{ query: string; purpose?: string; maxResults?: number }>;
      planningMode?: 'fixed' | 'intelligent';
      routingMode?: 'auto' | 'manual';
      routingModelId?: string;
    } = {}
  ): Promise<IExecution> {
    const decision = await Decision.findOne({ _id: decisionId, userId });
    if (!decision) {
      throw new Error('Decision not found.');
    }

    if (!StateMachine.canTransitionDecision(decision.status as DecisionStatus, 'debating').valid) {
      throw new Error(`Decision cannot be started from state "${decision.status}".`);
    }
    StateMachine.transitionDecision(decision.status as DecisionStatus, 'debating');
    decision.status = 'debating';
    decision.currentPhase = 'debating';
    await decision.save();

    const planningMode = opts.planningMode === 'intelligent' ? 'intelligent' : 'fixed';
    const routingMode = opts.routingMode === 'manual' ? 'manual' : 'auto';

    // In intelligent mode the execution starts `pending` while the planner
    // runs so the Worker never finalizes an empty execution; it is queued once
    // the plan has been compiled into real tasks.
    const execution = new Execution({
      decisionId,
      status: planningMode === 'intelligent' ? 'pending' : 'queued',
      startedAt: new Date(),
      currentPhase: 'debating',
      progress: 0,
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      runningTasks: 0,
      pendingTasks: 0,
      planningStatus: planningMode === 'intelligent' ? 'planning' : undefined,
      planningMode,
      metadata: {
        routing: {
          mode: routingMode,
          modelId: opts.routingModelId,
        },
      },
    });
    await execution.save();

    executionEventBus.emit({
      type: 'execution.queued',
      executionId: execution._id.toString(),
      decisionId,
    });

    if (planningMode === 'intelligent') {
      return this.startDecisionWithPlanning(execution, decision, opts.researchQueries || [], userId);
    }

    return this.startDecisionFixed(execution, decision, opts.researchQueries || []);
  }

  private async startDecisionFixed(
    execution: IExecution,
    decision: IDecision,
    researchQueriesInput: Array<{ query: string; purpose?: string; maxResults?: number }>
  ): Promise<IExecution> {
    const strategy = normalizeDebateMode(decision.configuration?.strategy || 'consensus');

    const researchQueries = (researchQueriesInput || []).filter((q) => q && q.query && q.query.trim());

    const researchTaskIds: string[] = [];
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

    await Execution.updateOne(
      { _id: execution._id },
      { $set: { currentTask: debateTask._id.toString() } }
    );

    executionEventBus.emit({
      type: 'execution.started',
      executionId: execution._id.toString(),
      decisionId: String(execution.decisionId),
    });

    // Wake the worker so the execution begins promptly.
    worker.wake();

    const fresh = await Execution.findById(execution._id);
    return fresh || execution;
  }

  /**
   * Phase 5 — intelligent start path.
   *
   *   create Execution (pending) → Planner → Validate → Compile (real tasks)
   *   → queue → wake worker.
   *
   * Planning is bounded (timeout + bounded retries + deterministic fallback)
   * so this never blocks the decision forever.
   */
  private async startDecisionWithPlanning(
    execution: IExecution,
    decision: IDecision,
    researchQueries: Array<{ query: string; purpose?: string; maxResults?: number }>,
    userId: string
  ): Promise<IExecution> {
    const { decisionPlanner, PlanningError } = await import('../planning/planner');

    let planningResult;
    try {
      planningResult = await decisionPlanner.planExecution({
        executionId: execution._id.toString(),
        userId,
        planningMode: 'intelligent',
        researchQueries: (researchQueries || [])
          .filter((q) => q && q.query && q.query.trim())
          .map((q) => q.query.trim()),
      });
    } catch (err: any) {
      // The planner marks the Execution failed itself on hard failures; surface
      // the structured failure to the API so the caller sees why.
      if (err instanceof PlanningError) throw err;
      throw new Error(`Planning failed: ${err?.message || err}`);
    }

    // The planner compiled real tasks; the execution may now be queued.
    await Execution.updateOne(
      { _id: execution._id },
      {
        $set: {
          status: 'queued',
          planningStatus: 'planned',
          planId: planningResult.compiled.persistedPlan._id,
          currentTask: planningResult.compiled.debateTaskId,
        },
      }
    );

    executionEventBus.emit({
      type: 'execution.started',
      executionId: execution._id.toString(),
      decisionId: String(execution.decisionId),
    });

    worker.wake();

    const fresh = await Execution.findById(execution._id);
    return fresh || execution;
  }

  async pauseDecision(decisionId: string, userId: string): Promise<void> {
    const decision = await Decision.findOne({ _id: decisionId, userId });
    if (!decision) throw new Error('Decision not found.');

    if (!StateMachine.canTransitionDecision(decision.status as DecisionStatus, 'paused').valid) {
      throw new Error(`Decision cannot be paused from state "${decision.status}".`);
    }
    StateMachine.transitionDecision(decision.status as DecisionStatus, 'paused');
    decision.status = 'paused';
    await decision.save();

    // Pause the active execution(s). The Worker will stop dispatching new tasks
    // because the owning decision is paused. Currently-running LLM calls are
    // allowed to finish; the scheduler stops after that.
    await Execution.updateMany(
      { decisionId, status: { $in: ['queued', 'running'] } },
      { $set: { status: 'paused' } }
    );

    const execs = await Execution.find({ decisionId, status: 'paused' });
    for (const e of execs) {
      executionEventBus.emit({
        type: 'execution.paused',
        executionId: e._id.toString(),
        decisionId,
      });
    }
  }

  async resumeDecision(decisionId: string, userId: string): Promise<void> {
    const decision = await Decision.findOne({ _id: decisionId, userId });
    if (!decision) throw new Error('Decision not found.');

    if (!StateMachine.canTransitionDecision(decision.status as DecisionStatus, 'debating').valid) {
      throw new Error(`Decision cannot be resumed from state "${decision.status}".`);
    }
    StateMachine.transitionDecision(decision.status as DecisionStatus, 'debating');
    decision.status = 'debating';
    decision.currentPhase = 'debating';
    await decision.save();

    // Resume paused executions back to queued so the scheduler picks them up
    // and continues the existing run.
    await Execution.updateMany(
      { decisionId, status: 'paused' },
      { $set: { status: 'queued' } }
    );

    const execs = await Execution.find({ decisionId, status: 'queued' });
    for (const e of execs) {
      executionEventBus.emit({
        type: 'execution.resumed',
        executionId: e._id.toString(),
        decisionId,
      });
    }

    worker.wake();
  }

  async cancelDecision(decisionId: string, userId: string): Promise<void> {
    const decision = await Decision.findOne({ _id: decisionId, userId });
    if (!decision) throw new Error('Decision not found.');

    if (!StateMachine.canTransitionDecision(decision.status as DecisionStatus, 'cancelled').valid) {
      throw new Error(`Decision cannot be cancelled from state "${decision.status}".`);
    }
    StateMachine.transitionDecision(decision.status as DecisionStatus, 'cancelled');
    decision.status = 'cancelled';
    decision.currentPhase = 'failed';
    decision.completedAt = new Date();
    await decision.save();

    // Phase 8: record an honest `cancelled` memory entry so abandoned or
    // cancelled decisions are represented accurately, never as successes.
    try {
      const { decisionMemoryService } = await import('../memory/decisionMemoryService');
      await decisionMemoryService.createForDecision(decisionId, userId, { via: 'cancellation' });
    } catch (err: any) {
      console.error('[Orchestrator] failed to record cancelled decision memory', err?.message);
    }

    // Mark active executions cancelled. Running tasks are allowed to finish or
    // are marked for cancellation; pending/ready tasks are cancelled outright.
    await Execution.updateMany(
      { decisionId, status: { $in: ['queued', 'running', 'paused'] } },
      { $set: { status: 'cancelled', cancelledAt: new Date(), completedAt: new Date() } }
    );

    const execs = await Execution.find({ decisionId, status: 'cancelled' });
    for (const e of execs) {
      await Task.updateMany(
        { executionId: e._id, status: { $in: ['pending', 'ready', 'retrying'] } },
        { $set: { status: 'cancelled', completedAt: new Date(), workerId: undefined, leasedAt: undefined } }
      );
      executionEventBus.emit({
        type: 'execution.cancelled',
        executionId: e._id.toString(),
        decisionId,
      });
    }
  }

  async getSnapshot(decisionId: string, userId: string): Promise<DecisionSnapshot> {
    const decision = await Decision.findOne({ _id: decisionId, userId });
    if (!decision) throw new Error('Decision not found.');

    const executions = await Execution.find({ decisionId }).sort({ createdAt: -1 });
    const tasks = await Task.find({
      executionId: { $in: executions.map((e) => e._id) },
    }).sort({ priority: 1, createdAt: 1 });
    const claims = await Claim.find({ decisionId });
    const evidence = await Evidence.find({ decisionId });
    const evidenceRelationships = await evidenceGraphService.getRelationshipsForDecision(decisionId);
    const verifications = await VerificationResult.find({ decisionId });
    const redTeamFindings = await RedTeamFinding.find({ decisionId });
    const reconciliation = await ReconciliationResult.findOne({ decisionId });

    const activeExec = executions.find((e) => ['queued', 'running', 'paused'].includes(e.status)) || executions[0];
    const progress = activeExec ? this.computeProgress(tasks) : undefined;

    return {
      id: decision._id.toString(),
      status: decision.status as DecisionStatus,
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

  async createCourthouseExecution(
    courtroomId: string,
    userId: string,
    result: any,
    usageRecords: TokenUsage[]
  ): Promise<IExecution | null> {
    const courtroom = await Courtroom.findOne({ _id: courtroomId, userId });
    if (!courtroom) return null;

    const decision = await this.linkFromCourtroom(
      courtroom,
      null as any,
      result.messages || [],
      result.verdict,
      usageRecords
    );

    const totalUsage = aggregateUsage(usageRecords);

    const execution = new Execution({
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

  async linkFromCourtroom(
    courtroom: any,
    execution: IExecution,
    messages: any[],
    verdict: any,
    usageRecords: TokenUsage[]
  ): Promise<IDecision | null> {
    const existing = await Decision.findOne({ courtroomId: courtroom._id });
    if (existing) return existing;

    const decision = new Decision({
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
      sourceType: 'user_input' as const,
      retrievedAt: new Date(),
    });

    await this.recordEvidence({
      decisionId: saved._id.toString(),
      type: 'verdict',
      title: 'Synthesized Verdict',
      content: verdict?.recommendation || '',
      sourceType: 'agent_generated' as const,
      retrievedAt: new Date(),
    });

    for (const msg of messages) {
      if (msg.parsedResponse) {
        await this.persistClaimsFromMessage(saved, msg);
      }
    }

    return saved;
  }

  private async createTask(executionId: string, definition: TaskDefinition): Promise<ITask> {
    const task = new Task({
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
    executionEventBus.emit({
      type: 'task.created',
      taskId: task._id.toString(),
      executionId,
    });
    return task;
  }

  private async persistClaimsFromMessage(decision: IDecision, msg: any): Promise<void> {
    const parsed = msg.parsedResponse;
    if (!parsed) return;

    const claims: Array<{ text: string; type: any; confidence?: number }> = [];

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
      const claim = new Claim({
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

  private async recordEvidence(params: {
    decisionId: string;
    type: string;
    title: string;
    content: string;
    sourceType: any;
    retrievedAt: Date;
    source?: string;
    metadata?: Record<string, unknown>;
  }): Promise<IEvidence> {
    const evidence = new Evidence({
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

  private computeProgress(tasks: ITask[]): ProgressSummary {
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

  private phaseForType(type: string): string {
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

export const decisionOrchestrator = new DecisionOrchestrator();
