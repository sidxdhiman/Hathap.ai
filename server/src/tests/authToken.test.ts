import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import User from '../models/User';
import {
  bumpAuthVersion,
  extractBearerToken,
  readAuthVersion,
  signToken,
  verifyAuthToken,
} from '../utils/authToken';

const TEST_URI = process.env.MONGODB_URI_TEST_AUTHTOKEN || 'mongodb://localhost:27017/hathap_test_authtoken';

/**
 * The secret the server itself will use. `getJwtSecret()` resolves this from the
 * environment (with a development fallback), so reading it the same way keeps the
 * tokens minted here verifiable by the code under test.
 */
const JWT_SECRET = process.env.JWT_SECRET || 'secret';

const OTHER_SECRET = 'a-completely-different-signing-secret';

/** A syntactically valid but non-ObjectId identity, the CastError trigger. */
const NON_OBJECT_ID = 'not-an-object-id';

let user: InstanceType<typeof User>;
let otherUser: InstanceType<typeof User>;

before(async () => {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(TEST_URI);
  }
  await User.deleteMany({});
  user = await User.create({
    email: 'authtoken-user@test.local',
    name: 'Auth Token User',
    passwordHash: 'test-only-hash',
  });
  otherUser = await User.create({
    email: 'authtoken-other@test.local',
    name: 'Auth Token Other',
    passwordHash: 'test-only-hash',
  });
});

after(async () => {
  await User.deleteMany({});
  await mongoose.connection.close();
});

describe('extractBearerToken', () => {
  test('returns the credential from a well-formed Bearer header', () => {
    assert.equal(extractBearerToken('Bearer abc.def.ghi'), 'abc.def.ghi');
  });

  test('trims surrounding whitespace from the credential', () => {
    assert.equal(extractBearerToken('Bearer   abc.def.ghi  '), 'abc.def.ghi');
  });

  test('returns null when the header is absent or empty', () => {
    assert.equal(extractBearerToken(undefined), null);
    assert.equal(extractBearerToken(''), null);
  });

  test('returns null for a credential presented under another scheme', () => {
    assert.equal(extractBearerToken('Basic YWxhZGRpbjpvcGVuc2VzYW1l'), null);
    assert.equal(extractBearerToken('bearer abc.def.ghi'), null);
    assert.equal(extractBearerToken('Token abc.def.ghi'), null);
  });

  test('returns null when the scheme is present but the credential is empty', () => {
    assert.equal(extractBearerToken('Bearer '), null);
    assert.equal(extractBearerToken('Bearer    '), null);
  });

  test('does not accept a scheme appearing later in the header', () => {
    assert.equal(extractBearerToken('Basic Bearer abc.def.ghi'), null);
  });
});

describe('readAuthVersion', () => {
  test('reads a stored counter', () => {
    assert.equal(readAuthVersion({ authVersion: 3 }), 3);
  });

  test('treats an absent or null counter as 0', () => {
    assert.equal(readAuthVersion({}), 0);
    assert.equal(readAuthVersion(null), 0);
    assert.equal(readAuthVersion(undefined), 0);
    assert.equal(readAuthVersion({ authVersion: undefined }), 0);
  });

  test('treats a non-numeric or non-finite counter as 0', () => {
    assert.equal(readAuthVersion({ authVersion: NaN }), 0);
    assert.equal(readAuthVersion({ authVersion: Infinity }), 0);
    assert.equal(readAuthVersion({ authVersion: 'nope' as unknown as number }), 0);
  });

  test('never reports a negative counter', () => {
    assert.equal(readAuthVersion({ authVersion: -5 }), 0);
  });

  test('truncates a fractional counter so comparisons stay integral', () => {
    assert.equal(readAuthVersion({ authVersion: 2.9 }), 2);
  });
});

