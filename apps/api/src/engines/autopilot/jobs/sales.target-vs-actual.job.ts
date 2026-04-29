import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AutopilotEngineService } from '../autopilot.service';
import {
  AutopilotJob,
  AutopilotJobContext,
  AutopilotJobMeta,
  AutopilotJobResult,
} from '../autopilot.types';

/** Daily 08:00 — compare current-month sales per branch vs same period last month. */
@Injectable()
export class SalesTargetVsActualJob implements AutopilotJob {
  private readonly logger = new Logger(SalesTargetVsActualJob.name);

  readonly meta: AutopilotJobMeta = {
    id: 'sales.target-vs-actual',
    domain: 'sales',
    schedule: '0 8 * * *',
    companyScoped: true,
    titleAr: 'مقارنة الأهداف بالمتحقق',
    titleEn: 'Target vs Actual',
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: AutopilotEngineService,
  ) {}

  async execute(ctx: AutopilotJobContext): Promise<AutopilotJobResult> {
    const { companyId } = ctx;
    const now = new Date();
    const monthStart    = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const prevMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    let exceptionsRaised = 0;

    type SumRow = { branchId: string; _sum: { totalIqd: { toNumber(): number } | null } };
    let thisMonth: SumRow[] = [];
    let lastMonth: SumRow[] = [];

    try {
      [thisMonth, lastMonth] = await Promise.all([
        (this.prisma.salesInvoice as any).groupBy({
          by: ['branchId'],
          where: { companyId, status: 'posted', createdAt: { gte: monthStart } },
          _sum: { totalIqd: true },
          orderBy: [{ branchId: 'asc' }],
        }),
        (this.prisma.salesInvoice as any).groupBy({
          by: ['branchId'],
          where: { companyId, status: 'posted', createdAt: { gte: prevMonthStart, lt: monthStart } },
          _sum: { totalIqd: true },
          orderBy: [{ branchId: 'asc' }],
        }),
      ]);
    } catch (err) {
      this.logger.error(`[${this.meta.id}] ${err instanceof Error ? err.message : String(err)}`);
      return { status: 'failed', itemsProcessed: 0, exceptionsRaised: 0, details: { reason: 'db_error' } };
    }

    const lastByBranch = new Map<string, number>(
      lastMonth.map((r) => [r.branchId, r._sum.totalIqd?.toNumber() ?? 0]),
    );

    for (const row of thisMonth) {
      const curr = row._sum.totalIqd?.toNumber() ?? 0;
      const prev = lastByBranch.get(row.branchId) ?? 0;
      if (prev > 0) {
        const pct = ((curr - prev) / prev) * 100;
        if (pct < -20) {
          await this.engine.raiseException({
            jobId: this.meta.id, domain: 'sales', companyId, severity: 'medium',
            title: 'انخفاض مبيعات مقارنة بالشهر الماضي',
            description: `مبيعات الفرع انخفضت ${Math.abs(pct).toFixed(1)}% مقارنةً بنفس الفترة من الشهر الماضي`,
            suggestedAction: 'مراجعة خطة المبيعات وتحليل أسباب الانخفاض',
            payload: { branchId: row.branchId, currIqd: curr, prevIqd: prev, pctChange: pct },
          });
          exceptionsRaised++;
        }
      }
    }

    return {
      status: exceptionsRaised > 0 ? 'exception_raised' : 'no_op',
      itemsProcessed: thisMonth.length,
      exceptionsRaised,
      details: { monthStart: monthStart.toISOString(), branchesAnalyzed: thisMonth.length },
    };
  }
}