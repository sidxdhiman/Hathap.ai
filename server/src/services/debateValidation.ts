import Courtroom from '../models/Courtroom';
import Agent from '../models/Agent';
import Model from '../models/Model';

export interface DebateValidationResult {
  ok: boolean;
  errors: string[];
}

export async function validateDebateReady(
  courtroomId: string,
  userId: string
): Promise<DebateValidationResult> {
  const errors: string[] = [];

  const courtroom = await Courtroom.findOne({ _id: courtroomId, userId });
  if (!courtroom) {
    return { ok: false, errors: ['Courtroom not found.'] };
  }

  if (!courtroom.participants || courtroom.participants.length === 0) {
    errors.push('Add at least one agent participant before starting the debate.');
  }

  const enabledModels = await Model.find({ userId, enabled: true });
  if (enabledModels.length === 0) {
    errors.push('Add and enable at least one AI model before starting a debate.');
  }

  const modelsWithKeys = enabledModels.filter((model) => Boolean(model.apiKey));
  if (enabledModels.length > 0 && modelsWithKeys.length === 0) {
    errors.push('Your enabled models are missing API keys. Add keys on the Models page.');
  }

  const agentIds = (courtroom.participants || [])
    .map((participant: { agentId?: string; id?: string; _id?: string }) =>
      participant.agentId || participant.id || participant._id
    )
    .filter(Boolean);

  const agents = await Agent.find({ _id: { $in: agentIds }, userId });
  if (courtroom.participants?.length && agents.length === 0) {
    errors.push('No valid agent participants could be resolved for this courtroom.');
  }

  for (const agent of agents) {
    const assignedModel = enabledModels.find(
      (model) =>
        model._id?.toString() === agent.assignedModelId?.toString() ||
        model.id === agent.assignedModelId?.toString()
    );
    const fallbackModel = enabledModels[0];
    const modelToUse = assignedModel || fallbackModel;

    if (!modelToUse) {
      errors.push(`Agent "${agent.name}" has no enabled model available.`);
      continue;
    }

    if (!modelToUse.apiKey) {
      errors.push(
        `Agent "${agent.name}" uses model "${modelToUse.displayName}" which has no API key configured.`
      );
    }
  }

  return { ok: errors.length === 0, errors };
}

export function normalizeDebateMode(mode: string | undefined): string {
  const normalized = (mode || 'consensus').toLowerCase().trim();
  const modeMap: Record<string, string> = {
    consensus: 'consensus',
    majority: 'majority vote',
    'majority vote': 'majority vote',
    'devils-advocate': "devil's advocate",
    "devil's advocate": "devil's advocate",
    'devils advocate': "devil's advocate",
    judge: 'judge',
    open: 'open debate',
    'open debate': 'open debate',
  };
  return modeMap[normalized] || normalized;
}
