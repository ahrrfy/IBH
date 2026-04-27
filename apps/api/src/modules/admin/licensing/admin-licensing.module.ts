import { Module } from '@nestjs/common';
import { AuditModule } from '../../../engines/audit/audit.module';
import { AdminLicensingController } from './admin-licensing.controller';
import { AdminLicensingService } from './admin-licensing.service';
import { AdminLicensingAnalyticsController } from './analytics.controller';
import { AdminLicensingAnalyticsService } from './analytics.service';

@Module({
  imports: [AuditModule],
  controllers: [AdminLicensingController, AdminLicensingAnalyticsController],
  providers: [AdminLicensingService, AdminLicensingAnalyticsService],
  exports: [AdminLicensingService, AdminLicensingAnalyticsService],
})
export class AdminLicensingModule {}
