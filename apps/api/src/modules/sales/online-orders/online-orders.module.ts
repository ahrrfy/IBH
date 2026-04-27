import { Module } from '@nestjs/common';
import { DeliveryModule } from '../../delivery/delivery.module';
import { PaymentsModule } from '../../payments/payments.module';
import { OnlineOrdersController } from './online-orders.controller';
import { OnlineOrdersService } from './online-orders.service';

/**
 * Online orders module (T55) — payment-gateway dispatch + delivery hand-off
 * + public status endpoints for the e-commerce flow.
 */
@Module({
  imports:     [DeliveryModule, PaymentsModule],
  controllers: [OnlineOrdersController],
  providers:   [OnlineOrdersService],
  exports:     [OnlineOrdersService],
})
export class OnlineOrdersModule {}
