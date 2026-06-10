export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
}

export interface Model {
  id: string;
  provider: string;
  displayName: string;
  modelName: string;
  apiKey: string;
  baseUrl: string;
  status: 'connected' | 'error' | 'untested';
  enabled: boolean;
}

export interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  assignedModelId: string;
  avatar: string;
  colorTag: string;
  createdAt: Date;
}

export interface Participant {
  id: string;
  courtroomId: string;
  type: 'agent' | 'model';
  modelId?: string;
  agentId?: string;
  customPrompt?: string;
  position?: number;
}

export interface Courtroom {
  id: string;
  name: string;
  description: string;
  objective: string;
  mode: 'consensus' | 'majority' | 'devils-advocate' | 'judge' | 'open';
  participants: Participant[];
  status: 'draft' | 'active' | 'completed' | 'paused';
  createdAt: Date;
  updatedAt: Date;
}

export interface Debate {
  id: string;
  courtroomId: string;
  roundNumber: number;
  status: 'active' | 'completed';
}

export interface Message {
  id: string;
  debateId: string;
  participantId: string;
  content: string;
  timestamp: Date;
  isResponse?: boolean;
  tokens?: number;
}

export interface Consensus {
  courtroomId: string;
  agreements: string[];
  disagreements: string[];
  risks: string[];
  recommendedSolution: string;
  confidenceScore: number;
}
