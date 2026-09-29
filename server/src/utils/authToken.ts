import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import User, { type IUser } from '../models/User';
import { getJwtSecret } from '../config/security';

/**
 * Credential issuance and verification.
 *
 * A signature-valid JWT is *not* authentication. The server must additionally
 * establish that the account still exists and that the credential has not been
 * invalidated since it was issued. Both are enforced here, in one place, so
 * that every authentication path in the process behaves identically.
 *
 * The mechanism is a monotonic per-user counter (`User.authVersion`) embedded
 * in each credential as the `av` claim. Incrementing the counter invalidates
 * every credential previously issued to that user in a single write. It requires
 * no session store, no extra collection and no new dependency, and it stays
 * correct across multiple API instances because the only shared state is
 * MongoDB, which the application already requires.
 *
 * Consequences that are deliberate and must not be described otherwise:
 *  - Invalidation is **per-user, not per-token**. Signing out, changing the
 *    password or deleting the account ends *every* session for that user,
 *    including other devices. Per-device revocation would require a server-side
 *    record of every issued token (a session store), which this phase
 *    intentionally does not introduce.
 *  - A credential is only as revocable as the counter check, so every code path
 *    that accepts a bearer token must go through `verifyAuthToken`. The A2A
 *    endpoints do exactly that.
 */

const TOKEN_TTL = '7d';
const ALLOWED_ALGORITHMS: jwt.Algorithm[] = ['HS256'];
const BEARER_PREFIX = 'Bearer ';

export interface VerifiedAuth {
  userId: string;
}

/** The user shape needed to issue a credential. */
type AuthenticableUser = Pick<IUser, '_id'> & { authVersion?: number };

/**
 * Read a user's auth counter defensively.
 *
 * Documents written before the field existed have no stored value, and a
 * hand-edited or partially-migrated document could hold a non-number. Every
 * such case normalizes to 0, which is the version those documents were created
 * under. Normalizing on read (rather than relying on Mongoose hydration
 * behavior) keeps invalidation deterministic and makes the legacy path testable.
 */
export function readAuthVersion(user: { authVersion?: number } | null | undefined): number {
  const raw = user?.authVersion;
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return 0;
  const normalized = Math.trunc(raw);
  return normalized > 0 ? normalized : 0;
}

/**
 * Issue a credential for a user, bound to their current auth counter.
 *
 * The counter is captured at issue time. Any later increment makes this
 * credential fail verification.
 */
export function signToken(user: AuthenticableUser): string {
  return jwt.sign(
    { id: String(user._id), av: readAuthVersion(user) },
    getJwtSecret(),
    { expiresIn: TOKEN_TTL, algorithm: 'HS256' }
  );
}

/** Extract the credential from an `Authorization` header, or null if unusable. */
export function extractBearerToken(header: string | undefined): string | null {
  if (!header || !header.startsWith(BEARER_PREFIX)) return null;
  const token = header.slice(BEARER_PREFIX.length).trim();
  return token.length > 0 ? token : null;
}

/**
 * Verify a credential and resolve the account behind it.
 *
 * Checks, in order: signature and expiry (via `jwt.verify` with the algorithm
 * pinned), claim shape, that the account still exists, and that the credential's
 * `av` claim still matches the account's counter. Returns null on any failure —
 * a single opaque result so callers cannot distinguish the failure mode.
 *
 * Throws only if the database is unreachable; that is a server fault, not an
 * authentication failure, and callers decide how to report it.
 */
export async function verifyAuthToken(token: string): Promise<VerifiedAuth | null> {
  let claims: unknown;
  try {
    claims = jwt.verify(token, getJwtSecret(), { algorithms: ALLOWED_ALGORITHMS });
  } catch {
    return null;
  }

  if (!claims || typeof claims !== 'object') return null;

  const { id, av } = claims as { id?: unknown; av?: unknown };
  if (typeof id !== 'string' || id.length === 0) return null;

  // A signature-valid credential can still name an identity that is not a valid
  // ObjectId. Handing such a value to Mongoose raises a CastError, which is a
  // server fault, not a rejected credential — it would turn a malformed
  // identity into a 500 instead of a 401. Rejecting it here keeps malformed
  // identities a plain authentication failure and keeps the database out of it.
  if (!mongoose.isObjectIdOrHexString(id)) return null;

  // A credential predating the `av` claim is treated as version 0 — the version
  // it was issued under. Any structurally invalid `av` is rejected outright
  // rather than coerced, so a malformed claim can never be used to slip past
  // the counter comparison.
  let presentedVersion = 0;
  if (av !== undefined) {
    if (typeof av !== 'number' || !Number.isInteger(av) || av < 0) return null;
    presentedVersion = av;
  }

  const user = await User.findById(id).select('authVersion');
  if (!user) return null;

  if (presentedVersion !== readAuthVersion(user)) return null;

  return { userId: id };
}

/**
 * Invalidate every credential currently issued to a user.
 *
 * A single atomic `$inc` on the user document; no read-modify-write race and no
 * transaction, because the counter is the only state involved.
 */
export async function bumpAuthVersion(userId: string): Promise<void> {
  await User.updateOne({ _id: userId }, { $inc: { authVersion: 1 } });
}
