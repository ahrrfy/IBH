import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import {
  InitiatePaymentResult,
  PaymentGateway,
  PaymentGatewayContext,
  RefundPaymentResult,
  VerifyPaymentResult,
  WebhookVerificationContext,
} from './payment-gateway.interface';

/**
 * Cash-on-Delivery gateway (T55).
 *
 * COD is the default and the only fully-live payment path in the Iraqi
 * launch. There is no third-party provider — money lives between the driver
 * and the customer until the delivery is marked delivered with a captured
 * `codCollectedIqd`. From an accounting perspective the JE happens later via
 * DeliveryService.depositCod() (already implemented), so this gateway is a
 * thin lifecycle adapter: it never moves money on its own.
 */
@Injectable()
export class CodGateway implements PaymentGateway {
  readonly name = 'cod';
  private readonly logger = new Logger(CodGateway.name);

  constructor(private readonly prisma: PrismaService) {}

  async initiate(ctx: PaymentGatewayContext): Promise<InitiatePaymentResult> {
    // Reference IS the order id — there is no external transaction yet.
    return {
      status:    'pending_delivery',
      reference: ctx.orderId,
    };
  }

  /**
   * For COD, the source of truth for "did the money arrive?" is the linked
   * delivery dispatch. We look up any DeliveryOrder that points at the SO,
   * and if it's `delivered` and the collected COD covers the order total,
   * we report the payment as paid. Anything else is still pending.
   */
  async verify(reference: string): Promise<VerifyPaymentResult> {
    const order = await this.prisma.salesOrder.findFirst({
      where: { id: reference },
      select: { id: true, totalIqd: true, deliveries: { select: { id: true, status: true, codCollectedIqd: true } } },
    });
    if (!order) {
      return { status: 'failed', txId: reference, message: 'order_not_found' };
    }

    const delivered = order.deliveries.find((d) => d.status === 'delivered');
    if (!delivered) {
      return { status: 'pending', txId: reference };
    }

    const collected = Number(delivered.codCollectedIqd ?? 0);
    const expected  = Number(order.totalIqd);
    if (collected >= expected && expected > 0) {
      return {
        status:    'paid',
        txId:      delivered.id,
        amountIqd: collected,
      };
    }

    return {
      status:    'pending',
      txId:      delivered.id,
      amountIqd: collected,
      message:   'cod_short_collection',
    };
  }

  /**
   * COD refunds happen by physically returning cash on a return trip; the
   * accounting reverse runs via DeliveryService.markReturned(). The gateway
   * itself has nothing to call — we just acknowledge.
   */
  async refund(txId: string, amountIqd: number): Promise<RefundPaymentResult> {
    this.logger.log(`COD refund acknowledged tx=${txId} amount=${amountIqd}`);
    return { status: 'refunded', refundId: `cod-refund-${txId}` };
  }

  /** COD has no webhooks — provider isn't involved. */
  async parseWebhook(_ctx: WebhookVerificationContext): Promise<VerifyPaymentResult> {
    throw new Error('COD has no webhook channel');
  }
}
