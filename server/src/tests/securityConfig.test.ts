import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { getJwtSecret, isAllowedCorsOrigin } from '../config/security';

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