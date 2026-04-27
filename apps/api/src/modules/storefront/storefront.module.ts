import { Module } from '@nestjs/common';
import { SequenceModule } from '../../engines/sequence/sequence.module';
import { InventoryModule } from '../inventory/inventory.module';
import { OnlineOrdersModule } from '../sales/online-orders/online-orders.module';
import { StorefrontController } from './storefront.controller';
import { StorefrontService } from './storefront.service';
import { CustomerPortalModule } from './customer-portal/customer-portal.module';

/**
 * Public-facing storefront module (T54).
 *
 * Mounts read-only catalog endpoints + a public order-creation endpoint
 * under /public/*. All requests are unauthenticated and tenant-scoped via
 * the STOREFRONT_COMPANY_ID env var. T56 adds customer-portal routes
 * (/public/auth/* and /public/portal/*) via the imported sub-module.
 */
@Module({
  imports: [SequenceModule, InventoryModule, OnlineOrdersModule, CustomerPortalModule],
  controllers: [StorefrontController],
  providers: [StorefrontService],
})
export class StorefrontModule {}
