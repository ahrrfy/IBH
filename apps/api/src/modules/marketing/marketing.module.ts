import { Module } from '@nestjs/common';
import { AuditModule } from '../../engines/audit/audit.module';
import { SequenceModule } from '../../engines/sequence/sequence.module';
import { PostingModule } from '../../engines/posting/posting.module';
import { CampaignsService } from './campaigns/campaigns.service';
import { CampaignsController } from './campaigns/campaigns.controller';
import { PromotionsService } from './promotions/promotions.service';
import { PromotionsController } from './promotions/promotions.controller';

@Module({
  imports: [AuditModule, SequenceModule, PostingModule],
  controllers: [CampaignsController, PromotionsController],
  providers: [CampaignsService, PromotionsService],
  exports: [CampaignsService, PromotionsService],
})
export class MarketingModule {}
