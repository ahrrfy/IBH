import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../../engines/auth/decorators/public.decorator';
import { CurrentUser } from '../../engines/auth/decorators/current-user.decorator';
import { RequirePermission } from '../../engines/auth/decorators/require-permission.decorator';
import { ZodValidationPipe } from '../pipes/zod-validation.pipe';
import { FingerprintService } from '../../modules/licensing/fingerprint.service';
import { FeatureCacheService } from './feature-cache.service';
import {
  hashFingerprint,
  LicenseSignerService,
  type LicensePayload,
} from './license-signer.service';
import {
  activateLicenseSchema,
  type ActivateLicenseInput,
  issueLicenseSchema,
  type IssueLicenseInput,
  renewLicenseSchema,
  type RenewLicenseInput,
  revokeLicenseSchema,
  type RevokeLicenseInput,
} from './dto/activation.dto';
import type { UserSession } from '@erp/shared-types';

/**
 * T64 — License Activation + Renewal Controller.
 *
 * Implements the offline-verifiable RSA-2048 license flow described in
 * F6. Five endpoints, all rooted at `/licensing/activation`:
 *
 *   POST /issue       — super-admin: mint a long-lived signed license
 *   POST /activate    — public+rate-limited: bind device, return short-lived token
 *   POST /renew       — auth: extend subscription, return fresh activation token
 *   POST /revoke      — super-admin: kill license + all bound devices
 *   GET  /public-key  — public: PEM for clients to bundle and verify offline
 *
 * Plan upgrade/downgrade (with proration) is intentionally out of scope —
 * see T68. This controller only handles activate / renew / revoke.
 */
