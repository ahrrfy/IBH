import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AutopilotEngineService } from '../autopilot.service';
import {
  AutopilotJob,
  AutopilotJobContext,
  AutopilotJobMeta,
  AutopilotJobResult,
} from '../autopilot.types';

const IMBALANCE_RATIO = 2.5;

/** Daily 06:00 — detect imbalanced delivery workload across drivers for today. */
@Injectable()
export class DeliveryDriverLoadBalanceJob implements AutopilotJob {
  private readonly logger = new Logger(DeliveryDriverLoadBalanceJob.name);

  readonly meta: AutopilotJobMeta = {
    id: 'delivery.driver-load-balance',
    domain: 'delivery',
    schedule: '0 6 * * *',
    companyScoped: true,
    titleAr: 'موازنة حمل السائقين',
    titleEn: 'Driver Load Balance',
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: AutopilotEngineService,
  ) {}

  async execute(ctx: AutopilotJobContext): Promise<AutopilotJobResult> {
    const { companyId } = ctx;
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    type Row = { driverId: string; _count: { _all: number } };
    let rows: Row[] = [];
    try {
      rows = await (this.prisma.deliveryOrder as any).groupBy({
        by: ['driverId'],
        where: {
          companyId,
          driverId: { not: null },
          status: { in: ['pending_dispatch', 'assigned', 'in_transit'] as any[] },
          plannedDate: { gte: todayStart },
        },
        _count: { _all: true },
        orderBy: [{ driverId: 'asc' }],
      });
    } catch (err) {
      this.logger.error(`[${this.meta.id}] ${err instanceof Error ? err.message : String(err)}`);
      return { status: 'failed', itemsProcessed: 0, exceptionsRaised: 0, details: { reason: 'db_error' } };
    }

    if (rows.length < 2) {
      return { status: 'no_op', itemsProcessed: rows.length, exceptionsRaised: 0 };
    }

    const total  = rows.reduce((s, r) => s + r._count._all, 0);
    const avg    = total / rows.length;
    const maxRow = rows.reduce((m, r) => (r._count._all > m._count._all ? r : m));
    let exceptionsRaised = 0;

    if (maxRow._count._all > avg * IMBALANCE_RATIO) {
      await this.engine.raiseException({
        jobId: this.meta.id, domain: 'delivery', companyId, severity: 'medium',
        title: 'سائق محمّل بزيادة',
        description: `سائق محمّل بـ ${maxRow._count._all} طلب مقابل متوسط ${avg.toFixed(1)} — يُنصح بإعادة توزيع الطلبات`,
        suggestedAction: 'إعادة تعيين بعض طلبات هذا السائق لسائق أقل حملاً',
        payload: { driverId: maxRow.driverId, orderCount: maxRow._count._all, avg, total },
      });
      exceptionsRaised++;
    }

    return {
      status: exceptionsRaised > 0 ? 'exception_raised' : 'no_op',
      itemsProcessed: rows.length,
      exceptionsRaised,
      details: { drivers: rows.length, totalOrders: total, avgPerDriver: avg },
    };
  }
}