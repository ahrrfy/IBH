import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AutopilotEngineService } from '../autopilot.service';
import {
  AutopilotJob,
  AutopilotJobContext,
  AutopilotJobMeta,
  AutopilotJobResult,
} from '../autopilot.types';

// ─── delivery.failed-redelivery ──────────────────────────────────────────────
// Cron: 08:00 daily.
// Goal: flag delivery orders stuck in 'failed' or 'returned' status that have
// had 2+ failure events in their status log — these need human intervention
// (contacting the customer, updating the address, or issuing a credit note).
//
// Algorithm:
//   1. Find all DeliveryOrders with status in ['failed', 'returned'] for
//      this company.
//   2. For each, count DeliveryStatusLog entries where toStatus = 'failed'.
//      If failureCount >= 2, raise a warning exception.
//   3. 'returned' orders also count as a final failure — always raise if
//      there was at least one prior 'failed' attempt logged.
//
// Note: DeliveryOrder has no direct attemptCount field in the schema.
//       We derive attempt count from DeliveryStatusLog.toStatus = 'failed'.

@Injectable()
export class DeliveryFailedRedeliveryJob implements AutopilotJob {
  private readonly logger = new Logger(DeliveryFailedRedeliveryJob.name);

  readonly meta: AutopilotJobMeta = {
    id: 'delivery.failed-redelivery',
    domain: 'delivery',
    schedule: '0 8 * * *',
    companyScoped: true,
    titleAr: 'إعادة جدولة التوصيل الفاشل',
    titleEn: 'Failed Redelivery',
    description:
      'Daily 08:00 — flags deliveries with 2+ failed attempts that need human intervention (returned or stuck in failed state).',
  };

  constructor(
    private readonly db: PrismaService,
    private readonly engine: AutopilotEngineService,
  ) {}

  async execute(ctx: AutopilotJobContext): Promise<AutopilotJobResult> {
    // ── 1. Find all failed/returned delivery orders ──────────────────────────
    const failedOrders = await this.db.deliveryOrder.findMany({
      where: {
        companyId: ctx.companyId,
        status: { in: ['failed', 'returned'] },
      },
      select: {
        id: true,
        number: true,
        status: true,
        failedAt: true,
        failureReason: true,
        driverId: true,
        customerId: true,
        codAmountIqd: true,
        deliveryAddress: true,
        deliveryCity: true,
        statusLogs: {
          where: { toStatus: 'failed' },
          select: { id: true, changedAt: true, notes: true },
          orderBy: { changedAt: 'asc' },
        },
      },
    });

    if (failedOrders.length === 0) {
      return { status: 'no_op', itemsProcessed: 0, exceptionsRaised: 0 };
    }

    // ── 2. Filter: only those with >= 2 failure events ──────────────────────
    // For 'returned' with 1 failure log: still flag (returned = definitive)
    const needsIntervention = failedOrders.filter((order) => {
      const failureCount = order.statusLogs.length;
      if (order.status === 'returned') return true; // always flag returned
      return failureCount >= 2; // flag repeated failures
    });

    if (needsIntervention.length === 0) {
      return { status: 'no_op', itemsProcessed: failedOrders.length, exceptionsRaised: 0 };
    }

    // ── 3. Raise one warning per order needing intervention ──────────────────
    let exceptionsRaised = 0;

    for (const order of needsIntervention) {
      const attemptCount = order.statusLogs.length;
      const isReturned = order.status === 'returned';

      const statusLabel = isReturned ? 'مُعاد' : 'فاشل';
      const addressInfo = [order.deliveryCity, order.deliveryAddress]
        .filter(Boolean)
        .join(' — ');

      const codAmount = Number(order.codAmountIqd);
      const hasCod = codAmount > 0;

      try {
        await this.engine.raiseException({
          jobId: this.meta.id,
          domain: 'delivery',
          companyId: ctx.companyId,
          severity: 'medium',
          title: `توصيل ${statusLabel} متكرر — ${order.number}`,
          description: [
            `${attemptCount} محاولة فاشلة`,
            addressInfo ? `العنوان: ${addressInfo}` : null,
            order.failureReason ? `السبب: ${order.failureReason}` : null,
            hasCod
              ? `COD: ${codAmount.toLocaleString('ar-IQ')} د.ع`
              : null,
          ]
            .filter(Boolean)
            .join(' — '),
          suggestedAction: isReturned
            ? 'التواصل مع العميل لإعادة الجدولة أو إصدار إشعار دائن إذا رُفض التسليم'
            : 'مراجعة العنوان مع العميل وإعادة جدولة التوصيل أو تعيين سائق مختلف',
          payload: {
            deliveryId: order.id,
            orderRef: order.number,
            status: order.status,
            failureAttempts: attemptCount,
            failedAt: order.failedAt?.toISOString() ?? null,
            failureReason: order.failureReason,
            driverId: order.driverId,
            customerId: order.customerId,
            codAmountIqd: codAmount,
            deliveryCity: order.deliveryCity,
          },
        });
        exceptionsRaised++;
      } catch (err) {
        this.logger.error(
          `[failed-redelivery] failed to raise exception for delivery=${order.id}`,
          err instanceof Error ? err.stack : String(err),
        );
      }
    }

    this.logger.log(
      `[failed-redelivery] company=${ctx.companyId} — ${failedOrders.length} failed/returned checked, ${needsIntervention.length} need intervention, ${exceptionsRaised} exceptions raised`,
    );

    return {
      status: exceptionsRaised > 0 ? 'exception_raised' : 'no_op',
      itemsProcessed: failedOrders.length,
      exceptionsRaised,
      details: {
        totalFailedOrReturned: failedOrders.length,
        needsIntervention: needsIntervention.length,
        returnedOrders: needsIntervention.filter((o) => o.status === 'returned').length,
        repeatedFailures: needsIntervention.filter((o) => o.status === 'failed').length,
      },
    };
  }
}
