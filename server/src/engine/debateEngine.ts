import Courtroom from '../models/Courtroom';
import Agent from '../models/Agent';
import Model from '../models/Model';
import Message from '../models/Message';
import Verdict from '../models/Verdict';

import { DebateContext, DebateStrategy, DebateResult } from './types';
import { EvidenceView } from '../research/types';
import { normalizeDebateMode, validateDebateReady } from '../services/debateValidation';
import { ConsensusStrategy } from './strategies/consensus';
import { MajorityVoteStrategy } from './strategies/majorityVote';
import { DevilsAdvocateStrategy } from './strategies/devilsAdvocate';
import { JudgeStrategy } from './strategies/judge';
import { OpenDebateStrategy } from './strategies/openDebate';
import { LLMUsageCallback } from '../decision/usage';

export interface DecisionDebateOptions {
  decisionId: string;
  userId: string;
  strategy: string;
  participants?: any[];
  objective?: string;
  onUsage?: LLMUsageCallback;
  /** Bounded, provenance-tagged research evidence handed to the agents. */
  evidence?: EvidenceView[];
  /** Phase 6 routing override: agent + model the router selected for this task. */
  routing?: { agentId?: string; modelId?: string };
}

class DebateEngine {
  private strategies: Record<string, DebateStrategy> = {};

  constructor() {
    // Register all strategies with normalized keys
    this.strategies['consensus'] = new ConsensusStrategy();
    this.strategies['majority vote'] = new MajorityVoteStrategy();
    this.strategies['majorityvote'] = new MajorityVoteStrategy();
    this.strategies["devil's advocate"] = new DevilsAdvocateStrategy();
    this.strategies['devils advocate'] = new DevilsAdvocateStrategy();
    this.strategies['devilsadvocate'] = new DevilsAdvocateStrategy();
    this.strategies['judge'] = new JudgeStrategy();
    this.strategies['open debate'] = new OpenDebateStrategy();
    this.strategies['opendebate'] = new OpenDebateStrategy();
  }

  private getStrategy(mode: string): DebateStrategy {
    const normalizedMode = (mode || '').toLowerCase().trim();
    const strategy = this.strategies[normalizedMode];
    if (!strategy) {
      // Default to Consensus strategy if not matched
      console.warn(`[DebateEngine] Unknown debate mode "${mode}". Defaulting to Consensus Strategy.`);
      return this.strategies['consensus'];
    }
    return strategy;
  }

