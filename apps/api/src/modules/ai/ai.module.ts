import { Module } from '@nestjs/common';
import { AuditModule } from '../../engines/audit/audit.module';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { AnomalyDetectionService } from './anomaly-detection.service';
import { NlQueryService } from './nl-query.service';
import { ForecastingService } from './forecasting.service';

@Module({
  imports: [AuditModule],
  controllers: [AiController],
  providers: [AiService, AnomalyDetectionService, NlQueryService, ForecastingService],
  exports: [AiService, AnomalyDetectionService, NlQueryService, ForecastingService],
})
export class AiModule {}
