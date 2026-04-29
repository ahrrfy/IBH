import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AutopilotEngineService } from '../autopilot.service';
import {
  AutopilotJob,
  AutopilotJobContext,
  AutopilotJobMeta,
  AutopilotJobResult,
} from '../autopilot.types';

// ─── T71 Job: sales.churn-risk-flag ─────────────────────────────────────────
// Cron: 10:00 UTC Mondays.
// Goal: Identify customers at risk of churning before they fully lapse:
//
//   Rule A — Formerly-loyal inactivity:
//     Customers with rfmSegment IN ('Champion', 'Loyal') and
//     rfmRecencyDays > 45 (went quiet faster than the 90-day crm job).
//
//   Rule B — Declining purchase frequency:
//     Customers where the number of posted invoices in the last 30 days is
//     less than HALF the number in the prior 30 days (day 31–60 ago),
//     regardless of segment — a signal of accelerating disengagement.
//
// One warning exception is raised per at-risk customer.
// Cap: 300 exceptions per run to avoid flooding the inbox.

const HIGH_VALUE_SEGMENTS = ['Champion', 'Loyal'];
const INACTIVITY_WARNING_DAYS = 45;
const MAX_EXCEPTIONS = 300;

@Injectable()
export class SalesChurnRiskFlagJob implements AutopilotJob {
  private readonly logger = new Logger(SalesChurnRiskFlagJob.name);

  readonly meta: AutopilotJobMeta = {
    id: 'sales.churn-risk-flag',
    domain: 'sales',
    schedule: '0 10 * * 1',
    companyScoped: true,
    titleAr: 'رصد العملاء المعرّضين للفقدان',
    titleEn: 'Churn-Risk Flag',
    description:
      'Monday 10:00 sweep — finds customers showing early churn signals ' +
      '(inactivity ≥ 45 days or declining purchase frequency).',
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: AutopilotEngineService,
  ) {}

  async execute(ctx: AutopilotJobContext): Promise<AutopilotJobResult> {
    const now = new Date();
    const last30Start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const prior30Start = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    let exceptionsRaised = 0;
    const seenCustomerIds = new Set<string>();

    // ── Rule A: High-value customers with rfmRecencyDays > 45 ────────────────
    const inactiveHighValue = await this.prisma.customer.findMany({
      where: {
        companyId: ctx.companyId,
        rfmSegment: { in: HIGH_VALUE_SEGMENTS },
        rfmRecencyDays: { gt: INACTIVITY_WARNING_DAYS },
        isActive: true,
        deletedAt: null,
      },
      select: {
        id: true,
        nameAr: true,
        rfmSegment: true,
        rfmRecencyDays: true,
      },
      take: MAX_EXCEPTIONS,
      orderBy: { rfmRecencyDays: 'desc' },
    });

    for (const customer of inactiveHighValue) {
      if (seenCustomerIds.size >= MAX_EXCEPTIONS) break;
      seenCustomerIds.add(customer.id);

      try {
        await this.engine.raiseException({
          jobId: this.meta.id,
          domain: 'sales',
          companyId: ctx.companyId,
          severity: 'medium',
          title: `خطر فقدان عميل — ${customer.nameAr}`,
          description:
            `خطر فقدان عميل ${customer.nameAr} — تراجع في الشراء` +
            ` (${customer.rfmRecencyDays ?? INACTIVITY_WARNING_DAYS} يوم بدون طلب، كان ${customer.rfmSegment ?? ''})`,
          suggestedAction:
            'التواصل مع العميل وتقديم عرض استرداد أو حافز للشراء',
          payload: {
            customerId: customer.id,
            customerName: customer.nameAr,
            rfmSegment: customer.rfmSegment,
            rfmRecencyDays: customer.rfmRecencyDays,
            ruleTriggered: 'A_inactivity',
          },
        });
        exceptionsRaised++;
      } catch (err) {
        this.logger.warn(
          `[sales.churn-risk-flag] Rule A raiseException failed for customer=${customer.id}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    // ── Rule B: Customers with declining purchase frequency ───────────────────
    // Count invoices per customer in the last 30 days vs prior 30 days.
    // Only check active customers not already flagged by Rule A.
    const recentInvoiceGroups = await this.prisma.salesInvoice.groupBy({
      by: ['customerId'],
      where: {
        companyId: ctx.companyId,
        status: 'posted',
        invoiceDate: { gte: last30Start },
      },
      _count: { id: true },
    });

    const priorInvoiceGroups = await this.prisma.salesInvoice.groupBy({
      by: ['customerId'],
      where: {
        companyId: ctx.companyId,
        status: 'posted',
        invoiceDate: { gte: prior30Start, lt: last30Start },
      },
      _count: { id: true },
    });

    // Build lookup maps
    const recentMap = new Map(
      recentInvoiceGroups.map((g) => [g.customerId, g._count.id]),
    );
    const priorMap = new Map(
      priorInvoiceGroups.map((g) => [g.customerId, g._count.id]),
    );

    // Find customers whose recent count is less than half of prior count
    // (prior must be ≥ 2 to filter out one-time buyers).
    for (const [customerId, priorCount] of priorMap.entries()) {
      if (seenCustomerIds.size >= MAX_EXCEPTIONS) break;
      if (seenCustomerIds.has(customerId)) continue; // already flagged by Rule A
      if (priorCount < 2) continue; // ignore rare buyers

      const recentCount = recentMap.get(customerId) ?? 0;
      if (recentCount >= priorCount / 2) continue; // not declining enough

      seenCustomerIds.add(customerId);

      // Load customer name for the exception message.
      let customerName = customerId;
      try {
        const customer = await this.prisma.customer.findUnique({
          where: { id: customerId },
          select: { nameAr: true },
        });
        if (customer) customerName = customer.nameAr;
      } catch {
        // fallback to id
      }

      try {
        await this.engine.raiseException({
          jobId: this.meta.id,
          domain: 'sales',
          companyId: ctx.companyId,
          severity: 'medium',
          title: `خطر فقدان عميل — ${customerName}`,
          description:
            `خطر فقدان عميل ${customerName} — تراجع في الشراء` +
            ` (${recentCount} طلب آخر 30 يوم مقابل ${priorCount} طلب قبلها)`,
          suggestedAction: 'مراجعة تاريخ العميل واستيضاح سبب التراجع',
          payload: {
            customerId,
            customerName,
            last30DaysOrders: recentCount,
            prior30DaysOrders: priorCount,
            ruleTriggered: 'B_declining_frequency',
          },
        });
        exceptionsRaised++;
      } catch (err) {
        this.logger.warn(
          `[sales.churn-risk-flag] Rule B raiseException failed for customer=${customerId}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    this.logger.log(
      `[sales.churn-risk-flag] company=${ctx.companyId} — raised ${exceptionsRaised} churn-risk warnings`,
    );

    return {
      status: exceptionsRaised > 0 ? 'exception_raised' : 'no_op',
      itemsProcessed: seenCustomerIds.size,
      exceptionsRaised,
      details: {
        ruleACustomers: inactiveHighValue.length,
        ruleBCustomers: seenCustomerIds.size - inactiveHighValue.length,
      },
    };
  }
}
