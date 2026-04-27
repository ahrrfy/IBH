import { Module } from '@nestjs/common';
import { CodGateway } from './gateways/cod.gateway';
import { FastPayGateway } from './gateways/fastpay.gateway';
import { PaymentGatewayFactory } from './gateways/payment-gateway.factory';
import { ZainCashGateway } from './gateways/zaincash.gateway';

/**
 * PaymentsModule (T55).
 *
 * Registers the gateway implementations + factory. Concrete gateways are
 * provided here so they share a single module-level Logger context and so
 * other modules can simply `imports: [PaymentsModule]` and inject
 * `PaymentGatewayFactory`.
 *
 * Real money-moving wiring (JE posting on webhook-confirmed payment) lives
 * in the OnlineOrders flow — gateways themselves are stateless adapters.
 */
@Module({
  providers: [CodGateway, ZainCashGateway, FastPayGateway, PaymentGatewayFactory],
  exports:   [PaymentGatewayFactory],
})
export class PaymentsModule {}
