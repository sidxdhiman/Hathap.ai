import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import authRoutes from './routes/auth';
import modelsRoutes from './routes/models';
import agentsRoutes from './routes/agents';
import courtroomsRoutes from './routes/courtrooms';
import decisionsRoutes from './routes/decisions';
import evaluationsRoutes from './routes/evaluations';
import researchRoutes from './routes/research';
import { setupA2A } from './a2a/setupA2A';
import { worker } from './tasks/worker';
import { isProductionEnvironment, getJwtSecret, resolveMongoUri, resolveTrustProxy, redactCredentials } from './config/security';
import { corsMiddleware } from './middleware/cors';
import { serverErrorMessage } from './utils/httpError';

dotenv.config();

// Every production-only rule in this server keys off NODE_ENV being exactly
// `production` (JWT secret enforcement, deny-by-default CORS, generic
// client-facing errors). With it unset the process silently adopts development
// behavior — including the fallback JWT secret — so an unconfigured deployment
// announces itself at boot instead of being discovered after go-live.
if (!(process.env.NODE_ENV || '').trim()) {
  console.warn(
    '[config] NODE_ENV is not set — running with development behavior ' +
      '(development JWT/CORS/error defaults). Set NODE_ENV=production for production deployments.'
  );
}

// Express 4 does not forward a rejected promise from an async route handler to
// the error middleware; the rejection is left unhandled and Node's default
// policy (--unhandled-rejections=throw) turns it into a process-terminating
// uncaught exception. A single bad request could then reset every in-flight
// connection. Registering a listener disables that default and keeps the server
// serving. Routes are still expected to handle their own errors — this is the
// last-resort net, not a substitute for a controlled response.
process.on('unhandledRejection', (reason) => {
  const detail = reason instanceof Error ? reason.stack ?? String(reason) : String(reason);
  console.error('[Unhandled rejection]', redactCredentials(detail));
});

if (!process.env.API_KEY_ENCRYPTION_SECRET || process.env.API_KEY_ENCRYPTION_SECRET.length < 32) {
  console.error(
    'FATAL: API_KEY_ENCRYPTION_SECRET must be set in server/.env and be at least 32 characters.'
  );
  process.exit(1);
}

// Production refuses to start without an explicit, strong JWT signing secret.
// There is no predictable/default JWT secret in production.
if (isProductionEnvironment()) {
  try {
    getJwtSecret();
  } catch (err: any) {
    console.error(`FATAL: ${err?.message || 'JWT_SECRET is not configured for production.'}`);
    process.exit(1);
  }
}

const app = express();

// Reverse-proxy trust is opt-in (TRUST_PROXY). Unset is the secure default:
// `request.ip` stays the socket peer, so `X-Forwarded-For` from an untrusted
// client can never forge a rate-limit key. Behind a proxy it MUST be set, or
// every client shares the proxy's address and the auth limiter's
// 30-requests-per-15-minutes budget becomes one site-wide bucket that locks out
// legitimate logins. See config/security.ts resolveTrustProxy.
const trustProxy = resolveTrustProxy(process.env.TRUST_PROXY);
if (trustProxy !== undefined) app.set('trust proxy', trustProxy);

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
// Env-driven CORS: allow-list (CORS_ORIGINS), localhost dev origins, and
// non-browser (no-Origin) requests. Unknown cross-origin browser requests are
// rejected instead of reflecting every origin, and the request `Host` header is
// never trusted as proof of same-origin. See ./middleware/cors.
app.use(corsMiddleware);
app.use(express.json());

const PORT = process.env.PORT || 4000;

// Production refuses to start without an explicit MONGODB_URI. The previous
// unconditional localhost fallback meant an unconfigured production process
// would silently target a local development database (or hang on a driver
// timeout). Development keeps the localhost default for out-of-the-box use.
let MONGODB_URI: string;
try {
  MONGODB_URI = resolveMongoUri(process.env.MONGODB_URI);
} catch (err: any) {
  console.error(`FATAL: ${err?.message || 'MONGODB_URI is not configured for production.'}`);
  process.exit(1);
}

// Conservative limiter for authentication endpoints only. Intentionally not
// applied globally so it cannot interfere with the task scheduler, SSE,
// research, or normal Decision execution.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});

async function start() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');

  // Start the background execution worker once persistence is available. The
  // worker picks up queued/running executions and recovers interrupted ones.
  worker.start();

  app.use('/api/auth', authLimiter, authRoutes);
  app.use('/api/models', modelsRoutes);
  app.use('/api/agents', agentsRoutes);
  app.use('/api/courtrooms', courtroomsRoutes);
  app.use('/api/decisions', decisionsRoutes);
  app.use('/api/evaluations', evaluationsRoutes);
  app.use('/api/research', researchRoutes);

  app.get('/api/health', (req, res) => res.json({ ok: true }));

  // A2A routes are mounted BEFORE the error middleware on purpose: Express only
  // forwards `next(err)` to an error handler registered after the layer that
  // threw. Registered in the previous order, `requireA2AAuthentication`'s
  // documented "let the app-level error handler report it" fallback (and the
  // task gate's) silently missed this handler and fell through to Express's
  // default finalizer — an HTML body instead of `{ error }`, and a stack trace
  // whenever NODE_ENV was not `production`.
  setupA2A(app);

  // Safety net for errors that reach Express as middleware errors (a thrown
  // synchronous handler, or an explicit `next(err)`). The real error is logged
  // here; in production the client only receives a generic 5xx message.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const detail = err instanceof Error ? err.stack ?? String(err) : String(err);
    console.error('[Unhandled error]', redactCredentials(detail));
    const status = (err as { status?: number })?.status ?? 500;
    res.status(status).json({ error: serverErrorMessage(err) });
  });

  const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });

  // Graceful shutdown: stop dispatching new work, let in-flight tasks finish up
  // to a timeout, then close the HTTP server.
  const shutdown = async (signal: string) => {
    console.log(`[Server] received ${signal}, shutting down...`);
    server.close();
    await worker.stop();
    await mongoose.disconnect();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

start().catch((err: unknown) => {
  // Driver failures can echo the connection string (a malformed MONGODB_URI
  // surfaces as a MongoParseError containing the URI). Credentials embedded in
  // the URI are redacted before the failure reaches the log stream.
  const detail = err instanceof Error ? err.stack ?? String(err) : String(err);
  console.error('Failed to start server:', redactCredentials(detail));
  process.exit(1);
});
