import { Injectable, NotFoundException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../platform/prisma/prisma.service';
import { AuditService } from '../../engines/audit/audit.service';
import * as crypto from 'crypto';
import type { UserSession } from '@erp/shared-types';

type LicensePlan = 'trial' | 'starter' | 'business' | 'enterprise';

const GRACE_DAYS = 30;

@Injectable()
export class LicensingService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private config: ConfigService,
  ) {}

  private getSigningKey(): { type: 'rsa' | 'hmac'; key: string } {
    const rsaPrivate = this.config.get<string>('LICENSE_RSA_PRIVATE_KEY');
    if (rsaPrivate) return { type: 'rsa', key: rsaPrivate };
    const hmacKey = this.config.get<string>('ENCRYPTION_KEY') ?? 'al-ruya-default-key';
    return { type: 'hmac', key: hmacKey };
  }

  private getVerifyKey(): { type: 'rsa' | 'hmac'; key: string } {
    const rsaPublic = this.config.get<string>('LICENSE_RSA_PUBLIC_KEY');
    if (rsaPublic) return { type: 'rsa', key: rsaPublic };
    const hmacKey = this.config.get<string>('ENCRYPTION_KEY') ?? 'al-ruya-default-key';
    return { type: 'hmac', key: hmacKey };
  }

  private signPayload(payload: object): string {
    const payloadStr = JSON.stringify(payload);
    const { type, key } = this.getSigningKey();
    if (type === 'rsa') {
      const signer = crypto.createSign('RSA-SHA256');
      signer.update(payloadStr);
      return signer.sign(key, 'hex');
    }
    return crypto.createHmac('sha256', key).update(payloadStr).digest('hex');
  }

  private verifyPayload(payload: object, signature: string): boolean {
    const payloadStr = JSON.stringify(payload);
    const { type, key } = this.getVerifyKey();
    if (type === 'rsa') {
      const verifier = crypto.createVerify('RSA-SHA256');
      verifier.update(payloadStr);
      try {
        return verifier.verify(key, signature, 'hex');
      } catch {
        return false;
      }
    }
    const expected = crypto.createHmac('sha256', key).update(payloadStr).digest('hex');
    try {
      return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'));
    } catch {
      return false;
    }
  }

  async issueLicense(
    dto: {
      clientName: string;
      clientContactEmail?: string;
      plan: LicensePlan;
      expiresAt: Date | string;
      maxCompanies?: number;
      maxBranches?: number;
      maxUsers?: number;
      enabledModules: string[];
    },
    session: UserSession,
  ) {
    if (!dto.clientName) throw new BadRequestException({ code: 'CLIENT_NAME_REQUIRED', messageAr: 'اسم العميل مطلوب' });
    if (!dto.plan) throw new BadRequestException({ code: 'PLAN_REQUIRED', messageAr: 'الباقة مطلوبة' });

    const licenseKey = crypto.randomBytes(32).toString('hex');
    const issuedAt = new Date();
    const expiresAt = new Date(dto.expiresAt);

    const payload = {
      licenseKey,
      clientName: dto.clientName,
      plan: dto.plan,
      expiresAt: expiresAt.toISOString(),
      limits: {
        maxCompanies: dto.maxCompanies ?? 1,
        maxBranches: dto.maxBranches ?? 1,
        maxUsers: dto.maxUsers ?? 5,
      },
      modules: dto.enabledModules,
      iat: issuedAt.toISOString(),
    };

    const signature = this.signPayload(payload);

    const license = await this.prisma.license.create({
      data: {
        licenseKey,
        createdBy:  session.userId,
        clientName: dto.clientName,
        clientContactEmail: dto.clientContactEmail,
        plan: dto.plan as any,
        issuedAt,
        expiresAt,
        maxCompanies: dto.maxCompanies ?? 1,
        maxBranches: dto.maxBranches ?? 1,
        maxUsers: dto.maxUsers ?? 5,
        enabledModules: dto.enabledModules as any,
        isActive: true,
        signature,
      },
    });

    await this.audit.log({
      companyId: session.companyId,
      userId: session.userId,
      action: 'LICENSE_ISSUED',
      entityType: 'License',
      entityId: license.id,
      metadata: { clientName: dto.clientName, plan: dto.plan },
    });

    return { licenseKey, signature, payload };
  }

  async activateLicense(licenseKey: string, hardwareFingerprint: string) {
    const license = await this.prisma.license.findUnique({ where: { licenseKey } });
    if (!license) throw new NotFoundException({ code: 'LICENSE_NOT_FOUND', messageAr: 'الترخيص غير موجود' });
    if (license.revokedAt) throw new UnauthorizedException({ code: 'LICENSE_REVOKED', messageAr: 'الترخيص ملغى' });
    if (license.expiresAt < new Date()) throw new UnauthorizedException({ code: 'LICENSE_EXPIRED', messageAr: 'الترخيص منتهي' });

    if (license.activatedAt && license.hardwareFingerprint && license.hardwareFingerprint !== hardwareFingerprint) {
      const allowReset = this.config.get<string>('ALLOW_FINGERPRINT_RESET') === 'true';
      if (!allowReset) {
        throw new UnauthorizedException({ code: 'FINGERPRINT_MISMATCH', messageAr: 'بصمة الجهاز لا تتطابق' });
      }
    }

    const updated = await this.prisma.license.update({
      where: { licenseKey },
      data: {
        activatedAt: license.activatedAt ?? new Date(),
        hardwareFingerprint,
        lastHeartbeatAt: new Date(),
      },
    });

    return {
      licenseKey: updated.licenseKey,
      clientName: updated.clientName,
      plan: updated.plan,
      expiresAt: updated.expiresAt.toISOString(),
      limits: {
        maxCompanies: updated.maxCompanies,
        maxBranches: updated.maxBranches,
        maxUsers: updated.maxUsers,
      },
      modules: updated.enabledModules,
      activatedAt: updated.activatedAt?.toISOString(),
    };
  }

  async heartbeat(licenseKey: string, hardwareFingerprint: string) {
    const license = await this.prisma.license.findUnique({ where: { licenseKey } });
    if (!license) throw new NotFoundException({ code: 'LICENSE_NOT_FOUND', messageAr: 'الترخيص غير موجود' });
    if (license.revokedAt) return { valid: false, reason: 'revoked' };
    if (license.hardwareFingerprint && license.hardwareFingerprint !== hardwareFingerprint) {
      return { valid: false, reason: 'fingerprint_mismatch' };
    }

    const now = new Date();
    const msPerDay = 1000 * 60 * 60 * 24;
    const expiresIn = Math.floor((license.expiresAt.getTime() - now.getTime()) / msPerDay);

    if (license.expiresAt < now) {
      const msPastExpiry = now.getTime() - license.expiresAt.getTime();
      const daysPast = Math.floor(msPastExpiry / msPerDay);
      const graceRemaining = GRACE_DAYS - daysPast;
      if (graceRemaining > 0) {
        await this.prisma.license.update({ where: { licenseKey }, data: { lastHeartbeatAt: now } });
        return { valid: true, expiresIn, graceRemaining, inGrace: true };
      }
      return { valid: false, reason: 'expired', graceRemaining: 0 };
    }

    await this.prisma.license.update({ where: { licenseKey }, data: { lastHeartbeatAt: now } });
    return { valid: true, expiresIn };
  }

  async revoke(licenseId: string, reason: string, session: UserSession) {
    const license = await this.prisma.license.findUnique({ where: { id: licenseId } });
    if (!license) throw new NotFoundException({ code: 'LICENSE_NOT_FOUND', messageAr: 'الترخيص غير موجود' });
    const updated = await this.prisma.license.update({
      where: { id: licenseId },
      data: { isActive: false, revokedAt: new Date(), revokedReason: reason },
    });
    await this.audit.log({
      companyId: session.companyId,
      userId: session.userId,
      action: 'LICENSE_REVOKED',
      entityType: 'License',
      entityId: licenseId,
      metadata: { reason },
    });
    return updated;
  }

  async listLicenses(params: { active?: boolean; plan?: LicensePlan }) {
    return this.prisma.license.findMany({
      where: {
        ...(params.active !== undefined && { isActive: params.active }),
        ...(params.plan && { plan: params.plan as any }),
      },
      orderBy: { issuedAt: 'desc' },
    });
  }

  async licensesExpiringSoon(days: number = 30) {
    const now = new Date();
    const cutoff = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    return this.prisma.license.findMany({
      where: {
        isActive: true,
        revokedAt: null,
        expiresAt: { gte: now, lte: cutoff },
      },
      orderBy: { expiresAt: 'asc' },
    });
  }

  async verifySignature(licenseKey: string, signature: string) {
    const license = await this.prisma.license.findUnique({ where: { licenseKey } });
    if (!license) return { valid: false, reason: 'not_found' };
    const payload = {
      licenseKey: license.licenseKey,
      clientName: license.clientName,
      plan: license.plan,
      expiresAt: license.expiresAt.toISOString(),
      limits: {
        maxCompanies: license.maxCompanies,
        maxBranches: license.maxBranches,
        maxUsers: license.maxUsers,
      },
      modules: license.enabledModules,
      iat: license.issuedAt.toISOString(),
    };
    return { valid: this.verifyPayload(payload, signature) };
  }
}
