import { Module } from '@nestjs/common';
import { PostingService } from './posting.service';
import { SequenceModule } from '../sequence/sequence.module';

@Module({
  imports: [SequenceModule],
  providers: [PostingService],
  exports: [PostingService],
})
export class PostingModule {}
