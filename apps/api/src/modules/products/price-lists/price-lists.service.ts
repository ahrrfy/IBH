import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AuditService } from '../../../engines/audit/audit.service';
import type { UserSession } from '@erp/shared-types';
import { Prisma } from '@prisma/client';

// ─── Price Lists Service ───────────────────────────────────────────────────────
// Manages temporal price lists — each item has effectiveFrom + effectiveTo.
// Multiple price lists can exist (Retail, Wholesale, Online, VIP).
//
// Key rules (F2-aligned):
//   - Prices are time-stamped: historical prices are NEVER modified
//   - A new price entry supersedes the previous (end-dates it automatically)
//   - POS and Storefront always read the currently active price list item
//   - Bulk import supported for thousands of SKUs at once

@Injectable()
export class PriceListsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ─── Price Lists ──────────────────────────────────────────────────────────

  async findAll(companyId: string) {
    return this.prisma.priceList.findMany({
      where: { companyId, deletedAt: null },
      include: { _count: { select: { items: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string, companyId: string) {
    const list = await this.prisma.priceList.findFirst({
      where: { id, companyId, deletedAt: null },
    });

    if (!list) {
      throw new NotFoundException({ code: 'NOT_FOUND', messageAr: 'قائمة الأسعار غير موجودة' });
    }

    return list;
  }

  async create(
    companyId: string,
    dto: {
      name: string;
      description?: string;
      currency?: string;
      isDefault?: boolean;
    },
    session: UserSession,
  ) {
    // If this is the new default, un-default the rest
    if (dto.isDefault) {
      await this.prisma.priceList.updateMany({
        where: { companyId },
        data: { isDefault: false },
      });
    }

    return this.prisma.priceList.create({
      data: {
        name:        dto.name,
        description: dto.description,
        currency:    dto.currency ?? 'IQD',
        isDefault:   dto.isDefault ?? false,
        companyId,
        createdBy:   session.userId,
      },
    });
  }

  // ─── Price List Items ─────────────────────────────────────────────────────

  async getItems(
    listId: string,
    companyId: string,
    params: { page?: number; limit?: number; search?: string } = {},
  ) {
    await this.findOne(listId, companyId);

    const { page = 1, limit = 50, search } = params;
    const now = new Date();

    const where: Prisma.PriceListItemWhereInput = {
      priceListId:   listId,
      effectiveFrom: { lte: now },
      OR: [
        { effectiveTo: null },
        { effectiveTo: { gte: now } },
      ],
      ...(search ? {
        variant: {
          OR: [
            { sku: { contains: search, mode: 'insensitive' } },
            { template: { nameAr: { contains: search } } },
          ],
        },
      } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.priceListItem.findMany({
        where,
        include: {
          variant: {
            select: {
              id: true, sku: true, nameAr: true, attributeValues: true,
              template: { select: { nameAr: true, code: true } },
            },
          },
        },
        orderBy: { variant: { sku: 'asc' } },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.priceListItem.count({ where }),
    ]);

    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  }

  /**
   * Set price for a variant in a price list.
   * Automatically end-dates the previous active entry for the same variant.
   */
  async setPrice(
    listId: string,
    companyId: string,
    dto: {
      variantId:     string;
      priceIqd:      number;
      effectiveFrom?: Date;
      effectiveTo?:   Date;
      minQty?:        number;
    },
    session: UserSession,
  ) {
    await this.findOne(listId, companyId);

    const effectiveFrom = dto.effectiveFrom ?? new Date();

    if (dto.effectiveTo && dto.effectiveTo <= effectiveFrom) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        messageAr: 'تاريخ الانتهاء يجب أن يكون بعد تاريخ البدء',
      });
    }

    // End-date the current active entry for this variant
    await this.prisma.priceListItem.updateMany({
      where: {
        priceListId: listId,
        variantId:   dto.variantId,
        effectiveTo: null,
        effectiveFrom: { lte: effectiveFrom },
      },
      data: {
        effectiveTo: effectiveFrom,
      },
    });

    const item = await this.prisma.priceListItem.create({
      data: {
        priceListId:   listId,
        variantId:     dto.variantId,
        priceIqd:      new Prisma.Decimal(dto.priceIqd),
        effectiveFrom,
        effectiveTo:   dto.effectiveTo ?? null,
        minQty:        dto.minQty ?? 1,
        createdBy:     session.userId,
      },
    });

    await this.audit.log({
      companyId,
      userId:     session.userId,
      userEmail:  session.userId,
      action:     'price_list.set_price',
      entityType: 'PriceListItem',
      entityId:   item.id,
      after:      { priceIqd: dto.priceIqd, variantId: dto.variantId, effectiveFrom },
    });

    return item;
  }

  /**
   * Bulk upsert prices from import (Excel upload, etc).
   * Each entry: { variantId or sku, priceIqd, effectiveFrom? }
   */
  async bulkSetPrices(
    listId: string,
    companyId: string,
    entries: Array<{ variantId?: string; sku?: string; priceIqd: number; effectiveFrom?: Date }>,
    session: UserSession,
  ) {
    await this.findOne(listId, companyId);

    const results = { success: 0, failed: 0, errors: [] as string[] };

    for (const entry of entries) {
      try {
        // Resolve variantId from SKU if needed
        let variantId = entry.variantId;

        if (!variantId && entry.sku) {
          const variant = await this.prisma.productVariant.findFirst({
            where: { sku: entry.sku.toUpperCase(), companyId, deletedAt: null },
            select: { id: true },
          });

          if (!variant) {
            results.failed++;
            results.errors.push(`SKU not found: ${entry.sku}`);
            continue;
          }

          variantId = variant.id;
        }

        if (!variantId) {
          results.failed++;
          results.errors.push('Missing variantId and sku');
          continue;
        }

        await this.setPrice(listId, companyId, { variantId, priceIqd: entry.priceIqd, effectiveFrom: entry.effectiveFrom }, session);
        results.success++;
      } catch {
        results.failed++;
      }
    }

    return results;
  }

  /**
   * Get the current effective price for a variant from a specific price list.
   * Used by POS, Storefront, and Invoice creation.
   */
  async getCurrentPrice(
    listId: string,
    variantId: string,
    qty: number = 1,
    asOf: Date = new Date(),
  ): Promise<number | null> {
    const item = await this.prisma.priceListItem.findFirst({
      where: {
        priceListId:   listId,
        variantId,
        minQty:        { lte: qty },
        effectiveFrom: { lte: asOf },
        OR: [
          { effectiveTo: null },
          { effectiveTo: { gte: asOf } },
        ],
      },
      orderBy: [
        { minQty: 'desc' },         // higher quantity tier first
        { effectiveFrom: 'desc' },  // most recent first
      ],
    });

    return item ? Number(item.priceIqd) : null;
  }

  /**
   * Get the default price list for a company.
   * Falls back to the first price list if no default is set.
   */
  async getDefaultListId(companyId: string): Promise<string | null> {
    const list = await this.prisma.priceList.findFirst({
      where:   { companyId, isDefault: true, deletedAt: null },
      select:  { id: true },
    }) ?? await this.prisma.priceList.findFirst({
      where:  { companyId, deletedAt: null },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });

    return list?.id ?? null;
  }
}
