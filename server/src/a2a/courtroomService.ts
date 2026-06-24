import Courtroom from '../models/Courtroom';
import Agent from '../models/Agent';
import type { DebateRequest } from './types';

const DEFAULT_AGENT_COUNT = 5;

export async function resolveCourtroomForDebate(
  userId: string,
  request: DebateRequest
): Promise<{ courtroomId: string; created: boolean }> {
  if (request.courtroomId) {
    const courtroom = await Courtroom.findOne({ _id: request.courtroomId, userId });
    if (!courtroom) {
      throw new Error('Courtroom not found or access denied.');
    }
    return { courtroomId: courtroom.id, created: false };
  }

  const agents = request.agentIds?.length
    ? await Agent.find({ _id: { $in: request.agentIds }, userId })
    : await Agent.find({ userId }).sort({ createdAt: 1 }).limit(DEFAULT_AGENT_COUNT);

  if (agents.length === 0) {
    throw new Error(
      'No agents available. Sign up in Hathap.AI and configure at least one agent template.'
    );
  }

  const objective = request.objective || 'Provide structured multi-agent analysis.';
  const courtroom = new Courtroom({
    name: `A2A Debate: ${objective.slice(0, 60)}`,
    description: 'Created automatically via A2A protocol',
    objective,
    mode: request.mode || 'consensus',
    participants: agents.map((agent) => ({ agentId: agent._id?.toString() })),
    status: 'draft',
    userId,
  });

  await courtroom.save();
  return { courtroomId: courtroom.id, created: true };
}
