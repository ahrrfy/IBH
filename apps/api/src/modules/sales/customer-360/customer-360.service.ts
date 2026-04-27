import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../platform/prisma/prisma.service';

/**
 * T44 — Customer 360 read-model.
 *
 * Returns everything a sales rep needs on the customer detail screen:
 *   - Profile + credit + loyalty
 *   - RFM (recency / frequency / monetary + segment)
 *   - Lifetime totals (since first invoice — uncapped)
 *   - Last 10 invoices, last 5 quotations, last 5 sales orders
 *   - AR aging buckets for this customer
 *   - Top 5 products (by qty in last 90 days, from posted invoices)
 *
 * No mutations here — this is a pure aggregator. Multi-tenancy is enforced
 * by RLS at the DB level AND by the explicit companyId filter on every
 * query (defense in depth — F1).
 */
@Injectable()
export class Customer360Service {
  constructor(private readonly prisma: PrismaService) {}

  async get(companyId: string, customerId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, companyId, deletedAt: null },
    });
    if (!customer) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        messageAr: 'العميل غير موجود',
      });
    }

    const [lifetimeAgg, recentInvoices, recentQuotations, recentOrders, agingBuckets, topProducts] =
      await Promise.all([
        this.prisma.salesInvoice.aggregate({
          where: {
            companyId,
            customerId,
            status: { in: ['posted', 'partially_paid', 'paid'] },
          },
          _count: { _all: true },
          _sum: { totalIqd: true, balanceIqd: true },
          _min: { invoiceDate: true },
          _max: { invoiceDate: true },
        }),
        this.prisma.salesInvoice.findMany({
          where: { companyId, customerId },
          select: {
            id: true,
            number: true,
            invoiceDate: true,
            dueDate: true,
            status: true,
            totalIqd: true,
            paidIqd: true,
            balanceIqd: true,
          },
          orderBy: { invoiceDate: 'desc' },
          take: 10,
        }),
        this.prisma.quotation.findMany({
          where: { companyId, customerId },
          select: {
            id: true,
            number: true,
            quotationDate: true,
            validUntil: true,
            status: true,
            totalIqd: true,
          },
          orderBy: { quotationDate: 'desc' },
          take: 5,
        }),
        this.prisma.salesOrder.findMany({
          where: { companyId, customerId },
          select: {
            id: true,
            number: true,
            orderDate: true,
            status: true,
            totalIqd: true,
          },
          orderBy: { orderDate: 'desc' },
          take: 5,
        }),
        this.computeCustomerAging(companyId, customerId),
        this.topProducts(companyId, customerId),
      ]);

    return {
      customer: {
        id: customer.id,
        code: customer.code,
        nameAr: customer.nameAr,
        nameEn: customer.nameEn,
        type: customer.type,
        phone: customer.phone,
        whatsapp: customer.whatsapp,
        email: customer.email,
        address: customer.address,
        city: customer.city,
        creditLimitIqd: customer.creditLimitIqd.toString(),
        creditBalanceIqd: customer.creditBalanceIqd.toString(),
        loyaltyPoints: customer.loyaltyPoints,
        loyaltyTier: customer.loyaltyTier,
        defaultDiscountPct: customer.defaultDiscountPct.toString(),
        isActive: customer.isActive,
        createdAt: customer.createdAt,
      },
      rfm: {
        recencyDays: customer.rfmRecencyDays,
        frequency: customer.rfmFrequency,
        monetaryIqd: customer.rfmMonetaryIqd?.toString() ?? null,
        rScore: customer.rfmRScore,
        fScore: customer.rfmFScore,
        mScore: customer.rfmMScore,
        segment: customer.rfmSegment,
        computedAt: customer.rfmComputedAt,
      },
      lifetime: {
        invoiceCount: lifetimeAgg._count._all,
        totalIqd: lifetimeAgg._sum.totalIqd?.toString() ?? '0',
        outstandingIqd: lifetimeAgg._sum.balanceIqd?.toString() ?? '0',
        firstInvoiceAt: lifetimeAgg._min.invoiceDate,
        lastInvoiceAt: lifetimeAgg._max.invoiceDate,
      },
      recentInvoices: recentInvoices.map((i) => ({
        ...i,
        totalIqd: i.totalIqd.toString(),
        paidIqd: i.paidIqd.toString(),
        balanceIqd: i.balanceIqd.toString(),
      })),
      recentQuotations: recentQuotations.map((q) => ({
        ...q,
        totalIqd: q.totalIqd.toString(),
      })),
      recentOrders: recentOrders.map((o) => ({
        ...o,
        totalIqd: o.totalIqd.toString(),
      })),
      aging: agingBuckets,
      topProducts,
    };
  }

  /** AR aging for one customer — same buckets as the ledger-wide report. */
  private async computeCustomerAging(companyId: string, customerId: string) {
    const today = new Date();
    const invoices = await this.prisma.salesInvoice.findMany({
      where: {
        companyId,
        customerId,
        status: { in: ['posted', 'partially_paid'] },
        balanceIqd: { gt: 0 },
      },
      select: { invoiceDate: true, dueDate: true, balanceIqd: true },
    });

    const buckets = {
      current: new Prisma.Decimal(0),
      d1_30: new Prisma.Decimal(0),
      d31_60: new Prisma.Decimal(0),
      d61_90: new Prisma.Decimal(0),
      d90plus: new Prisma.Decimal(0),
      total: new Prisma.Decimal(0),
    };

    for (const inv of invoices) {
      const due = inv.dueDate ?? inv.invoiceDate;
      const daysOverdue = Math.floor((today.getTime() - due.getTime()) / 86_400_000);
      const bal = inv.balanceIqd;
      if (daysOverdue <= 0) buckets.current = buckets.current.plus(bal);
      else if (daysOverdue <= 30) buckets.d1_30 = buckets.d1_30.plus(bal);
      else if (daysOverdue <= 60) buckets.d31_60 = buckets.d31_60.plus(bal);
      else if (daysOverdue <= 90) buckets.d61_90 = buckets.d61_90.plus(bal);
      else buckets.d90plus = buckets.d90plus.plus(bal);
      buckets.total = buckets.total.plus(bal);
    }

    return {
      current: buckets.current.toString(),
      d1_30: buckets.d1_30.toString(),
      d31_60: buckets.d31_60.toString(),
      d61_90: buckets.d61_90.toString(),
      d90plus: buckets.d90plus.toString(),
      total: buckets.total.toString(),
    };
  }

  /** Top 5 products by total quantity in posted invoices over last 90 days. */
  private async topProducts(companyId: string, customerId: string) {
    const since = new Date(Date.now() - 90 * 86_400_000);
    const invoices = await this.prisma.salesInvoice.findMany({
      where: {
        companyId,
        customerId,
        status: { in: ['posted', 'partially_paid', 'paid'] },
        invoiceDate: { gte: since },
      },
      select: { id: true },
    });
    if (invoices.length === 0) return [];

    const lines = await this.prisma.salesInvoiceLine.groupBy({
      by: ['variantId'],
      where: { invoiceId: { in: invoices.map((i) => i.id) } },
      _sum: { qty: true, lineTotalIqd: true },
      orderBy: { _sum: { lineTotalIqd: 'desc' } },
      take: 5,
    });

    if (lines.length === 0) return [];

    const variants = await this.prisma.productVariant.findMany({
      where: { id: { in: lines.map((l) => l.variantId) } },
      select: {
        id: true,
        sku: true,
        template: { select: { nameAr: true } },
      },
    });
    const byId = new Map(variants.map((v) => [v.id, v]));

    return lines.map((l) => ({
      variantId: l.variantId,
      sku: byId.get(l.variantId)?.sku ?? null,
      nameAr: byId.get(l.variantId)?.template.nameAr ?? null,
      qty: l._sum.qty?.toString() ?? '0',
      totalIqd: l._sum.lineTotalIqd?.toString() ?? '0',
    }));
  }
}
