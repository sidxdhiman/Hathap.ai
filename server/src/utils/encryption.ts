import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const ENCRYPTED_PREFIX = 'enc:v1:';
const KEY_SALT = 'hathap-api-key-v1';

function getEncryptionKey(): Buffer {
  const secret = process.env.API_KEY_ENCRYPTION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      'API_KEY_ENCRYPTION_SECRET must be set and at least 32 characters long.'
    );
  }
  return crypto.scryptSync(secret, KEY_SALT, 32);
}

export function isEncrypted(value: string | undefined): boolean {
  return Boolean(value?.startsWith(ENCRYPTED_PREFIX));
}

export function encryptApiKey(plainText: string): string {
  if (!plainText) return plainText;
  if (isEncrypted(plainText)) return plainText;

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, authTag, encrypted]).toString('base64url');
  return `${ENCRYPTED_PREFIX}${payload}`;
}

export function decryptApiKey(stored: string | undefined): string {
  if (!stored) return '';

  if (!isEncrypted(stored)) {
    return stored;
  }

  const key = getEncryptionKey();
  const data = Buffer.from(stored.slice(ENCRYPTED_PREFIX.length), 'base64url');
  const iv = data.subarray(0, IV_LENGTH);
  const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
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
