import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import User from '../models/User';
import Model from '../models/Model';
import { getJwtSecret, isProductionEnvironment } from '../config/security';
import { signToken, verifyAuthToken } from '../utils/authToken';
import {
  decryptApiKey,
  encryptApiKey,
  isEncrypted,
} from '../utils/encryption';
import {
  migrateModelApiKeys,
  reencryptStoredValue,
  verifyModelApiKeys,
} from '../services/encryptionKeyMigration';

// Node's test runner gives each file its own process, so seeding a stable
// default encryption secret here cannot affect other suites. The real
// encryption path (scrypt + AES-256-GCM) is fully exercised.
process.env.API_KEY_ENCRYPTION_SECRET ??= 'phase32-default-secret-0123456789ab';

const TEST_URI = process.env.MONGODB_URI_TEST_ROTATION || 'mongodb://localhost:27017/hathap_test_phase32_rotation';

const OLD_SECRET = 'phase32-old-secret-0123456789abcdefg';
const NEW_SECRET = 'phase32-new-secret-abcdefghijklmnopqrstuvwxyz';
const THIRD_SECRET = 'phase32-third-secret-ZYXWVUTSRQPONMLKJIHG';

const JWT_SECRET_A = 'phase32-jwt-secret-AAAAAAAAAAAAAAAAAAAA';
const JWT_SECRET_B = 'phase32-jwt-secret-BBBBBBBBBBBBBBBBBBBB';

async function clean(): Promise<void> {
  await Promise.all([User.deleteMany({}), Model.deleteMany({})]);
}

function JWT_SECRET_C(): string {
  return 'phase32-jwt-secret-CCCCCCCCCCCCCCCCCCCC';
}

describe('Phase 32 — JWT secret rotation semantics', () => {
  let userId: string;
  const originalJwtSecret = process.env.JWT_SECRET;
  const originalNodeEnv = process.env.NODE_ENV;

  before(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(TEST_URI);
    }
    await clean();
    const user = await User.create({
      email: 'jwt-rotation@example.com',
      name: 'JWT Rotation',
      passwordHash: 'not-a-real-hash-for-this-test',
      authVersion: 0,
    });
    userId = String(user._id);
  });

  after(async () => {
    if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalJwtSecret;
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    await clean();
    await mongoose.connection.close();
  });

  test('getJwtSecret re-reads the environment on every call (no caching)', () => {
    process.env.JWT_SECRET = JWT_SECRET_A;
    assert.equal(getJwtSecret(), JWT_SECRET_A);
    process.env.JWT_SECRET = JWT_SECRET_B;
    assert.equal(getJwtSecret(), JWT_SECRET_B);
  });

  test('rotating JWT_SECRET invalidates previously issued tokens; restoring it recovers them', async () => {
    process.env.JWT_SECRET = JWT_SECRET_A;
    const user = await User.findById(userId);
    assert.ok(user);
    const tokenUnderA = signToken(user!);

    assert.ok(
      (await verifyAuthToken(tokenUnderA)) !== null,
      'token must verify under the secret it was signed with'
    );

    process.env.JWT_SECRET = JWT_SECRET_B;
    assert.equal(
      await verifyAuthToken(tokenUnderA),
      null,
      'a rotated secret must reject tokens signed under the previous secret'
    );

    const tokenUnderB = signToken(user!);
    assert.ok(
      (await verifyAuthToken(tokenUnderB)) !== null,
      'the new secret must issue and verify fresh tokens'
    );

    process.env.JWT_SECRET = JWT_SECRET_A;
    assert.ok(
      (await verifyAuthToken(tokenUnderA)) !== null,
      'restoring the previous secret must recover previously issued tokens (rollback path)'
    );

    // Forged/other-secret tokens stay rejected under either secret.
    const forged = jwt.sign({ id: userId, av: 0 }, JWT_SECRET_C(), { algorithm: 'HS256' });
    process.env.JWT_SECRET = JWT_SECRET_B;
    assert.equal(await verifyAuthToken(forged), null);
  });

  test('rotation has no effect in production mode without the secret being present', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.JWT_SECRET;
    assert.equal(isProductionEnvironment(), true);
    assert.throws(() => getJwtSecret(), /JWT_SECRET must be set/);
  });
});

