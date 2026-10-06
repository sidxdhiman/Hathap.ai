import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { serverErrorMessage } from '../utils/httpError';

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

/** Run `fn` with `console.error` captured, so production logging is asserted
 * without polluting the test output. */
function withCapturedConsoleError(fn: () => void): unknown[][] {
  const original = console.error;
  const calls: unknown[][] = [];
  console.error = (...args: unknown[]) => {
    calls.push(args);
  };
  try {
    fn();
  } finally {
    console.error = original;
  }
  return calls;
}

describe('serverErrorMessage - non-production', () => {
  test('returns the real error message', () => {
    withEnv({ NODE_ENV: undefined }, () => {
      assert.equal(serverErrorMessage(new Error('database exploded')), 'database exploded');
    });
  });

  test('falls back when the error carries no message', () => {
    withEnv({ NODE_ENV: undefined }, () => {
      assert.equal(
        serverErrorMessage(undefined, 'Failed to create agent.'),
        'Failed to create agent.'
      );
    });
  });

  test('does not log while the message is already visible to the caller', () => {
    withEnv({ NODE_ENV: undefined }, () => {
      const calls = withCapturedConsoleError(() =>
        serverErrorMessage(new Error('database exploded'))
      );
      assert.equal(calls.length, 0);
    });
  });
});

describe('serverErrorMessage - production', () => {
  test('hides the real error message behind the generic default', () => {
    withEnv({ NODE_ENV: 'production' }, () => {
      withCapturedConsoleError(() => {
        assert.equal(serverErrorMessage(new Error('database exploded')), 'Internal server error.');
      });
    });
  });

  test('hides the real error message behind the route fallback', () => {
    withEnv({ NODE_ENV: 'production' }, () => {
      withCapturedConsoleError(() => {
        assert.equal(
          serverErrorMessage(new Error('database exploded'), 'Failed to update agent.'),
          'Failed to update agent.'
        );
      });
    });
  });

  test('still logs the real error server-side rather than dropping it', () => {
    withEnv({ NODE_ENV: 'production' }, () => {
      const error = new Error('database exploded');
      const calls = withCapturedConsoleError(() => serverErrorMessage(error));
      assert.equal(calls.length, 1);
      assert.ok(calls[0].includes(error));
    });
  });
});