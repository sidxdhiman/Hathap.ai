import { ModelResponse } from './types';

export function parseModelResponse(text: string): ModelResponse {
  const defaultResponse: ModelResponse = {
    position: 'Undecided',
    arguments: ['No specific arguments provided.'],
    risks: ['No specific risks identified.'],
    recommendation: 'Further analysis needed.',
  };

  if (!text) {
    return defaultResponse;
  }

  try {
    let cleanText = text.trim();
    // Strip markdown code blocks if present
    if (cleanText.startsWith('```')) {
      const match = cleanText.match(/^(?:```[a-z]*\s*)([\s\S]*?)(?:\s*```)$/i);
      if (match && match[1]) {
        cleanText = match[1].trim();
      }
    }

    const parsed = JSON.parse(cleanText);

    return {
      position: typeof parsed.position === 'string' ? parsed.position : defaultResponse.position,
      arguments: Array.isArray(parsed.arguments) ? parsed.arguments.map(String) : defaultResponse.arguments,
      risks: Array.isArray(parsed.risks) ? parsed.risks.map(String) : defaultResponse.risks,
      recommendation: typeof parsed.recommendation === 'string' ? parsed.recommendation : defaultResponse.recommendation,
    };
  } catch (error) {
    console.error('Failed to parse model response as JSON:', error);
    return {
      position: 'Analysis Provided',
      arguments: [text],
      risks: ['Could not parse structured risks.'],
      recommendation: 'Check raw response content.',
    };
  }
}
