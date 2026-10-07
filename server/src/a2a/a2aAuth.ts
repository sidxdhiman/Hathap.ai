import type { NextFunction, Request, Response } from 'express';
import type { User } from '@a2a-js/sdk/server';
import { getUserId } from './types';
import { hathapUserBuilder } from './userBuilder';

/**
 * A2A identity resolution, memoised per Express request.
 *
 * `setupA2A` mounts `requireA2AAuthentication` in front of both transports and
 * also passes this builder into `jsonRpcHandler`/`restHandler`, which would
 * otherwise verify the same credential (and hit the same `authVersion` lookup)
 * twice for a single request.
 */
const resolvedUsers = new WeakMap<Request, Promise<User>>();
const resolvedUserIds = new WeakMap<Request, string>();

export function a2aUserBuilder(req: Request): Promise<User> {
  let pending = resolvedUsers.get(req);
  if (!pending) {
    pending = hathapUserBuilder(req).then((user) => {
      const userId = getUserId(user);
      if (userId) {
        resolvedUserIds.set(req, userId);
      }
      return user;
    });
    resolvedUsers.set(req, pending);
  }
  return pending;
}

/**
 * The principal `requireA2AAuthentication` already resolved, for middleware
 * mounted behind it.
 *
 * `createTaskAccessGate` runs before the transport, so there is no
 * `ServerCallContext` yet and no `context.user` to read. Re-deriving the
 * identity from the header would repeat the JWT verification and the `authVersion`
 * lookup; this hands it over instead.
 */
export function getA2AUserId(req: Request): string | undefined {
  return resolvedUserIds.get(req);
}

/**
 * Reject a request that has no A2A principal before it reaches the A2A
 * request handler.
 *
 * The SDK's `DefaultRequestHandler` authenticates nothing: `tasks/get`,
 * `tasks/cancel` and `tasks/resubscribe` never look at
 * `context.user.isAuthenticated`, so an anonymous caller reached every
 * task-scoped operation. `HathapDebateExecutor` refuses to *execute*
 * anonymously, but by then the request has already been parsed and routed, and
 * the read/cancel paths were never guarded at all.
 *
 * The agent card is deliberately not behind this check — protocol discovery
 * stays public.
 *
 * Every failure is reported as the same `401 { error: 'Unauthorized' }` the
 * rest of the API uses, so the response cannot be used to probe which part of
 * the check failed.
 */
export function requireA2AAuthentication(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  a2aUserBuilder(req)
    .then((user) => {
      if (!getUserId(user)) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      next();
    })
    .catch((error: unknown) => {
      // A database fault while resolving the credential is a server error, not
      // a rejected one; let the app-level error handler report it as such.
      next(error);
    });
}
