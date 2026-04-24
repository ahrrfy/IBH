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
// Multiple price lists per company (Retail, Wholesale, Online, VIP...).
//
// F2 rules:
//   - Prices are time-stamped; historical entries are NEVER modified.
//   - A new price supersedes the previous by setting effectiveTo on the old row.
//   - POS + Storefront always read the currently active entry at `asOf`.
//   - Bulk import supported for thousands of SKUs at once.

@Injectable()
export class PriceListsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ─── Price Lists ──────────────────────────────────────────────────────────

  async findAll(companyId: string) {
    return this.prisma.priceList.findMany({
      where:  { companyId, isActive: true },
      include: { _count: { select: { items: true } } },
      orderBy: { nameAr: 'asc' },
    });
  }

  async findOne(id: string, companyId: string) {
    const list = await this.prisma.priceList.findFirst({
      where: { id, companyId, isActive: true },
    });
    if (!list) {
      throw new NotFoundException({ code: 'NOT_FOUND', messageAr: 'قائمة الأسعار غير موجودة' });
    }
    return list;
  }

  async create(
    companyId: string,
    dto: {
      nameAr:   string;
      type?:    'retail' | 'wholesale' | 'online' | string;
      currency?: string;
      isDefault?: boolean;
    },
    session: UserSession,
  ) {
    // If this is the new default, un-default the rest
    if (dto.isDefault) {
      await this.prisma.priceList.updateMany({
        where: { companyId },
        data:  { isDefault: false },
      });
    }

    const list = await this.prisma.priceList.create({
      data: {
        companyId,
        nameAr:     dto.nameAr,
        type:       dto.type ?? 'retail',
        currency:   dto.currency ?? 'IQD',
        isDefault:  dto.isDefault ?? false,
        createdBy:  session.userId,
      },
    });

    await this.audit.log({
      companyId,
      userId:     session.userId,
      userEmail:  session.userId,
      action:     'price_list.create',
      entityType: 'PriceList',
      entityId:   list.id,
      after:      { nameAr: dto.nameAr, type: list.type },
    });

    return list;
  }

  // ─── Price List Items ─────────────────────────────────────────────────────

  /**
   * List items active "now". We fetch variant + template metadata in a second
   * query because PriceListItem has no `variant` relation defined.
   */
  async getItems(
    listId: string,
    companyId: string,
    params: { page?: number; limit?: number; search?: string } = {},
  ) {
    await this.findOne(listId, companyId);

    const { page = 1, limit = 50, search } = params;
    const now = new Date();

    // Variant ids matching the search (if provided)
    let variantIds: string[] | undefined;
    if (search) {
      const variants = await this.prisma.productVariant.findMany({
        where: {
          companyId,
          deletedAt: null,
          OR: [
            { sku: { contains: search, mode: Prisma.QueryMode.insensitive } },
            { template: { nameAr: { contains: search } } },
          ],
        },
        select: { id: true },
        take: 5000,
      });
      variantIds = variants.map((v) => v.id);
      if (variantIds.length === 0) {
        return { items: [], total: 0, page, limit, pages: 0 };
      }
    }

    const where: Prisma.PriceListItemWhereInput = {
      priceListId:   listId,
      effectiveFrom: { lte: now },
      OR: [
        { effectiveTo: null },
        { effectiveTo: { gte: now } },
      ],
      ...(variantIds ? { variantId: { in: variantIds } } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.priceListItem.findMany({
        where,
        orderBy: [{ effectiveFrom: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.priceListItem.count({ where }),
    ]);

    // Enrich with variant + template metadata
    if (items.length === 0) {
      return { items: [], total, page, limit, pages: Math.ceil(total / limit) };
    }

    const variants = await this.prisma.productVariant.findMany({
      where:  { id: { in: items.map((i) => i.variantId) } },
      select: {
        id:              true,
        sku:             true,
        attributeValues: true,
        template:        { select: { nameAr: true, sku: true } },
      },
    });
    const byId = new Map(variants.map((v) => [v.id, v]));

    return {
      items: items.map((i) => ({ ...i, variant: byId.get(i.variantId) ?? null })),
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }

  /**
   * Set price for a variant in a price list.
   * End-dates the current active entry for the same (priceListId, variantId).
   */
  async setPrice(
    listId: string,
    companyId: string,
    dto: {
      variantId:      string;
      priceIqd:       number;
      effectiveFrom?: Date;
      effectiveTo?:   Date;
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

    // End-date the current active entry for this variant in this list
    await this.prisma.priceListItem.updateMany({
      where: {
        priceListId:   listId,
        variantId:     dto.variantId,
        effectiveTo:   null,
        effectiveFrom: { lte: effectiveFrom },
      },
      data: {
        effectiveTo: effectiveFrom,
      },
    });

    const item = await this.prisma.priceListItem.create({
      data: {
        priceListId:  listId,
        variantId:    dto.variantId,
        priceIqd:     new Prisma.Decimal(dto.priceIqd),
        effectiveFrom,
        effectiveTo:  dto.effectiveTo ?? null,
        createdBy:    session.userId,
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
   * Bulk upsert prices from import (Excel / CSV).
   * Each entry: { variantId | sku, priceIqd, effectiveFrom? }
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
        let variantId = entry.variantId;

        if (!variantId && entry.sku) {
          const variant = await this.prisma.productVariant.findFirst({
            where:  { sku: entry.sku.toUpperCase(), companyId, deletedAt: null },
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

        await this.setPrice(
          listId,
          companyId,
          {
            variantId,
            priceIqd:      entry.priceIqd,
            effectiveFrom: entry.effectiveFrom,
          },
          session,
        );
        results.success++;
      } catch (err) {
        results.failed++;
        results.errors.push((err as Error).message);
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
    asOf: Date = new Date(),
  ): Promise<number | null> {
    const item = await this.prisma.priceListItem.findFirst({
      where: {
        priceListId:   listId,
        variantId,
        effectiveFrom: { lte: asOf },
        OR: [
          { effectiveTo: null },
          { effectiveTo: { gte: asOf } },
        ],
      },
      orderBy: [
        { effectiveFrom: 'desc' },   // most recent first
      ],
    });

    return item ? Number(item.priceIqd) : null;
  }

  /**
   * Get the default price list for a company.
   * Falls back to the first price list if no default is set.
   */
  async getDefaultListId(companyId: string): Promise<string | null> {
    const def =
      (await this.prisma.priceList.findFirst({
        where:  { companyId, isDefault: true, isActive: true },
        select: { id: true },
      })) ??
      (await this.prisma.priceList.findFirst({
        where:  { companyId, isActive: true },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
      }));

    return def?.id ?? null;
  }
}
