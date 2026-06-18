import { DebateContext, DebateMessageInput, DebateResult, DebateStrategy } from '../types';
import { runAgent } from '../agentRunner';
import { generateVerdict } from '../verdictGenerator';

export class ConsensusStrategy implements DebateStrategy {
  async execute(ctx: DebateContext): Promise<DebateResult> {
    const messages: DebateMessageInput[] = [];

    if (ctx.agents.length === 0) {
      throw new Error('No agents assigned to this courtroom debate.');
    }

    // --- Round 1: Independent Analysis (Parallel) ---
    console.log(`[ConsensusStrategy] Starting Round 1: Independent Analysis for ${ctx.agents.length} agents`);
    const round1Promises = ctx.agents.map((agent) =>
      runAgent(
        agent,
        ctx,
        [],
        1,
        'Provide your independent analysis of the objective without seeing other perspectives.'
      )
    );
    const round1Messages = await Promise.all(round1Promises);
    messages.push(...round1Messages);

    // --- Round 2: Consensus Finding (Parallel) ---
    console.log(`[ConsensusStrategy] Starting Round 2: Finding Consensus`);
    const round2Promises = ctx.agents.map((agent) =>
      runAgent(
        agent,
        ctx,
        messages,
        2,
        'Review the Round 1 analyses of other agents. Identify where you agree and disagree, and try to find a consensus or compromise solution.'
      )
    );
    const round2Messages = await Promise.all(round2Promises);
    messages.push(...round2Messages);

    // --- Synthesize Verdict ---
    console.log(`[ConsensusStrategy] Generating final verdict`);
    // Use first model in courtroom config, fallback to default model
    const synthesisModel = ctx.models[0];
    const verdict = await generateVerdict(ctx.objective, messages, synthesisModel);

    return {
      messages,
      verdict,
    };
  }
}
