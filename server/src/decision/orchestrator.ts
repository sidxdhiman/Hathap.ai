import Decision, { IDecision } from '../models/Decision';
import Execution, { IExecution } from '../models/Execution';
import Task, { ITask } from '../models/Task';
import Claim, { IClaim } from '../models/Claim';
import Evidence, { IEvidence } from '../models/Evidence';
import Courtroom from '../models/Courtroom';
import Message from '../models/Message';
import Verdict from '../models/Verdict';
import Agent, { IAgent } from '../models/Agent';
import Model, { IModel } from '../models/Model';
import {
  DecisionConfiguration,
  DecisionStatus,
  ExecutionStatus,
  TaskStatus,
  TaskType,
  TaskDefinition,
  TokenUsage,
  ExecutionError,
} from './types';
import { StateMachine } from './stateMachine';
import { aggregateUsage, usageSummary } from './usage';
import { debateEngine } from '../engine/debateEngine';
import { normalizeDebateMode } from '../services/debateValidation';

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
}

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
   * Start a decision execution. Creates a persistent Execution and runs
   * a series of Tasks through the debate engine (the existing, proven
   * execution layer) while recording granular lifecycle data.
   */
  async startDecision(decisionId: string, userId: string): Promise<IExecution> {
    const decision = await Decision.findOne({ _id: decisionId, userId });
    if (!decision) {
      throw new Error('Decision not found.');
    }

    StateMachine.transitionDecision(decision.status as DecisionStatus, 'debating');
    decision.status = 'debating';
    decision.currentPhase = 'debating';
    await decision.save();

    const execution = new Execution({
      decisionId,
      status: 'running',
      startedAt: new Date(),
      currentPhase: 'debating',
      progress: 0,
    });
    await execution.save();

    const usageRecords: TokenUsage[] = [];

    try {
      // ---- Phase 1: Initial Analysis Task ----
      await this.createTask(execution._id.toString(), {
        type: 'analysis',
        input: { description: 'Initial agent analysis' },
        priority: 1,
      });

      // ---- Phase 2: Run the debate via DebateEngine ----
      const result = await this.runDebate(decision, execution, usageRecords);
      decision.confidence = result.verdict?.confidenceScore;

      // ---- Phase 3: Persist claims from debate messages ----
      await this.persistClaimsFromDebate(decision, result.messages);

      // ---- Finalize execution ----
      const totalUsage = aggregateUsage(usageRecords);
      execution.tokenUsage = totalUsage;
      execution.estimatedCost = totalUsage.estimatedCost;
      execution.actualCost = totalUsage.estimatedCost;
      execution.progress = 100;
      execution.status = 'completed';
      execution.completedAt = new Date();
      await execution.save();

      // ---- Finalize decision ----
      StateMachine.transitionDecision(decision.status as DecisionStatus, 'completed');
      decision.status = 'completed';
      decision.currentPhase = 'completed';
      decision.completedAt = new Date();
      await decision.save();

      return execution;
    } catch (error: any) {
      execution.status = 'failed';
      execution.error = {
        code: this.classifyError(error),
        message: error?.message || 'Decision execution failed.',
        retryable: true,
        retryCount: execution.retryCount,
        createdAt: new Date(),
      };
      const totalUsage = aggregateUsage(usageRecords);
      execution.tokenUsage = totalUsage;
      execution.estimatedCost = totalUsage.estimatedCost;
      execution.completedAt = new Date();
      await execution.save();

      decision.status = 'failed';
      await decision.save();
      throw error;
    }
  }

  /**
   * Create a persistent Execution and linked Decision for a debate that ran
   * through the classic Courtroom path (`debateEngine.runDebate`). This keeps
   * the two execution models in sync without forcing the courtroom flow to
   * change its behavior.
   */
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
      tokenUsage: totalUsage,
      estimatedCost: totalUsage.estimatedCost,
      actualCost: totalUsage.estimatedCost,
      metadata: { courtroomId },
    });
    await execution.save();

    return execution;
  }

  async pauseDecision(decisionId: string, userId: string): Promise<void> {
    const decision = await Decision.findOne({ _id: decisionId, userId });
    if (!decision) throw new Error('Decision not found.');

    StateMachine.transitionDecision(decision.status as DecisionStatus, 'paused');
    decision.status = 'paused';
    await decision.save();
  }

  async resumeDecision(decisionId: string, userId: string): Promise<void> {
    const decision = await Decision.findOne({ _id: decisionId, userId });
    if (!decision) throw new Error('Decision not found.');

    StateMachine.transitionDecision(decision.status as DecisionStatus, 'debating');
    decision.status = 'debating';
    await decision.save();
  }

  async getSnapshot(decisionId: string, userId: string): Promise<DecisionSnapshot> {
    const decision = await Decision.findOne({ _id: decisionId, userId });
    if (!decision) throw new Error('Decision not found.');

    const executions = await Execution.find({ decisionId }).sort({ createdAt: -1 });
    const tasks = await Task.find({
      executionId: { $in: executions.map((e) => e._id) },
    }).sort({ priority: 1 });
    const claims = await Claim.find({ decisionId });
    const evidence = await Evidence.find({ decisionId });

    return {
      id: decision._id.toString(),
      status: decision.status as DecisionStatus,
      currentPhase: decision.currentPhase,
      confidence: decision.confidence,
      executions,
      tasks,
      claims,
      evidence,
    };
  }

  async linkFromCourtroom(
    courtroom: any,
    execution: IExecution,
    messages: any[],
    verdict: any,
    usageRecords: TokenUsage[]
  ): Promise<IDecision | null> {    const existing = await Decision.findOne({ courtroomId: courtroom._id });
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

  private async runDebate(
    decision: IDecision,
    execution: IExecution,
    usageRecords: TokenUsage[]
  ): Promise<any> {
    const strategy = decision.configuration?.strategy || 'consensus';
    const normalized = normalizeDebateMode(strategy);

    const results: any[] = [];
    const taskResults: { messages: any[]; verdict: any } = {
      messages: [],
      verdict: null,
    };

    try {
      const result = await debateEngine.executeForDecision({
        decisionId: decision._id.toString(),
        userId: decision.userId.toString(),
        strategy: normalized,
        participants: decision.participants,
        onUsage: (usage: TokenUsage) => usageRecords.push(usage),
      });
      taskResults.messages = result.messages;
      taskResults.verdict = result.verdict;
      results.push(result);
    } catch (error) {
      throw error;
    }

    return {
      messages: taskResults.messages,
      verdict: taskResults.verdict,
    };
  }

  private async createTask(executionId: string, definition: TaskDefinition): Promise<ITask> {
    const task = new Task({
      executionId,
      type: definition.type,
      status: 'completed',
      priority: definition.priority || 0,
      input: definition.input || {},
      assignedAgent: definition.assignedAgent,
      assignedModel: definition.assignedModel,
      dependencies: definition.dependencies || [],
      startedAt: new Date(),
      completedAt: new Date(),
    });
    await task.save();
    return task;
  }

  private async persistClaimsFromDebate(decision: IDecision, messages: any[]): Promise<void> {
    for (const msg of messages) {
      await this.persistClaimsFromMessage(decision, msg);
    }
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

  private classifyError(error: any): ExecutionError['code'] {
    const message = error?.message || '';
    if (/timeout/i.test(message)) return 'TIMEOUT';
    if (/rate limit|429/i.test(message)) return 'RATE_LIMIT';
    if (/credit|402/i.test(message)) return 'INSUFFICIENT_CREDITS';
    if (/api key|invalid key|401/i.test(message)) return 'INVALID_API_KEY';
    if (/malformed|parse/i.test(message)) return 'MALFORMED_OUTPUT';
    if (/model.*unavailable|not found/i.test(message)) return 'MODEL_UNAVAILABLE';
    if (/network|fetch failed|ECONNRESET/i.test(message)) return 'NETWORK_FAILURE';
    return 'AGENT_FAILURE';
  }
}

export const decisionOrchestrator = new DecisionOrchestrator();
