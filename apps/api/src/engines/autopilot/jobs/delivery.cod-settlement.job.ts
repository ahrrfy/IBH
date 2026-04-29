import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AutopilotEngineService } from '../autopilot.service';
import {
  AutopilotJob,
  AutopilotJobContext,
  AutopilotJobMeta,
  AutopilotJobResult,
} from '../autopilot.types';

// ─── delivery.cod-settlement ─────────────────────────────────────────────────
// Cron: 23:00 daily.
// Goal: flag COD delivery orders that were delivered more than 7 days ago but
// the collected cash has not yet been deposited/settled (codDepositedAt IS NULL
// and codSettlementId IS NULL).
//
// This prevents lost cash — drivers holding collected COD too long is a
// financial control risk. Each unsettled delivery raises a warning.
//
// Fields used from DeliveryOrder:
//   - companyId          — company scoping
//   - status             — must be 'delivered'
//   - codAmountIqd       — must be > 0 (actually a COD order)
//   - deliveredAt        — delivery timestamp
//   - codDepositedAt     — set when cash is deposited at cashbox
//   - codSettlementId    — set when a CodSettlement record is created
//   - number             — order reference for the exception message
//   - driverId           — for context

@Injectable()
export class DeliveryCodSettlementJob implements AutopilotJob {
  private readonly logger = new Logger(DeliveryCodSettlementJob.name);

  readonly meta: AutopilotJobMeta = {
    id: 'delivery.cod-settlement',
    domain: 'delivery',
    schedule: '0 23 * * *',
    companyScoped: true,
    titleAr: 'تسوية الدفع عند الاستلام',
    titleEn: 'COD Settlement',
    description:
      'Daily 23:00 — flags COD deliveries completed >7 days ago where cash has not been deposited; prevents untracked cash in transit.',
  };

  constructor(
    private readonly db: PrismaService,
    private readonly engine: AutopilotEngineService,
  ) {}

  async execute(ctx: AutopilotJobContext): Promise<AutopilotJobResult> {
    const settlementDeadline = new Date(
      ctx.startedAt.getTime() - 7 * 24 * 60 * 60 * 1000,
    );

    // ── 1. Find unsettled COD deliveries older than 7 days ──────────────────
    const unsettled = await this.db.deliveryOrder.findMany({
      where: {
        companyId: ctx.companyId,
        status: 'delivered',
        codAmountIqd: { gt: 0 }, // only actual COD orders
        deliveredAt: {
          not: null,
          lt: settlementDeadline,
        },
        codDepositedAt: null,
        codSettlementId: null,
      },
      select: {
        id: true,
        number: true,
        deliveredAt: true,
        codAmountIqd: true,
        codCollectedIqd: true,
        driverId: true,
        deliveryCompanyId: true,
        customerId: true,
      },
      orderBy: { deliveredAt: 'asc' }, // oldest first
    });

    if (unsettled.length === 0) {
      return { status: 'no_op', itemsProcessed: 0, exceptionsRaised: 0 };
    }

    // ── 2. Raise one warning per unsettled delivery ──────────────────────────
    let exceptionsRaised = 0;
    let totalUnsettledIqd = 0;

    for (const delivery of unsettled) {
      const deliveredAt = delivery.deliveredAt as Date;
      const msElapsed = ctx.startedAt.getTime() - deliveredAt.getTime();
      const daysElapsed = Math.floor(msElapsed / (24 * 60 * 60 * 1000));

      const codAmount = Number(delivery.codAmountIqd);
      totalUnsettledIqd += codAmount;

      try {
        await this.engine.raiseException({
          jobId: this.meta.id,
          domain: 'delivery',
          companyId: ctx.companyId,
          severity: 'medium',
          title: `COD غير مُسوَّى — طلبية ${delivery.number}`,
          description: `تم التسليم منذ ${daysElapsed} يوم — المبلغ المحصّل: ${codAmount.toLocaleString('ar-IQ')} د.ع — لم يتم إيداع النقد بعد.`,
          suggestedAction:
            'مراجعة الطلبية وإيداع المبلغ المحصّل في الصندوق أو إنشاء تسوية COD',
          payload: {
            deliveryId: delivery.id,
            orderRef: delivery.number,
            deliveredAt: deliveredAt.toISOString(),
            daysElapsed,
            codAmountIqd: codAmount,
            codCollectedIqd: Number(delivery.codCollectedIqd),
            driverId: delivery.driverId,
            deliveryCompanyId: delivery.deliveryCompanyId,
          },
        });
        exceptionsRaised++;
      } catch (err) {
        this.logger.error(
          `[cod-settlement] failed to raise exception for delivery=${delivery.id}`,
          err instanceof Error ? err.stack : String(err),
        );
      }
    }

    this.logger.log(
      `[cod-settlement] company=${ctx.companyId} — ${unsettled.length} unsettled COD deliveries, total ${totalUnsettledIqd.toLocaleString('ar-IQ')} د.ع, ${exceptionsRaised} exceptions raised`,
    );

    return {
      status: exceptionsRaised > 0 ? 'exception_raised' : 'no_op',
      itemsProcessed: unsettled.length,
      exceptionsRaised,
      details: {
        unsettledDeliveries: unsettled.length,
        totalUnsettledIqd: Math.round(totalUnsettledIqd),
        settlementThresholdDays: 7,
      },
    };
  }
}
