import { Module } from '@nestjs/common';
import { AuditModule } from '../../../engines/audit/audit.module';
import { InventoryIntelligenceController } from './intelligence.controller';
import { InventoryIntelligenceService } from './intelligence.service';

@Module({
  imports: [AuditModule],
  controllers: [InventoryIntelligenceController],
  providers: [InventoryIntelligenceService],
  exports: [InventoryIntelligenceService],
})
export class InventoryIntelligenceModule {}
