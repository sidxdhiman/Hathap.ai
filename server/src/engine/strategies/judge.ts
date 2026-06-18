import { DebateContext, DebateMessageInput, DebateResult, DebateStrategy } from '../types';
import { runAgent } from '../agentRunner';
import { generateVerdict } from '../verdictGenerator';

export class JudgeStrategy implements DebateStrategy {
  async execute(ctx: DebateContext): Promise<DebateResult> {
    const messages: DebateMessageInput[] = [];

    if (ctx.agents.length === 0) {
      throw new Error('No agents assigned to this courtroom debate.');
    }

    // Assign the last agent as the Judge
    const judge = ctx.agents[ctx.agents.length - 1];
    const advocates = ctx.agents.slice(0, ctx.agents.length - 1);

    if (advocates.length === 0) {
      // Fallback for single agent
      console.log(`[JudgeStrategy] Running single-agent fallback`);
      const r1 = await runAgent(judge, ctx, [], 1, 'Analyze the objective as an independent analyst.');
      messages.push(r1);
      
      const r2 = await runAgent(judge, ctx, messages, 2, 'Identify alternative viewpoints and rebuttals.');
      messages.push(r2);

      const r3 = await runAgent(judge, ctx, messages, 3, 'Act as the Judge. Weigh all arguments and issue your final ruling.');
      messages.push(r3);
    } else {
      console.log(`[JudgeStrategy] Round 1: Advocates present arguments`);
      const r1Promises = advocates.map((agent) =>
        runAgent(agent, ctx, [], 1, 'Present your initial arguments on the objective.')
      );
      const r1Messages = await Promise.all(r1Promises);
      messages.push(...r1Messages);

      console.log(`[JudgeStrategy] Round 2: Advocates rebut each other`);
      const r2Promises = advocates.map((agent) =>
        runAgent(
          agent,
          ctx,
          messages,
          2,
          'Review other advocates\' arguments from Round 1. Rebut their points, challenge their assertions, and defend your own position.'
        )
      );
      const r2Messages = await Promise.all(r2Promises);
      messages.push(...r2Messages);

      console.log(`[JudgeStrategy] Round 3: Judge issues final ruling`);
      const judgeMessage = await runAgent(
        judge,
        ctx,
        messages,
        3,
        `Act strictly as the Judge. Review the full debate history (Round 1 arguments and Round 2 rebuttals). Weigh all arguments objectively and output your final, definitive ruling/verdict.`
      );
      messages.push(judgeMessage);
    }

    console.log(`[JudgeStrategy] Generating final verdict`);
    const synthesisModel = ctx.models[0];
    const verdict = await generateVerdict(ctx.objective, messages, synthesisModel);

    // Ensure the judge's ruling is emphasized in the summary
    const finalRuling = messages[messages.length - 1];
    verdict.summary = `[Judge's Decision: ${finalRuling.parsedResponse?.position || 'Issued'}] ${verdict.summary}`;

    return {
      messages,
      verdict,
    };
  }
}
