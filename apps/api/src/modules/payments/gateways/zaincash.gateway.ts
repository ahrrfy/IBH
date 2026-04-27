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
 * ZainCash gateway — STUB ONLY (T55).
 *
 * ZainCash is the dominant Iraqi mobile-wallet provider. The real
 * integration uses JWT-signed init requests, a hosted redirect page, and an
 * IPN callback signed with HS256 against a merchant secret.
 *
 * This stub:
 *   - Returns a deterministic placeholder reference so the UI flow can be
 *     built and exercised end-to-end without a merchant account.
 *   - Throws `NotImplementedError` for any operation that would require
 *     contacting the live API.
 *   - Reads env (`ZAINCASH_MERCHANT_ID`, `ZAINCASH_SECRET`,
 *     `ZAINCASH_MSISDN`) so production can light it up by adding code +
 *     env vars without schema changes.
 *
 * TODO(T55+):
 *   1. POST sign(init payload, ZAINCASH_SECRET) → /transaction/init
 *   2. Build redirectUrl from returned token
 *   3. Webhook: verify HS256 signature, then status mapping
 *   4. Refund endpoint: /transaction/refund
 */
@Injectable()
export class ZainCashGateway implements PaymentGateway {
  readonly name = 'zaincash';
  private readonly logger = new Logger(ZainCashGateway.name);

  private get merchantId(): string {
    return process.env.ZAINCASH_MERCHANT_ID ?? '';
  }

  private get secret(): string {
    return process.env.ZAINCASH_SECRET ?? '';
  }

  /**
   * Returns a placeholder reference. We deliberately do NOT contact the
   * provider — this is a build-time stub. Callers should treat the returned
   * `redirectUrl` as a sentinel and surface a "coming soon" UI state rather
   * than redirecting customers anywhere real.
   */
  async initiate(ctx: PaymentGatewayContext): Promise<InitiatePaymentResult> {
    this.logger.warn(
      `ZainCash STUB: initiate called for order=${ctx.orderId} amount=${ctx.amountIqd}; live API not wired`,
    );
    if (!this.merchantId || !this.secret) {
      // Allow the stub to flow in dev without env, but log loudly.
      this.logger.warn('ZAINCASH_MERCHANT_ID / ZAINCASH_SECRET not set — using local-only placeholder');
    }
    return {
      status:      'pending',
      reference:   `zc-stub-${ctx.orderId}`,
      redirectUrl: `/payments/stub/zaincash/${ctx.orderId}`,
    };
  }

  async verify(_reference: string): Promise<VerifyPaymentResult> {
    throw new NotImplementedError('ZainCashGateway', 'verify');
  }

  async refund(_txId: string, _amountIqd: number): Promise<RefundPaymentResult> {
    throw new NotImplementedError('ZainCashGateway', 'refund');
  }

  async parseWebhook(_ctx: WebhookVerificationContext): Promise<VerifyPaymentResult> {
    // Refusing all webhooks until signature verification is implemented is
    // the only safe behaviour — see header comment.
    throw new NotImplementedError('ZainCashGateway', 'parseWebhook');
  }
}