describe('Phase 32 — AES-256-GCM key semantics (unit)', () => {
  test('round-trips under the same key and fails closed under a different key', () => {
    const plain = 'provider-key-value-0123456789';
    const stored = encryptApiKey(plain, OLD_SECRET);

    assert.ok(isEncrypted(stored));
    assert.equal(decryptApiKey(stored, OLD_SECRET), plain);
    assert.throws(() => decryptApiKey(stored, NEW_SECRET));
  });

  test('an explicit 32-byte derived key behaves like the raw secret', () => {
    const plain = 'derived-key-check-0123456789';
    const stored = encryptApiKey(plain, OLD_SECRET);
    const derived = crypto.scryptSync(OLD_SECRET, 'hathap-api-key-v1', 32);
    assert.equal(decryptApiKey(stored, derived), plain);
    const badLength = Buffer.alloc(16);
    assert.throws(() => decryptApiKey(stored, badLength), /32 bytes/);
  });

  test('tampered ciphertext fails authentication (never returns modified plaintext)', () => {
    const stored = encryptApiKey('tamper-target-value-0123456789', OLD_SECRET);
    const body = Buffer.from(stored.slice('enc:v1:'.length), 'base64url');
    body[body.length - 1] ^= 0xff;
    const tampered = `enc:v1:${body.toString('base64url')}`;
    assert.throws(() => decryptApiKey(tampered, OLD_SECRET));
  });

  test('truncated ciphertext fails authentication instead of returning garbage', () => {
    const stored = encryptApiKey('truncate-target-value-01234567', OLD_SECRET);
    const body = Buffer.from(stored.slice('enc:v1:'.length), 'base64url');
    const truncated = `enc:v1:${body.subarray(0, body.length - 4).toString('base64url')}`;
    assert.throws(() => decryptApiKey(truncated, OLD_SECRET));
  });

  test('encryptApiKey is idempotent on already-encrypted values — changing the env key does NOT re-encrypt (why a migration is mandatory)', () => {
    const stored = encryptApiKey('stability-check-value-012345678', OLD_SECRET);
    // Same input again under a DIFFERENT current key returns the same ciphertext:
    // encryptApiKey will not transparently re-key. This is the exact hazard the
    // migration service exists to handle.
    assert.equal(encryptApiKey(stored, NEW_SECRET), stored);
    assert.throws(() => decryptApiKey(stored, NEW_SECRET));
  });

  test('plaintext values pass through decrypt unchanged (legacy records)', () => {
    assert.equal(decryptApiKey('legacy-plaintext-value-01234567', NEW_SECRET), 'legacy-plaintext-value-01234567');
  });
});

