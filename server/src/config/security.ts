/**
 * Central, deliberately-small configuration for security-sensitive settings:
 * the JWT signing secret, and the CORS origin policy.
 *
 * Rules:
 *  - Production requires an explicit, strong `JWT_SECRET`. There is NO
 *    predictable/default signing secret in production — missing or weak
 *    configuration is a hard error (the server refuses to start).
 *  - Development keeps a conventional (non-secret) fallback so local tooling
 *    and tests work out of the box, clearly separated from production.
 */

const DEV_FALLBACK_JWT_SECRET = 'secret';
const MIN_PRODUCTION_JWT_SECRET_LENGTH = 16;

const DEV_ALLOWED_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'];

let warnedOnce = false;
function warnOnce(message: string): void {
  if (!warnedOnce) {
    warnedOnce = true;
    console.warn(message);
  }
}

export function isProductionEnvironment(): boolean {
  return (process.env.NODE_ENV || 'development').trim().toLowerCase() === 'production';
}

/**
 * Resolve the JWT signing secret for this process.
 *
 * The value is re-read from the environment on every call (cheap) so that a
 * startup guard in `index.ts` and request-handler reads always agree. Each
 * read is a single `process.env` lookup; development warnings are deduplicated.
 */
export function getJwtSecret(): string {
  const fromEnv = process.env.JWT_SECRET;

  if (isProductionEnvironment()) {
    if (!fromEnv || fromEnv.length < MIN_PRODUCTION_JWT_SECRET_LENGTH) {
      throw new Error(
        `JWT_SECRET must be set in the environment to a random value of at least ` +
          `${MIN_PRODUCTION_JWT_SECRET_LENGTH} characters in production. ` +
          `Refusing to start with a predictable default signing secret.`
      );
    }
    return fromEnv;
  }

  if (!fromEnv) {
    warnOnce(
      '[security] JWT_SECRET is not set — using a development-only fallback. ' +
        'Set a strong random JWT_SECRET for any shared or production environment.'
    );
    return DEV_FALLBACK_JWT_SECRET;
  }

  if (fromEnv.length < MIN_PRODUCTION_JWT_SECRET_LENGTH) {
    warnOnce(
      '[security] JWT_SECRET looks short — use a strong random value of at least ' +
        `${MIN_PRODUCTION_JWT_SECRET_LENGTH} characters. The configured value is used as-is.`
    );
  }

  return fromEnv;
}

/** Comma-separated CORS allow-list from the environment (trailing slashes normalized). */
function configuredCorsOrigins(): string[] {
  return (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

/**
 * Decide whether a browser origin may call the API cross-origin.
 *
 *  - Requests without an `Origin` header (curl, server-to-server, workers) are
 *    not subject to browser CORS enforcement and are allowed.
 *  - `CORS_ORIGINS` (comma-separated) always wins when set.
 *  - Otherwise production rejects every browser origin (same-origin requests
 *    are handled separately by the caller), while development allows the Vite
 *    dev-server origins.
 */
export function isAllowedCorsOrigin(origin: string | undefined): boolean {
  if (!origin) return true;

  const allowList = configuredCorsOrigins();
  if (allowList.length > 0) return allowList.includes(origin);

  if (isProductionEnvironment()) return false;
  return DEV_ALLOWED_ORIGINS.includes(origin);
}