import { callLLM } from './llmClient';
import { parseModelResponse } from './responseParser';
import { DebateContext, DebateMessageInput } from './types';
import { IAgent } from '../models/Agent';

export async function runAgent(
  agent: IAgent,
  context: DebateContext,
  history: DebateMessageInput[],
  roundNumber: number,
  additionalInstructions: string = ''
): Promise<DebateMessageInput> {
  // 1. Find assigned model
  let model = context.models.find((m) => m.id === agent.assignedModelId?.toString() || m._id?.toString() === agent.assignedModelId?.toString());
  if (!model) {
    // Fallback to first available model
    model = context.models[0];
  }

  if (!model) {
    throw new Error(`No available model configured to run agent "${agent.name}". Please ensure you have added and enabled at least one model.`);
  }

  // 2. Prepare message history for LLM
  const historyText = history
    .map((msg) => {
      let text = `Agent: ${msg.agentName} (${msg.role})\n`;
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

  // 3. Prepare System Prompt
  const systemPrompt = `You are playing the role of "${agent.name}".
Description of your role: ${agent.description || 'Expert collaborator'}
Your core persona/system prompt:
${agent.systemPrompt || 'Collaborate to help make the best decision.'}

You are participating in a structured debate session.
Objective: ${context.objective}

You MUST reply with a JSON object. Do not include any other conversational text outside the JSON block.
Format your output exactly as follows:
{
  "position": "A clear, concise summary of your current stance/position.",
  "arguments": [
    "Core argument 1 supporting your position",
    "Core argument 2 supporting your position"
  ],
  "risks": [
    "Potential risk 1 or downside to consider",
    "Potential risk 2 or downside to consider"
  ],
  "recommendation": "Your concrete recommended action or next step."
}

Ensure your response is highly specific, professional, and directly addresses the debate objective and the points raised by other agents.`;

  // 4. Prepare User Prompt
  let userPrompt = `Objective: ${context.objective}\n\n`;
  if (history.length > 0) {
    userPrompt += `Here is the discussion history so far:\n${historyText}\n\n`;
  } else {
    userPrompt += `This is the start of the debate. Please present your initial analysis.\n\n`;
  }

  if (additionalInstructions) {
    userPrompt += `${additionalInstructions}\n`;
  }

  userPrompt += `\nPlease output your response in the required JSON format.`;

  const rawResponse = await callLLM(
    model,
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    { responseFormatJson: true }
  );

  const parsed = parseModelResponse(rawResponse);

  // Construct message content for display
  const content = `Position: ${parsed.position}\n\nRecommendation: ${parsed.recommendation}`;

  return {
    agentId: agent.id || agent._id?.toString(),
    agentName: agent.name,
    role: 'assistant',
    content,
    roundNumber,
    parsedResponse: parsed,
  };
}