describe('Phase 32 — encryption-key migration service', () => {
  const PLAIN_1 = 'migrating-key-one-0123456789abcdef';
  const PLAIN_2 = 'legacy-plaintext-entry-0123456789';
  const PLAIN_3 = 'already-new-key-entry-0123456789a';
  const PLAIN_4 = 'lost-key-entry-0123456789abcdefg';

  let m1: string;
  let m2: string;
  let m3: string;
  let m4: string;
  let m5: string;
  let m6 = '';
  let storedAfterFirstRun: Record<string, string> = {};

  async function snapshot(ids: string[]): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    for (const id of ids) {
      const doc = await Model.findById(id);
      out[id] = doc?.apiKey ?? '';
    }
    return out;
  }

  before(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(TEST_URI);
    }
    await clean();
    const userId = new mongoose.Types.ObjectId();

    const d1 = await Model.create({ provider: 'openai', displayName: 'M1', modelName: 'm1', apiKey: encryptApiKey(PLAIN_1, OLD_SECRET), userId });
    const d2 = await Model.create({ provider: 'openai', displayName: 'M2', modelName: 'm2', apiKey: PLAIN_2, userId });
    const d3 = await Model.create({ provider: 'openai', displayName: 'M3', modelName: 'm3', apiKey: encryptApiKey(PLAIN_3, NEW_SECRET), userId });
    const d4 = await Model.create({ provider: 'openai', displayName: 'M4', modelName: 'm4', apiKey: encryptApiKey(PLAIN_4, THIRD_SECRET), userId });
    const d5 = await Model.create({ provider: 'openai', displayName: 'M5', modelName: 'm5', apiKey: '', userId });

    m1 = String(d1._id);
    m2 = String(d2._id);
    m3 = String(d3._id);
    m4 = String(d4._id);
    m5 = String(d5._id);
  });

  after(async () => {
    await clean();
    await mongoose.connection.close();
  });

  test('reencryptStoredValue classifies every shape correctly', () => {
    assert.deepEqual(reencryptStoredValue('', OLD_SECRET, NEW_SECRET), { outcome: 'no-key' });

    const plain = reencryptStoredValue(PLAIN_2, OLD_SECRET, NEW_SECRET);
    assert.equal(plain.outcome, 'plaintext-encrypted');
    assert.equal(decryptApiKey(plain.value, NEW_SECRET), PLAIN_2);

    const oldCipher = encryptApiKey(PLAIN_1, OLD_SECRET);
    const migrated = reencryptStoredValue(oldCipher, OLD_SECRET, NEW_SECRET);
    assert.equal(migrated.outcome, 're-encrypted');
    assert.equal(decryptApiKey(migrated.value, NEW_SECRET), PLAIN_1);

    const newCipher = encryptApiKey(PLAIN_3, NEW_SECRET);
    assert.deepEqual(reencryptStoredValue(newCipher, OLD_SECRET, NEW_SECRET), { outcome: 'already-on-new-key' });

    const lostCipher = encryptApiKey(PLAIN_4, THIRD_SECRET);
    assert.throws(() => reencryptStoredValue(lostCipher, OLD_SECRET, NEW_SECRET));
  });

  test('dry-run reports the plan without modifying any record', async () => {
    const beforeSnapshot = await snapshot([m1, m2, m3, m4, m5]);

    const result = await migrateModelApiKeys({ oldSecret: OLD_SECRET, newSecret: NEW_SECRET, dryRun: true });
    assert.equal(result.dryRun, true);
    assert.equal(result.scanned, 4, 'the empty-key record must not be scanned');
    assert.equal(result.reEncrypted, 1);
    assert.equal(result.plaintextEncrypted, 1);
    assert.equal(result.alreadyOnNewKey, 1);
    assert.equal(result.failed.length, 1);
    assert.equal(result.failed[0].modelId, m4);
    assert.equal(result.failed[0].classification, 'undecryptable-with-both-keys');

    assert.deepEqual(await snapshot([m1, m2, m3, m4, m5]), beforeSnapshot, 'dry-run must not write');
    assert.ok(!JSON.stringify(result).includes(PLAIN_1), 'results must never contain plaintext values');
  });

  test('real migration re-encrypts old-key and plaintext records, skips current, preserves undecryptable', async () => {
    const beforeSnapshot = await snapshot([m1, m3, m4]);

    const result = await migrateModelApiKeys({ oldSecret: OLD_SECRET, newSecret: NEW_SECRET });
    assert.equal(result.dryRun, false);
    assert.equal(result.reEncrypted, 1);
    assert.equal(result.plaintextEncrypted, 1);
    assert.equal(result.alreadyOnNewKey, 1);
    assert.equal(result.failed.length, 1);
    assert.equal(result.failed[0].modelId, m4);

    const d1 = await Model.findById(m1);
    assert.ok(isEncrypted(d1!.apiKey));
    assert.equal(decryptApiKey(d1!.apiKey, NEW_SECRET), PLAIN_1);
    assert.throws(() => decryptApiKey(d1!.apiKey, OLD_SECRET), 'm1 must no longer decrypt under the old key');

    const d2 = await Model.findById(m2);
    assert.ok(isEncrypted(d2!.apiKey), 'the legacy plaintext record must now be encrypted');
    assert.equal(decryptApiKey(d2!.apiKey, NEW_SECRET), PLAIN_2);

    const afterSnapshot = await snapshot([m1, m3, m4]);
    assert.equal(afterSnapshot[m3], beforeSnapshot[m3], 'already-current record must be untouched');
    assert.equal(afterSnapshot[m4], beforeSnapshot[m4], 'undecryptable record must be preserved byte-for-byte');
    assert.notEqual(afterSnapshot[m1], beforeSnapshot[m1]);

    storedAfterFirstRun = afterSnapshot;
    assert.ok(!JSON.stringify(result).includes(PLAIN_4), 'results must never contain plaintext values');
  });

  test('re-running the migration is idempotent (safe resume after interruption)', async () => {
    const result = await migrateModelApiKeys({ oldSecret: OLD_SECRET, newSecret: NEW_SECRET });
    assert.equal(result.reEncrypted, 0);
    assert.equal(result.plaintextEncrypted, 0);
    assert.equal(result.alreadyOnNewKey, 3);
    assert.equal(result.failed.length, 1);
    assert.equal(result.failed[0].modelId, m4);

    const after = await snapshot([m1, m3, m4]);
    assert.deepEqual(after, storedAfterFirstRun, 'a second run must not double-encrypt anything');
  });

  test('a persist failure isolates to its record and the next run resumes cleanly', async () => {
    const userId = new mongoose.Types.ObjectId();
    const plain6 = 'persist-fail-entry-0123456789abcdef';
    const d6 = await Model.create({ provider: 'openai', displayName: 'M6', modelName: 'm6', apiKey: encryptApiKey(plain6, OLD_SECRET), userId });
    m6 = String(d6._id);
    const before6 = (await Model.findById(m6))!.apiKey;

    const failing = await migrateModelApiKeys({
      oldSecret: OLD_SECRET,
      newSecret: NEW_SECRET,
      persist: async (record) => {
        if (String((record as any)._id) === m6) throw new Error('simulated persist fault');
        await record.save();
      },
    });
    assert.ok(
      failing.failed.some((f) => f.modelId === m6 && f.classification === 'persist-failed'),
      'the injected persist failure must be classified and isolated'
    );
    assert.equal((await Model.findById(m6))!.apiKey, before6, 'a failed persist must leave the record unchanged');

    const resumed = await migrateModelApiKeys({ oldSecret: OLD_SECRET, newSecret: NEW_SECRET });
    assert.equal(
      resumed.failed.filter((f) => f.modelId === m6).length,
      0,
      'the resumed run must migrate the record that previously failed to persist'
    );
    assert.equal(decryptApiKey((await Model.findById(m6))!.apiKey, NEW_SECRET), plain6);
  });

  test('verifyModelApiKeys enumerates completeness by id only', async () => {
    const v = await verifyModelApiKeys(NEW_SECRET);
    assert.equal(v.plaintext, 0, 'no plaintext records may remain after a completed migration');
    assert.ok(v.undecryptableIds.includes(m4), 'the pre-existing lost-key record must be reported');
    assert.ok(!v.undecryptableIds.includes(m1), 'migrated records must verify under the new key');
    assert.ok(!v.undecryptableIds.includes(m6), 'the resumed record must verify under the new key');
    assert.ok(!JSON.stringify(v).includes(PLAIN_1), 'verification output must never contain plaintext values');
    assert.ok(!JSON.stringify(v).includes('enc:v1:'), 'verification output must never contain ciphertext');
  });
});
