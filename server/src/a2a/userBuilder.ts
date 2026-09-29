import { Request } from 'express';
import { UnauthenticatedUser, type User } from '@a2a-js/sdk/server';
import { HathapUser } from './types';
import { extractBearerToken, verifyAuthToken } from '../utils/authToken';

export async function hathapUserBuilder(req: Request): Promise<User> {
  // Bearer credentials are verified through the same path as `requireAuth`, so
  // a credential invalidated by sign-out, password change or account deletion
  // cannot be used to reach the A2A surface. Verifying the signature alone here
  // would let revocation be bypassed entirely.
  const token = extractBearerToken(req.headers.authorization);
  if (token) {
    try {
      const verified = await verifyAuthToken(token);
      if (verified) {
        return new HathapUser(verified.userId, verified.userId);
      }
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
