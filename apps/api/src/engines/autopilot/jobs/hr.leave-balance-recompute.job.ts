import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AutopilotEngineService } from '../autopilot.service';
import {
  AutopilotJob,
  AutopilotJobContext,
  AutopilotJobMeta,
  AutopilotJobResult,
} from '../autopilot.types';

// ─── T71 Job: hr.leave-balance-recompute ─────────────────────────────────────
// Cron: 01:00 UTC on the 1st of every month.
// Goal: validate that no active employee has exceeded the standard annual
// leave entitlement for the current year. This is a Tier-3 consistency guard —
// a dedicated LeaveBalance table does not yet exist in the schema (Wave 5),
// so we derive the consumed leave from approved LeaveRequest rows.
//
// Standard annual entitlement: 30 days (configurable via STANDARD_ANNUAL_DAYS).
// If an employee's total approved annual-leave days for the year exceeds the
// entitlement, raise an 'info' exception so the HR manager can review.
//
// NOTE: When a proper LeaveBalance model is added in Wave 5, replace the
// aggregation query below with a direct balance table read.

/** Standard annual leave entitlement in days (Iraqi Labor Law basis). */
const STANDARD_ANNUAL_DAYS = 30;

@Injectable()
export class HrLeaveBalanceRecomputeJob implements AutopilotJob {
  private readonly logger = new Logger(HrLeaveBalanceRecomputeJob.name);

  readonly meta: AutopilotJobMeta = {
    id: 'hr.leave-balance-recompute',
    domain: 'hr',
    schedule: '0 1 1 * *',
    companyScoped: true,
    titleAr: 'إعادة احتساب أرصدة الإجازات',
    titleEn: 'Leave Balance Recompute',
    description:
      'Runs at 01:00 on the 1st of each month — validates that no active employee has exceeded the annual leave entitlement.',
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: AutopilotEngineService,
  ) {}

  /**
   * Validate leave balances for all active employees in the company.
   *
   * Business rule:
   *   Sum approved annual LeaveRequest.totalDays for each active employee
   *   for the current calendar year. If any employee has consumed more than
   *   STANDARD_ANNUAL_DAYS → raise an 'info' exception with a list of
   *   affected employees.
   *
   * No writes are performed — this is a read-only consistency audit.
   *
   * @param ctx - Job context including companyId.
   * @returns AutopilotJobResult.
   */
  async execute(ctx: AutopilotJobContext): Promise<AutopilotJobResult> {
    const now = new Date();
    const currentYear = now.getUTCFullYear();
    const yearStart = new Date(Date.UTC(currentYear, 0, 1));
    const yearEnd = new Date(Date.UTC(currentYear, 11, 31, 23, 59, 59));

    // Fetch active employees.
    let employees: Array<{ id: string; nameAr: string }> = [];

    try {
      employees = await this.prisma.employee.findMany({
        where: {
          companyId: ctx.companyId,
          status: 'active',
          deletedAt: null,
        },
        select: { id: true, nameAr: true },
      });
    } catch (err) {
      this.logger.error(
        `[hr.leave-balance-recompute] Failed to query employees for company=${ctx.companyId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return { status: 'no_op', itemsProcessed: 0, exceptionsRaised: 0, details: { reason: 'db_error' } };
    }

    if (employees.length === 0) {
      return { status: 'completed', itemsProcessed: 0, exceptionsRaised: 0 };
    }

    const employeeIds = employees.map((e) => e.id);

    // Aggregate approved annual leave days per employee for the current year.
    let leaveAggregates: Array<{
      employeeId: string;
      _sum: { totalDays: unknown };
    }> = [];

    try {
      leaveAggregates = await (this.prisma.leaveRequest as any).groupBy({
        by: ['employeeId'],
        where: {
          companyId: ctx.companyId,
          employeeId: { in: employeeIds },
          type: 'annual',
          status: 'approved',
          startDate: { gte: yearStart, lte: yearEnd },
        },
        _sum: { totalDays: true },
      });
    } catch (err) {
      this.logger.error(
        `[hr.leave-balance-recompute] Failed to aggregate leave requests for company=${ctx.companyId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return { status: 'no_op', itemsProcessed: 0, exceptionsRaised: 0, details: { reason: 'db_error' } };
    }

    // Build a name map for reporting.
    const employeeNameMap = new Map<string, string>(
      employees.map((e) => [e.id, e.nameAr]),
    );

    // Find employees who have exceeded the standard entitlement.
    type OverLimitEntry = { employeeId: string; nameAr: string; consumedDays: number };
    const overLimit: OverLimitEntry[] = [];

    for (const agg of leaveAggregates) {
      const consumed = Number(agg._sum.totalDays ?? 0);
      if (consumed > STANDARD_ANNUAL_DAYS) {
        overLimit.push({
          employeeId: agg.employeeId,
          nameAr: employeeNameMap.get(agg.employeeId) ?? agg.employeeId,
          consumedDays: consumed,
        });
      }
    }

    let exceptionsRaised = 0;

    if (overLimit.length > 0) {
      const summary = overLimit
        .slice(0, 5)
        .map((e) => `${e.nameAr} (${e.consumedDays} يوم)`)
        .join('، ');
      const moreText = overLimit.length > 5 ? ` وآخرون` : '';

      try {
        await this.engine.raiseException({
          jobId: this.meta.id,
          domain: 'hr',
          companyId: ctx.companyId,
          severity: 'low',
          title: `${overLimit.length} موظف تجاوز رصيد الإجازة السنوية`,
          description: `الموظفون الذين تجاوزوا الحد (${STANDARD_ANNUAL_DAYS} يوم): ${summary}${moreText}`,
          suggestedAction: 'مراجعة طلبات الإجازات المعتمدة وتسوية الأرصدة مع مدير الموارد البشرية',
          payload: {
            year: currentYear,
            standardEntitlement: STANDARD_ANNUAL_DAYS,
            overLimitCount: overLimit.length,
            employees: overLimit,
          },
        });
        exceptionsRaised++;
      } catch (err) {
        this.logger.error(
          `[hr.leave-balance-recompute] Failed to raise exception: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    return {
      status: exceptionsRaised > 0 ? 'exception_raised' : 'completed',
      itemsProcessed: employees.length,
      exceptionsRaised,
      details: {
        year: currentYear,
        totalEmployeesChecked: employees.length,
        employeesWithApprovedLeave: leaveAggregates.length,
        employeesOverLimit: overLimit.length,
        standardEntitlement: STANDARD_ANNUAL_DAYS,
      },
    };
  }
}
