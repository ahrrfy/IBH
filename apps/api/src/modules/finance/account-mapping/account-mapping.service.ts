import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../platform/prisma/prisma.service';

/**
 * T48 — Financial Accounts Configurator
 *
 * Resolves the GL account code for a given business event (e.g. `sale.cash`,
 * `sale.credit`, `inventory.in`) from the `account_mappings` table, with a
 * 5-minute in-memory cache per (companyId, eventType).
 *
 * Posting services should use {@link getAccountForEvent} with a string
 * fallback literal so that production accounting never breaks if a mapping
 * row is missing — the literal is the legacy behavior.
 *
 * Standard event types (kept stable across versions):
 *   sale.cash         — Cash debit on cash sale
 *   sale.credit       — AR debit on credit sale
 *   sale.revenue.cash — Cash revenue credit
 *   sale.revenue.cr   — Credit revenue credit
 *   sale.cogs         — COGS debit
 *   sale.inventory    — Inventory credit on sale
 *   sale.return.cogs  — COGS credit on return
 *   purchase.ap       — AP credit on vendor invoice
 *   purchase.inventory— Inventory debit on GRN
 *   purchase.vat.in   — Input VAT debit
 *   purchase.freight  — Freight expense debit
 *   payroll.gross     — Gross salary expense
 *   payroll.tax       — Income tax payable
 *   payroll.ss        — Social security payable
 *   payroll.net       — Net cash payable
 *   asset.cash        — Cash credit on asset purchase (cash funding)
 *   asset.ap          — AP credit on asset purchase (credit funding)
 *   asset.maintenance — Maintenance expense
 *   asset.gain        — Misc income on asset disposal
 *   bank.charge       — Bank charges expense
 *   bank.interest     — Misc income (bank interest)
 *   ar.control        — AR control account for receipts
 */

interface CacheEntry {
  code: string | null;
  expiresAt: number;
}

@Injectable()
export class AccountMappingService {
  private readonly logger = new Logger(AccountMappingService.name);
  private readonly cache = new Map<string, CacheEntry>();
  private readonly TTL_MS = 5 * 60 * 1000; // 5 minutes

  constructor(private readonly prisma: PrismaService) {}

  private cacheKey(companyId: string, eventType: string): string {
    return `${companyId}::${eventType}`;
  }

  /**
   * Returns the configured account code for a given (company, eventType),
   * or `null` if not configured. Uses a 5min cache.
   *
   * Callers should pattern-match: `code ?? FALLBACK_LITERAL` to keep
   * existing accounting behavior when a mapping is missing.
   */
  async getAccountForEvent(companyId: string, eventType: string): Promise<string | null> {
    const key = this.cacheKey(companyId, eventType);
    const now = Date.now();
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > now) {
      return cached.code;
    }

    const row = await this.prisma.accountMapping.findUnique({
      where: { companyId_eventType: { companyId, eventType } },
      select: { accountCode: true },
    });

    const code = row?.accountCode ?? null;
    this.cache.set(key, { code, expiresAt: now + this.TTL_MS });
    return code;
  }

  /** Bust the cache for a single (company, eventType) — used after writes. */
  private invalidate(companyId: string, eventType: string): void {
    this.cache.delete(this.cacheKey(companyId, eventType));
  }

  /** List all mappings for a company. */
  async list(companyId: string) {
    return this.prisma.accountMapping.findMany({
      where: { companyId },
      orderBy: { eventType: 'asc' },
    });
  }

  /** Get a single mapping or 404. */
  async get(companyId: string, eventType: string) {
    const row = await this.prisma.accountMapping.findUnique({
      where: { companyId_eventType: { companyId, eventType } },
    });
    if (!row) {
      throw new NotFoundException({
        code: 'ACCOUNT_MAPPING_NOT_FOUND',
        messageAr: `لا يوجد ربط حساب للحدث "${eventType}"`,
      });
    }
    return row;
  }

  /**
   * Upsert a mapping after validating that `accountCode` exists in the
   * company's chart of accounts.
   */
  async upsert(
    companyId: string,
    eventType: string,
    accountCode: string,
    description?: string,
  ) {
    if (!eventType || !/^[a-z][a-z0-9._-]{1,79}$/i.test(eventType)) {
      throw new BadRequestException({
        code: 'INVALID_EVENT_TYPE',
        messageAr: 'نوع الحدث غير صالح',
      });
    }
    const acc = await this.prisma.chartOfAccount.findFirst({
      where: { companyId, code: accountCode, isActive: true },
      select: { id: true, allowDirectPosting: true },
    });
    if (!acc) {
      throw new BadRequestException({
        code: 'ACCOUNT_NOT_FOUND',
        messageAr: `الحساب ${accountCode} غير موجود أو غير مفعّل`,
      });
    }
    if (!acc.allowDirectPosting) {
      throw new BadRequestException({
        code: 'ACCOUNT_NOT_POSTABLE',
        messageAr: `الحساب ${accountCode} لا يسمح بالترحيل المباشر`,
      });
    }

    const row = await this.prisma.accountMapping.upsert({
      where: { companyId_eventType: { companyId, eventType } },
      create: { companyId, eventType, accountCode, description },
      update: { accountCode, description },
    });
    this.invalidate(companyId, eventType);
    this.logger.log(`Account mapping upserted: ${eventType} → ${accountCode}`);
    return row;
  }
}
