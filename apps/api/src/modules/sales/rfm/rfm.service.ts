import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { emitRealtime } from '../../../platform/realtime/emit-realtime';
import { computeRfm, RFM_WINDOW_DAYS, RfmResult } from './rfm.thresholds';

interface CustomerRfmAggregate {
  customerId: string;
  lastInvoiceAt: Date | null;
  frequency: number;
  monetaryIqd: number;
}

/**
 * T44 — RFM segmentation service.
 *
 * Computes Recency / Frequency / Monetary scores for every customer
 * (or one customer by id), persists them on `Customer.rfm*` columns,
 * and emits `customer.rfm_updated` so the frontend can refresh via
 * `useLiveResource`.
 *
 * Trigger paths:
 *   - Nightly BullMQ repeat job (see RfmScheduler)
 *   - Manual: `POST /sales/rfm/recompute` (admin)
 *   - Per-customer: `RfmService.recomputeOne(id)`
 *
 * Aggregation window: posted SalesInvoices in the last RFM_WINDOW_DAYS.
 */
@Injectable()
export class RfmService {
  private readonly logger = new Logger(RfmService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Recompute RFM for every active customer of every company.
   * Returns total customers updated.
   */
  async recomputeAll(): Promise<{ companies: number; customers: number }> {
    const companies = await this.prisma.company.findMany({
      select: { id: true },
    });
    let total = 0;
    for (const c of companies) {
      const n = await this.recomputeForCompany(c.id);
      total += n;
    }
    this.logger.log(`RFM recompute complete: ${total} customers across ${companies.length} companies`);
    return { companies: companies.length, customers: total };
  }

  /**
   * Recompute RFM for every customer in a single company.
   */
  async recomputeForCompany(companyId: string): Promise<number> {
    const now = new Date();
    const windowStart = new Date(now.getTime() - RFM_WINDOW_DAYS * 86_400_000);

    // Aggregate posted invoices within the window, per customer.
    // status in (posted, partially_paid, paid) is "real revenue".
    const groups = await this.prisma.salesInvoice.groupBy({
      by: ['customerId'],
      where: {
        companyId,
        status: { in: ['posted', 'partially_paid', 'paid'] },
        invoiceDate: { gte: windowStart },
      },
      _count: { _all: true },
      _sum: { totalIqd: true },
      _max: { invoiceDate: true },
    });

    const aggByCustomer = new Map<string, CustomerRfmAggregate>();
    for (const g of groups) {
      aggByCustomer.set(g.customerId, {
        customerId: g.customerId,
        lastInvoiceAt: g._max.invoiceDate ?? null,
        frequency: g._count._all,
        monetaryIqd: Number(g._sum.totalIqd ?? 0),
      });
    }

    // Walk every active, non-deleted customer (so customers with zero
    // posted invoices in the window still get a `New`/`Lost` segment).
    const customers = await this.prisma.customer.findMany({
      where: { companyId, deletedAt: null },
      select: { id: true },
    });

    let updated = 0;
    for (const cu of customers) {
      const agg = aggByCustomer.get(cu.id);
      const recencyDays =
        agg?.lastInvoiceAt
          ? Math.max(0, Math.floor((now.getTime() - agg.lastInvoiceAt.getTime()) / 86_400_000))
          : null;
      const frequency = agg?.frequency ?? 0;
      const monetaryIqd = agg?.monetaryIqd ?? 0;

      const result = computeRfm({ recencyDays, frequency, monetaryIqd });

      await this.prisma.customer.update({
        where: { id: cu.id },
        data: {
          rfmRecencyDays: recencyDays,
          rfmFrequency: frequency,
          rfmMonetaryIqd: new Prisma.Decimal(monetaryIqd),
          rfmRScore: result.rScore,
          rfmFScore: result.fScore,
          rfmMScore: result.mScore,
          rfmSegment: result.segment,
          rfmComputedAt: now,
        },
      });
      updated++;
    }

    // Single company-wide event — frontends listening per-customer can
    // trigger a refetch on their own customer detail.
    emitRealtime(this.events, 'customer.rfm_updated', {
      companyId,
      scope: 'company',
      customers: updated,
      computedAt: now.toISOString(),
    });

    return updated;
  }

  /**
   * Recompute RFM for a single customer (used after a posted invoice).
   */
  async recomputeOne(companyId: string, customerId: string): Promise<RfmResult & { computedAt: Date }> {
    const now = new Date();
    const windowStart = new Date(now.getTime() - RFM_WINDOW_DAYS * 86_400_000);

    const agg = await this.prisma.salesInvoice.aggregate({
      where: {
        companyId,
        customerId,
        status: { in: ['posted', 'partially_paid', 'paid'] },
        invoiceDate: { gte: windowStart },
      },
      _count: { _all: true },
      _sum: { totalIqd: true },
      _max: { invoiceDate: true },
    });

    const lastAt = agg._max.invoiceDate ?? null;
    const recencyDays = lastAt
      ? Math.max(0, Math.floor((now.getTime() - lastAt.getTime()) / 86_400_000))
      : null;
    const frequency = agg._count._all;
    const monetaryIqd = Number(agg._sum.totalIqd ?? 0);

    const result = computeRfm({ recencyDays, frequency, monetaryIqd });

    await this.prisma.customer.update({
      where: { id: customerId },
      data: {
        rfmRecencyDays: recencyDays,
        rfmFrequency: frequency,
        rfmMonetaryIqd: new Prisma.Decimal(monetaryIqd),
        rfmRScore: result.rScore,
        rfmFScore: result.fScore,
        rfmMScore: result.mScore,
        rfmSegment: result.segment,
        rfmComputedAt: now,
      },
    });

    emitRealtime(this.events, 'customer.rfm_updated', {
      companyId,
      customerId,
      scope: 'one',
      segment: result.segment,
      computedAt: now.toISOString(),
    });

    return { ...result, computedAt: now };
  }
}
