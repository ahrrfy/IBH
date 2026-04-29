import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AutopilotEngineService } from '../autopilot.service';
import {
  AutopilotJob,
  AutopilotJobContext,
  AutopilotJobMeta,
  AutopilotJobResult,
} from '../autopilot.types';

const LOOKBACK_DAYS = 7;
const MAX_ORDERS = 30;

/**
 * Sunday 10:00 — flag customers who completed a delivery in the past 7 days
 * but haven't rated it. Prompts sales team to send NPS follow-up.
 */
@Injectable()
export class CrmNpsPulseJob implements AutopilotJob {
  private readonly logger = new Logger(CrmNpsPulseJob.name);

  readonly meta: AutopilotJobMeta = {
    id: 'crm.nps-pulse',
    domain: 'crm',
    schedule: '0 10 * * 0',
    companyScoped: true,
    titleAr: 'متابعة تقييم العملاء (NPS)',
    titleEn: 'NPS Pulse',
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: AutopilotEngineService,
  ) {}

  async execute(ctx: AutopilotJobContext): Promise<AutopilotJobResult> {
    const { companyId } = ctx;
    const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000);
    let exceptionsRaised = 0;

    let unrated: Array<{ id: string; number: string; customerId: string; deliveredAt: Date | null }> = [];
    try {
      unrated = await this.prisma.deliveryOrder.findMany({
        where: {
          companyId,
          status: 'delivered',
          deliveredAt: { gte: since },
          customerRating: null,
        },
        select: { id: true, number: true, customerId: true, deliveredAt: true },
        take: MAX_ORDERS,
      });
    } catch (err) {
      this.logger.error(`[${this.meta.id}] ${err instanceof Error ? err.message : String(err)}`);
      return { status: 'failed', itemsProcessed: 0, exceptionsRaised: 0, details: { reason: 'db_error' } };
    }

    for (const d of unrated) {
      await this.engine.raiseException({
        jobId: this.meta.id, domain: 'crm', companyId, severity: 'low',
        title: 'توصيل بدون تقييم — أرسل استطلاع رضا',
        description: `طلب التوصيل #${d.number} اكتمل بدون تقييم — يُنصح بإرسال استطلاع رضا للعميل`,
        suggestedAction: 'إرسال رسالة NPS للعميل عبر SMS أو WhatsApp',
        payload: { deliveryOrderId: d.id, customerId: d.customerId, deliveredAt: d.deliveredAt },
      });
      exceptionsRaised++;
    }

    return {
      status: exceptionsRaised > 0 ? 'exception_raised' : 'no_op',
      itemsProcessed: unrated.length,
      exceptionsRaised,
      details: { unratedDeliveries: unrated.length },
    };
  }
}