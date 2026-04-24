import { Module } from '@nestjs/common';
import { SuppliersController } from './suppliers/suppliers.controller';
import { SuppliersService } from './suppliers/suppliers.service';
import { PurchaseOrdersController } from './orders/purchase-orders.controller';
import { PurchaseOrdersService } from './orders/purchase-orders.service';
import { GRNController } from './grn/grn.controller';
import { GRNService } from './grn/grn.service';
import { VendorInvoicesController } from './invoices/vendor-invoices.controller';
import { VendorInvoicesService } from './invoices/vendor-invoices.service';
import { AuditModule } from '../../engines/audit/audit.module';
import { SequenceModule } from '../../engines/sequence/sequence.module';
import { PostingModule } from '../../engines/posting/posting.module';
import { PolicyModule } from '../../engines/policy/policy.module';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [AuditModule, SequenceModule, PostingModule, PolicyModule, InventoryModule],
  controllers: [
    SuppliersController,
    PurchaseOrdersController,
    GRNController,
    VendorInvoicesController,
  ],
  providers: [
    SuppliersService,
    PurchaseOrdersService,
    GRNService,
    VendorInvoicesService,
  ],
  exports: [SuppliersService, VendorInvoicesService],
})
export class PurchasesModule {}