@Controller('licensing/activation')
export class LicenseActivationController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly signer: LicenseSignerService,
    private readonly fingerprints: FingerprintService,
    private readonly featureCache: FeatureCacheService,
  ) {}

  /**
   * Issue a fresh signed license for a tenant. Creates or reuses a
   * Subscription row, persists a `LicenseKey` row carrying the token's
   * SHA-256 (for revocation lookup), and returns the base64url-compact
   * signed token.
   */
  @Post('issue')
  @RequirePermission('License', 'admin')
  @HttpCode(HttpStatus.CREATED)
  async issue(
    @Body(new ZodValidationPipe(issueLicenseSchema)) body: IssueLicenseInput,
    @CurrentUser() session: UserSession,
  ): Promise<{ licenseKey: string; licenseKeyId: string; expiresAt: string }> {
    const plan = await this.prisma.plan.findUnique({
      where: { id: body.planId },
      include: { features: { where: { isEnabled: true } } },
    });
    if (!plan) {
      throw new NotFoundException({
        code: 'PLAN_NOT_FOUND',
        messageAr: 'الباقة غير موجودة',
      });
    }

    const validFrom = body.validFrom ? new Date(body.validFrom) : new Date();
    const validUntil = new Date(
      validFrom.getTime() + body.durationDays * 24 * 60 * 60 * 1000,
    );
    const maxDevices = body.maxDevices ?? plan.maxUsers ?? 1;
    const featureCodes = plan.features.map((f) => f.featureCode);

    // Find-or-create subscription for this (company, plan). Schema has
    // no compound unique on (companyId, planId), so we do an explicit
    // findFirst → branch.
    const existingSub = await this.prisma.subscription.findFirst({
      where: { companyId: body.companyId, planId: body.planId },
      select: { id: true },
    });
    const subscription = existingSub
      ? await this.prisma.subscription.update({
          where: { id: existingSub.id },
          data: {
            status: 'active',
            currentPeriodStartAt: validFrom,
            currentPeriodEndAt: validUntil,
            effectiveFeatures: featureCodes as unknown as object,
          },
        })
      : await this.prisma.subscription.create({
          data: {
            companyId: body.companyId,
            planId: body.planId,
            status: 'active',
            startedAt: validFrom,
            currentPeriodStartAt: validFrom,
            currentPeriodEndAt: validUntil,
            priceIqd: plan.monthlyPriceIqd,
            effectiveFeatures: featureCodes as unknown as object,
            createdBy: session.userId,
          },
        });

    // Pre-create the LicenseKey row WITHOUT the token text — we need its
    // id to embed in the payload (so revocation can target it). We fill
    // `key`/`signatureSha` immediately after signing.
    const licenseKeyRow = await this.prisma.licenseKey.create({
      data: {
        subscriptionId: subscription.id,
        key: `pending-${crypto.randomBytes(16).toString('hex')}`,
        signatureSha: '0'.repeat(64),
        issuedAt: new Date(),
        expiresAt: validUntil,
        maxDevices,
        createdBy: session.userId,
      },
    });

    const token = this.signer.buildAndSign({
      companyId: body.companyId,
      planCode: plan.code,
      subscriptionId: subscription.id,
      licenseKeyId: licenseKeyRow.id,
      validFrom,
      validUntil,
      maxDevices,
      features: featureCodes,
      typ: 'license',
    });
    const signatureSha = crypto.createHash('sha256').update(token).digest('hex');

    await this.prisma.licenseKey.update({
      where: { id: licenseKeyRow.id },
      data: { key: token, signatureSha },
    });

    await this.prisma.licenseEvent.create({
      data: {
        subscriptionId: subscription.id,
        eventType: 'created',
        payload: {
          licenseKeyId: licenseKeyRow.id,
          planCode: plan.code,
          validUntil: validUntil.toISOString(),
          maxDevices,
        } as unknown as object,
        createdBy: session.userId,
      },
    });

    await this.featureCache.invalidate(body.companyId);

    return {
      licenseKey: token,
      licenseKeyId: licenseKeyRow.id,
      expiresAt: validUntil.toISOString(),
    };
  }

  /**
   * Activate a license on a specific device. Signature is verified
   * against the bundled public key, then the DB row is consulted to
   * confirm it has not been revoked, and finally T62's
   * FingerprintService binds the hardware (enforcing maxDevices).
   *
   * Returns a SHORT-LIVED activation token (30 days, refreshed via
   * `/renew`) carrying the fingerprint hash binding so offline clients
   * can self-validate that the token belongs to *this* device.
   */
  @Post('activate')
  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @HttpCode(HttpStatus.OK)
  async activate(
    @Body(new ZodValidationPipe(activateLicenseSchema))
    body: ActivateLicenseInput,
  ): Promise<{
    activationToken: string;
    payload: LicensePayload;
    expiresAt: string;
  }> {
    const payload = this.signer.verifyLicense(body.licenseKey);
    if (payload.typ !== 'license') {
      throw new UnauthorizedException({
        code: 'WRONG_TOKEN_TYPE',
        messageAr: 'نوع الرمز غير مسموح به للتفعيل',
      });
    }
    if (!payload.licenseKeyId) {
      throw new UnauthorizedException({
        code: 'LICENSE_MISSING_ID',
        messageAr: 'الترخيص لا يحمل مُعرّفاً',
      });
    }

    const licenseKeyRow = await this.prisma.licenseKey.findUnique({
      where: { id: payload.licenseKeyId },
      include: { subscription: true },
    });
    if (!licenseKeyRow) {
      throw new NotFoundException({
        code: 'LICENSE_KEY_NOT_FOUND',
        messageAr: 'مفتاح الترخيص غير موجود',
      });
    }
    if (licenseKeyRow.revokedAt) {
      throw new ForbiddenException({
        code: 'LICENSE_REVOKED',
        messageAr: 'تم إلغاء هذا الترخيص',
      });
    }

    // Bind the device (T62 enforces maxDevices and idempotency).
    await this.fingerprints.register(
      licenseKeyRow.id,
      body.fingerprint,
      body.deviceLabel,
    );

    // Mint the short-lived activation token. Capped at 30 days OR the
    // license's own expiry, whichever is sooner — never extend.
    const now = new Date();
    const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const activationExpiry =
      thirtyDays.getTime() < licenseKeyRow.expiresAt.getTime()
        ? thirtyDays
        : licenseKeyRow.expiresAt;

    const activationToken = this.signer.buildAndSign({
      companyId: payload.companyId,
      planCode: payload.planCode,
      subscriptionId: payload.subscriptionId,
      licenseKeyId: licenseKeyRow.id,
      validFrom: now,
      validUntil: activationExpiry,
      maxDevices: payload.maxDevices,
      features: payload.features,
      typ: 'activation',
      fingerprintHash: body.fingerprint,
    });

    await this.prisma.licenseKey.update({
      where: { id: licenseKeyRow.id },
      data: { lastSeenAt: now },
    });
    await this.prisma.licenseEvent.create({
      data: {
        subscriptionId: licenseKeyRow.subscriptionId,
        eventType: 'activated',
        payload: {
          licenseKeyId: licenseKeyRow.id,
          fingerprintHash: body.fingerprint,
        } as unknown as object,
      },
    });

    return {
      activationToken,
      payload: this.signer.verifyLicense(activationToken),
      expiresAt: activationExpiry.toISOString(),
    };
  }

  /**
   * Renew an existing activation. Verifies the supplied activation
   * token, confirms the device fingerprint still matches, extends the
   * underlying Subscription's `currentPeriodEndAt` by the plan's
   * billing-cycle window, and mints a fresh activation token.
   *
   * Idempotent within a 5-minute window — if `currentPeriodEndAt` was
   * just bumped, we re-issue without bumping again to absorb retries
   * from clients with flaky networks.
   */
  @Post('renew')
  @Public() // identity is proven by the activation token itself
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @HttpCode(HttpStatus.OK)
  async renew(
    @Body(new ZodValidationPipe(renewLicenseSchema)) body: RenewLicenseInput,
  ): Promise<{
    activationToken: string;
    payload: LicensePayload;
    expiresAt: string;
  }> {
    const payload = this.signer.verifyLicense(body.currentLicenseKey);

    // Activation tokens carry a fphash binding — verify it matches the
    // device asking for renewal. License (long-lived) tokens may also be
    // used here as a fallback for first renew on devices that lost their
    // activation token; we'd require a fresh fingerprint validation.
    if (payload.typ === 'activation') {
      if (payload.fphash !== hashFingerprint(body.fingerprint)) {
        throw new UnauthorizedException({
          code: 'FINGERPRINT_MISMATCH',
          messageAr: 'بصمة الجهاز لا تطابق رمز التفعيل',
        });
      }
    }

    if (!payload.licenseKeyId) {
      throw new UnauthorizedException({
        code: 'LICENSE_MISSING_ID',
        messageAr: 'الترخيص لا يحمل مُعرّفاً',
      });
    }
    const licenseKeyRow = await this.prisma.licenseKey.findUnique({
      where: { id: payload.licenseKeyId },
      include: { subscription: { include: { plan: true } } },
    });
    if (!licenseKeyRow) {
      throw new NotFoundException({
        code: 'LICENSE_KEY_NOT_FOUND',
        messageAr: 'مفتاح الترخيص غير موجود',
      });
    }
    if (licenseKeyRow.revokedAt) {
      throw new ForbiddenException({
        code: 'LICENSE_REVOKED',
        messageAr: 'تم إلغاء هذا الترخيص',
      });
    }

    // Validate the fingerprint is still bound (and active) for this license.
    const ok = await this.fingerprints.validate(
      licenseKeyRow.id,
      body.fingerprint,
    );
    if (!ok) {
      throw new ForbiddenException({
        code: 'FINGERPRINT_NOT_BOUND',
        messageAr: 'الجهاز غير مربوط بهذا الترخيص',
      });
    }

    const now = new Date();
    const sub = licenseKeyRow.subscription;
    const FIVE_MIN = 5 * 60 * 1000;

    // Idempotent window — if we already extended within 5 minutes, reuse.
    const justExtended =
      sub.currentPeriodEndAt &&
      now.getTime() - sub.updatedAt.getTime() < FIVE_MIN &&
      sub.currentPeriodEndAt.getTime() > now.getTime();

    let newPeriodEnd: Date;
    if (justExtended && sub.currentPeriodEndAt) {
      newPeriodEnd = sub.currentPeriodEndAt;
    } else {
      const cycleDays = sub.billingCycle === 'annual' ? 365 : 30;
      const base =
        sub.currentPeriodEndAt && sub.currentPeriodEndAt.getTime() > now.getTime()
          ? sub.currentPeriodEndAt
          : now;
      newPeriodEnd = new Date(base.getTime() + cycleDays * 24 * 60 * 60 * 1000);

      await this.prisma.subscription.update({
        where: { id: sub.id },
        data: {
          status: 'active',
          currentPeriodEndAt: newPeriodEnd,
          gracePeriodEndsAt: null,
        },
      });
      await this.prisma.licenseKey.update({
        where: { id: licenseKeyRow.id },
        data: { expiresAt: newPeriodEnd, lastSeenAt: now },
      });
      await this.prisma.licenseEvent.create({
        data: {
          subscriptionId: sub.id,
          eventType: 'renewed',
          payload: {
            licenseKeyId: licenseKeyRow.id,
            newPeriodEnd: newPeriodEnd.toISOString(),
          } as unknown as object,
        },
      });
      await this.featureCache.invalidate(sub.companyId);
    }

    const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const activationExpiry =
      thirtyDays.getTime() < newPeriodEnd.getTime() ? thirtyDays : newPeriodEnd;

    const activationToken = this.signer.buildAndSign({
      companyId: payload.companyId,
      planCode: payload.planCode,
      subscriptionId: payload.subscriptionId,
      licenseKeyId: licenseKeyRow.id,
      validFrom: now,
      validUntil: activationExpiry,
      maxDevices: payload.maxDevices,
      features: payload.features,
      typ: 'activation',
      fingerprintHash: body.fingerprint,
    });

    return {
      activationToken,
      payload: this.signer.verifyLicense(activationToken),
      expiresAt: activationExpiry.toISOString(),
    };
  }

  /**
   * Revoke a license. Marks the LicenseKey row as revoked and
   * cascades a soft-revoke to every bound HardwareFingerprint so any
   * device attempting renewal will fail.
   */
  @Post('revoke')
  @RequirePermission('License', 'admin')
  @HttpCode(HttpStatus.OK)
  async revoke(
    @Body(new ZodValidationPipe(revokeLicenseSchema)) body: RevokeLicenseInput,
    @CurrentUser() session: UserSession,
  ): Promise<{ revoked: true; revokedDevices: number }> {
    const licenseKeyRow = await this.prisma.licenseKey.findUnique({
      where: { id: body.licenseKeyId },
      include: { subscription: true },
    });
    if (!licenseKeyRow) {
      throw new NotFoundException({
        code: 'LICENSE_KEY_NOT_FOUND',
        messageAr: 'مفتاح الترخيص غير موجود',
      });
    }

    const reason = body.reason ?? 'manual_revoke';
    const now = new Date();

    const result = await this.prisma.$transaction(async (tx) => {
      // Soft-revoke the license key (idempotent).
      if (!licenseKeyRow.revokedAt) {
        await tx.licenseKey.update({
          where: { id: licenseKeyRow.id },
          data: { revokedAt: now, revokedReason: reason },
        });
      }
      // Soft-revoke every still-active fingerprint.
      const fpUpdate = await tx.hardwareFingerprint.updateMany({
        where: { licenseKeyId: licenseKeyRow.id, revokedAt: null },
        data: {
          isActive: false,
          revokedAt: now,
          revokedReason: 'license_revoked',
        },
      });
      await tx.licenseEvent.create({
        data: {
          subscriptionId: licenseKeyRow.subscriptionId,
          eventType: 'cancelled',
          payload: {
            licenseKeyId: licenseKeyRow.id,
            reason,
            revokedDevices: fpUpdate.count,
          } as unknown as object,
          createdBy: session.userId,
        },
      });
      return fpUpdate.count;
    });

    await this.featureCache.invalidate(licenseKeyRow.subscription.companyId);

    return { revoked: true, revokedDevices: result };
  }

  /**
   * Public RSA-2048 PEM. Cacheable for 24h. Tauri Desktop / POS / Web
   * clients fetch this once and bundle it locally so they can verify
   * licenses with zero network when offline.
   */
  @Get('public-key')
  @Public()
  @Header('Cache-Control', 'public, max-age=86400, immutable')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  getPublicKey(): string {
    return this.signer.getPublicKeyPem();
  }
}
