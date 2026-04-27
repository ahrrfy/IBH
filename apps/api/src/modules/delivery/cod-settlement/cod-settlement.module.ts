import { Module } from '@nestjs/common';
import { CodSettlementController } from './cod-settlement.controller';
import { CodSettlementService } from './cod-settlement.service';
import { AuditModule } from '../../../engines/audit/audit.module';
import { SequenceModule } from '../../../engines/sequence/sequence.module';
import { PostingModule } from '../../../engines/posting/posting.module';

@Module({
  imports: [AuditModule, SequenceModule, PostingModule],
  controllers: [CodSettlementController],
  providers: [CodSettlementService],
  exports: [CodSettlementService],
})
export class CodSettlementModule {}
