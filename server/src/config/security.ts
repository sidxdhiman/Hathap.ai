/**
 * Central, deliberately-small configuration for security-sensitive settings:
 * the JWT signing secret, the CORS origin policy, the reverse-proxy trust
 * setting, and log redaction of embedded credentials.
 *
 * Rules:
 *  - Production requires an explicit, strong `JWT_SECRET`. There is NO
 *    predictable/default signing secret in production — missing or weak
 *    configuration is a hard error (the server refuses to start).
 *  - Development keeps a conventional (non-secret) fallback so local tooling
 *    and tests work out of the box, clearly separated from production.
 *  - Express `trust proxy` stays disabled unless the operator opts in, because
 *    trusting `X-Forwarded-For` from an untrusted peer lets a client forge its
 *    own rate-limit key.
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
 *  - Otherwise production rejects every browser origin, while development
 *    allows the Vite dev-server origins.
 *
 * A same-origin browser request is NOT subject to CORS enforcement, so it needs
 * no reflected header and is not special-cased here. The request `Host` header
 * is never consulted: treating it as proof of same-origin would let a caller
 * forge `Origin` and `Host` together and have an arbitrary origin reflected.
 */
export function isAllowedCorsOrigin(origin: string | undefined): boolean {
  if (!origin) return true;

  const allowList = configuredCorsOrigins();
  if (allowList.length > 0) return allowList.includes(origin);

  if (isProductionEnvironment()) return false;
  return DEV_ALLOWED_ORIGINS.includes(origin);
}

/** Values Express accepts for `app.set('trust proxy', …)` that we permit. */
export type TrustProxySetting = number | boolean | 'loopback' | 'linklocal' | 'uniquelocal';

/**
 * Parse the opt-in `TRUST_PROXY` environment variable.
 *
 * Returns `undefined` when the variable is unset/empty or unsupported, which
 * leaves Express at its default (`trust proxy = false`) — the secure default,
 * because an untrusted `X-Forwarded-For` header must never become the identity
 * a request is keyed or authorized by.
 *
 * Why this exists: `express-rate-limit` keys on `request.ip`. Behind a reverse
 * proxy with trust disabled, every client shares the proxy's address, so the
 * 30-requests-per-15-minutes auth limiter becomes one site-wide bucket and
 * legitimate logins start receiving 429. Set this ONLY when the proxy is in
 * front of the app and overwrites/appends `X-Forwarded-For` (a hop count like
 * `1`, or `loopback`) — never on an internet-facing socket, where a client
 * could forge the header to evade rate limiting.
 */
export function resolveTrustProxy(raw: string | undefined): TrustProxySetting | undefined {
  if (raw === undefined) return undefined;
  const value = raw.trim();
  if (value === '') return undefined;
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^\d+$/.test(value)) return Number(value);
  if (value === 'loopback' || value === 'linklocal' || value === 'uniquelocal') return value;

  console.warn(
    `[security] Ignoring unsupported TRUST_PROXY value ${JSON.stringify(value.slice(0, 40))}. ` +
      `Expected a hop count (0, 1, 2, ...), true/false, loopback, linklocal or uniquelocal.`
  );
  return undefined;
}

// `scheme://userinfo@host` — the userinfo segment of a connection string
// (`mongodb://user:password@host`, `postgres://…`, `https://…`). The userinfo
// group is deliberately broad: anything up to the first `/` or `@` is treated
// as credentials so unusual URI shapes still redact instead of leaking.
const URI_USERINFO = /([a-z][a-z0-9+.-]*:\/\/)([^/@\s]+)@/gi;

/**
 * Strip credentials embedded in connection-string style URIs before text is
 * written to a log. `MONGODB_URI` frequently carries a username and password;
 * driver errors (e.g. a `MongoParseError` for a malformed URI) echo the URI
 * back verbatim, so the startup failure path must redact it rather than hand a
 * live credential to the log stream.
 */
export function redactCredentials(text: string): string {
  return text.replace(URI_USERINFO, (_match, scheme: string) => `${scheme}<redacted>@`);
}