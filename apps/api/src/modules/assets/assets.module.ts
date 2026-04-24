import { Module } from '@nestjs/common';
import { AuditModule } from '../../engines/audit/audit.module';
import { SequenceModule } from '../../engines/sequence/sequence.module';
import { PostingModule } from '../../engines/posting/posting.module';
import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';
import { DepreciationService } from './depreciation.service';

@Module({
  imports: [AuditModule, SequenceModule, PostingModule],
  controllers: [AssetsController],
  providers: [AssetsService, DepreciationService],
  exports: [AssetsService, DepreciationService],
})
export class AssetsModule {}
