"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MajorityVoteStrategy = void 0;
const agentRunner_1 = require("../agentRunner");
const verdictGenerator_1 = require("../verdictGenerator");
class MajorityVoteStrategy {
    async execute(ctx) {
        const messages = [];
        if (ctx.agents.length === 0) {
            throw new Error('No agents assigned to this courtroom debate.');
        }
        // --- Round 1: Initial Analysis (Parallel) ---
        console.log(`[MajorityVoteStrategy] Starting Round 1: Initial Analysis`);
        const round1Promises = ctx.agents.map((agent) => (0, agentRunner_1.runAgent)(agent, ctx, [], 1, 'Provide your initial analysis, perspectives, and key arguments on the objective.'));
        const round1Messages = await Promise.all(round1Promises);
        messages.push(...round1Messages);
        // --- Round 2: Voting Round (Parallel) ---
        console.log(`[MajorityVoteStrategy] Starting Round 2: Voting`);
        const round2Promises = ctx.agents.map((agent) => (0, agentRunner_1.runAgent)(agent, ctx, messages, 2, 'Review the arguments. You must explicitly cast your vote as "APPROVE" or "REJECT" in your position field, and provide your voting justification in the arguments/recommendation.'));
        const round2Messages = await Promise.all(round2Promises);
        messages.push(...round2Messages);
        // --- Synthesize Verdict ---
        console.log(`[MajorityVoteStrategy] Generating final verdict`);
        const synthesisModel = ctx.models[0];
        const verdict = await (0, verdictGenerator_1.generateVerdict)(ctx.objective, messages, synthesisModel);
        // Let's modify the verdict summary to explicitly show the vote count
        let approves = 0;
        let rejects = 0;
        for (const msg of round2Messages) {
            const pos = (msg.parsedResponse?.position || '').toUpperCase();
            if (pos.includes('APPROVE')) {
                approves++;
            }
            else if (pos.includes('REJECT')) {
                rejects++;
            }
            else {
                // Fallback search in recommendation or content
                const text = (msg.content || '').toUpperCase();
                if (text.includes('APPROVE')) {
                    approves++;
                }
                else if (text.includes('REJECT')) {
                    rejects++;
                }
                else {
                    // default to approve if positive tone, reject otherwise, or just count as undecided
                    approves++; // Default/neutral
                }
            }
        }
        verdict.summary = `[Vote Tally: ${approves} Approve, ${rejects} Reject] ${verdict.summary}`;
        return {
            messages,
            verdict,
        };
    }
}
exports.MajorityVoteStrategy = MajorityVoteStrategy;