describe('signToken', () => {
  test('binds the credential to the user id and current auth version', () => {
    const token = signToken({ _id: user._id, authVersion: 4 } as never);
    const claims = jwt.decode(token) as Record<string, unknown>;
    assert.equal(claims.id, String(user._id));
    assert.equal(claims.av, 4);
  });

  test('normalizes a missing auth version to 0', () => {
    const token = signToken({ _id: user._id } as never);
    const claims = jwt.decode(token) as Record<string, unknown>;
    assert.equal(claims.av, 0);
  });

  test('signs with HS256', () => {
    const token = signToken(user);
    const header = JSON.parse(
      Buffer.from(token.split('.')[0], 'base64url').toString('utf8')
    ) as { alg: string };
    assert.equal(header.alg, 'HS256');
  });
});

describe('verifyAuthToken - accepts genuine credentials', () => {
  test('resolves the user behind a freshly issued credential', async () => {
    const verified = await verifyAuthToken(signToken(user));
    assert.deepEqual(verified, { userId: String(user._id) });
  });

  test('accepts a credential issued before the av claim existed', async () => {
    const legacy = jwt.sign({ id: String(user._id) }, JWT_SECRET, { expiresIn: '7d' });
    const verified = await verifyAuthToken(legacy);
    assert.deepEqual(verified, { userId: String(user._id) });
  });

  test('accepts a credential carrying an explicit av of 0', async () => {
    const token = jwt.sign({ id: String(user._id), av: 0 }, JWT_SECRET, { expiresIn: '7d' });
    assert.deepEqual(await verifyAuthToken(token), { userId: String(user._id) });
  });
});

describe('verifyAuthToken - refuses unusable credentials', () => {
  test('refuses an expired credential', async () => {
    const expired = jwt.sign({ id: String(user._id), av: 0 }, JWT_SECRET, { expiresIn: -10 });
    assert.equal(await verifyAuthToken(expired), null);
  });

  test('refuses a structurally malformed credential', async () => {
    assert.equal(await verifyAuthToken('not-a-jwt'), null);
    assert.equal(await verifyAuthToken(''), null);
    assert.equal(await verifyAuthToken('a.b.c'), null);
  });

  test('refuses a credential signed with a different secret', async () => {
    const forged = jwt.sign({ id: String(user._id), av: 0 }, OTHER_SECRET, { expiresIn: '7d' });
    assert.equal(await verifyAuthToken(forged), null);
  });

  test('refuses an unsigned alg:none credential', async () => {
    const unsigned = jwt.sign({ id: String(user._id), av: 0 }, '', { algorithm: 'none' });
    assert.equal(await verifyAuthToken(unsigned), null);
  });

  test('refuses a signature-valid credential whose account no longer exists', async () => {
    const ghostId = new mongoose.Types.ObjectId();
    const token = jwt.sign({ id: String(ghostId), av: 0 }, JWT_SECRET, { expiresIn: '7d' });
    assert.equal(await verifyAuthToken(token), null);
  });
});

