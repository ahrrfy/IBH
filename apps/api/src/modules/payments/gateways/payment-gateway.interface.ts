/**
 * Payment gateway abstraction (T55).
 *
 * Every concrete gateway (COD, ZainCash, FastPay, …) implements this
 * interface so the OnlineOrdersService can drive payment lifecycle without
 * caring which provider is on the other end.
 *
 * Gateway implementations are STATELESS: they translate between an order /
 * amount and the provider's wire protocol. Persistence (paymentReference,
 * paymentStatus) is the caller's responsibility — keeps the gateways unit-
 * testable without a DB.
 */

export interface InitiatePaymentResult {
  /** Provider-specific status — not the SalesOrder.paymentStatus enum. */
  status: 'pending' | 'pending_delivery' | 'redirect' | 'failed';
  /** External reference / transaction id we should persist on the order. */
  reference: string;
  /** Browser redirect target (hosted-page gateways). */
  redirectUrl?: string;
  /** QR / deep-link payload for app-to-app gateways. */
  qr?: string;
}

export interface VerifyPaymentResult {
  status: 'pending' | 'paid' | 'failed' | 'refunded';
  txId: string;
  /** Captured amount in IQD (provider quote, not necessarily order total). */
  amountIqd?: number;
  /** Verbatim provider message — useful for ops dashboards. */
  message?: string;
}

export interface RefundPaymentResult {
  status: 'pending' | 'refunded' | 'failed';
  refundId?: string;
}

export interface PaymentGatewayContext {
  /** Tenant id — gateways may need it for provider account scoping. */
  companyId: string;
  /** ERP order id (ULID). */
  orderId: string;
  /** Order total in IQD. */
  amountIqd: number;
  /** Customer phone — required by ZainCash, useful for receipts. */
  customerPhone?: string;
}

export interface WebhookVerificationContext {
  /** Raw HTTP headers (signature lookup happens per gateway). */
  headers: Record<string, string | string[] | undefined>;
  /** Parsed body. */
  body: unknown;
}

/** Marker thrown by stub gateways for unimplemented live calls. */
export class NotImplementedError extends Error {
  constructor(gatewayName: string, op: string) {
    super(`${gatewayName}.${op} is not implemented in this build`);
    this.name = 'NotImplementedError';
  }
}

export interface PaymentGateway {
  /** Stable key, e.g. 'cod', 'zaincash'. Matches SalesOrder.paymentMethod. */
  readonly name: string;

  /**
   * Kick off a payment. For COD this is essentially a no-op + reference; for
   * online gateways it returns a redirect/QR for the customer.
   */
  initiate(ctx: PaymentGatewayContext): Promise<InitiatePaymentResult>;

  /** Confirm whether a payment with the given reference has settled. */
  verify(reference: string): Promise<VerifyPaymentResult>;

  /** Refund a captured payment. */
  refund(txId: string, amountIqd: number): Promise<RefundPaymentResult>;

  /**
   * Validate an incoming webhook (signature/HMAC/etc) and translate it into
   * the same VerifyPaymentResult shape `verify()` returns. Implementations
   * MUST reject (throw) unsigned/forged payloads — this is the only thing
   * standing between an attacker and a free `paymentStatus = 'paid'` write.
   */
  parseWebhook(ctx: WebhookVerificationContext): Promise<VerifyPaymentResult>;
}
