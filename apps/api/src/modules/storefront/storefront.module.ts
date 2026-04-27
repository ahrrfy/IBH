import { Module } from '@nestjs/common';
import { SequenceModule } from '../../engines/sequence/sequence.module';
import { InventoryModule } from '../inventory/inventory.module';
import { OnlineOrdersModule } from '../sales/online-orders/online-orders.module';
import { StorefrontController } from './storefront.controller';
import { StorefrontService } from './storefront.service';

/**
 * Public-facing storefront module (T54).
 *
 * Mounts read-only catalog endpoints + a public order-creation endpoint
 * under /public/*. All requests are unauthenticated and tenant-scoped via
 * the STOREFRONT_COMPANY_ID env var.
 */
@Module({
  imports: [SequenceModule, InventoryModule, OnlineOrdersModule],
  controllers: [StorefrontController],
  providers: [StorefrontService],
})
export class StorefrontModule {}
