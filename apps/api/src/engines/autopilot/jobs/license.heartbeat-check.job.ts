import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AutopilotEngineService } from '../autopilot.service';
import { AutopilotJob, AutopilotJobContext, AutopilotJobMeta, AutopilotJobResult } from '../autopilot.types';

// Cron: every 4 hours. Flag active license keys that have not sent a heartbeat in 24h.
// A silent license may indicate: VPS down, network issue, or license guard bypassed.

const HEARTBEAT_STALE_HOURS = 24;

@Injectable()
export class LicenseHeartbeatCheckJob implements AutopilotJob {
  private readonly logger = new Logger(LicenseHeartbeatCheckJob.name);

  readonly meta: AutopilotJobMeta = {
    id: 'license.heartbeat-check',
    domain: 'license',
    schedule: '0 */4 * * *',
    companyScoped: true,
    titleAr: 'فحص نبضات التراخيص',
    titleEn: 'License Heartbeat Check',
    description: 'Every 4 hours — flags active license keys with no heartbeat in 24+ hours.',
  };

  constructor(private readonly prisma: PrismaService, private readonly engine: AutopilotEngineService) {}

  async execute(ctx: AutopilotJobContext): Promise<AutopilotJobResult> {
    const now = new Date();
    const staleThreshold = new Date(now.getTime() - HEARTBEAT_STALE_HOURS * 3_600_000);

    let silentKeys: Array<{ id: string; key: string; lastSeenAt: Date | null }> = [];
    try {
      silentKeys = await this.prisma.licenseKey.findMany({
        where: {
          revokedAt: null,
          expiresAt: { gt: now },
          OR: [
            { lastSeenAt: null },
            { lastSeenAt: { lt: staleThreshold } },
          ],
        },
        select: { id: true, key: true, lastSeenAt: true },
        take: 50,
        orderBy: { lastSeenAt: 'asc' },
      });
    } catch (err) {
      this.logger.error(`[license.heartbeat-check] DB error: ${err instanceof Error ? err.message : String(err)}`);
      return { status: 'no_op', itemsProcessed: 0, exceptionsRaised: 0, details: { reason: 'db_error' } };
    }

    if (silentKeys.length === 0) return { status: 'completed', itemsProcessed: 0, exceptionsRaised: 0 };

    let exceptionsRaised = 0;
    for (const lk of silentKeys) {
      const lastSeen = lk.lastSeenAt ? `منذ ${Math.floor((now.getTime() - lk.lastSeenAt.getTime()) / 3_600_000)} ساعة` : 'لم يتصل قط';
      try {
        await this.engine.raiseException({
          jobId: this.meta.id, domain: 'license', companyId: ctx.companyId, severity: 'medium',
          title: `ترخيص صامت — ${lastSeen}`,
          description: `مفتاح الترخيص لم يرسل نبضة حياة (${lastSeen})`,
          suggestedAction: 'التحقق من اتصال العميل بالخادم وإعادة تشغيل التطبيق إن لزم',
          payload: { licenseKeyId: lk.id, lastSeenAt: lk.lastSeenAt?.toISOString() ?? null },
        });
        exceptionsRaised++;
      } catch { /* continue */ }
    }

    return { status: exceptionsRaised > 0 ? 'exception_raised' : 'completed', itemsProcessed: silentKeys.length, exceptionsRaised, details: { silentLicenseCount: silentKeys.length } };
  }
}