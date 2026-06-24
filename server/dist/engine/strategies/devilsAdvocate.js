"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DevilsAdvocateStrategy = void 0;
const agentRunner_1 = require("../agentRunner");
const verdictGenerator_1 = require("../verdictGenerator");
class DevilsAdvocateStrategy {
    async execute(ctx) {
        const messages = [];
        if (ctx.agents.length === 0) {
            throw new Error('No agents assigned to this courtroom debate.');
        }
        // Pick first agent as Devil's Advocate
        const devilsAdvocate = ctx.agents[0];
        const proponents = ctx.agents.slice(1);
        if (proponents.length === 0) {
            // Fallback if only 1 agent is in the courtroom: agent analyzes, then challenges themselves, then responds
            console.log(`[DevilsAdvocateStrategy] Running single-agent fallback`);
            // Round 1: Initial Analysis
            const r1 = await (0, agentRunner_1.runAgent)(devilsAdvocate, ctx, [], 1, 'Analyze the objective normally.');
            messages.push(r1);
            // Round 2: Self-Challenge
            const r2 = await (0, agentRunner_1.runAgent)(devilsAdvocate, ctx, messages, 2, 'Now act as a Devil\'s Advocate. Play critic and challenge your own assumptions, identifying all potential failure modes and blind spots.');
            messages.push(r2);
            // Round 3: Rebuttal/Mitigation
            const r3 = await (0, agentRunner_1.runAgent)(devilsAdvocate, ctx, messages, 3, 'Address the challenges you raised. How can these risks be mitigated or the plan updated?');
            messages.push(r3);
        }
        else {
            // Normal flow: proponents and devilsAdvocate
            console.log(`[DevilsAdvocateStrategy] Round 1: Proponents submit initial analysis`);
            const r1Promises = proponents.map((agent) => (0, agentRunner_1.runAgent)(agent, ctx, [], 1, 'Provide your initial analysis of the objective.'));
            const r1Messages = await Promise.all(r1Promises);
            messages.push(...r1Messages);
            console.log(`[DevilsAdvocateStrategy] Round 2: Devil's Advocate challenges assumptions`);
            const r2Message = await (0, agentRunner_1.runAgent)(devilsAdvocate, ctx, messages, 2, `Act strictly as the Devil's Advocate. Review the Round 1 analyses of the other agents. Aggressively challenge their assumptions, point out flaws, and list critical risks or blind spots in their positions.`);
            messages.push(r2Message);
            console.log(`[DevilsAdvocateStrategy] Round 3: Proponents defend and mitigate`);
            const r3Promises = proponents.map((agent) => (0, agentRunner_1.runAgent)(agent, ctx, messages, 3, `Review the Devil's Advocate challenges in Round 2. Defend your analysis, adjust your stance if needed, and suggest concrete risk mitigations.`));
            const r3Messages = await Promise.all(r3Promises);
            messages.push(...r3Messages);
        }
        console.log(`[DevilsAdvocateStrategy] Generating final verdict`);
        const synthesisModel = ctx.models[0];
        const verdict = await (0, verdictGenerator_1.generateVerdict)(ctx.objective, messages, synthesisModel);
        return {
            messages,
            verdict,
        };
    }
}
exports.DevilsAdvocateStrategy = DevilsAdvocateStrategy;
