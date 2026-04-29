import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AutopilotEngineService } from '../autopilot.service';
import {
  AutopilotJob,
  AutopilotJobContext,
  AutopilotJobMeta,
  AutopilotJobResult,
} from '../autopilot.types';

const LOOKBACK_DAYS = 30;

/** Monday 02:00 — flag active delivery zones with no deliveries in last 30 days. */
@Injectable()
export class DeliveryZoneCoverageAuditJob implements AutopilotJob {
  private readonly logger = new Logger(DeliveryZoneCoverageAuditJob.name);

  readonly meta: AutopilotJobMeta = {
    id: 'delivery.zone-coverage-audit',
    domain: 'delivery',
    schedule: '0 2 * * 1',
    companyScoped: true,
    titleAr: 'تدقيق تغطية مناطق التوصيل',
    titleEn: 'Zone Coverage Audit',
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: AutopilotEngineService,
  ) {}

  async execute(ctx: AutopilotJobContext): Promise<AutopilotJobResult> {
    const { companyId } = ctx;
    const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000);
    let exceptionsRaised = 0;

    let zones: Array<{ id: string; nameAr: string; city: string | null }> = [];
    let coveredCities: Set<string> = new Set();

    try {
      zones = await this.prisma.deliveryZone.findMany({
        where: { companyId, isActive: true },
        select: { id: true, nameAr: true, city: true },
      });

      const recentDeliveries = await this.prisma.deliveryOrder.findMany({
        where: {
          companyId,
          status: 'delivered',
          deliveredAt: { gte: since },
          deliveryCity: { not: null },
        },
        select: { deliveryCity: true },
        distinct: ['deliveryCity'],
      });

      coveredCities = new Set(recentDeliveries.map((d) => d.deliveryCity?.toLowerCase() ?? ''));
    } catch (err) {
      this.logger.error(`[${this.meta.id}] ${err instanceof Error ? err.message : String(err)}`);
      return { status: 'failed', itemsProcessed: 0, exceptionsRaised: 0, details: { reason: 'db_error' } };
    }

    if (zones.length === 0) {
      return { status: 'no_op', itemsProcessed: 0, exceptionsRaised: 0 };
    }

    for (const zone of zones) {
      const city = zone.city?.toLowerCase() ?? '';
      if (city && !coveredCities.has(city)) {
        await this.engine.raiseException({
          jobId: this.meta.id, domain: 'delivery', companyId, severity: 'low',
          title: 'منطقة توصيل غير مغطاة',
          description: `منطقة "${zone.nameAr}" (${zone.city}) لم تُغطَّ بأي توصيل خلال ${LOOKBACK_DAYS} يوم`,
          suggestedAction: 'مراجعة تغطية هذه المنطقة وتعيين سائق مسؤول عنها',
          payload: { zoneId: zone.id, city: zone.city, lookbackDays: LOOKBACK_DAYS },
        });
        exceptionsRaised++;
      }
    }

    return {
      status: exceptionsRaised > 0 ? 'exception_raised' : 'no_op',
      itemsProcessed: zones.length,
      exceptionsRaised,
      details: { zonesChecked: zones.length, uncovered: exceptionsRaised },
    };
  }
}