import { Module } from '@nestjs/common';
import { AuditModule } from '../../engines/audit/audit.module';
import { LeadsService } from './leads/leads.service';
import { LeadsController } from './leads/leads.controller';
import { ActivitiesService } from './activities/activities.service';
import { ActivitiesController } from './activities/activities.controller';
import { PipelineService } from './pipeline/pipeline.service';
import { PipelineController } from './pipeline/pipeline.controller';

@Module({
  imports: [AuditModule],
  controllers: [LeadsController, ActivitiesController, PipelineController],
  providers: [LeadsService, ActivitiesService, PipelineService],
  exports: [LeadsService, ActivitiesService, PipelineService],
})
export class CrmModule {}