  async runDebate(courtroomId: string, userId: string): Promise<DebateResult> {
    console.log(`[DebateEngine] Running debate for courtroom: ${courtroomId}`);
    const validation = await validateDebateReady(courtroomId, userId);
    if (!validation.ok) {
      throw new Error(validation.errors.join(' '));
    }

    // 1. Fetch courtroom
    const courtroom = await Courtroom.findOne({ _id: courtroomId, userId });
    if (!courtroom) {
      throw new Error('Courtroom not found.');
    }

    if (!courtroom.participants || courtroom.participants.length === 0) {
      throw new Error('Cannot start debate: no participants assigned to the courtroom.');
    }

    const normalizedMode = normalizeDebateMode(courtroom.mode);
    if (normalizedMode !== courtroom.mode) {
      courtroom.mode = normalizedMode;
      await courtroom.save();
    }

    // 2. Fetch courtroom participants (Agents) and their Models
    // Each participant in courtroom.participants is either an Agent template object or has an agentId.
    // Let's resolve the actual Agent documents from the database.
    const agentIds = courtroom.participants
      .map((p: any) => p.agentId || p.id || p._id)
      .filter(Boolean);

    const agents = await Agent.find({ _id: { $in: agentIds }, userId });

    if (agents.length === 0) {
      throw new Error('No valid agent participants could be resolved from the courtroom participants.');
    }

    // 3. Fetch all enabled Models configured by this user
    const models = await Model.find({ userId, enabled: true });
    if (models.length === 0) {
      throw new Error('No models configured or enabled. Please add a model with an API key first.');
    }

    // 4. Update status to active
    courtroom.status = 'active';
    await courtroom.save();

    // 5. Build context
    const context: DebateContext = {
      courtroom,
      agents,
      models,
      objective: courtroom.objective || 'Provide general feedback and decision support.',
    };

    // 6. Look up and run strategy
    const strategy = this.getStrategy(courtroom.mode || 'consensus');
    
    try {
      const result = await strategy.execute(context);

      // 7. Clear old debate messages and verdict for this courtroom
      await Message.deleteMany({ courtroomId });
      await Verdict.deleteMany({ courtroomId });

      // 8. Persist new messages to Message collection
      const savedMessages = [];
      for (const msg of result.messages) {
        const dbMsg = new Message({
          courtroomId,
          agentId: msg.agentId,
          agentName: msg.agentName,
          role: msg.role,
          content: msg.content,
          roundNumber: msg.roundNumber,
          parsedResponse: msg.parsedResponse,
        });
        const saved = await dbMsg.save();
        savedMessages.push(saved);
      }

      // 9. Persist final verdict
      const dbVerdict = new Verdict({
        courtroomId,
        summary: result.verdict.summary,
        recommendation: result.verdict.recommendation,
        pros: result.verdict.pros,
        cons: result.verdict.cons,
        risks: result.verdict.risks,
        nextActions: result.verdict.nextActions,
        confidenceScore: result.verdict.confidenceScore,
        rawData: result,
      });
      await dbVerdict.save();

      // 10. Update courtroom status to completed
      courtroom.status = 'completed';
      await courtroom.save();

      return result;
    } catch (err: any) {
      console.error('[DebateEngine] Execution error:', err);
      courtroom.status = 'failed';
      await courtroom.save();
      throw err;
    }
  }

  /**
   * Execute a debate directly from a Decision, without requiring a
   * persisted Courtroom document. This is the path used by the
   * DecisionOrchestrator. It resolves agents/models the same way the
   * courtroom path does, applies the same strategy, and returns messages
   * and verdict — without persisting them to the Courtroom collections.
   */
  async executeForDecision(options: DecisionDebateOptions): Promise<DebateResult> {
    const userId = options.userId;
    const strategyKey = normalizeDebateMode(options.strategy);

    // Resolve agent participants
    const participantIds = (options.participants || [])
      .map((p: any) => p?.agentId || p?.id || p?._id)
      .filter(Boolean);

    const agents = participantIds.length > 0
      ? await Agent.find({ _id: { $in: participantIds }, userId })
      : [];

    // Phase 6 — the router selected the agent that should lead this debate. If
    // that agent is not among the decision's participants, include it so the
    // routed choice actually participates (decision path only; courtrooms are
    // untouched).
    if (options.routing?.agentId && participantIds.length > 0) {
      const routedPresent = agents.some(
        (a) => a._id.toString() === options.routing?.agentId || a.id === options.routing?.agentId
      );
      if (!routedPresent) {
        const routedAgent = await Agent.findOne({ _id: options.routing.agentId, userId });
        if (routedAgent) {
          agents.push(routedAgent);
        }
      }
    }

    if (agents.length === 0) {
      throw new Error('No valid agent participants could be resolved for this decision.');
    }

    // Resolve enabled models
    const models = await Model.find({ userId, enabled: true });
    if (models.length === 0) {
      throw new Error('No models configured or enabled. Please add a model with an API key first.');
    }

    const objective = options.objective || 'Provide general feedback and decision support.';

    const context: DebateContext = {
      courtroom: {
        name: 'Decision',
        objective,
        participants: options.participants || [],
      } as any,
      agents,
      models,
      objective,
      onUsage: options.onUsage,
      evidence: options.evidence,
      routingAgentId: options.routing?.agentId,
      routingModelId: options.routing?.modelId,
    };

    const strategy = this.getStrategy(strategyKey);

    const result = await strategy.execute(context);
    return result;
  }
}

export const debateEngine = new DebateEngine();
