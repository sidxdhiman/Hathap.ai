import { DebateContext, DebateMessageInput, DebateResult, DebateStrategy } from '../types';
import { runAgent } from '../agentRunner';
import { generateVerdict } from '../verdictGenerator';

export class OpenDebateStrategy implements DebateStrategy {
  async execute(ctx: DebateContext): Promise<DebateResult> {
    const messages: DebateMessageInput[] = [];

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
        const msg = await runAgent(
          agent,
          ctx,
          messages,
          round,
          round === 1
            ? 'Open the debate with your perspective.'
            : 'Continue the debate. Respond directly to the arguments, criticisms, and points raised in the discussion so far.'
        );
        messages.push(msg);
      }
    }

    console.log(`[OpenDebateStrategy] Generating final verdict`);
    const synthesisModel = ctx.models[0];
    const verdict = await generateVerdict(ctx.objective, messages, synthesisModel);

    return {
      messages,
      verdict,
    };
  }
}
