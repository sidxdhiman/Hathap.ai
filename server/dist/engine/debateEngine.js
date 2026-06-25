"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.debateEngine = void 0;
const Courtroom_1 = __importDefault(require("../models/Courtroom"));
const Agent_1 = __importDefault(require("../models/Agent"));
const Model_1 = __importDefault(require("../models/Model"));
const Message_1 = __importDefault(require("../models/Message"));
const Verdict_1 = __importDefault(require("../models/Verdict"));
const debateValidation_1 = require("../services/debateValidation");
const consensus_1 = require("./strategies/consensus");
const majorityVote_1 = require("./strategies/majorityVote");
const devilsAdvocate_1 = require("./strategies/devilsAdvocate");
const judge_1 = require("./strategies/judge");
const openDebate_1 = require("./strategies/openDebate");
class DebateEngine {
    constructor() {
        this.strategies = {};
        // Register all strategies with normalized keys
        this.strategies['consensus'] = new consensus_1.ConsensusStrategy();
        this.strategies['majority vote'] = new majorityVote_1.MajorityVoteStrategy();
        this.strategies['majorityvote'] = new majorityVote_1.MajorityVoteStrategy();
        this.strategies["devil's advocate"] = new devilsAdvocate_1.DevilsAdvocateStrategy();
        this.strategies['devils advocate'] = new devilsAdvocate_1.DevilsAdvocateStrategy();
        this.strategies['devilsadvocate'] = new devilsAdvocate_1.DevilsAdvocateStrategy();
        this.strategies['judge'] = new judge_1.JudgeStrategy();
        this.strategies['open debate'] = new openDebate_1.OpenDebateStrategy();
        this.strategies['opendebate'] = new openDebate_1.OpenDebateStrategy();
    }
    getStrategy(mode) {
        const normalizedMode = (mode || '').toLowerCase().trim();
        const strategy = this.strategies[normalizedMode];
        if (!strategy) {
            // Default to Consensus strategy if not matched
            console.warn(`[DebateEngine] Unknown debate mode "${mode}". Defaulting to Consensus Strategy.`);
            return this.strategies['consensus'];
        }
        return strategy;
    }
    async runDebate(courtroomId, userId) {
        console.log(`[DebateEngine] Running debate for courtroom: ${courtroomId}`);
        const validation = await (0, debateValidation_1.validateDebateReady)(courtroomId, userId);
        if (!validation.ok) {
            throw new Error(validation.errors.join(' '));
        }
        // 1. Fetch courtroom
        const courtroom = await Courtroom_1.default.findOne({ _id: courtroomId, userId });
        if (!courtroom) {
            throw new Error('Courtroom not found.');
        }
        if (!courtroom.participants || courtroom.participants.length === 0) {
            throw new Error('Cannot start debate: no participants assigned to the courtroom.');
        }
        const normalizedMode = (0, debateValidation_1.normalizeDebateMode)(courtroom.mode);
        if (normalizedMode !== courtroom.mode) {
            courtroom.mode = normalizedMode;
            await courtroom.save();
        }
        // 2. Fetch courtroom participants (Agents) and their Models
        // Each participant in courtroom.participants is either an Agent template object or has an agentId.
        // Let's resolve the actual Agent documents from the database.
        const agentIds = courtroom.participants
            .map((p) => p.agentId || p.id || p._id)
            .filter(Boolean);
        const agents = await Agent_1.default.find({ _id: { $in: agentIds }, userId });
        if (agents.length === 0) {
            throw new Error('No valid agent participants could be resolved from the courtroom participants.');
        }
        // 3. Fetch all enabled Models configured by this user
        const models = await Model_1.default.find({ userId, enabled: true });
        if (models.length === 0) {
            throw new Error('No models configured or enabled. Please add a model with an API key first.');
        }
        // 4. Update status to active
        courtroom.status = 'active';
        await courtroom.save();
        // 5. Build context
        const context = {
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
            await Message_1.default.deleteMany({ courtroomId });
            await Verdict_1.default.deleteMany({ courtroomId });
            // 8. Persist new messages to Message collection
            const savedMessages = [];
            for (const msg of result.messages) {
                const dbMsg = new Message_1.default({
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
            const dbVerdict = new Verdict_1.default({
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
        }
        catch (err) {
            console.error('[DebateEngine] Execution error:', err);
            courtroom.status = 'failed';
            await courtroom.save();
            throw err;
        }
    }
}
exports.debateEngine = new DebateEngine();
