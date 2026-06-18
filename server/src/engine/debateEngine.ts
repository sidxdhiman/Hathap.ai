import Courtroom from '../models/Courtroom';
import Agent from '../models/Agent';
import Model from '../models/Model';
import Message from '../models/Message';
import Verdict from '../models/Verdict';

import { DebateContext, DebateStrategy, DebateResult } from './types';
import { ConsensusStrategy } from './strategies/consensus';
import { MajorityVoteStrategy } from './strategies/majorityVote';
import { DevilsAdvocateStrategy } from './strategies/devilsAdvocate';
import { JudgeStrategy } from './strategies/judge';
import { OpenDebateStrategy } from './strategies/openDebate';

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

    // 1. Fetch courtroom
    const courtroom = await Courtroom.findOne({ _id: courtroomId, userId });
    if (!courtroom) {
      throw new Error('Courtroom not found.');
    }

    if (!courtroom.participants || courtroom.participants.length === 0) {
      throw new Error('Cannot start debate: no participants assigned to the courtroom.');
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
}

export const debateEngine = new DebateEngine();
