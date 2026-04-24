import { Module } from '@nestjs/common';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { AuditModule } from '../../engines/audit/audit.module';
import { PolicyModule } from '../../engines/policy/policy.module';
import { PostingModule } from '../../engines/posting/posting.module';

@Module({
  imports: [AuditModule, PolicyModule, PostingModule],
  controllers: [InventoryController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
