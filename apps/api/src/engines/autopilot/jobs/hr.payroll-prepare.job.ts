import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AutopilotEngineService } from '../autopilot.service';
import {
  AutopilotJob,
  AutopilotJobContext,
  AutopilotJobMeta,
  AutopilotJobResult,
} from '../autopilot.types';

// ─── T71 Job: hr.payroll-prepare ─────────────────────────────────────────────
// Cron: 09:00 UTC on the 25th of each month.
// Goal: remind the payroll officer when no PayrollRun has been created yet for
// the current month. This is a read-only check — it never creates the run.
// Only raises an exception when no run exists for (companyId, year, month).
// Multiple branch-scoped runs are acceptable; only a total absence is flagged.

@Injectable()
export class HrPayrollPrepareJob implements AutopilotJob {
  private readonly logger = new Logger(HrPayrollPrepareJob.name);

  readonly meta: AutopilotJobMeta = {
    id: 'hr.payroll-prepare',
    domain: 'hr',
    schedule: '0 9 25 * *',
    companyScoped: true,
    titleAr: 'تهيئة كشوف الرواتب',
    titleEn: 'Payroll Prepare',
    description:
      'Runs on the 25th at 09:00 — reminds the payroll officer to start the monthly payroll run when none exists yet.',
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: AutopilotEngineService,
  ) {}

  /**
   * Check whether a PayrollRun for the current month already exists.
   *
   * Business rule:
   *   If prisma.payrollRun has zero rows for (companyId, periodYear, periodMonth)
   *   matching the current calendar month → raise severity='warning'.
   *   Any status (draft, calculated, approved…) counts — we just need one row.
   *
   * @param ctx - Job context including companyId.
   * @returns AutopilotJobResult.
   */
  async execute(ctx: AutopilotJobContext): Promise<AutopilotJobResult> {
    const now = new Date();
    const currentYear = now.getUTCFullYear();
    const currentMonth = now.getUTCMonth() + 1; // 1-based

    let existingRun: { id: string } | null = null;

    try {
      existingRun = await this.prisma.payrollRun.findFirst({
        where: {
          companyId: ctx.companyId,
          periodYear: currentYear,
          periodMonth: currentMonth,
        },
        select: { id: true },
      });
    } catch (err) {
      this.logger.error(
        `[hr.payroll-prepare] Failed to query payrollRun for company=${ctx.companyId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return { status: 'no_op', itemsProcessed: 0, exceptionsRaised: 0, details: { reason: 'db_error' } };
    }

    // If a run already exists for this month — nothing to do.
    if (existingRun) {
      return {
        status: 'completed',
        itemsProcessed: 1,
        exceptionsRaised: 0,
        details: { payrollRunId: existingRun.id, currentYear, currentMonth },
      };
    }

    // No run found — raise a reminder.
    let exceptionsRaised = 0;

    try {
      await this.engine.raiseException({
        jobId: this.meta.id,
        domain: 'hr',
        companyId: ctx.companyId,
        severity: 'medium',
        title: 'لم يُنشأ مسير الرواتب لهذا الشهر بعد',
        description: `لا يوجد مسير رواتب لشهر ${currentMonth}/${currentYear}. يجب إنشاؤه قبل نهاية الشهر.`,
        suggestedAction: 'فتح وحدة الرواتب وإنشاء مسير الشهر الحالي',
        payload: {
          periodYear: currentYear,
          periodMonth: currentMonth,
        },
      });
      exceptionsRaised++;
    } catch (err) {
      this.logger.error(
        `[hr.payroll-prepare] Failed to raise exception for company=${ctx.companyId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    return {
      status: exceptionsRaised > 0 ? 'exception_raised' : 'failed',
      itemsProcessed: 0,
      exceptionsRaised,
      details: { currentYear, currentMonth },
    };
  }
}
