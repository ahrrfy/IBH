import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { AuditModule } from '../../../engines/audit/audit.module';
import { BudgetService } from './budget.service';
import { BudgetController } from './budget.controller';
import { VarianceService } from './variance.service';
import {
  VarianceAlertProcessor,
  BUDGET_VARIANCE_QUEUE,
} from './variance-alert.processor';

/**
 * T49 — Budget Module + Variance.
 *
 * Read-only against accounting (no journal posting). Provides budget CRUD,
 * variance comparison vs posted journal entries, and a daily cron that
 * surfaces 80%/100%/120% threshold alerts via NotificationsService (T46).
 */
@Module({
  imports: [
    AuditModule,
    BullModule.registerQueue({ name: BUDGET_VARIANCE_QUEUE }),
  ],
  controllers: [BudgetController],
  providers: [BudgetService, VarianceService, VarianceAlertProcessor],
  exports: [BudgetService, VarianceService],
})
export class BudgetModule {}
