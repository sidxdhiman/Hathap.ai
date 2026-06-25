"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isEncrypted = isEncrypted;
exports.encryptApiKey = encryptApiKey;
exports.decryptApiKey = decryptApiKey;
exports.getApiKeyHint = getApiKeyHint;
exports.maskApiKey = maskApiKey;
exports.isMaskedApiKeyValue = isMaskedApiKeyValue;
const crypto_1 = __importDefault(require("crypto"));
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const ENCRYPTED_PREFIX = 'enc:v1:';
const KEY_SALT = 'hathap-api-key-v1';
function getEncryptionKey() {
    const secret = process.env.API_KEY_ENCRYPTION_SECRET;
    if (!secret || secret.length < 32) {
        throw new Error('API_KEY_ENCRYPTION_SECRET must be set and at least 32 characters long.');
    }
    return crypto_1.default.scryptSync(secret, KEY_SALT, 32);
}
function isEncrypted(value) {
    return Boolean(value?.startsWith(ENCRYPTED_PREFIX));
}
function encryptApiKey(plainText) {
    if (!plainText)
        return plainText;
    if (isEncrypted(plainText))
        return plainText;
    const key = getEncryptionKey();
    const iv = crypto_1.default.randomBytes(IV_LENGTH);
    const cipher = crypto_1.default.createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    const payload = Buffer.concat([iv, authTag, encrypted]).toString('base64url');
    return `${ENCRYPTED_PREFIX}${payload}`;
}
function decryptApiKey(stored) {
    if (!stored)
        return '';
    if (!isEncrypted(stored)) {
        return stored;
    }
    const key = getEncryptionKey();
    const data = Buffer.from(stored.slice(ENCRYPTED_PREFIX.length), 'base64url');
    const iv = data.subarray(0, IV_LENGTH);
    const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
    const decipher = crypto_1.default.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}
function getApiKeyHint(plainText) {
    if (!plainText || plainText.length <= 4)
        return '****';
    return plainText.slice(-4);
}
function maskApiKey(hint) {
    if (!hint)
        return 'Not set';
    return `••••••••${hint}`;
}
function isMaskedApiKeyValue(value) {
    if (!value)
        return true;
    return value.includes('•') || value === 'Not set';
}
