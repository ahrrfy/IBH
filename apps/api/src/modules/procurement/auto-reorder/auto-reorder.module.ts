import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { AuditModule } from '../../../engines/audit/audit.module';
import { SequenceModule } from '../../../engines/sequence/sequence.module';
import { InventoryIntelligenceModule } from '../../inventory/intelligence/intelligence.module';
import { AutoReorderController } from './auto-reorder.controller';
import { AutoReorderService } from './auto-reorder.service';
import { AUTO_REORDER_QUEUE, AutoReorderProcessor } from './auto-reorder.processor';

// ─── Procurement / Auto-Reorder Module (T42) ────────────────────────────────
// New top-level module under apps/api/src/modules/procurement/. Lives next to
// the legacy `purchases` module rather than inside it because the engine
// orchestrates Inventory + Purchases and would create a circular module
// import otherwise.

@Module({
  imports: [
    AuditModule,
    SequenceModule,
    InventoryIntelligenceModule,
    BullModule.registerQueue({ name: AUTO_REORDER_QUEUE }),
  ],
  controllers: [AutoReorderController],
  // I046 — AutoReorderProcessor removed; same @nestjs/bull explorer crash.
  providers: [AutoReorderService],
  exports: [AutoReorderService],
})
export class ProcurementAutoReorderModule {}
