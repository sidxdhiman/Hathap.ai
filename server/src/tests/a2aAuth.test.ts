import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { Request } from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import User from '../models/User';
import { hathapUserBuilder } from '../a2a/userBuilder';
import { getUserId, HathapUser } from '../a2a/types';
import { bumpAuthVersion, signToken } from '../utils/authToken';

const TEST_URI = process.env.MONGODB_URI_TEST_A2AAUTH || 'mongodb://localhost:27017/hathap_test_a2aauth';

const JWT_SECRET = process.env.JWT_SECRET || 'secret';
const API_KEY = 'a2a-service-key-for-tests';
const DEFAULT_USER_ID = 'a2a-service-user';

let user: InstanceType<typeof User>;

/** Minimal shape `hathapUserBuilder` reads: the request headers, nothing else. */
function requestWith(headers: Record<string, string>): Request {
  return { headers } as unknown as Request;
}

async function currentUser(): Promise<InstanceType<typeof User>> {
  const found = await User.findById(user._id);
  assert.ok(found, 'expected the fixture user to exist');
  return found;
}

before(async () => {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(TEST_URI);
  }
  await User.deleteMany({});
  user = await User.create({
    email: 'a2aauth-user@test.local',
    name: 'A2A Auth User',
    passwordHash: 'test-only-hash',
  });
});

beforeEach(() => {
  delete process.env.A2A_API_KEY;
  delete process.env.A2A_DEFAULT_USER_ID;
});

after(async () => {
  await User.deleteMany({});
  await mongoose.connection.close();
});

/**
 * Regression coverage for credential invalidation on the A2A surface.
 *
 * The A2A endpoints authenticate through `hathapUserBuilder`, which is a
 * separate entry point from the Express `requireAuth` middleware. Before this
 * phase it verified only the JWT signature, so a credential that had already
 * been invalidated by sign-out, password change or account deletion still
 * produced an authenticated user there: revocation was real everywhere except
 * on the A2A routes.
 *
 * These tests drive the genuine mechanism — a real persisted user, a real
 * credential minted by `signToken`, and a real `bumpAuthVersion` increment, the
 * exact write that `/api/auth/logout` and `/api/auth/change-password` perform.
 * Nothing about invalidation is mocked, so a regression that bypassed the
 * version check would fail here rather than pass on a stubbed result.
 */
describe('hathapUserBuilder - credential invalidation', () => {
  test('authenticates a bearer credential that is the account current one', async () => {
    const resolved = await hathapUserBuilder(
      requestWith({ authorization: `Bearer ${signToken(await currentUser())}` })
    );

    assert.ok(resolved instanceof HathapUser, 'expected an authenticated A2A user');
    assert.equal(resolved.isAuthenticated, true);
    assert.equal(getUserId(resolved), String(user._id));
  });

  test('stops authenticating the same credential once it has been invalidated', async () => {
    const token = signToken(await currentUser());

    assert.ok(
      (await hathapUserBuilder(requestWith({ authorization: `Bearer ${token}` }))) instanceof HathapUser,
      'precondition: the credential authenticates before invalidation'
    );

    // Exactly what logout and password change do.
    await bumpAuthVersion(String(user._id));

    const afterInvalidation = await hathapUserBuilder(
      requestWith({ authorization: `Bearer ${token}` })
    );

    assert.equal(
      afterInvalidation.isAuthenticated,
      false,
      'an invalidated credential must not authenticate on the A2A surface'
    );
    assert.equal(getUserId(afterInvalidation), undefined);
    assert.ok(!(afterInvalidation instanceof HathapUser));
  });

  test('authenticates a credential issued after the invalidation', async () => {
    await bumpAuthVersion(String(user._id));

    const resolved = await hathapUserBuilder(
      requestWith({ authorization: `Bearer ${signToken(await currentUser())}` })
    );

    assert.ok(resolved instanceof HathapUser, 'signing in again must restore access');
    assert.equal(getUserId(resolved), String(user._id));
  });

  test('invalidation is per-account, so another user is unaffected', async () => {
    const bystander = await User.create({
      email: 'a2aauth-bystander@test.local',
      name: 'A2A Auth Bystander',
      passwordHash: 'test-only-hash',
    });
    const bystanderToken = signToken(bystander);

    await bumpAuthVersion(String(user._id));

    try {
      const resolved = await hathapUserBuilder(
        requestWith({ authorization: `Bearer ${bystanderToken}` })
      );
      assert.ok(resolved instanceof HathapUser);
      assert.equal(getUserId(resolved), String(bystander._id));
    } finally {
      await User.deleteOne({ _id: bystander._id });
    }
  });

  test('a credential naming a non-ObjectId identity does not authenticate', async () => {
    const malformed = jwt.sign(
      { id: 'not-an-object-id', av: 0 },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    const resolved = await hathapUserBuilder(requestWith({ authorization: `Bearer ${malformed}` }));

    assert.equal(resolved.isAuthenticated, false);
    assert.equal(getUserId(resolved), undefined);
  });

  test('a signature-valid credential for a deleted account does not authenticate', async () => {
    const doomed = await User.create({
      email: 'a2aauth-doomed@test.local',
      name: 'A2A Auth Doomed',
      passwordHash: 'test-only-hash',
    });
    const token = signToken(doomed);
    await User.deleteOne({ _id: doomed._id });

    const resolved = await hathapUserBuilder(requestWith({ authorization: `Bearer ${token}` }));

    assert.equal(resolved.isAuthenticated, false);
    assert.equal(getUserId(resolved), undefined);
  });
});

describe('hathapUserBuilder - unauthenticated and service fallbacks', () => {
  test('reports no user when no credential is presented', async () => {
    const resolved = await hathapUserBuilder(requestWith({}));
    assert.equal(resolved.isAuthenticated, false);
    assert.equal(getUserId(resolved), undefined);
  });

  test('reports no user for an unusable credential', async () => {
    for (const authorization of ['Bearer not-a-jwt', 'Basic abc', 'Bearer ']) {
      const resolved = await hathapUserBuilder(requestWith({ authorization }));
      assert.equal(resolved.isAuthenticated, false, `expected refusal for ${authorization}`);
    }
  });

  test('an invalidated credential does not silently fall through to the service account', async () => {
    process.env.A2A_API_KEY = API_KEY;
    process.env.A2A_DEFAULT_USER_ID = DEFAULT_USER_ID;

    const token = signToken(await currentUser());
    await bumpAuthVersion(String(user._id));

    // No x-a2a-api-key header is sent, so the service fallback must not rescue
    // the bearer credential that was just invalidated.
    const resolved = await hathapUserBuilder(requestWith({ authorization: `Bearer ${token}` }));

    assert.equal(resolved.isAuthenticated, false);
    assert.equal(getUserId(resolved), undefined);
  });

  test('the configured API key still authenticates as the service account', async () => {
    process.env.A2A_API_KEY = API_KEY;
    process.env.A2A_DEFAULT_USER_ID = DEFAULT_USER_ID;

    const resolved = await hathapUserBuilder(requestWith({ 'x-a2a-api-key': API_KEY }));

    assert.ok(resolved instanceof HathapUser);
    assert.equal(getUserId(resolved), DEFAULT_USER_ID);
  });

  test('an incorrect API key does not authenticate', async () => {
    process.env.A2A_API_KEY = API_KEY;
    process.env.A2A_DEFAULT_USER_ID = DEFAULT_USER_ID;

    const resolved = await hathapUserBuilder(requestWith({ 'x-a2a-api-key': 'wrong-key' }));

    assert.equal(resolved.isAuthenticated, false);
  });
});
