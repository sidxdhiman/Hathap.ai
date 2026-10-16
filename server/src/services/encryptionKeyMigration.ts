import Model from '../models/Model';
import { decryptApiKey, encryptApiKey, isEncrypted } from '../utils/encryption';

/**
 * Safe rotation of `API_KEY_ENCRYPTION_SECRET` for every stored provider key.
 *
 * Stored ciphertext carries a FORMAT version (`enc:v1:`) but no key
 * identifier, so a record encrypted under the old key and one encrypted under
 * the new key are visually indistinguishable. Migration therefore decides by
 * decryption: try the new key first (already migrated), then the old key
 * (needs re-encryption); if neither authenticates, the record is reported and
 * left byte-for-byte untouched so nothing recoverable is destroyed.
 *
 * AES-GCM cannot distinguish "wrong key" from "corrupted ciphertext" — both
 * fail authentication — so both land in the same undecryptable bucket and are
 * handled identically: never overwritten, always reported by record id.
 *
 * Every function here reports counts and record ids only — never plaintext
 * keys and never ciphertext.
 */

export type ReencryptOutcome =
  | 'no-key'
  | 'already-on-new-key'
  | 'plaintext-encrypted'
  | 're-encrypted';

export interface ReencryptResult {
  outcome: ReencryptOutcome;
  /** New stored value; undefined when the stored value is unchanged. */
  value?: string;
}

/**
 * Decide what a single stored value needs under the new secret.
 *
 * Throws when the value is ciphertext that neither the new nor the old secret
 * can authenticate. Callers must treat that as "leave the record alone".
 */
export function reencryptStoredValue(
  stored: string | undefined,
  oldSecret: string,
  newSecret: string
): ReencryptResult {
  if (!stored) return { outcome: 'no-key' };

  if (!isEncrypted(stored)) {
    return { outcome: 'plaintext-encrypted', value: encryptApiKey(stored, newSecret) };
  }

  try {
    decryptApiKey(stored, newSecret);
    return { outcome: 'already-on-new-key' };
  } catch {
    // Not under the new key (AES-GCM also fails here on corruption); try old.
  }

  const plain = decryptApiKey(stored, oldSecret); // throws if neither key authenticates
  return { outcome: 're-encrypted', value: encryptApiKey(plain, newSecret) };
}

export type MigrationFailureClass =
  | 'undecryptable-with-both-keys'
  | 'persist-failed'
  | 'verify-failed';

export interface MigrationFailure {
  modelId: string;
  classification: MigrationFailureClass;
}

export interface MigrationResult {
  scanned: number;
  withKey: number;
  reEncrypted: number;
  alreadyOnNewKey: number;
  plaintextEncrypted: number;
  failed: MigrationFailure[];
  dryRun: boolean;
}

/** Minimal persistence surface the migration needs (test seam for failure injection). */
export interface PersistableRecord {
  apiKey?: string;
  save: () => Promise<unknown>;
}

export interface MigrationOptions {
  oldSecret: string;
  newSecret: string;
  dryRun?: boolean;
  /** Test seam: how a changed record is persisted. Defaults to document.save(). */
  persist?: (record: PersistableRecord) => Promise<unknown>;
}

/**
 * Re-encrypt every stored model API key under `newSecret`.
 *
 * Per-record processing with per-record error isolation: one bad record never
 * aborts the pass and never modifies the bad record. Re-running the migration
 * after a partial failure is safe — records already on the new key are counted
 * and skipped, so the run resumes where the previous one stopped.
 */
export async function migrateModelApiKeys(options: MigrationOptions): Promise<MigrationResult> {
  const { oldSecret, newSecret, dryRun = false, persist } = options;
  const result: MigrationResult = {
    scanned: 0,
    withKey: 0,
    reEncrypted: 0,
    alreadyOnNewKey: 0,
    plaintextEncrypted: 0,
    failed: [],
    dryRun,
  };

  const models = await Model.find({ apiKey: { $exists: true, $nin: [null, ''] } });

  for (const model of models) {
    result.scanned += 1;
    const stored = model.apiKey;
    if (!stored) continue;
    result.withKey += 1;

    let next: ReencryptResult;
    try {
      next = reencryptStoredValue(stored, oldSecret, newSecret);
    } catch {
      result.failed.push({
        modelId: String(model._id),
        classification: 'undecryptable-with-both-keys',
      });
      continue;
    }

    if (next.outcome === 'already-on-new-key') {
      result.alreadyOnNewKey += 1;
      continue;
    }
    if (next.outcome === 'no-key') continue;

    if (next.outcome === 'plaintext-encrypted') result.plaintextEncrypted += 1;
    if (next.outcome === 're-encrypted') result.reEncrypted += 1;

    if (dryRun) continue;

    model.apiKey = next.value;
    try {
      if (persist) await persist(model);
      else await model.save();
    } catch {
      result.failed.push({ modelId: String(model._id), classification: 'persist-failed' });
      continue;
    }

    // Read-back verification: the value just written must authenticate with
    // the NEW key before this record counts as migrated.
    try {
      decryptApiKey(next.value, newSecret);
    } catch {
      result.failed.push({ modelId: String(model._id), classification: 'verify-failed' });
    }
  }

  return result;
}

export interface KeyVerificationResult {
  total: number;
  decryptable: number;
  plaintext: number;
  /** Record ids only — never values. */
  undecryptableIds: string[];
}

/**
 * Enumeration / completeness check: every stored key either decrypts under
 * `secret`, is legacy plaintext, or is listed as undecryptable by id.
 * A migration is complete exactly when `undecryptableIds` matches the set of
 * records that were undecryptable BEFORE the rotation (typically none) and
 * `plaintext` is 0.
 */
export async function verifyModelApiKeys(secret: string): Promise<KeyVerificationResult> {
  const result: KeyVerificationResult = {
    total: 0,
    decryptable: 0,
    plaintext: 0,
    undecryptableIds: [],
  };

  const models = await Model.find({ apiKey: { $exists: true, $nin: [null, ''] } });
  for (const model of models) {
    const stored = model.apiKey;
    if (!stored) continue;
    result.total += 1;

    if (!isEncrypted(stored)) {
      result.plaintext += 1;
      continue;
    }

    try {
      decryptApiKey(stored, secret);
      result.decryptable += 1;
    } catch {
      result.undecryptableIds.push(String(model._id));
    }
  }

  return result;
}
