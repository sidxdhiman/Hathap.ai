"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenDebateStrategy = void 0;
const agentRunner_1 = require("../agentRunner");
const verdictGenerator_1 = require("../verdictGenerator");
class OpenDebateStrategy {
    async execute(ctx) {
        const messages = [];
        if (ctx.agents.length === 0) {
            throw new Error('No agents assigned to this courtroom debate.');
        }
        const maxRounds = 3;
        for (let round = 1; round <= maxRounds; round++) {
            console.log(`[OpenDebateStrategy] Starting Round ${round}`);
            // In an open debate, let's run them in sequence or in parallel.
            // Running them in sequence allows later agents in the same round to respond immediately to earlier ones.
            // However, parallel is faster and works well if we pass previous rounds.
            // Let's do sequential for a more conversational, dynamic debate!
            for (const agent of ctx.agents) {
                const msg = await (0, agentRunner_1.runAgent)(agent, ctx, messages, round, round === 1
                    ? 'Open the debate with your perspective.'
                    : 'Continue the debate. Respond directly to the arguments, criticisms, and points raised in the discussion so far.');
                messages.push(msg);
            }
        }
        console.log(`[OpenDebateStrategy] Generating final verdict`);
        const synthesisModel = ctx.models[0];
        const verdict = await (0, verdictGenerator_1.generateVerdict)(ctx.objective, messages, synthesisModel);
        return {
            messages,
            verdict,
        };
    }
}
exports.OpenDebateStrategy = OpenDebateStrategy;
