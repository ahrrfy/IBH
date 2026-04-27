/**
 * TOTP service — Google Authenticator / Authy compatible (RFC 6238).
 *
 * Stores secrets encrypted at rest with AES-256-GCM using a key derived
 * from JWT_SECRET (so secrets are useless if the DB is leaked without
 * the app secret).
 *
 * Sensitivity policy (which roles MUST have 2FA):
 *   - system_owner, super_admin, company_admin, branch_manager, accountant
 *   - other roles are optional
 */

import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { authenticator } from 'otplib';
import * as QRCode from 'qrcode';
import {
  createCipheriv, createDecipheriv, randomBytes, randomInt, scryptSync, createHash,
} from 'crypto';
import { PrismaService } from '../../platform/prisma/prisma.service';

const ALGO = 'aes-256-gcm';
const KEY_LEN = 32;

// Roles where 2FA is policy-mandatory (cannot opt out)
export const MFA_REQUIRED_ROLES = new Set([
  'system_owner',
  'super_admin',
  'company_admin',
  'branch_manager',
  'accountant',
]);

// Roles where 2FA is recommended but optional
export const MFA_RECOMMENDED_ROLES = new Set([
  'sales_manager',
  'warehouse_manager',
  'hr_manager',
  'purchasing_officer',
]);

@Injectable()
export class TotpService {
  // 30-second window, ±1 step tolerance for clock drift
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    authenticator.options = { window: 1, step: 30 };
  }

  /** Whether a user with these roles is REQUIRED to have 2FA. */
  isMfaRequired(roles: string[], isSystemOwner: boolean): boolean {
    if (isSystemOwner) return true;
    return roles.some((r) => MFA_REQUIRED_ROLES.has(r));
  }

  /** Whether a user is recommended to enable 2FA. */
  isMfaRecommended(roles: string[]): boolean {
    return roles.some((r) => MFA_RECOMMENDED_ROLES.has(r));
  }

  // ─── Setup flow ────────────────────────────────────────────────────────

  /**
   * Generate a new TOTP secret (NOT yet activated).
   * Returns the otpauth URI + a data-URL QR code.
   * Frontend shows QR; user scans with Google Authenticator;
   * confirms via confirmTotpSetup() with a 6-digit code.
   */
  async generateSecret(userId: string): Promise<{ secret: string; otpauthUrl: string; qrDataUrl: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, username: true, nameAr: true },
    });
    if (!user) throw new BadRequestException('user_not_found');

    const secret = authenticator.generateSecret(); // base32
    const accountName = user.username ?? user.email;
    const issuer = 'الرؤية العربية ERP';
    const otpauthUrl = authenticator.keyuri(accountName, issuer, secret);
    const qrDataUrl = await QRCode.toDataURL(otpauthUrl, { width: 280, margin: 1 });

    // Persist encrypted, NOT yet enabled (requires2FA stays false until confirm)
    await this.prisma.user.update({
      where: { id: userId },
      data: { totpSecret: this.encrypt(secret) },
    });

    return { secret, otpauthUrl, qrDataUrl };
  }

  /**
   * Confirm TOTP setup — user enters first code from authenticator.
   * Activates 2FA and generates backup codes.
   */
  async confirmTotpSetup(userId: string, code: string): Promise<{ backupCodes: string[] }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { totpSecret: true },
    });
    if (!user?.totpSecret) throw new BadRequestException({ code: 'TOTP_NOT_INITIATED', messageAr: 'لم يتم إعداد المصادقة الثنائية بعد' });

    const secret = this.decrypt(user.totpSecret);
    if (!authenticator.check(code, secret)) {
      throw new BadRequestException({ code: 'TOTP_INVALID_CODE', messageAr: 'الرمز غير صحيح' });
    }

    // Generate 8 backup codes (8 chars each, hashed at rest)
    const backupCodes = Array.from({ length: 8 }, () => this.randomBackupCode());
    const hashed = backupCodes.map((c) => this.hashBackup(c));

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        requires2FA: true,
        totpEnabledAt: new Date(),
        backupCodes: JSON.stringify(hashed),
      },
    });

    return { backupCodes };
  }

  /**
   * Verify a TOTP code during login.
   * Returns true on success. Also accepts a backup code (single-use).
   */
  async verifyCode(userId: string, code: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { totpSecret: true, backupCodes: true, requires2FA: true },
    });
    if (!user || !user.requires2FA || !user.totpSecret) return false;

    const secret = this.decrypt(user.totpSecret);

    // Try TOTP first (6 digits)
    if (/^\d{6}$/.test(code) && authenticator.check(code, secret)) {
      return true;
    }

    // Fall back to backup code (8 chars alphanumeric)
    if (user.backupCodes) {
      const codes: string[] = JSON.parse(user.backupCodes);
      const codeHash = this.hashBackup(code.trim().toUpperCase());
      const idx = codes.indexOf(codeHash);
      if (idx >= 0) {
        // Single-use — remove it
        codes.splice(idx, 1);
        await this.prisma.user.update({
          where: { id: userId },
          data: { backupCodes: JSON.stringify(codes) },
        });
        return true;
      }
    }

    return false;
  }

  /** Disable 2FA — wipe secret + backup codes */
  async disable(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        requires2FA: false,
        totpSecret: null,
        totpEnabledAt: null,
        backupCodes: null,
      },
    });
  }

  // ─── Encryption helpers ────────────────────────────────────────────────

  private getKey(): Buffer {
    const jwtSecret = this.config.get<string>('JWT_SECRET');
    if (!jwtSecret) throw new Error('JWT_SECRET not set — cannot derive TOTP encryption key');
    // Derive a stable 32-byte key from JWT_SECRET via scrypt
    return scryptSync(jwtSecret, 'al-ruya.totp.v1', KEY_LEN);
  }

  private encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGO, this.getKey(), iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    // Format: iv.tag.ciphertext (all base64)
    return [iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join('.');
  }

  private decrypt(payload: string): string {
    const [ivB64, tagB64, ctB64] = payload.split('.');
    if (!ivB64 || !tagB64 || !ctB64) throw new Error('Invalid TOTP payload');
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const ct = Buffer.from(ctB64, 'base64');
    const decipher = createDecipheriv(ALGO, this.getKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  }

  private randomBackupCode(): string {
    // 8 chars, alphanumeric uppercase, no ambiguous (0,O,1,I)
    // Use randomInt for unbiased selection (modulo on randomBytes can bias for non-power-of-2 alphabets)
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 8; i++) s += alphabet[randomInt(0, alphabet.length)];
    return s;
  }

  private hashBackup(code: string): string {
    return createHash('sha256')
      .update(code + '|' + (this.config.get<string>('JWT_SECRET') ?? ''))
      .digest('hex');
  }
}
