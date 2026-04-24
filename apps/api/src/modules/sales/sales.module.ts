import { Module } from '@nestjs/common';
import { CustomersController } from './customers/customers.controller';
import { CustomersService } from './customers/customers.service';
import { QuotationsController } from './quotations/quotations.controller';
import { QuotationsService } from './quotations/quotations.service';
import { SalesOrdersController } from './orders/sales-orders.controller';
import { SalesOrdersService } from './orders/sales-orders.service';
import { SalesInvoicesController } from './invoices/sales-invoices.controller';
import { SalesInvoicesService } from './invoices/sales-invoices.service';
import { SalesReturnsController } from './returns/sales-returns.controller';
import { SalesReturnsService } from './returns/sales-returns.service';
import { AuditModule } from '../../engines/audit/audit.module';
import { SequenceModule } from '../../engines/sequence/sequence.module';
import { PostingModule } from '../../engines/posting/posting.module';
import { PolicyModule } from '../../engines/policy/policy.module';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [AuditModule, SequenceModule, PostingModule, PolicyModule, InventoryModule],
  controllers: [
    CustomersController,
    QuotationsController,
    SalesOrdersController,
    SalesInvoicesController,
    SalesReturnsController,
  ],
  providers: [
    CustomersService,
    QuotationsService,
    SalesOrdersService,
    SalesInvoicesService,
    SalesReturnsService,
  ],
  exports: [SalesInvoicesService, CustomersService],
})
export class SalesModule {}
