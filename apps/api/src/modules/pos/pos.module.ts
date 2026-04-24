import { Module } from '@nestjs/common';
import { POSDevicesController } from './devices/pos-devices.controller';
import { POSDevicesService } from './devices/pos-devices.service';
import { ShiftsController } from './shifts/shifts.controller';
import { ShiftsService } from './shifts/shifts.service';
import { ReceiptsController } from './receipts/receipts.controller';
import { ReceiptsService } from './receipts/receipts.service';
import { CashMovementsController } from './cash/cash-movements.controller';
import { CashMovementsService } from './cash/cash-movements.service';
import { AuditModule } from '../../engines/audit/audit.module';
import { SequenceModule } from '../../engines/sequence/sequence.module';
import { PostingModule } from '../../engines/posting/posting.module';
import { PolicyModule } from '../../engines/policy/policy.module';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [AuditModule, SequenceModule, PostingModule, PolicyModule, InventoryModule],
  controllers: [POSDevicesController, ShiftsController, ReceiptsController, CashMovementsController],
  providers: [POSDevicesService, ShiftsService, ReceiptsService, CashMovementsService],
  exports: [ShiftsService, ReceiptsService],
})
export class POSModule {}
