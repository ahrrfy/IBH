import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { IntegrationType, Prisma } from '@prisma/client';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { EncryptionService } from '../../../platform/encryption/encryption.service';
import { AuditService } from '../../../engines/audit/audit.service';
import {
  WhatsAppConfig,
  WhatsAppConfigPublicView,
  WhatsAppConfigSchema,
} from './dto/whatsapp-config.dto';

/**
 * Per-company integration management. Each tenant configures their own
 * 3rd-party service credentials (WhatsApp, SMTP, SMS providers, etc.).
 *
 * All credentials are encrypted at rest via {@link EncryptionService}
 * (AES-256-GCM). Plaintext values are never persisted to the DB and
 * never returned in GET responses — only masked previews.
 *
 * RLS is enforced at the DB level via `current_company_id()` so even a
 * raw SQL bug cannot cross tenant boundaries.
 */
@Injectable()
export class IntegrationsService {
  private readonly logger = new Logger(IntegrationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly audit: AuditService,
  ) {}

  // ─── WhatsApp ───────────────────────────────────────────────────────────

  /** Returns a masked, public-safe view of the company's WhatsApp config. */
  async getWhatsAppConfig(companyId: string): Promise<WhatsAppConfigPublicView> {
    const row = await this.prisma.companyIntegration.findUnique({
      where: { companyId_type: { companyId, type: IntegrationType.whatsapp } },
    });
    if (!row) {
      return {
        isEnabled: false,
        tokenMasked: null,
        phoneNumberId: null,
        businessAccountId: null,
        apiVersion: null,
        lastTestedAt: null,
        lastTestStatus: null,
        lastTestError: null,
      };
    }
    let cfg: WhatsAppConfig | null = null;
    try {
      cfg = this.encryption.decryptJson<WhatsAppConfig>(row.configEncrypted);
    } catch (err) {
      this.logger.error(
        `Failed to decrypt WhatsApp config for company=${companyId}: ${(err as Error).message}`,
      );
    }
    const meta = (row.publicMetadata ?? {}) as Record<string, unknown>;
    return {
      isEnabled: row.isEnabled,
      tokenMasked: cfg?.token ? this.maskToken(cfg.token) : null,
      phoneNumberId: cfg?.phoneNumberId ?? null,
      businessAccountId: cfg?.businessAccountId ?? null,
      apiVersion: cfg?.apiVersion ?? null,
      lastTestedAt: (meta.lastTestedAt as string) ?? null,
      lastTestStatus: (meta.lastTestStatus as 'success' | 'failed') ?? null,
      lastTestError: (meta.lastTestError as string) ?? null,
    };
  }

  /**
   * Persist a new or updated WhatsApp config for the tenant. The config
   * is validated, then encrypted, then upserted. Audit-logged.
   */
  async setWhatsAppConfig(
    companyId: string,
    actorUserId: string,
    body: { isEnabled: boolean; config: WhatsAppConfig },
  ): Promise<WhatsAppConfigPublicView> {
    const parsed = WhatsAppConfigSchema.safeParse(body.config);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'INVALID_WHATSAPP_CONFIG',
        messageAr: 'بيانات WhatsApp غير صحيحة',
        details: parsed.error.issues,
      });
    }
    const ciphertext = this.encryption.encryptJson(parsed.data);
    await this.prisma.companyIntegration.upsert({
      where: { companyId_type: { companyId, type: IntegrationType.whatsapp } },
      create: {
        companyId,
        type: IntegrationType.whatsapp,
        isEnabled: body.isEnabled,
        configEncrypted: ciphertext,
        publicMetadata: {},
        lastModifiedBy: actorUserId,
      },
      update: {
        isEnabled: body.isEnabled,
        configEncrypted: ciphertext,
        lastModifiedAt: new Date(),
        lastModifiedBy: actorUserId,
      },
    });
    await this.audit.log({
      companyId,
      userId: actorUserId,
      action: 'INTEGRATION_UPDATED',
      entityType: 'CompanyIntegration',
      entityId: `${companyId}:whatsapp`,
      metadata: {
        type: 'whatsapp',
        isEnabled: body.isEnabled,
        // Never log the token itself; just the fact that it changed.
        credentialsRotated: true,
      },
    });
    return this.getWhatsAppConfig(companyId);
  }

  /**
   * Test the saved WhatsApp config by hitting Meta's token-info endpoint.
   * Updates publicMetadata with the result so the UI can show a status badge.
   */
  async testWhatsAppConnection(companyId: string): Promise<{ success: boolean; error?: string }> {
    const row = await this.prisma.companyIntegration.findUnique({
      where: { companyId_type: { companyId, type: IntegrationType.whatsapp } },
    });
    if (!row) {
      throw new NotFoundException({
        code: 'INTEGRATION_NOT_CONFIGURED',
        messageAr: 'WhatsApp غير مهيأ لهذه الشركة',
      });
    }
    let cfg: WhatsAppConfig;
    try {
      cfg = this.encryption.decryptJson<WhatsAppConfig>(row.configEncrypted);
    } catch {
      throw new BadRequestException({
        code: 'INTEGRATION_DECRYPT_FAILED',
        messageAr: 'تعذّر فك تشفير الإعدادات',
      });
    }
    const apiVersion = cfg.apiVersion ?? 'v22.0';
    const url = `https://graph.facebook.com/${apiVersion}/${cfg.phoneNumberId}`;
    let success = false;
    let error: string | undefined;
    try {
      const resp = await fetch(url, {
        headers: { Authorization: `Bearer ${cfg.token}` },
      });
      if (!resp.ok) {
        error = `HTTP ${resp.status}: ${resp.statusText}`;
      } else {
        success = true;
      }
    } catch (err) {
      error = (err as Error).message;
    }

    const newMeta = {
      ...((row.publicMetadata ?? {}) as Record<string, unknown>),
      lastTestedAt: new Date().toISOString(),
      lastTestStatus: success ? 'success' : 'failed',
      lastTestError: error ?? null,
    };
    await this.prisma.companyIntegration.update({
      where: { id: row.id },
      data: { publicMetadata: newMeta as Prisma.InputJsonValue },
    });
    return { success, ...(error ? { error } : {}) };
  }

  /**
   * Internal: read the decrypted WhatsApp config for sending messages.
   * Used by whatsapp-bridge / notification dispatch — NOT exposed via HTTP.
   * Returns null if not configured or disabled.
   */
  async getWhatsAppConfigInternal(companyId: string): Promise<WhatsAppConfig | null> {
    const row = await this.prisma.companyIntegration.findUnique({
      where: { companyId_type: { companyId, type: IntegrationType.whatsapp } },
    });
    if (!row || !row.isEnabled) return null;
    try {
      return this.encryption.decryptJson<WhatsAppConfig>(row.configEncrypted);
    } catch (err) {
      this.logger.error(
        `Failed to decrypt WhatsApp config for company=${companyId}: ${(err as Error).message}`,
      );
      return null;
    }
  }

  // ─── helpers ────────────────────────────────────────────────────────────

  private maskToken(token: string): string {
    if (token.length <= 4) return '****';
    return `****${token.slice(-4)}`;
  }
}