describe('verifyAuthToken - refuses malformed identities without a database fault', () => {
  /**
   * Regression: a signature-valid credential whose `id` is not an ObjectId used
   * to reach `User.findById`, where Mongoose raised a CastError. That escaped as
   * a server fault and surfaced to clients as 500 instead of 401. These
   * assertions fail loudly if the rejection is ever removed, because `await`
   * would reject instead of resolving to null.
   */
  test('refuses a non-ObjectId identity instead of raising a CastError', async () => {
    const token = jwt.sign({ id: NON_OBJECT_ID, av: 0 }, JWT_SECRET, { expiresIn: '7d' });
    const verified = await verifyAuthToken(token);
    assert.equal(verified, null);
  });

  test('refuses other malformed identity shapes', async () => {
    for (const id of ['', 'not-a-hex-string', 'zzzzzzzzzzzzzzzzzzzzzzzz', '12345']) {
      const token = jwt.sign({ id, av: 0 }, JWT_SECRET, { expiresIn: '7d' });
      assert.equal(await verifyAuthToken(token), null, `expected refusal for id=${JSON.stringify(id)}`);
    }
  });

  test('refuses a non-string identity claim', async () => {
    for (const id of [123, true, null, { $ne: null }, ['507f1f77bcf86cd799439011']]) {
      const token = jwt.sign({ id }, JWT_SECRET, { expiresIn: '7d' });
      assert.equal(await verifyAuthToken(token), null, `expected refusal for id=${JSON.stringify(id)}`);
    }
  });

  test('refuses a credential with no identity claim at all', async () => {
    const token = jwt.sign({ av: 0 }, JWT_SECRET, { expiresIn: '7d' });
    assert.equal(await verifyAuthToken(token), null);
  });

  test('still resolves a legitimate ObjectId identity', async () => {
    const token = jwt.sign({ id: String(otherUser._id), av: 0 }, JWT_SECRET, { expiresIn: '7d' });
    assert.deepEqual(await verifyAuthToken(token), { userId: String(otherUser._id) });
  });
});

describe('verifyAuthToken - honours the auth version counter', () => {
  test('refuses a non-numeric version claim rather than coercing it', async () => {
    for (const av of ['1', true, {}, [], null]) {
      const token = jwt.sign({ id: String(user._id), av }, JWT_SECRET, { expiresIn: '7d' });
      assert.equal(await verifyAuthToken(token), null, `expected refusal for av=${JSON.stringify(av)}`);
    }
  });

  test('refuses a negative or fractional version claim', async () => {
    for (const av of [-1, 1.5]) {
      const token = jwt.sign({ id: String(user._id), av }, JWT_SECRET, { expiresIn: '7d' });
      assert.equal(await verifyAuthToken(token), null, `expected refusal for av=${JSON.stringify(av)}`);
    }
  });

  test('refuses a credential whose version is behind the account', async () => {
    const token = signToken({ _id: user._id, authVersion: 0 } as never);
    await bumpAuthVersion(String(user._id));
    try {
      assert.equal(await verifyAuthToken(token), null);
    } finally {
      await mongoose.connection.db!.collection('users').updateOne(
        { _id: user._id },
        { $set: { authVersion: 0 } }
      );
    }
  });

  test('refuses a credential whose version is ahead of the account', async () => {
    const token = signToken({ _id: user._id, authVersion: 5 } as never);
    assert.equal(await verifyAuthToken(token), null);
  });

  test('a credential issued after the bump is accepted again', async () => {
    await bumpAuthVersion(String(user._id));
    try {
      const refreshed = await User.findById(user._id);
      assert.deepEqual(await verifyAuthToken(signToken(refreshed!)), { userId: String(user._id) });
    } finally {
      await mongoose.connection.db!.collection('users').updateOne(
        { _id: user._id },
        { $set: { authVersion: 0 } }
      );
    }
  });
});

describe('bumpAuthVersion', () => {
  test('increments the counter by exactly one and ends earlier credentials', async () => {
    const before = signToken({ _id: otherUser._id, authVersion: 0 } as never);
    await bumpAuthVersion(String(otherUser._id));
    await bumpAuthVersion(String(otherUser._id));

    const stored = await User.findById(otherUser._id);
    assert.equal(stored!.authVersion, 2);
    assert.equal(await verifyAuthToken(before), null);
    assert.deepEqual(await verifyAuthToken(signToken(stored!)), { userId: String(otherUser._id) });
  });

  test('invalidates only the account it was called for', async () => {
    const bystanderToken = signToken(user);
    await bumpAuthVersion(String(otherUser._id));
    try {
      assert.deepEqual(await verifyAuthToken(bystanderToken), { userId: String(user._id) });
    } finally {
      await mongoose.connection.db!.collection('users').updateOne(
        { _id: otherUser._id },
        { $set: { authVersion: 0 } }
      );
    }
  });
});
