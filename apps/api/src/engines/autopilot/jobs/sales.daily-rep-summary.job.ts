import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AutopilotEngineService } from '../autopilot.service';
import {
  AutopilotJob,
  AutopilotJobContext,
  AutopilotJobMeta,
  AutopilotJobResult,
} from '../autopilot.types';

// ─── T71 Job: sales.daily-rep-summary ───────────────────────────────────────
// Cron: 18:00 UTC daily (end of business day).
// Goal: Aggregate today's sales per creator (sales rep) and raise an
// info-level exception for any rep who created zero posted invoices today —
// prompting managers to investigate underperformance.
//
// "Sales rep" is identified by SalesInvoice.createdBy grouped by user.
// Target comparison: if a SalesTarget record exists for today's date and the
// rep, compare actual vs target IQD.  If below 50% of target, severity is
// bumped to 'medium'.  In the absence of target data, we only flag zero-sales
// reps.
//
// Note: SalesTarget is a future model (Wave 5).  The job is designed to work
// without it — falls back to zero-sales detection only when it does not exist.

const LOW_PERFORMANCE_PCT = 50; // below this % of daily target → medium exception

@Injectable()
export class SalesDailyRepSummaryJob implements AutopilotJob {
  private readonly logger = new Logger(SalesDailyRepSummaryJob.name);

  readonly meta: AutopilotJobMeta = {
    id: 'sales.daily-rep-summary',
    domain: 'sales',
    schedule: '0 18 * * *',
    companyScoped: true,
    titleAr: 'ملخص يومي للمندوب',
    titleEn: 'Daily Rep Summary',
    description:
      "End-of-day 18:00 sweep — aggregates each rep's posted invoice totals " +
      'for today and flags underperformance.',
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: AutopilotEngineService,
  ) {}

  async execute(ctx: AutopilotJobContext): Promise<AutopilotJobResult> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    // Group today's posted invoices by createdBy (sales rep).
    const invoiceGroups = await this.prisma.salesInvoice.groupBy({
      by: ['createdBy'],
      where: {
        companyId: ctx.companyId,
        status: 'posted',
        invoiceDate: {
          gte: todayStart,
          lte: todayEnd,
        },
      },
      _count: { id: true },
      _sum: { totalIqd: true },
    });

    if (invoiceGroups.length === 0) {
      // No posted invoices at all today — single broad exception.
      await this.engine.raiseException({
        jobId: this.meta.id,
        domain: 'sales',
        companyId: ctx.companyId,
        severity: 'low',
        title: 'لا مبيعات اليوم',
        description: 'لم يتم ترحيل أي فاتورة مبيعات اليوم',
        suggestedAction: 'مراجعة حالة الفريق وتأكيد عمل النظام',
        payload: { date: todayStart.toISOString().slice(0, 10) },
      });

      return {
        status: 'exception_raised',
        itemsProcessed: 0,
        exceptionsRaised: 1,
        details: { message: 'No posted invoices today.' },
      };
    }

    let exceptionsRaised = 0;

    for (const group of invoiceGroups) {
      const repId = group.createdBy;
      const invoiceCount = group._count.id;
      const totalIqd = Number(group._sum.totalIqd ?? 0);

      // Check for a sales target (model may not exist yet — guard with try/catch).
      let targetIqd: number | null = null;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const prismaAny = this.prisma as any;
        if (prismaAny.salesTarget) {
          const target = await prismaAny.salesTarget.findFirst({
            where: {
              companyId: ctx.companyId,
              userId: repId,
              targetDate: {
                gte: todayStart,
                lte: todayEnd,
              },
            },
            select: { targetIqd: true },
          });
          if (target) targetIqd = Number(target.targetIqd);
        }
      } catch {
        // SalesTarget model not yet available — continue without target data
      }

      // Determine if the rep is underperforming.
      if (targetIqd !== null && targetIqd > 0) {
        const achievedPct = (totalIqd / targetIqd) * 100;
        if (achievedPct < LOW_PERFORMANCE_PCT) {
          await this.engine.raiseException({
            jobId: this.meta.id,
            domain: 'sales',
            companyId: ctx.companyId,
            severity: 'medium',
            title: `أداء دون الهدف — مندوب ${repId}`,
            description:
              `مندوب المبيعات حقق ${achievedPct.toFixed(0)}% من الهدف اليومي` +
              ` (${totalIqd.toLocaleString()} من ${targetIqd.toLocaleString()} د.ع)`,
            suggestedAction: 'مراجعة المندوب واستفسار عن الأسباب',
            payload: {
              repId,
              invoiceCount,
              totalIqd,
              targetIqd,
              achievedPct: Math.round(achievedPct),
            },
          });
          exceptionsRaised++;
        }
      } else if (invoiceCount === 0) {
        // No target data — only flag reps with zero invoices.
        await this.engine.raiseException({
          jobId: this.meta.id,
          domain: 'sales',
          companyId: ctx.companyId,
          severity: 'low',
          title: `لا مبيعات — مندوب ${repId}`,
          description: `مندوب المبيعات لم يسجل أي مبيعات اليوم`,
          suggestedAction: 'التحقق من حضور المندوب ونشاطه',
          payload: { repId, invoiceCount: 0, totalIqd: 0 },
        });
        exceptionsRaised++;
      }
    }

    this.logger.log(
      `[sales.daily-rep-summary] company=${ctx.companyId} — processed ${invoiceGroups.length} reps, ${exceptionsRaised} exceptions`,
    );

    return {
      status: exceptionsRaised > 0 ? 'exception_raised' : 'completed',
      itemsProcessed: invoiceGroups.length,
      exceptionsRaised,
      details: { repsProcessed: invoiceGroups.length },
    };
  }
}
