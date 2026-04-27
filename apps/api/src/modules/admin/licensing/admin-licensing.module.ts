import { Module } from '@nestjs/common';
import { AuditModule } from '../../../engines/audit/audit.module';
import { AdminLicensingController } from './admin-licensing.controller';
import { AdminLicensingService } from './admin-licensing.service';
import { AdminLicensingAnalyticsController } from './analytics.controller';
import { AdminLicensingAnalyticsService } from './analytics.service';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';

@Module({
  imports: [AuditModule],
  controllers: [
    AdminLicensingController,
    AdminLicensingAnalyticsController,
    BillingController,
  ],
  providers: [
    AdminLicensingService,
    AdminLicensingAnalyticsService,
    BillingService,
  ],
  exports: [
    AdminLicensingService,
    AdminLicensingAnalyticsService,
    BillingService,
  ],
})
export class AdminLicensingModule {}
