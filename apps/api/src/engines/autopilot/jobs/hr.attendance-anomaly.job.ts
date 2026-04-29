import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AutopilotEngineService } from '../autopilot.service';
import {
  AutopilotJob,
  AutopilotJobContext,
  AutopilotJobMeta,
  AutopilotJobResult,
} from '../autopilot.types';

// ─── T71 Job: hr.attendance-anomaly ─────────────────────────────────────────
// Cron: 20:00 UTC daily — runs after expected end of workday.
// Goal: detect active employees who have no attendance record AND no approved
// leave for today. Raises 'info' when 1-3 employees are missing, 'warning'
// when 4 or more are missing. This is a read-only scan — no data is mutated.

/** Threshold (exclusive) above which severity escalates from info → warning. */
const WARNING_THRESHOLD = 3;

@Injectable()
export class HrAttendanceAnomalyJob implements AutopilotJob {
  private readonly logger = new Logger(HrAttendanceAnomalyJob.name);

  readonly meta: AutopilotJobMeta = {
    id: 'hr.attendance-anomaly',
    domain: 'hr',
    schedule: '0 20 * * *',
    companyScoped: true,
    titleAr: 'كشف شذوذ الحضور',
    titleEn: 'Attendance Anomaly',
    description:
      'Daily 20:00 scan — flags active employees with no attendance record and no approved leave for today.',
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: AutopilotEngineService,
  ) {}

  /**
   * Execute the attendance anomaly check for a single company.
   *
   * Business rule:
   *   An "anomaly" occurs when an active employee has neither:
   *     (a) an AttendanceRecord row for today, nor
   *     (b) an approved LeaveRequest that covers today.
   *
   * @param ctx - Job context including companyId.
   * @returns AutopilotJobResult with itemsProcessed = total active employees checked.
   */
  async execute(ctx: AutopilotJobContext): Promise<AutopilotJobResult> {
    // Build today's date boundaries in UTC.
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

    let activeEmployees: Array<{ id: string; nameAr: string }> = [];

    try {
      activeEmployees = await this.prisma.employee.findMany({
        where: {
          companyId: ctx.companyId,
          status: 'active',
          deletedAt: null,
        },
        select: { id: true, nameAr: true },
      });
    } catch (err) {
      this.logger.error(
        `[hr.attendance-anomaly] Failed to query employees for company=${ctx.companyId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return { status: 'no_op', itemsProcessed: 0, exceptionsRaised: 0, details: { reason: 'db_error' } };
    }

    if (activeEmployees.length === 0) {
      return { status: 'completed', itemsProcessed: 0, exceptionsRaised: 0 };
    }

    const missingEmployees: Array<{ id: string; nameAr: string }> = [];

    for (const emp of activeEmployees) {
      try {
        // Check for any attendance record today.
        const attendance = await this.prisma.attendanceRecord.findFirst({
          where: {
            employeeId: emp.id,
            companyId: ctx.companyId,
            date: { gte: today, lt: tomorrow },
          },
          select: { id: true },
        });

        if (attendance) continue;

        // Check for an approved leave that covers today.
        const approvedLeave = await this.prisma.leaveRequest.findFirst({
          where: {
            employeeId: emp.id,
            companyId: ctx.companyId,
            status: 'approved',
            startDate: { lte: today },
            endDate: { gte: today },
          },
          select: { id: true },
        });

        if (approvedLeave) continue;

        missingEmployees.push(emp);
      } catch (err) {
        this.logger.warn(
          `[hr.attendance-anomaly] Skipping employee=${emp.id} due to error: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    let exceptionsRaised = 0;

    if (missingEmployees.length > 0) {
      const severity = missingEmployees.length > WARNING_THRESHOLD ? 'medium' : 'low';
      const nameList = missingEmployees
        .slice(0, 5)
        .map((e) => e.nameAr)
        .join('، ');
      const moreText = missingEmployees.length > 5 ? ` وآخرون` : '';

      try {
        await this.engine.raiseException({
          jobId: this.meta.id,
          domain: 'hr',
          companyId: ctx.companyId,
          severity,
          title: `${missingEmployees.length} موظف بدون تسجيل حضور اليوم`,
          description: `الموظفون بدون حضور أو إجازة معتمدة اليوم: ${nameList}${moreText}`,
          suggestedAction: 'مراجعة سجلات الحضور وتسوية الغيابات أو تسجيلها يدوياً',
          payload: {
            date: today.toISOString().split('T')[0],
            count: missingEmployees.length,
            employeeIds: missingEmployees.map((e) => e.id),
          },
        });
        exceptionsRaised++;
      } catch (err) {
        this.logger.error(
          `[hr.attendance-anomaly] Failed to raise exception: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    return {
      status: exceptionsRaised > 0 ? 'exception_raised' : 'completed',
      itemsProcessed: activeEmployees.length,
      exceptionsRaised,
      details: {
        totalActive: activeEmployees.length,
        missingCount: missingEmployees.length,
        date: today.toISOString().split('T')[0],
      },
    };
  }
}
