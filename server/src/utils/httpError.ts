import { isProductionEnvironment } from '../config/security';

/**
 * The message that is safe to send to an API client for a 5xx (server-side)
 * failure.
 *
 * In production a 5xx never echoes the underlying error text: driver errors,
 * validation internals and stack-adjacent detail can leak file paths, query
 * fragments or configuration. The real error is still written to the server
 * log so operators keep visibility; only the client-facing text is replaced.
 *
 * Outside production the real message is returned unchanged, which is what
 * local development and the test suite rely on. Callers pass a route-specific
 * `fallback` when they have one (`'Failed to create agent.'`); otherwise the
 * generic default is used.
 */
export function serverErrorMessage(error: unknown, fallback = 'Internal server error.'): string {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';

  if (isProductionEnvironment()) {
    console.error('[server error]', error);
    return fallback;
  }

  return message || fallback;
}