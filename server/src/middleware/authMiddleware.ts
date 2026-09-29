import { Request, Response, NextFunction } from 'express';
import { extractBearerToken, verifyAuthToken } from '../utils/authToken';

export interface AuthRequest extends Request {
  userId?: string;
}

/**
 * Authenticate a request.
 *
 * A cryptographically valid JWT is not sufficient: `verifyAuthToken` also
 * requires the account to still exist and the credential to still be the
 * account's current one. Tokens issued before a password change, a sign-out or
 * an account deletion therefore stop working here, which is what makes those
 * operations real.
 *
 * Every failure is reported identically (`401 Unauthorized`) so the response
 * cannot be used to probe which part of the check failed.
 */
export const requireAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const token = extractBearerToken(req.headers.authorization);
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  let verified: Awaited<ReturnType<typeof verifyAuthToken>>;
  try {
    verified = await verifyAuthToken(token);
  } catch (err) {
    // A database fault is a server error, not a rejected credential. Fail with
    // 500 rather than 401 so a transient outage is never mistaken by clients
    // (or operators) as "your session ended".
    console.error('requireAuth: credential verification failed:', err);
    return res.status(500).json({ error: 'Authentication service unavailable.' });
  }

  if (!verified) return res.status(401).json({ error: 'Unauthorized' });

  req.userId = verified.userId;
  next();
};
