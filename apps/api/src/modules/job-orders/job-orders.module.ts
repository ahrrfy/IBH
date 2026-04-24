import { Module } from '@nestjs/common';
import { AuditModule } from '../../engines/audit/audit.module';
import { SequenceModule } from '../../engines/sequence/sequence.module';
import { PostingModule } from '../../engines/posting/posting.module';
import { JobOrdersService } from './job-orders.service';
import { JobOrdersController } from './job-orders.controller';

@Module({
  imports: [AuditModule, SequenceModule, PostingModule],
  controllers: [JobOrdersController],
  providers: [JobOrdersService],
  exports: [JobOrdersService],
})
export class JobOrdersModule {}
