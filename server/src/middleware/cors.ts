import cors from 'cors';
import { isAllowedCorsOrigin } from '../config/security';

/**
 * The API's CORS policy, built once and shared by every request.
 *
 * The allow/deny decision is delegated entirely to `isAllowedCorsOrigin`,
 * which is environment-driven:
 *   - `CORS_ORIGINS` (comma-separated) always wins when set,
 *   - production otherwise rejects every browser origin,
 *   - development allows the Vite dev-server origins,
 *   - requests without an `Origin` header are not browser-enforced and pass.
 *
 * It deliberately does NOT consider the request `Host` header. A same-origin
 * browser request is not subject to CORS enforcement and therefore needs no
 * reflected header, whereas treating `Host` as authoritative would let any
 * caller forge `Origin` and `Host` together and have an arbitrary origin
 * reflected. Because an unapproved origin resolves to `false`, the cors
 * middleware sets no `Access-Control-Allow-Origin` header for it.
 *
 * Responses never carry `Access-Control-Allow-Credentials`: the API is
 * authenticated with a bearer token, not cookies.
 */
export const corsMiddleware = cors({
  origin(origin, callback) {
    callback(null, isAllowedCorsOrigin(origin));
  },
});