import type { User } from '@a2a-js/sdk/server';

export interface DebateRequest {
  skill?: string;
  objective?: string;
  mode?: string;
  courtroomId?: string;
  agentIds?: string[];
}

export class HathapUser implements User {
  constructor(
    public readonly userId: string,
    private readonly name: string
  ) {}

  get isAuthenticated(): boolean {
    return true;
  }

  get userName(): string {
    return this.name;
  }
}

export function getUserId(user: User | undefined): string | undefined {
  if (user instanceof HathapUser) {
    return user.userId;
  }
  return undefined;
}
