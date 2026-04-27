import { BadRequestException, Injectable } from '@nestjs/common';
import { CodGateway } from './cod.gateway';
import { FastPayGateway } from './fastpay.gateway';
import { PaymentGateway } from './payment-gateway.interface';
import { ZainCashGateway } from './zaincash.gateway';

/**
 * Factory that selects a PaymentGateway implementation by name.
 *
 * Keeping the lookup in a single place lets controllers / services treat
 * gateways as interchangeable — they ask for `'cod'` / `'zaincash'` /
 * `'fastpay'` and never depend on concrete classes. Unknown gateway names
 * raise a 400 instead of falling back silently.
 */
@Injectable()
export class PaymentGatewayFactory {
  private readonly gateways: Record<string, PaymentGateway>;

  constructor(
    cod: CodGateway,
    zainCash: ZainCashGateway,
    fastPay: FastPayGateway,
  ) {
    this.gateways = {
      [cod.name]:       cod,
      [zainCash.name]:  zainCash,
      [fastPay.name]:   fastPay,
    };
  }

  /** Resolve a gateway by `paymentMethod`. Throws if the name is unknown. */
  get(name: string): PaymentGateway {
    const g = this.gateways[name];
    if (!g) {
      throw new BadRequestException({
        code:      'PAYMENT_GATEWAY_UNKNOWN',
        messageAr: `طريقة الدفع غير مدعومة: ${name}`,
      });
    }
    return g;
  }

  /** True iff the given name maps to a registered gateway. */
  has(name: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.gateways, name);
  }

  /** List of supported gateway names — useful for `/payments/methods` UIs. */
  list(): string[] {
    return Object.keys(this.gateways);
  }
}
