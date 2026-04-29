import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AutopilotEngineService } from '../autopilot.service';
import { AutopilotJob, AutopilotJobContext, AutopilotJobMeta, AutopilotJobResult } from '../autopilot.types';

// Cron: 10:00 UTC daily. Iraqi Labor Law probation = 90 days from hireDate.
// Alert when probation ends within 7 days.

const PROBATION_DAYS = 90;
const LOOKAHEAD_DAYS = 7;
const MS_PER_DAY = 86_400_000;

@Injectable()
export class HrProbationEndFlagJob implements AutopilotJob {
  private readonly logger = new Logger(HrProbationEndFlagJob.name);

  readonly meta: AutopilotJobMeta = {
    id: 'hr.probation-end-flag',
    domain: 'hr',
    schedule: '0 10 * * *',
    companyScoped: true,
    titleAr: 'تنبيه نهاية فترة التجربة',
    titleEn: 'Probation End Flag',
    description: 'Daily 10:00 — flags employees whose 90-day probation ends within 7 days.',
  };

  constructor(private readonly prisma: PrismaService, private readonly engine: AutopilotEngineService) {}

  async execute(ctx: AutopilotJobContext): Promise<AutopilotJobResult> {
    const now = new Date();
    now.setUTCHours(0, 0, 0, 0);
    const hireDateMin = new Date(now.getTime() - PROBATION_DAYS * MS_PER_DAY);
    const hireDateMax = new Date(now.getTime() - (PROBATION_DAYS - LOOKAHEAD_DAYS) * MS_PER_DAY);
    let employees: Array<{ id: string; nameAr: string; hireDate: Date }> = [];
    try {
      employees = await this.prisma.employee.findMany({
        where: {
          companyId: ctx.companyId, status: 'active', deletedAt: null,
          hireDate: { gte: hireDateMin, lte: hireDateMax },
        },
        select: { id: true, nameAr: true, hireDate: true },
        orderBy: { hireDate: 'asc' },
      });
    } catch (err) {
      this.logger.error(`[hr.probation-end-flag] DB error: ${err instanceof Error ? err.message : String(err)}`);
      return { status: 'no_op', itemsProcessed: 0, exceptionsRaised: 0, details: { reason: 'db_error' } };
    }
    if (employees.length === 0) return { status: 'completed', itemsProcessed: 0, exceptionsRaised: 0 };
    let exceptionsRaised = 0;
    for (const emp of employees) {
      const probationEnd = new Date(emp.hireDate.getTime() + PROBATION_DAYS * MS_PER_DAY);
      const daysLeft = Math.max(0, Math.ceil((probationEnd.getTime() - now.getTime()) / MS_PER_DAY));
      const probationEndStr = probationEnd.toISOString().split('T')[0];
      try {
        await this.engine.raiseException({
          jobId: this.meta.id, domain: 'hr', companyId: ctx.companyId,
          severity: daysLeft <= 2 ? 'medium' : 'low',
          title: `فترة تجربة ${emp.nameAr} تنتهي خلال ${daysLeft} يوم`,
          description: `تنتهي فترة التجربة بتاريخ ${probationEndStr}`,
          suggestedAction: 'مراجعة أداء الموظف واتخاذ قرار التثبيت',
          payload: { employeeId: emp.id, employeeName: emp.nameAr, probationEnd: probationEndStr, daysLeft },
        });
        exceptionsRaised++;
      } catch { /* continue */ }
    }
    return { status: exceptionsRaised > 0 ? 'exception_raised' : 'completed', itemsProcessed: employees.length, exceptionsRaised, details: { probationEndingSoon: employees.length } };
  }
}