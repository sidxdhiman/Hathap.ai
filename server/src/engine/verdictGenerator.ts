import { callLLM } from './llmClient';
import { DebateMessageInput, VerdictResult } from './types';
import { IModel } from '../models/Model';

export async function generateVerdict(
  objective: string,
  messages: DebateMessageInput[],
  model: IModel
): Promise<VerdictResult> {
  const defaultVerdict: VerdictResult = {
    summary: 'Consensus synthesis failed to generate.',
    recommendation: 'Unable to derive recommendation.',
    pros: [],
    cons: [],
    risks: ['Failed to synthesize risks.'],
    nextActions: [],
    confidenceScore: 50,
  };

  const messageHistoryText = messages
    .map((msg) => {
      let text = `[Round ${msg.roundNumber}] Agent: ${msg.agentName} (${msg.role})\n`;
      if (msg.parsedResponse) {
        text += `Position: ${msg.parsedResponse.position}\n`;
        text += `Arguments:\n${msg.parsedResponse.arguments.map((a) => `- ${a}`).join('\n')}\n`;
        text += `Risks:\n${msg.parsedResponse.risks.map((r) => `- ${r}`).join('\n')}\n`;
        text += `Recommendation: ${msg.parsedResponse.recommendation}\n`;
      } else {
        text += `Content: ${msg.content}\n`;
      }
      return text;
    })
    .join('\n---\n');

  const systemPrompt = `You are the Hathap Courtroom Synthesizer. Your job is to analyze the discussion history of multiple expert AI agents debating a specific objective, find common ground, highlight core disagreements, and construct a final, actionable verdict.

You MUST respond with a single JSON object containing exactly the following fields:
{
  "summary": "A detailed synthesis of the debate, summarizing the consensus or key tensions.",
  "recommendation": "The final recommended path forward based on the collective intelligence.",
  "pros": ["List of key positive outcomes or benefits of the recommendation"],
  "cons": ["List of potential drawbacks, challenges, or trade-offs of the recommendation"],
  "risks": ["Critical risk factors that need mitigation"],
  "nextActions": ["Actionable, concrete next steps to implement the recommendation"],
  "confidenceScore": 85
}
Note: The confidenceScore must be a number between 0 and 100 representing how strongly supported the recommendation is by the debate.`;

  const userPrompt = `Debate Objective: ${objective}

Debate History:
${messageHistoryText}

Based on the debate history, generate the final verdict.`;

  try {
    const rawResult = await callLLM(
      model,
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { responseFormatJson: true }
    );

    let cleanText = rawResult.trim();
    if (cleanText.startsWith('```')) {
      const match = cleanText.match(/^(?:```[a-z]*\s*)([\s\S]*?)(?:\s*```)$/i);
      if (match && match[1]) {
        cleanText = match[1].trim();
      }
    }

    const parsed = JSON.parse(cleanText);

    return {
      summary: typeof parsed.summary === 'string' ? parsed.summary : defaultVerdict.summary,
      recommendation: typeof parsed.recommendation === 'string' ? parsed.recommendation : defaultVerdict.recommendation,
      pros: Array.isArray(parsed.pros) ? parsed.pros.map(String) : defaultVerdict.pros,
      cons: Array.isArray(parsed.cons) ? parsed.cons.map(String) : defaultVerdict.cons,
      risks: Array.isArray(parsed.risks) ? parsed.risks.map(String) : defaultVerdict.risks,
      nextActions: Array.isArray(parsed.nextActions) ? parsed.nextActions.map(String) : defaultVerdict.nextActions,
      confidenceScore: typeof parsed.confidenceScore === 'number' ? parsed.confidenceScore : defaultVerdict.confidenceScore,
    };
  } catch (error) {
    console.error('Failed to generate and parse verdict:', error);
    return defaultVerdict;
  }
}
