import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AutopilotEngineService } from '../autopilot.service';
import { AutopilotJob, AutopilotJobContext, AutopilotJobMeta, AutopilotJobResult } from '../autopilot.types';

// Cron: 06:00 UTC on the 1st of every month. Summary of active licenses, expiries, and revenue.

@Injectable()
export class LicenseUsageReportJob implements AutopilotJob {
  private readonly logger = new Logger(LicenseUsageReportJob.name);

  readonly meta: AutopilotJobMeta = {
    id: 'license.usage-report',
    domain: 'license',
    schedule: '0 6 1 * *',
    companyScoped: true,
    titleAr: 'تقرير استخدام التراخيص',
    titleEn: 'License Usage Report',
    description: 'Monthly on the 1st — summarizes active license keys, upcoming expirations, and key events.',
  };

  constructor(private readonly prisma: PrismaService, private readonly engine: AutopilotEngineService) {}

  async execute(ctx: AutopilotJobContext): Promise<AutopilotJobResult> {
    const now = new Date();
    const in30Days = new Date(now.getTime() + 30 * 86_400_000);

    const [active, expiringSoon, recentEvents] = await Promise.all([
      this.prisma.licenseKey.count({ where: { revokedAt: null, expiresAt: { gt: now } } }).catch(() => 0),
      this.prisma.licenseKey.count({ where: { revokedAt: null, expiresAt: { gt: now, lte: in30Days } } }).catch(() => 0),
      this.prisma.licenseEvent.count({ where: { createdAt: { gte: new Date(now.getTime() - 30 * 86_400_000) } } }).catch(() => 0),
    ]);

    const monthName = new Date(now.getFullYear(), now.getMonth() - 1).toLocaleString('ar', { month: 'long' });
    let exceptionsRaised = 0;
    try {
      await this.engine.raiseException({
        jobId: this.meta.id, domain: 'license', companyId: ctx.companyId, severity: 'low',
        title: `تقرير التراخيص — ${monthName}`,
        description: `نشط: ${active} — ينتهي قريباً: ${expiringSoon} — أحداث الشهر: ${recentEvents}`,
        suggestedAction: expiringSoon > 0 ? 'مراجعة التراخيص المنتهية قريباً وتجديدها' : 'لا إجراء مطلوب',
        payload: { active, expiringSoon, recentEvents, month: monthName },
      });
      exceptionsRaised++;
    } catch { /* continue */ }

    return { status: 'exception_raised', itemsProcessed: active, exceptionsRaised, details: { active, expiringSoon, recentEvents } };
  }
}