import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../platform/prisma/prisma.service';

/**
 * T62 — Hardware Fingerprint Binding Service.
 *
 * Manages the (LicenseKey ↔ HardwareFingerprint) relationship for
 * Tauri Desktop / POS clients. The Rust client computes a SHA-256
 * fingerprint from CPU + RAM + disk + OS and registers it against
 * a license. This service enforces:
 *
 *   - max device count from `LicenseKey.maxDevices` (plan-driven)
 *   - idempotent registration (same licenseKeyId + fingerprintHash
 *     just refreshes `lastSeenAt`)
 *   - soft revoke (sets `revokedAt` and `isActive = false`, never deletes)
 *   - validation only succeeds for active, non-revoked bindings
 *
 * Append-only by design — fingerprints are never hard-deleted so the
 * audit trail of which devices ran the software is preserved.
 */
@Injectable()
export class FingerprintService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Register a hardware fingerprint against a license key. Idempotent:
   * if the binding already exists (active or revoked), it is reactivated
   * and `lastSeenAt` is bumped. If a new device push exceeds
   * `LicenseKey.maxDevices` (counted over active bindings only), throws
   * ForbiddenException with code MAX_DEVICES_EXCEEDED.
   *
   * @param licenseKeyId  ULID of the LicenseKey.
   * @param fingerprintHash  64-char lowercase SHA-256 hex from the Tauri client.
   * @param deviceLabel  Optional human-readable label ("POS-Branch1-Counter2").
   */
  async register(
    licenseKeyId: string,
    fingerprintHash: string,
    deviceLabel?: string,
  ) {
    this.assertHash(fingerprintHash);

    const licenseKey = await this.prisma.licenseKey.findUnique({
      where: { id: licenseKeyId },
    });
    if (!licenseKey) {
      throw new NotFoundException({
        code: 'LICENSE_KEY_NOT_FOUND',
        messageAr: 'مفتاح الترخيص غير موجود',
      });
    }
    if (licenseKey.revokedAt) {
      throw new ForbiddenException({
        code: 'LICENSE_REVOKED',
        messageAr: 'تم إلغاء هذا الترخيص',
      });
    }

    // Idempotent path: existing binding (active OR revoked) — reactivate.
    const existing = await this.prisma.hardwareFingerprint.findUnique({
      where: {
        licenseKeyId_fingerprintHash: { licenseKeyId, fingerprintHash },
      },
    });
    if (existing) {
      return this.prisma.hardwareFingerprint.update({
        where: { id: existing.id },
        data: {
          isActive: true,
          revokedAt: null,
          revokedReason: null,
          lastSeenAt: new Date(),
          // Only overwrite label if caller provided one.
          ...(deviceLabel ? { deviceLabel } : {}),
        },
      });
    }

    // New binding — enforce maxDevices over the *active* set only.
    const activeCount = await this.prisma.hardwareFingerprint.count({
      where: { licenseKeyId, isActive: true, revokedAt: null },
    });
    if (activeCount >= licenseKey.maxDevices) {
      throw new ForbiddenException({
        code: 'MAX_DEVICES_EXCEEDED',
        messageAr: 'تم تجاوز الحد الأقصى للأجهزة المسموح بها لهذا الترخيص',
        maxDevices: licenseKey.maxDevices,
        activeDevices: activeCount,
      });
    }

    return this.prisma.hardwareFingerprint.create({
      data: {
        licenseKeyId,
        fingerprintHash,
        deviceLabel: deviceLabel ?? null,
      },
    });
  }

  /**
   * Validate that a fingerprint is currently authorized for a license.
   * Returns true iff the binding exists, is active, and not revoked.
   * Side effect: bumps `lastSeenAt` on success (for telemetry).
   */
  async validate(licenseKeyId: string, fingerprintHash: string): Promise<boolean> {
    this.assertHash(fingerprintHash);
    const binding = await this.prisma.hardwareFingerprint.findUnique({
      where: {
        licenseKeyId_fingerprintHash: { licenseKeyId, fingerprintHash },
      },
    });
    if (!binding) return false;
    if (!binding.isActive || binding.revokedAt) return false;

    await this.prisma.hardwareFingerprint.update({
      where: { id: binding.id },
      data: { lastSeenAt: new Date() },
    });
    return true;
  }

  /**
   * Soft-revoke a fingerprint binding. Idempotent — revoking an already
   * revoked binding is a no-op. The row is preserved for audit.
   */
  async revoke(licenseKeyId: string, fingerprintHash: string, reason?: string) {
    this.assertHash(fingerprintHash);
    const binding = await this.prisma.hardwareFingerprint.findUnique({
      where: {
        licenseKeyId_fingerprintHash: { licenseKeyId, fingerprintHash },
      },
    });
    if (!binding) {
      throw new NotFoundException({
        code: 'FINGERPRINT_NOT_FOUND',
        messageAr: 'بصمة الجهاز غير مسجلة لهذا الترخيص',
      });
    }
    if (binding.revokedAt) return; // idempotent

    await this.prisma.hardwareFingerprint.update({
      where: { id: binding.id },
      data: {
        isActive: false,
        revokedAt: new Date(),
        revokedReason: reason ?? 'manual_revoke',
      },
    });
  }

  /** List all fingerprint bindings for a license key (active + revoked). */
  async listDevices(licenseKeyId: string) {
    return this.prisma.hardwareFingerprint.findMany({
      where: { licenseKeyId },
      orderBy: { firstSeenAt: 'asc' },
    });
  }

  /** Reject anything that isn't a 64-char lowercase hex string. */
  private assertHash(hash: string): void {
    if (typeof hash !== 'string' || !/^[0-9a-f]{64}$/.test(hash)) {
      throw new BadRequestException({
        code: 'INVALID_FINGERPRINT_HASH',
        messageAr: 'صيغة بصمة الجهاز غير صحيحة',
      });
    }
  }
}
