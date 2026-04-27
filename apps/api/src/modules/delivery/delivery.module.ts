import { Module } from '@nestjs/common';
import { DeliveryController } from './delivery.controller';
import { DeliveryService } from './delivery.service';
import { DeliveryCompaniesModule } from './delivery-companies/delivery-companies.module';
import { CodSettlementModule } from './cod-settlement/cod-settlement.module';
import { AuditModule } from '../../engines/audit/audit.module';
import { SequenceModule } from '../../engines/sequence/sequence.module';
import { PostingModule } from '../../engines/posting/posting.module';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [
    AuditModule,
    SequenceModule,
    PostingModule,
    InventoryModule,
    DeliveryCompaniesModule,
    CodSettlementModule,
  ],
  controllers: [DeliveryController],
  providers: [DeliveryService],
  exports: [DeliveryService, DeliveryCompaniesModule, CodSettlementModule],
})
export class DeliveryModule {}
