import { Model, AgentTemplate, Participant } from '../types';

export const generateId = (prefix: string): string => {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

export const getParticipantName = (
  participant: Participant,
  models: Model[],
  agents: AgentTemplate[]
): string => {
  if (participant.type === 'model') {
    return models.find((m) => m.id === participant.modelId)?.displayName || 'Unknown Model';
  } else {
    return agents.find((a) => a.id === participant.agentId)?.name || 'Unknown Agent';
  }
};

export const getParticipantInfo = (
  participant: Participant,
  models: Model[],
  agents: AgentTemplate[]
) => {
  if (participant.type === 'model') {
    const model = models.find((m) => m.id === participant.modelId);
    return {
      name: model?.displayName || 'Unknown',
      avatar: '🤖',
      color: 'from-blue-500 to-cyan-500',
    };
  } else {
    const agent = agents.find((a) => a.id === participant.agentId);
    return {
      name: agent?.name || 'Unknown',
      avatar: agent?.avatar || '👤',
      color: `from-${agent?.colorTag}-500 to-${agent?.colorTag}-600`,
    };
  }
};

export const formatDate = (date: Date): string => {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

export const formatTime = (date: Date): string => {
  return new Date(date).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const formatDateTime = (date: Date): string => {
  return `${formatDate(date)} at ${formatTime(date)}`;
};

export const getStatusColor = (
  status: string
): 'bg-green-500/20' | 'bg-red-500/20' | 'bg-yellow-500/20' | 'bg-blue-500/20' => {
  switch (status) {
    case 'connected':
    case 'active':
    case 'completed':
      return 'bg-green-500/20';
    case 'error':
      return 'bg-red-500/20';
    case 'untested':
    case 'draft':
      return 'bg-yellow-500/20';
    default:
      return 'bg-blue-500/20';
  }
};

export const getStatusText = (
  status: string
): 'text-green-400' | 'text-red-400' | 'text-yellow-400' | 'text-blue-400' => {
  switch (status) {
    case 'connected':
    case 'active':
    case 'completed':
      return 'text-green-400';
    case 'error':
      return 'text-red-400';
    case 'untested':
    case 'draft':
      return 'text-yellow-400';
    default:
      return 'text-blue-400';
  }
};
