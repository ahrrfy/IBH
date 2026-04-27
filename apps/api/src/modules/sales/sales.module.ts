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
import { OmnichannelController } from './omnichannel/omnichannel.controller';
import { OmnichannelService } from './omnichannel/omnichannel.service';
import { IntentExtractorService } from './omnichannel/intent-extractor.service';
import { AuditModule } from '../../engines/audit/audit.module';
import { SequenceModule } from '../../engines/sequence/sequence.module';
import { PostingModule } from '../../engines/posting/posting.module';
import { PolicyModule } from '../../engines/policy/policy.module';
import { InventoryModule } from '../inventory/inventory.module';
import { FinanceModule } from '../finance/finance.module';
import { SalesCommissionsModule } from './commissions/commissions.module';
import { Customer360Module } from './customer-360/customer-360.module';
import { RfmModule } from './rfm/rfm.module';

@Module({
  imports: [
    AuditModule,
    SequenceModule,
    PostingModule,
    PolicyModule,
    InventoryModule,
    FinanceModule,
    SalesCommissionsModule,
    Customer360Module,
    RfmModule,
  ],
  controllers: [
    CustomersController,
    QuotationsController,
    SalesOrdersController,
    SalesInvoicesController,
    SalesReturnsController,
    OmnichannelController,
  ],
  providers: [
    CustomersService,
    QuotationsService,
    SalesOrdersService,
    SalesInvoicesService,
    SalesReturnsService,
    OmnichannelService,
    IntentExtractorService,
  ],
  exports: [SalesInvoicesService, CustomersService, SalesCommissionsModule],
})
export class SalesModule {}
