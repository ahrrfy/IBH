import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AutopilotEngineService } from '../autopilot.service';
import { DeliveryStatus } from '@prisma/client';
import {
  AutopilotJob,
  AutopilotJobContext,
  AutopilotJobMeta,
  AutopilotJobResult,
} from '../autopilot.types';

/** Every 30 min — find in-transit deliveries past their plannedDate. */
@Injectable()
export class DeliveryEtaDeviationJob implements AutopilotJob {
  private readonly logger = new Logger(DeliveryEtaDeviationJob.name);

  readonly meta: AutopilotJobMeta = {
    id: 'delivery.eta-deviation',
    domain: 'delivery',
    schedule: '*/30 * * * *',
    companyScoped: true,
    titleAr: 'كشف انحراف وقت الوصول',
    titleEn: 'ETA Deviation',
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: AutopilotEngineService,
  ) {}

  async execute(ctx: AutopilotJobContext): Promise<AutopilotJobResult> {
    const { companyId } = ctx;
    const now = new Date();
    let exceptionsRaised = 0;

    let overdue: Array<{ id: string; number: string; plannedDate: Date | null; driverId: string | null }> = [];
    try {
      overdue = await this.prisma.deliveryOrder.findMany({
        where: {
          companyId,
          status: { in: [DeliveryStatus.in_transit, DeliveryStatus.assigned] },
          plannedDate: { not: null, lt: now },
        },
        select: { id: true, number: true, plannedDate: true, driverId: true },
        take: 50,
      });
    } catch (err) {
      this.logger.error(`[${this.meta.id}] ${err instanceof Error ? err.message : String(err)}`);
      return { status: 'failed', itemsProcessed: 0, exceptionsRaised: 0, details: { reason: 'db_error' } };
    }

    for (const d of overdue) {
      const hoursLate = Math.floor(
        (now.getTime() - (d.plannedDate as Date).getTime()) / 3_600_000,
      );
      await this.engine.raiseException({
        jobId: this.meta.id, domain: 'delivery', companyId,
        severity: hoursLate >= 4 ? 'high' : 'medium',
        title: 'تأخير في التوصيل',
        description: `طلب توصيل #${d.number} متأخر ${hoursLate} ساعة عن الموعد المحدد`,
        suggestedAction: 'التواصل مع السائق والعميل لتحديث الموقف',
        payload: { deliveryOrderId: d.id, driverId: d.driverId, hoursLate, plannedDate: d.plannedDate },
      });
      exceptionsRaised++;
    }

    return {
      status: exceptionsRaised > 0 ? 'exception_raised' : 'no_op',
      itemsProcessed: overdue.length,
      exceptionsRaised,
      details: { overdueCount: overdue.length, checkedAt: now.toISOString() },
    };
  }
}