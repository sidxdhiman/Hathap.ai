import { ICourtroom } from '../models/Courtroom';
import { IAgent } from '../models/Agent';
import { IModel } from '../models/Model';
import { LLMUsageCallback } from '../decision/usage';
import { EvidenceView } from '../research/types';

export interface ModelResponse {
  position: string;
  arguments: string[];
  risks: string[];
  recommendation: string;
}

export interface VerdictResult {
  summary: string;
  recommendation: string;
  pros: string[];
  cons: string[];
  risks: string[];
  nextActions: string[];
  confidenceScore: number;
}

export interface DebateContext {
  courtroom: ICourtroom;
  agents: IAgent[];
  models: IModel[];
  objective: string;
  onUsage?: LLMUsageCallback;
  /** Bounded research evidence. Untrusted source material — agents must never
   *  treat it as instructions, only as material to reason about. */
  evidence?: EvidenceView[];
  /** Phase 6 routing override: run the matching agent on the routed model. */
  routingAgentId?: string;
  routingModelId?: string;
}

export interface DebateMessageInput {
  agentId?: string;
  agentName: string;
  role: 'assistant' | 'user' | 'system';
  content: string;
  roundNumber: number;
  parsedResponse?: ModelResponse;
}

export interface DebateResult {
  messages: DebateMessageInput[];
  verdict: VerdictResult;
}

export interface DebateStrategy {
  execute(ctx: DebateContext): Promise<DebateResult>;
}
