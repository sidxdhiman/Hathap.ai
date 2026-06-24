import { Request } from 'express';
import jwt from 'jsonwebtoken';
import { UnauthenticatedUser, type User } from '@a2a-js/sdk/server';
import { HathapUser } from './types';

const JWT_SECRET = process.env.JWT_SECRET || 'secret';

export async function hathapUserBuilder(req: Request): Promise<User> {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) {
    try {
      const token = auth.split(' ')[1];
      const data = jwt.verify(token, JWT_SECRET) as { id: string; email?: string };
      return new HathapUser(data.id, data.email || data.id);
    } catch {
      // Fall through to other auth methods
    }
  }

  const apiKey = req.headers['x-a2a-api-key'];
  const configuredKey = process.env.A2A_API_KEY;
  const defaultUserId = process.env.A2A_DEFAULT_USER_ID;

  if (
    typeof apiKey === 'string' &&
    configuredKey &&
    apiKey === configuredKey &&
    defaultUserId
  ) {
    return new HathapUser(defaultUserId, 'a2a-service');
  }

  return new UnauthenticatedUser();
}
