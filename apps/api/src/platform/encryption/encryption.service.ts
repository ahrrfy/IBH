import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as crypto from 'crypto';

/**
 * AES-256-GCM symmetric encryption for sensitive data at rest
 * (integration tokens, API keys, SMTP passwords, etc.).
 *
 * Key source: env var `INTEGRATION_ENCRYPTION_KEY` — must be 32 bytes
 * encoded as 64-char hex. Generate with:
 *   node -e "console.log(crypto.randomBytes(32).toString('hex'))"
 *
 * Output format: base64( iv[12] || ciphertext || authTag[16] )
 *   - iv: random per encryption (12 bytes — GCM standard)
 *   - authTag: 16 bytes (GCM standard)
 *
 * Algorithm choice: AES-256-GCM provides both confidentiality and
 * authenticity — tampering with ciphertext or auth tag causes decryption
 * to throw, so we cannot return corrupted plaintext.
 */
@Injectable()
export class EncryptionService implements OnModuleInit {
  private readonly logger = new Logger(EncryptionService.name);
  private key!: Buffer;

  onModuleInit() {
    const hex = process.env.INTEGRATION_ENCRYPTION_KEY;
    if (!hex || hex.length !== 64 || !/^[0-9a-fA-F]+$/.test(hex)) {
      // Don't crash boot — derive a deterministic dev-only key from a fixed
      // seed so dev/test environments stay functional. Log a loud warning.
      this.logger.warn(
        'INTEGRATION_ENCRYPTION_KEY missing or malformed — using dev-only fallback. ' +
        'Set a 32-byte hex key in production via the env var.',
      );
      this.key = crypto.createHash('sha256').update('al-ruya-erp-dev-fallback-key').digest();
      return;
    }
    this.key = Buffer.from(hex, 'hex');
  }

  /** Encrypt a UTF-8 string. Returns base64-encoded blob. */
  encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, encrypted, authTag]).toString('base64');
  }

  /**
   * Decrypt a blob previously produced by `encrypt`. Throws if the input
   * is corrupted or tampered (GCM auth tag mismatch).
   */
  decrypt(blob: string): string {
    const buf = Buffer.from(blob, 'base64');
    if (buf.length < 12 + 16 + 1) {
      throw new Error('Encrypted blob is too short to be valid');
    }
    const iv = buf.subarray(0, 12);
    const authTag = buf.subarray(buf.length - 16);
    const ciphertext = buf.subarray(12, buf.length - 16);
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString('utf8');
  }

  /** Convenience: encrypt a JSON-serializable object. */
  encryptJson(obj: unknown): string {
    return this.encrypt(JSON.stringify(obj));
  }

  /** Convenience: decrypt and parse JSON. */
  decryptJson<T = unknown>(blob: string): T {
    return JSON.parse(this.decrypt(blob)) as T;
  }
}
