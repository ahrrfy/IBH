import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AutopilotEngineService } from '../autopilot.service';
import {
  AutopilotJob,
  AutopilotJobContext,
  AutopilotJobMeta,
  AutopilotJobResult,
} from '../autopilot.types';

// ─── T71 Job: finance.period-close-check ────────────────────────────────────
// Cron: 08:00 UTC on the 1st of each month.
// Goal: check that the *previous* accounting period has been formally closed.
// Business rule (F2): the engine must never silently allow postings into an
// open prior period — human confirmation is required before the new period
// begins. If the prior-period record is missing (i.e. the accounting module
// hasn't been activated yet) we return no_op rather than crashing.

@Injectable()
export class FinancePeriodCloseCheckJob implements AutopilotJob {
  private readonly logger = new Logger(FinancePeriodCloseCheckJob.name);

  readonly meta: AutopilotJobMeta = {
    id: 'finance.period-close-check',
    domain: 'finance',
    schedule: '0 8 1 * *',
    companyScoped: true,
    titleAr: 'تحقق من إقفال الفترة المحاسبية',
    titleEn: 'Period-Close Check',
    description:
      '08:00 UTC on 1st of month — verifies that the previous accounting period has been formally closed.',
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: AutopilotEngineService,
  ) {}

  /**
   * Derive the previous calendar month relative to the execution date.
   * Returns { year, month } where month is 1-indexed.
   */
  private previousMonth(now: Date): { year: number; month: number } {
    const month = now.getMonth(); // 0-indexed
    if (month === 0) {
      return { year: now.getFullYear() - 1, month: 12 };
    }
    return { year: now.getFullYear(), month };
  }

  async execute(ctx: AutopilotJobContext): Promise<AutopilotJobResult> {
    const { year, month } = this.previousMonth(ctx.startedAt);

    try {
      const period = await this.prisma.accountingPeriod.findUnique({
        where: {
          companyId_year_month: {
            companyId: ctx.companyId,
            year,
            month,
          },
        },
        select: { id: true, status: true },
      });

      // Period record doesn't exist yet — accounting module not activated.
      if (!period) {
        this.logger.debug(
          `[T71] period-close-check: no period record for ${year}-${String(month).padStart(2, '0')} company=${ctx.companyId}`,
        );
        return {
          status: 'no_op',
          itemsProcessed: 0,
          exceptionsRaised: 0,
          details: { reason: 'period-record-not-found', year, month },
        };
      }

      // Period already hard or soft closed — nothing to flag.
      if (period.status === 'hard_closed' || period.status === 'soft_closed') {
        return {
          status: 'no_op',
          itemsProcessed: 1,
          exceptionsRaised: 0,
          details: { periodStatus: period.status, year, month },
        };
      }

      // Period is still open — raise a warning for the finance team.
      const periodLabel = `${year}-${String(month).padStart(2, '0')}`;
      await this.engine.raiseException({
        jobId: this.meta.id,
        domain: 'finance',
        companyId: ctx.companyId,
        severity: 'medium',
        title: `الفترة المحاسبية ${periodLabel} لم تُغلق`,
        description: `الفترة المحاسبية السابقة (${periodLabel}) لم تُغلق بعد. يجب إغلاق الفترة قبل استمرار عمليات الشهر الجديد.`,
        suggestedAction: 'اذهب إلى الإعدادات > الفترات المحاسبية وأغلق الفترة السابقة',
        payload: { periodId: period.id, year, month, currentStatus: period.status },
      });

      return {
        status: 'exception_raised',
        itemsProcessed: 1,
        exceptionsRaised: 1,
        details: { periodId: period.id, year, month, currentStatus: period.status },
      };
    } catch (err) {
      this.logger.error(
        `[T71] period-close-check failed for company=${ctx.companyId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return {
        status: 'failed',
        itemsProcessed: 0,
        exceptionsRaised: 0,
        details: {
          error: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }
}
