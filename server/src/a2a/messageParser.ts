import type { Message } from '@a2a-js/sdk';
import type { DebateRequest } from './types';

export function extractMessageText(message: Message): string {
  return message.parts
    .filter((part) => part.kind === 'text')
    .map((part) => part.text)
    .join('\n')
    .trim();
}

export function parseDebateRequest(text: string): DebateRequest {
  if (!text) {
    throw new Error('Message text is required.');
  }

  const trimmed = text.trim();
  if (trimmed.startsWith('{')) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      parsed = undefined;
    }
    // A JSON object is a structured request, so let its validation errors
    // reach the caller. Swallowing them (as this did before) silently
    // re-ran the payload as a plain-text objective, which made every
    // `normalizeDebateRequest` check unreachable over the wire.
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return normalizeDebateRequest(parsed as DebateRequest);
    }
  }

  return {
    skill: 'run-debate',
    objective: text,
    mode: 'consensus',
  };
}

export function normalizeDebateRequest(request: DebateRequest): DebateRequest {
  const skill = request.skill || (request.courtroomId ? 'courtroom-debate' : 'run-debate');
  const agentIds = normalizeAgentIds(request.agentIds);
  const objective = typeof request.objective === 'string' ? request.objective : undefined;
  const mode = typeof request.mode === 'string' ? request.mode : undefined;

  if (request.courtroomId !== undefined && typeof request.courtroomId !== 'string') {
    // `courtroomId` reaches `Courtroom.findOne({ _id: ... })`, so an
    // operator-shaped value must never get that far.
    throw new Error('courtroomId must be a string.');
  }

  if (skill === 'courtroom-debate') {
    if (!request.courtroomId) {
      throw new Error('courtroomId is required for courtroom-debate skill.');
    }
    // Allow-listed keys only. This object is JSON supplied by the caller, so a
    // spread would forward whatever else it contains to the debate resolver.
    return {
      skill,
      courtroomId: request.courtroomId,
      objective,
      mode,
      agentIds,
    };
  }

  if (!objective?.trim()) {
    throw new Error('objective is required for run-debate skill.');
  }

  return {
    skill: 'run-debate',
    objective: objective.trim(),
    mode: mode || 'consensus',
    agentIds,
    courtroomId: request.courtroomId,
  };
}

/**
 * `agentIds` is fed straight into `Agent.find({ _id: { $in: agentIds } })`.
 * Reject anything that is not a list of non-empty strings before it reaches
 * the query, so a malformed payload fails as a parse error the caller can see
 * instead of surfacing as a driver cast failure inside the task.
 */
function normalizeAgentIds(agentIds: string[] | undefined): string[] | undefined {
  if (agentIds === undefined) {
    return undefined;
  }
  const isStringList =
    Array.isArray(agentIds) &&
    agentIds.every((id) => typeof id === 'string' && id.trim().length > 0);
  if (!isStringList) {
    throw new Error('agentIds must be an array of non-empty strings.');
  }
  return agentIds;
}
