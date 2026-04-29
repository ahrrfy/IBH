import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AutopilotEngineService } from '../autopilot.service';
import { AutopilotJob, AutopilotJobContext, AutopilotJobMeta, AutopilotJobResult } from '../autopilot.types';

// Cron: 09:00 UTC daily. Raise low-severity exception for employees with birthday today.

@Injectable()
export class HrBirthdayGreetingJob implements AutopilotJob {
  private readonly logger = new Logger(HrBirthdayGreetingJob.name);

  readonly meta: AutopilotJobMeta = {
    id: 'hr.birthday-greeting',
    domain: 'hr',
    schedule: '0 9 * * *',
    companyScoped: true,
    titleAr: 'تهنئة أعياد الميلاد',
    titleEn: 'Birthday Greeting',
    description: 'Daily 09:00 — raises a low-severity exception for employees with a birthday today.',
  };

  constructor(private readonly prisma: PrismaService, private readonly engine: AutopilotEngineService) {}

  async execute(ctx: AutopilotJobContext): Promise<AutopilotJobResult> {
    const now = new Date();
    const month = now.getUTCMonth() + 1;
    const day = now.getUTCDate();
    let birthdays: Array<{ id: string; nameAr: string; dateOfBirth: Date | null }> = [];
    try {
      birthdays = await this.prisma.$queryRaw<Array<{ id: string; nameAr: string; dateOfBirth: Date }>>`
        SELECT id, "nameAr", "dateOfBirth"
        FROM employees
        WHERE "companyId" = ${ctx.companyId}
          AND status = 'active'
          AND "deletedAt" IS NULL
          AND "dateOfBirth" IS NOT NULL
          AND EXTRACT(MONTH FROM "dateOfBirth") = ${month}
          AND EXTRACT(DAY FROM "dateOfBirth") = ${day}
      `;
    } catch (err) {
      this.logger.error(`[hr.birthday-greeting] DB error: ${err instanceof Error ? err.message : String(err)}`);
      return { status: 'no_op', itemsProcessed: 0, exceptionsRaised: 0, details: { reason: 'db_error' } };
    }
    if (birthdays.length === 0) return { status: 'completed', itemsProcessed: 0, exceptionsRaised: 0 };
    let exceptionsRaised = 0;
    for (const emp of birthdays) {
      const birthYear = emp.dateOfBirth ? new Date(emp.dateOfBirth).getUTCFullYear() : null;
      const age = birthYear ? now.getUTCFullYear() - birthYear : null;
      const ageText = age !== null ? ` — يتم ${age} عاماً` : '';
      try {
        await this.engine.raiseException({
          jobId: this.meta.id, domain: 'hr', companyId: ctx.companyId, severity: 'low',
          title: `عيد ميلاد ${emp.nameAr}${ageText}`,
          description: `اليوم عيد ميلاد الموظف ${emp.nameAr}${ageText}`,
          suggestedAction: 'إرسال تهنئة عبر WhatsApp',
          payload: { employeeId: emp.id, employeeName: emp.nameAr, age },
        });
        exceptionsRaised++;
      } catch { /* continue */ }
    }
    return { status: exceptionsRaised > 0 ? 'exception_raised' : 'completed', itemsProcessed: birthdays.length, exceptionsRaised, details: { birthdaysToday: birthdays.length } };
  }
}