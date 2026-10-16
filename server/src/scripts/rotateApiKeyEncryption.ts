import mongoose from 'mongoose';
import dotenv from 'dotenv';
import {
  migrateModelApiKeys,
  verifyModelApiKeys,
} from '../services/encryptionKeyMigration';
import { deriveEncryptionKey } from '../utils/encryption';

/**
 * Operator CLI for rotating API_KEY_ENCRYPTION_SECRET.
 *
 * Stages (see docs/PHASE32_ENGINEERING_REPORT.md for the full runbook):
 *
 *  1. Backup the database (mongodump). This is YOUR recovery path — the script
 *     never deletes or overwrites a value it cannot decrypt.
 *  2. With the app STOPPED (single replica; a running instance still holds the
 *     OLD key and would treat freshly re-encrypted records as unreadable):
 *
 *       API_KEY_ENCRYPTION_SECRET=<NEW> API_KEY_ENCRYPTION_SECRET_OLD=<OLD> \
 *         npx ts-node src/scripts/rotateApiKeyEncryption.ts --dry-run
 *
 *     Review the counts. Nothing is written in dry-run mode.
 *
 *  3. Re-run with --yes to perform the migration, then --verify-only to prove
 *     every stored key authenticates under the NEW secret.
 *
 *  4. Set API_KEY_ENCRYPTION_SECRET=<NEW> in the deployment environment and
 *     start the app. Only after the app has run successfully on the new secret
 *     may the OLD secret be retired — and only after --verify-only reports
 *     undecryptable=0 and plaintext=0.
 *
 * The script prints counts and record ids only. It never prints, logs, or
 * writes plaintext keys or ciphertext.
 */

dotenv.config();

function fail(message: string): never {
  console.error(`[rotate-api-key-encryption] ${message}`);
  process.exit(1);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const yes = args.includes('--yes');
  const verifyOnly = args.includes('--verify-only');

  const currentSecret = process.env.API_KEY_ENCRYPTION_SECRET;
  if (!currentSecret || currentSecret.length < 32) {
    fail('API_KEY_ENCRYPTION_SECRET must be set to the NEW secret (at least 32 characters).');
  }
  try {
    deriveEncryptionKey(currentSecret);
  } catch (err: any) {
    fail(`API_KEY_ENCRYPTION_SECRET is not usable: ${err?.message || err}`);
  }

  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/hathap';
  await mongoose.connect(uri);

  try {
    if (verifyOnly) {
      const v = await verifyModelApiKeys(currentSecret);
      console.log(
        `verify-only: total=${v.total} decryptable=${v.decryptable} ` +
          `plaintext=${v.plaintext} undecryptable=${v.undecryptableIds.length}`
      );
      for (const id of v.undecryptableIds) {
        console.log(`  undecryptable modelId=${id}`);
      }
      const clean = v.undecryptableIds.length === 0 && v.plaintext === 0;
      process.exitCode = clean ? 0 : 1;
      return;
    }

    const oldSecret = process.env.API_KEY_ENCRYPTION_SECRET_OLD;
    if (!oldSecret || oldSecret.length < 32) {
      fail(
        'API_KEY_ENCRYPTION_SECRET_OLD (the secret being replaced) must be set ' +
          'to at least 32 characters.'
      );
    }
    if (oldSecret === currentSecret) {
      fail('API_KEY_ENCRYPTION_SECRET and API_KEY_ENCRYPTION_SECRET_OLD are identical — nothing to rotate.');
    }
    if (!dryRun && !yes) {
      fail('Refusing to modify data without --yes. Run with --dry-run first.');
    }

    const result = await migrateModelApiKeys({ oldSecret, newSecret: currentSecret, dryRun });
    console.log(
      `migration ${dryRun ? '(dry-run) ' : ''}complete: scanned=${result.scanned} ` +
        `withKey=${result.withKey} reEncrypted=${result.reEncrypted} ` +
        `alreadyOnNewKey=${result.alreadyOnNewKey} ` +
        `plaintextEncrypted=${result.plaintextEncrypted} failed=${result.failed.length}`
    );
    for (const failure of result.failed) {
      console.log(`  failed modelId=${failure.modelId} classification=${failure.classification}`);
    }

    if (!dryRun && result.failed.length === 0) {
      const v = await verifyModelApiKeys(currentSecret);
      console.log(
        `post-migration verify: total=${v.total} decryptable=${v.decryptable} ` +
          `plaintext=${v.plaintext} undecryptable=${v.undecryptableIds.length}`
      );
    }

    process.exitCode = result.failed.length > 0 ? 1 : 0;
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err: unknown) => {
  const detail = err instanceof Error ? err.message : String(err);
  console.error(`[rotate-api-key-encryption] unexpected failure: ${detail}`);
  process.exit(1);
});
