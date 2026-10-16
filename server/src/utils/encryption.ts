import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const ENCRYPTED_PREFIX = 'enc:v1:';
const KEY_SALT = 'hathap-api-key-v1';
const DERIVED_KEY_LENGTH = 32;

/**
 * Key material for `encryptApiKey` / `decryptApiKey`:
 *  - `string`: the configured secret (`API_KEY_ENCRYPTION_SECRET`), scrypt-derived
 *    with the fixed v1 salt, or
 *  - `Buffer`: an already-derived 32-byte key.
 *
 * The Buffer form exists so the key-rotation migration can hold an OLD and a
 * NEW derived key at the same time without mutating `process.env` mid-flight.
 * Omitting the parameter preserves the historical behavior exactly: the key is
 * derived from `API_KEY_ENCRYPTION_SECRET` at call time.
 */
export type EncryptionKeyInput = string | Buffer;

function deriveKey(secret: string): Buffer {
  if (!secret || secret.length < 32) {
    throw new Error(
      'API_KEY_ENCRYPTION_SECRET must be set and at least 32 characters long.'
    );
  }
  return crypto.scryptSync(secret, KEY_SALT, DERIVED_KEY_LENGTH);
}

/** Derive the storage key from a configured secret (exported for the rotation CLI). */
export function deriveEncryptionKey(secret: string): Buffer {
  return deriveKey(secret);
}

function resolveKey(key?: EncryptionKeyInput): Buffer {
  if (key === undefined) {
    return deriveKey(process.env.API_KEY_ENCRYPTION_SECRET ?? '');
  }
  if (Buffer.isBuffer(key)) {
    if (key.length !== DERIVED_KEY_LENGTH) {
      throw new Error(
        `Encryption key buffer must be exactly ${DERIVED_KEY_LENGTH} bytes, got ${key.length}.`
      );
    }
    return key;
  }
  return deriveKey(key);
}

export function isEncrypted(value: string | undefined): boolean {
  return Boolean(value?.startsWith(ENCRYPTED_PREFIX));
}

export function encryptApiKey(plainText: string, key?: EncryptionKeyInput): string {
  if (!plainText) return plainText;
  if (isEncrypted(plainText)) return plainText;

  const derived = resolveKey(key);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, derived, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, authTag, encrypted]).toString('base64url');
  return `${ENCRYPTED_PREFIX}${payload}`;
}

export function decryptApiKey(stored: string | undefined, key?: EncryptionKeyInput): string {
  if (!stored) return '';

  if (!isEncrypted(stored)) {
    return stored;
  }

  const derived = resolveKey(key);
  const data = Buffer.from(stored.slice(ENCRYPTED_PREFIX.length), 'base64url');
  const iv = data.subarray(0, IV_LENGTH);
  const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, derived, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

export function getApiKeyHint(plainText: string): string {
  if (!plainText || plainText.length <= 4) return '****';
  return plainText.slice(-4);
}

export function maskApiKey(hint?: string): string {
  if (!hint) return 'Not set';
  return `••••••••${hint}`;
}

export function isMaskedApiKeyValue(value: string | undefined): boolean {
  if (!value) return true;
  return value.includes('•') || value === 'Not set';
}
