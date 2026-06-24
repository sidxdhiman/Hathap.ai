"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConsensusStrategy = void 0;
const agentRunner_1 = require("../agentRunner");
const verdictGenerator_1 = require("../verdictGenerator");
class ConsensusStrategy {
    async execute(ctx) {
        const messages = [];
        if (ctx.agents.length === 0) {
            throw new Error('No agents assigned to this courtroom debate.');
        }
        // --- Round 1: Independent Analysis (Parallel) ---
        console.log(`[ConsensusStrategy] Starting Round 1: Independent Analysis for ${ctx.agents.length} agents`);
        const round1Promises = ctx.agents.map((agent) => (0, agentRunner_1.runAgent)(agent, ctx, [], 1, 'Provide your independent analysis of the objective without seeing other perspectives.'));
        const round1Messages = await Promise.all(round1Promises);
        messages.push(...round1Messages);
        // --- Round 2: Consensus Finding (Parallel) ---
        console.log(`[ConsensusStrategy] Starting Round 2: Finding Consensus`);
        const round2Promises = ctx.agents.map((agent) => (0, agentRunner_1.runAgent)(agent, ctx, messages, 2, 'Review the Round 1 analyses of other agents. Identify where you agree and disagree, and try to find a consensus or compromise solution.'));
        const round2Messages = await Promise.all(round2Promises);
        messages.push(...round2Messages);
        // --- Synthesize Verdict ---
        console.log(`[ConsensusStrategy] Generating final verdict`);
        // Use first model in courtroom config, fallback to default model
        const synthesisModel = ctx.models[0];
        const verdict = await (0, verdictGenerator_1.generateVerdict)(ctx.objective, messages, synthesisModel);
        return {
            messages,
            verdict,
        };
    }
}
exports.ConsensusStrategy = ConsensusStrategy;
