import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'http';
import type { AddressInfo } from 'net';
import { corsMiddleware } from '../middleware/cors';

/**
 * CORS regression tests.
 *
 * These are self-contained: no database, no auth. They assert the *response
 * headers* the browser enforces, which is where a CORS misconfiguration is
 * actually observable. The most important case is Host-independence — a caller
 * must not be able to make an arbitrary origin trusted by pairing it with a
 * matching `Host` header.
 */

/**
 * Set env vars for the duration of `fn`, including any async work it starts.
 * Awaiting inside the `try` is what keeps the environment stable until the
 * requests have actually been made.
 */
async function withEnv(
  env: Record<string, string | undefined>,
  fn: () => Promise<void> | void
): Promise<void> {
  const saved = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(env)) {
    saved.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    await fn();
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

interface Reply {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}

let server: http.Server;
let port: number;

before(async () => {
  const app = express();
  app.use(corsMiddleware);
  app.get('/ping', (_req, res) => res.json({ ok: true }));
  server = await new Promise<http.Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  port = (server.address() as AddressInfo).port;
});

after(() => {
  server.close();
});

function request(opts: {
  method?: string;
  path?: string;
  headers?: Record<string, string>;
}): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        method: opts.method ?? 'GET',
        path: opts.path ?? '/ping',
        headers: opts.headers,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body })
        );
      }
    );
    req.on('error', reject);
    req.end();
  });
}

describe('CORS middleware - allow-list', () => {
  test('reflects an explicitly allowed origin', async () => {
    await withEnv(
      { NODE_ENV: 'production', CORS_ORIGINS: 'https://app.example.com' },
      async () => {
        const reply = await request({ headers: { Origin: 'https://app.example.com' } });
        assert.equal(reply.headers['access-control-allow-origin'], 'https://app.example.com');
      }
    );
  });

  test('does not reflect an origin missing from the allow-list', async () => {
    await withEnv(
      { NODE_ENV: 'production', CORS_ORIGINS: 'https://app.example.com' },
      async () => {
        const reply = await request({ headers: { Origin: 'https://evil.example' } });
        assert.equal(reply.headers['access-control-allow-origin'], undefined);
      }
    );
  });

  test('never sets Access-Control-Allow-Credentials', async () => {
    await withEnv(
      { NODE_ENV: 'production', CORS_ORIGINS: 'https://app.example.com' },
      async () => {
        const reply = await request({ headers: { Origin: 'https://app.example.com' } });
        assert.equal(reply.headers['access-control-allow-credentials'], undefined);
      }
    );
  });
});

describe('CORS middleware - Host is never trusted', () => {
  test('a matching Host header does not make an unapproved origin allowed', async () => {
    await withEnv({ NODE_ENV: 'production', CORS_ORIGINS: undefined }, async () => {
      // The pre-fix server compared Origin to `http(s)://${Host}` and reflected
      // the pair. A forged pair must no longer be treated as same-origin.
      const reply = await request({
        headers: { Origin: 'https://evil.example', Host: 'evil.example' },
      });
      assert.equal(reply.headers['access-control-allow-origin'], undefined);
    });
  });

  test('a matching Host header does not grant a preflight either', async () => {
    await withEnv({ NODE_ENV: 'production', CORS_ORIGINS: undefined }, async () => {
      const reply = await request({
        method: 'OPTIONS',
        headers: {
          Origin: 'https://evil.example',
          Host: 'evil.example',
          'Access-Control-Request-Method': 'GET',
        },
      });
      assert.notEqual(reply.status, 204);
      assert.equal(reply.headers['access-control-allow-origin'], undefined);
    });
  });
});

describe('CORS middleware - preflight', () => {
  test('an approved origin gets a 204 preflight with the reflected origin', async () => {
    await withEnv(
      { NODE_ENV: 'production', CORS_ORIGINS: 'https://app.example.com' },
      async () => {
        const reply = await request({
          method: 'OPTIONS',
          headers: {
            Origin: 'https://app.example.com',
            'Access-Control-Request-Method': 'POST',
          },
        });
        assert.equal(reply.status, 204);
        assert.equal(reply.headers['access-control-allow-origin'], 'https://app.example.com');
      }
    );
  });
});

describe('CORS middleware - development defaults', () => {
  test('allows the Vite dev-server origin and rejects others', async () => {
    await withEnv({ NODE_ENV: undefined, CORS_ORIGINS: undefined }, async () => {
      const allowed = await request({ headers: { Origin: 'http://localhost:5173' } });
      assert.equal(allowed.headers['access-control-allow-origin'], 'http://localhost:5173');

      const rejected = await request({ headers: { Origin: 'https://evil.example' } });
      assert.equal(rejected.headers['access-control-allow-origin'], undefined);
    });
  });

  test('requests without an Origin are passed through untouched', async () => {
    await withEnv({ NODE_ENV: 'production', CORS_ORIGINS: undefined }, async () => {
      const reply = await request({});
      assert.equal(reply.status, 200);
      assert.equal(reply.headers['access-control-allow-origin'], undefined);
    });
  });
});