import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AutopilotEngineService } from '../autopilot.service';
import { AutopilotJob, AutopilotJobContext, AutopilotJobMeta, AutopilotJobResult } from '../autopilot.types';

// Cron: 02:00 UTC on the 1st of every month. Summarize unpaid commission accruals.
// Raises one 'medium' exception if there are unsettled accruals from last month.

@Injectable()
export class SalesCommissionCalcJob implements AutopilotJob {
  private readonly logger = new Logger(SalesCommissionCalcJob.name);

  readonly meta: AutopilotJobMeta = {
    id: 'sales.commission-calc',
    domain: 'sales',
    schedule: '0 2 1 * *',
    companyScoped: true,
    titleAr: 'احتساب العمولات الشهرية',
    titleEn: 'Monthly Commission Calc',
    description: 'Monthly on the 1st — summarizes unsettled commission accruals from the previous month.',
  };

  constructor(private readonly prisma: PrismaService, private readonly engine: AutopilotEngineService) {}

  async execute(ctx: AutopilotJobContext): Promise<AutopilotJobResult> {
    const now = new Date();
    const prevMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const prevMonthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) - 1);

    let accruals: Array<{ employeeId: string | null; _sum: { commissionIqd: unknown } }> = [];
    try {
      accruals = await (this.prisma.commissionEntry as any).groupBy({
        by: ['employeeId'],
        where: {
          companyId: ctx.companyId,
          kind: 'accrual',
          status: 'pending',
          createdAt: { gte: prevMonthStart, lte: prevMonthEnd },
        },
        _sum: { commissionIqd: true },
        orderBy: [{ employeeId: 'asc' }],
      }) as typeof accruals;
    } catch (err) {
      this.logger.error(`[sales.commission-calc] DB error: ${err instanceof Error ? err.message : String(err)}`);
      return { status: 'no_op', itemsProcessed: 0, exceptionsRaised: 0, details: { reason: 'db_error' } };
    }

    if (accruals.length === 0) return { status: 'completed', itemsProcessed: 0, exceptionsRaised: 0 };

    const totalIqd = accruals.reduce((sum, a) => sum + Number(a._sum.commissionIqd ?? 0), 0);
    let exceptionsRaised = 0;
    try {
      await this.engine.raiseException({
        jobId: this.meta.id, domain: 'sales', companyId: ctx.companyId, severity: 'medium',
        title: `${accruals.length} موظف لديهم عمولات غير مسوّاة — ${totalIqd.toLocaleString()} IQD`,
        description: `عمولات شهر ${prevMonthStart.toLocaleString('ar', { month: 'long' })} غير مُصرفة بعد`,
        suggestedAction: 'مراجعة عمولات الشهر الماضي وصرفها ضمن دورة الرواتب',
        payload: { month: prevMonthStart.toISOString().slice(0, 7), employeeCount: accruals.length, totalIqd },
      });
      exceptionsRaised++;
    } catch { /* continue */ }

    return { status: exceptionsRaised > 0 ? 'exception_raised' : 'completed', itemsProcessed: accruals.length, exceptionsRaised, details: { employeesWithPendingCommissions: accruals.length, totalIqd } };
  }
}