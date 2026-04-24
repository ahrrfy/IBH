import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AuditService } from '../../../engines/audit/audit.service';
import { SequenceService } from '../../../engines/sequence/sequence.service';
import { Prisma } from '@prisma/client';
import type { UserSession } from '@erp/shared-types';

export interface FindSuppliersQuery {
  page?: number;
  limit?: number;
  search?: string;
  type?: string;
  isActive?: boolean;
}

export interface CreateSupplierDto {
  code?: string;
  type: string;
  nameAr: string;
  contactPerson?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  address?: string;
  city?: string;
  country?: string;
  taxNumber?: string;
  currency?: string;
  paymentTermsDays?: number;
  creditLimitIqd?: number | string;
  rating?: number;
}

export interface SetSupplierPriceDto {
  supplierId: string;
  variantId: string;
  priceIqd: number | string;
  currency?: string;
  priceOriginal?: number | string;
  minQty?: number;
  leadTimeDays?: number;
  effectiveFrom?: Date;
  effectiveTo?: Date | null;
  isPreferred?: boolean;
}

@Injectable()
export class SuppliersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sequence: SequenceService,
  ) {}

  async findAll(companyId: string, query: FindSuppliersQuery = {}) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? query.limit : 25;
    const skip = (page - 1) * limit;

    const where: Prisma.SupplierWhereInput = {
      companyId,
      deletedAt: null,
    };

    if (query.search) {
      where.OR = [
        { nameAr: { contains: query.search, mode: 'insensitive' } },
        { code: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search } },
        { taxNumber: { contains: query.search } },
      ];
    }
    if (query.type) {
      (where as any).type = query.type;
    }
    if (typeof query.isActive === 'boolean') {
      where.isActive = query.isActive;
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.supplier.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.supplier.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async findOne(id: string, companyId: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, companyId, deletedAt: null },
    });
    if (!supplier) {
      throw new NotFoundException({
        code: 'SUPPLIER_NOT_FOUND',
        messageAr: 'المورّد غير موجود',
      });
    }
    return supplier;
  }

  async create(companyId: string, dto: CreateSupplierDto, session: UserSession) {
    const code =
      dto.code ||
      (await this.sequence.nextNumber({ companyId, sequenceCode: 'SUPPLIER' } as any));

    const existing = await this.prisma.supplier.findFirst({
      where: { companyId, code, deletedAt: null },
    });
    if (existing) {
      throw new ConflictException({
        code: 'SUPPLIER_CODE_DUPLICATE',
        messageAr: 'رمز المورّد مستخدم مسبقاً',
      });
    }

    const supplier = await this.prisma.supplier.create({
      data: {
        companyId,
        code,
        type: dto.type as any,
        nameAr: dto.nameAr,
        contactPerson: dto.contactPerson,
        phone: dto.phone,
        whatsapp: dto.whatsapp,
        email: dto.email,
        address: dto.address,
        city: dto.city,
        country: dto.country || 'IQ',
        taxNumber: dto.taxNumber,
        currency: dto.currency || 'IQD',
        paymentTermsDays: dto.paymentTermsDays ?? 0,
        creditLimitIqd: new Prisma.Decimal(dto.creditLimitIqd ?? 0),
        balanceIqd: new Prisma.Decimal(0),
        rating: dto.rating ?? 0,
        onTimeDeliveryPct: new Prisma.Decimal(0),
        qualityScorePct: new Prisma.Decimal(0),
        isActive: true,
      },
    });

    await this.audit.log({
      companyId,
      userId: session.userId,
      userEmail: session.userId,
      action: 'purchase.supplier.create',
      entityType: 'Supplier',
      entityId: supplier.id,
      after: supplier,
    } as any);

    return supplier;
  }

  async update(
    id: string,
    companyId: string,
    dto: Partial<CreateSupplierDto>,
    session: UserSession,
  ) {
    const before = await this.findOne(id, companyId);
    const data: Prisma.SupplierUpdateInput = {};
    if (dto.nameAr !== undefined) data.nameAr = dto.nameAr;
    if (dto.contactPerson !== undefined) data.contactPerson = dto.contactPerson;
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.whatsapp !== undefined) data.whatsapp = dto.whatsapp;
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.address !== undefined) data.address = dto.address;
    if (dto.city !== undefined) data.city = dto.city;
    if (dto.country !== undefined) data.country = dto.country;
    if (dto.taxNumber !== undefined) data.taxNumber = dto.taxNumber;
    if (dto.currency !== undefined) data.currency = dto.currency;
    if (dto.paymentTermsDays !== undefined) data.paymentTermsDays = dto.paymentTermsDays;
    if (dto.creditLimitIqd !== undefined)
      data.creditLimitIqd = new Prisma.Decimal(dto.creditLimitIqd);
    if (dto.rating !== undefined) data.rating = dto.rating;
    if (dto.type !== undefined) (data as any).type = dto.type;

    const supplier = await this.prisma.supplier.update({
      where: { id },
      data,
    });

    await this.audit.log({
      companyId,
      userId: session.userId,
      userEmail: session.userId,
      action: 'purchase.supplier.update',
      entityType: 'Supplier',
      entityId: supplier.id,
      before,
      after: supplier,
    } as any);

    return supplier;
  }

  async softDelete(id: string, companyId: string, session: UserSession) {
    const supplier = await this.findOne(id, companyId);

    if (supplier.balanceIqd && new Prisma.Decimal(supplier.balanceIqd as any).gt(0)) {
      throw new BadRequestException({
        code: 'SUPPLIER_HAS_BALANCE',
        messageAr: 'لا يمكن حذف مورّد لديه رصيد مستحق',
      });
    }

    const activePOs = await this.prisma.purchaseOrder.count({
      where: {
        supplierId: id,
        companyId,
        status: { in: ['draft', 'submitted', 'approved', 'partially_received'] as any },
      },
    });
    if (activePOs > 0) {
      throw new BadRequestException({
        code: 'SUPPLIER_HAS_ACTIVE_PO',
        messageAr: 'لا يمكن حذف مورّد لديه أوامر شراء نشطة',
      });
    }

    const updated = await this.prisma.supplier.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });

    await this.audit.log({
      companyId,
      userId: session.userId,
      userEmail: session.userId,
      action: 'purchase.supplier.delete',
      entityType: 'Supplier',
      entityId: id,
      before: supplier,
      after: updated,
    } as any);

    return { success: true };
  }

  async getSupplierPrices(supplierId: string, companyId: string) {
    await this.findOne(supplierId, companyId);
    return this.prisma.supplierPrice.findMany({
      where: { supplierId },
      orderBy: [{ variantId: 'asc' }, { effectiveFrom: 'desc' }],
    });
  }

  async setSupplierPrice(
    companyId: string,
    dto: SetSupplierPriceDto,
    session: UserSession,
  ) {
    await this.findOne(dto.supplierId, companyId);

    const now = dto.effectiveFrom ?? new Date();

    return this.prisma.$transaction(async (tx) => {
      // end-date any active price for same (supplier, variant)
      await tx.supplierPrice.updateMany({
        where: {
          supplierId: dto.supplierId,
          variantId: dto.variantId,
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
        },
        data: { effectiveTo: now },
      });

      const created = await tx.supplierPrice.create({
        data: {
          supplierId: dto.supplierId,
          variantId: dto.variantId,
          priceIqd: new Prisma.Decimal(dto.priceIqd),
          currency: dto.currency || 'IQD',
          priceOriginal:
            dto.priceOriginal !== undefined
              ? new Prisma.Decimal(dto.priceOriginal)
              : new Prisma.Decimal(dto.priceIqd),
          minQty: dto.minQty ?? 1,
          leadTimeDays: dto.leadTimeDays ?? 0,
          effectiveFrom: now,
          effectiveTo: dto.effectiveTo ?? null,
          isPreferred: dto.isPreferred ?? false,
        },
      });

      await this.audit.log({
        companyId,
        userId: session.userId,
        userEmail: session.userId,
        action: 'purchase.supplier.price.set',
        entityType: 'SupplierPrice',
        entityId: created.id,
        after: created,
      } as any);

      return created;
    });
  }

  async comparePricesForVariant(variantId: string, companyId: string) {
    const now = new Date();
    const prices = await this.prisma.supplierPrice.findMany({
      where: {
        variantId,
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
        supplier: { companyId, deletedAt: null, isActive: true },
      },
      include: {
        supplier: {
          select: {
            id: true,
            code: true,
            nameAr: true,
            rating: true,
            onTimeDeliveryPct: true,
            qualityScorePct: true,
            paymentTermsDays: true,
          },
        },
      },
      orderBy: { priceIqd: 'asc' },
    });

    return {
      variantId,
      count: prices.length,
      rows: prices.map((p) => ({
        supplierId: p.supplierId,
        supplierCode: p.supplier.code,
        supplierName: p.supplier.nameAr,
        priceIqd: p.priceIqd,
        minQty: p.minQty,
        leadTimeDays: p.leadTimeDays,
        isPreferred: p.isPreferred,
        rating: p.supplier.rating,
        onTimeDeliveryPct: p.supplier.onTimeDeliveryPct,
        qualityScorePct: p.supplier.qualityScorePct,
        paymentTermsDays: p.supplier.paymentTermsDays,
      })),
    };
  }

  async getApAgingReport(companyId: string) {
    const now = new Date();
    const invoices = await this.prisma.vendorInvoice.findMany({
      where: {
        companyId,
        status: { in: ['posted', 'partially_paid'] as any },
        balanceIqd: { gt: 0 },
      },
      include: {
        supplier: { select: { id: true, code: true, nameAr: true } },
      },
    });

    const buckets = new Map<
      string,
      {
        supplierId: string;
        supplierCode: string;
        supplierName: string;
        current: Prisma.Decimal;
        d1_30: Prisma.Decimal;
        d31_60: Prisma.Decimal;
        d61_90: Prisma.Decimal;
        d91_plus: Prisma.Decimal;
        total: Prisma.Decimal;
      }
    >();

    for (const inv of invoices) {
      const key = inv.supplierId;
      if (!buckets.has(key)) {
        buckets.set(key, {
          supplierId: inv.supplierId,
          supplierCode: inv.supplier.code,
          supplierName: inv.supplier.nameAr,
          current: new Prisma.Decimal(0),
          d1_30: new Prisma.Decimal(0),
          d31_60: new Prisma.Decimal(0),
          d61_90: new Prisma.Decimal(0),
          d91_plus: new Prisma.Decimal(0),
          total: new Prisma.Decimal(0),
        });
      }
      const bucket = buckets.get(key)!;
      const due = inv.dueDate ?? inv.invoiceDate;
      const daysOverdue = Math.floor(
        (now.getTime() - new Date(due).getTime()) / (1000 * 60 * 60 * 24),
      );
      const bal = new Prisma.Decimal(inv.balanceIqd as any);
      if (daysOverdue <= 0) bucket.current = bucket.current.add(bal);
      else if (daysOverdue <= 30) bucket.d1_30 = bucket.d1_30.add(bal);
      else if (daysOverdue <= 60) bucket.d31_60 = bucket.d31_60.add(bal);
      else if (daysOverdue <= 90) bucket.d61_90 = bucket.d61_90.add(bal);
      else bucket.d91_plus = bucket.d91_plus.add(bal);
      bucket.total = bucket.total.add(bal);
    }

    const rows = Array.from(buckets.values());
    const totals = rows.reduce(
      (acc, r) => ({
        current: acc.current.add(r.current),
        d1_30: acc.d1_30.add(r.d1_30),
        d31_60: acc.d31_60.add(r.d31_60),
        d61_90: acc.d61_90.add(r.d61_90),
        d91_plus: acc.d91_plus.add(r.d91_plus),
        total: acc.total.add(r.total),
      }),
      {
        current: new Prisma.Decimal(0),
        d1_30: new Prisma.Decimal(0),
        d31_60: new Prisma.Decimal(0),
        d61_90: new Prisma.Decimal(0),
        d91_plus: new Prisma.Decimal(0),
        total: new Prisma.Decimal(0),
      },
    );

    return { rows, totals, generatedAt: now };
  }

  async scorecard(supplierId: string, companyId: string) {
    const supplier = await this.findOne(supplierId, companyId);
    const twelveMoAgo = new Date();
    twelveMoAgo.setMonth(twelveMoAgo.getMonth() - 12);

    const [poCount, poTotal, grns, invoiceAgg] = await this.prisma.$transaction([
      this.prisma.purchaseOrder.count({
        where: { supplierId, companyId, orderDate: { gte: twelveMoAgo } },
      }),
      this.prisma.purchaseOrder.aggregate({
        where: { supplierId, companyId, orderDate: { gte: twelveMoAgo } },
        _sum: { totalIqd: true },
      }),
      this.prisma.goodsReceiptNote.findMany({
        where: { supplierId, companyId, receiptDate: { gte: twelveMoAgo } },
        include: { purchaseOrder: { select: { expectedDate: true } } },
      }),
      this.prisma.vendorInvoice.aggregate({
        where: { supplierId, companyId, invoiceDate: { gte: twelveMoAgo } },
        _sum: { totalIqd: true, paidIqd: true },
        _count: true,
      }),
    ]);

    let onTime = 0;
    let totalGrns = grns.length;
    let totalReceived = new Prisma.Decimal(0);
    let totalRejected = new Prisma.Decimal(0);

    for (const g of grns) {
      const exp = g.purchaseOrder?.expectedDate;
      if (exp && new Date(g.receiptDate) <= new Date(exp)) onTime++;
      const lines = await this.prisma.gRNLine.findMany({ where: { grnId: g.id } });
      for (const l of lines) {
        totalReceived = totalReceived.add(new Prisma.Decimal(l.qtyReceived as any));
        totalRejected = totalRejected.add(new Prisma.Decimal(l.qtyRejected as any));
      }
    }

    const onTimePct = totalGrns > 0 ? (onTime / totalGrns) * 100 : 0;
    const qualityPct = totalReceived.gt(0)
      ? 100 -
        totalRejected
          .div(totalReceived)
          .mul(100)
          .toNumber()
      : 100;

    return {
      supplierId: supplier.id,
      supplierCode: supplier.code,
      supplierName: supplier.nameAr,
      rating: supplier.rating,
      last12Months: {
        poCount,
        poTotalIqd: poTotal._sum.totalIqd ?? new Prisma.Decimal(0),
        grnCount: totalGrns,
        onTimeDeliveryPct: onTimePct.toFixed(2),
        qualityScorePct: qualityPct.toFixed(2),
        totalRejected: totalRejected,
        invoiceCount: invoiceAgg._count,
        invoiceTotalIqd: invoiceAgg._sum.totalIqd ?? new Prisma.Decimal(0),
        invoicePaidIqd: invoiceAgg._sum.paidIqd ?? new Prisma.Decimal(0),
      },
      currentBalanceIqd: supplier.balanceIqd,
    };
  }
}
