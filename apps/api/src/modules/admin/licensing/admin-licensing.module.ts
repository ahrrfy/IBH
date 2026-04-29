import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { AuditModule } from '../../../engines/audit/audit.module';
import { AdminLicensingController } from './admin-licensing.controller';
import { AdminLicensingService } from './admin-licensing.service';
import { AdminLicensingAnalyticsController } from './analytics.controller';
import { AdminLicensingAnalyticsService } from './analytics.service';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { BillingSweepProcessor, BILLING_SWEEP_QUEUE } from './billing-sweep.processor';

@Module({
  imports: [
    AuditModule,
    // T70 — daily billing sweep cron (02:00 UTC, idempotent)
    BullModule.registerQueue({ name: BILLING_SWEEP_QUEUE }),
  ],
  controllers: [
    AdminLicensingController,
    AdminLicensingAnalyticsController,
    BillingController,
  ],
  providers: [
    AdminLicensingService,
    AdminLicensingAnalyticsService,
    BillingService,
    BillingSweepProcessor,
  ],
  exports: [
    AdminLicensingService,
    AdminLicensingAnalyticsService,
    BillingService,
  ],
})
export class AdminLicensingModule {}
