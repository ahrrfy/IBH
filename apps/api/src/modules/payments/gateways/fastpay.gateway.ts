import { Injectable, Logger } from '@nestjs/common';
import {
  InitiatePaymentResult,
  NotImplementedError,
  PaymentGateway,
  PaymentGatewayContext,
  RefundPaymentResult,
  VerifyPaymentResult,
  WebhookVerificationContext,
} from './payment-gateway.interface';

/**
 * FastPay gateway — STUB ONLY (T55).
 *
 * FastPay is a second Iraqi wallet provider. The shape of the integration
 * mirrors ZainCash (init → redirect → webhook). Same stub policy applies:
 *
 *   - `initiate()` returns a placeholder reference so UI flows can be built.
 *   - All other operations throw `NotImplementedError`.
 *   - Reads `FASTPAY_MERCHANT_ID` / `FASTPAY_SECRET` to leave env wiring
 *     ready for the real implementation.
 *
 * TODO(T55+): wire the real /v1/order/create + signed webhook handler.
 */
@Injectable()
export class FastPayGateway implements PaymentGateway {
  readonly name = 'fastpay';
  private readonly logger = new Logger(FastPayGateway.name);

  private get merchantId(): string {
    return process.env.FASTPAY_MERCHANT_ID ?? '';
  }

  private get secret(): string {
    return process.env.FASTPAY_SECRET ?? '';
  }

  async initiate(ctx: PaymentGatewayContext): Promise<InitiatePaymentResult> {
    this.logger.warn(
      `FastPay STUB: initiate called for order=${ctx.orderId} amount=${ctx.amountIqd}; live API not wired`,
    );
    if (!this.merchantId || !this.secret) {
      this.logger.warn('FASTPAY_MERCHANT_ID / FASTPAY_SECRET not set — using local-only placeholder');
    }
    return {
      status:      'pending',
      reference:   `fp-stub-${ctx.orderId}`,
      redirectUrl: `/payments/stub/fastpay/${ctx.orderId}`,
    };
  }

  async verify(_reference: string): Promise<VerifyPaymentResult> {
    throw new NotImplementedError('FastPayGateway', 'verify');
  }

  async refund(_txId: string, _amountIqd: number): Promise<RefundPaymentResult> {
    throw new NotImplementedError('FastPayGateway', 'refund');
  }

  async parseWebhook(_ctx: WebhookVerificationContext): Promise<VerifyPaymentResult> {
    throw new NotImplementedError('FastPayGateway', 'parseWebhook');
  }
}
