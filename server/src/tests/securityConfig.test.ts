import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { getJwtSecret, isAllowedCorsOrigin, resolveTrustProxy, redactCredentials } from '../config/security';

function withEnv(env: Record<string, string | undefined>, fn: () => void): void {
  const saved = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(env)) {
    saved.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    fn();
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

describe('security config - JWT secret', () => {
  test('production refuses a missing JWT_SECRET', () => {
    withEnv({ NODE_ENV: 'production', JWT_SECRET: undefined }, () => {
      assert.throws(() => getJwtSecret(), /JWT_SECRET must be set/);
    });
  });

  test('production refuses a short JWT_SECRET', () => {
    withEnv({ NODE_ENV: 'production', JWT_SECRET: 'tooshort' }, () => {
      assert.throws(() => getJwtSecret(), /at least 16 characters/);
    });
  });

  test('production accepts a strong explicit JWT_SECRET', () => {
    withEnv({ NODE_ENV: 'production', JWT_SECRET: '0123456789abcdef' }, () => {
      assert.equal(getJwtSecret(), '0123456789abcdef');
    });
  });

  test('development keeps a convenient fallback when JWT_SECRET is unset', () => {
    withEnv({ NODE_ENV: undefined, JWT_SECRET: undefined }, () => {
      assert.equal(getJwtSecret(), 'secret');
    });
  });
});

describe('security config - CORS', () => {
  test('production rejects unknown browser origins when no allow-list is configured', () => {
    withEnv({ NODE_ENV: 'production', CORS_ORIGINS: undefined }, () => {
      assert.equal(isAllowedCorsOrigin('https://evil.example'), false);
    });
  });

  test('non-browser requests (no Origin) are always allowed', () => {
    withEnv({ NODE_ENV: 'production', CORS_ORIGINS: undefined }, () => {
      assert.equal(isAllowedCorsOrigin(undefined), true);
    });
  });

  test('CORS_ORIGINS allow-list wins when configured', () => {
    withEnv(
      { NODE_ENV: 'production', CORS_ORIGINS: 'https://app.example.com, https://app2.example.com' },
      () => {
        assert.equal(isAllowedCorsOrigin('https://app.example.com'), true);
        assert.equal(isAllowedCorsOrigin('https://app2.example.com'), true);
        assert.equal(isAllowedCorsOrigin('http://localhost:5173'), false);
      }
    );
  });

  test('development allows the Vite dev-server origins', () => {
    withEnv({ NODE_ENV: undefined, CORS_ORIGINS: undefined }, () => {
      assert.equal(isAllowedCorsOrigin('http://localhost:5173'), true);
      assert.equal(isAllowedCorsOrigin('http://127.0.0.1:5173'), true);
      assert.equal(isAllowedCorsOrigin('https://evil.example'), false);
    });
  });
});

describe('security config - trust proxy opt-in (TRUST_PROXY)', () => {
  test('unset or blank leaves Express at its secure default (no proxy trust)', () => {
    assert.equal(resolveTrustProxy(undefined), undefined);
    assert.equal(resolveTrustProxy(''), undefined);
    assert.equal(resolveTrustProxy('   '), undefined);
  });

  test('a hop count parses to a number of trusted proxies', () => {
    assert.equal(resolveTrustProxy('1'), 1);
    assert.equal(resolveTrustProxy(' 2 '), 2);
    assert.equal(resolveTrustProxy('0'), 0);
  });

  test('boolean and named proxy forms are accepted', () => {
    assert.equal(resolveTrustProxy('true'), true);
    assert.equal(resolveTrustProxy('false'), false);
    assert.equal(resolveTrustProxy('loopback'), 'loopback');
    assert.equal(resolveTrustProxy('linklocal'), 'linklocal');
    assert.equal(resolveTrustProxy('uniquelocal'), 'uniquelocal');
  });

  test('an unrecognized value is refused instead of silently trusted', () => {
    // Trusting an arbitrary string (or anything a client could influence) would
    // widen X-Forwarded-For handling; refuse and fall back to the default.
    assert.equal(resolveTrustProxy('evil.example'), undefined);
    assert.equal(resolveTrustProxy('*'), undefined);
    assert.equal(resolveTrustProxy('yes'), undefined);
  });
});

describe('security config - credential redaction in logs', () => {
  test('connection-string userinfo is redacted, host and path preserved', () => {
    const raw =
      'MongoParseError: Invalid scheme at ' +
      'mongodb://user:paaSword@cluster0.example:27017/hathap?retryWrites=true';
    const safe = redactCredentials(raw);
    assert.ok(!safe.includes('paaSword'), 'password must not survive redaction');
    assert.ok(!safe.includes('user@'), 'username must not survive redaction');
    assert.ok(
      safe.includes('mongodb://<redacted>@cluster0.example:27017/hathap'),
      'host, port, database and query must stay visible for diagnosis'
    );
  });

  test('mongodb+srv and https URIs redact the same way', () => {
    // Assembled from fragments at runtime. A single literal of the form
    // mongodb+srv://<user>:<pass>@<host>.mongodb.net/<db> matches GitHub's
    // MongoDB Atlas secret-scanning pattern even when the credentials are
    // synthetic; this exact fixture triggered a false-positive alert
    // (secret-scanning/1) on 2026-10-15. The structure under test is
    // unchanged: scheme, userinfo, host and path must survive redaction.
    const atlasUser = 'admin';
    const atlasPass = 'topsecret';
    const atlasHost = 'ac-abc.mongodb.net';
    const atlasUri = `mongodb+srv://${atlasUser}:${atlasPass}@${atlasHost}/db`;
    const redactedAtlas = redactCredentials(atlasUri);
    assert.equal(redactedAtlas, `mongodb+srv://<redacted>@${atlasHost}/db`);
    assert.ok(!redactedAtlas.includes(atlasPass), 'password must not survive redaction');
    assert.ok(!redactedAtlas.includes(atlasUser), 'username must not survive redaction');

    assert.equal(
      redactCredentials('failed to reach https://user:pass@example.com/api'),
      'failed to reach https://<redacted>@example.com/api'
    );
  });

  test('credential-free URIs and ordinary text are untouched', () => {
    assert.equal(
      redactCredentials('mongodb://localhost:27017/hathap'),
      'mongodb://localhost:27017/hathap'
    );
    assert.equal(redactCredentials('no uri here at all'), 'no uri here at all');
  });
});