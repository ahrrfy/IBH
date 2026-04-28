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
  // I046 — VarianceAlertProcessor removed from providers. @nestjs/bull v10.2.3
  // BullExplorer was double-registering @Process('scan') causing api crash.
  // Cron logic can be re-enabled via a separate scheduler service or restored
  // once the explorer issue is debugged in I047.
  providers: [BudgetService, VarianceService],
  exports: [BudgetService, VarianceService],
})
export class BudgetModule {}
