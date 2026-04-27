import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../../platform/notifications/notifications.module';
import { ProcurementAutoReorderModule } from '../../modules/procurement/auto-reorder/auto-reorder.module';
import { AutopilotEngineService } from './autopilot.service';
import { AutopilotController } from './autopilot.controller';
import {
  AUTOPILOT_QUEUE,
  AutopilotProcessor,
  AutopilotScheduler,
} from './autopilot.scheduler';
import { AUTOPILOT_JOBS } from './autopilot.tokens';
import { SalesOverdueReminderJob } from './jobs/sales.overdue-reminder.job';
import { InventoryAutoReorderJob } from './jobs/inventory.auto-reorder.job';
import { LicenseAutoRenewalJob } from './jobs/license.auto-renewal.job';
import { AutopilotJobScaffolds } from './jobs/stubs';
import type { AutopilotJob } from './autopilot.types';

// ─── T71 — Autonomous Operations Engine Module ──────────────────────────────
// Brings together:
//   * The 3 reference jobs (sales.overdue-reminder, inventory.auto-reorder,
//     license.auto-renewal) — fully implemented.
//   * The 47 scaffolded jobs from `jobs/stubs.ts` — register their metadata
//     so the catalogue endpoint shows the full roadmap.
//   * The BullMQ scheduler + processor that ticks every cron-scheduled job.
//   * The manager-facing controller at `/autopilot/*`.
//
// Job providers attach to the AUTOPILOT_JOBS multi-token. The engine reads
// the resulting array in its constructor — adding a new job is a one-line
// change here once its class is implemented.

@Module({
  imports: [
    AuditModule,
    NotificationsModule,
    ProcurementAutoReorderModule,
    BullModule.registerQueue({ name: AUTOPILOT_QUEUE }),
  ],
  controllers: [AutopilotController],
  providers: [
    AutopilotEngineService,
    AutopilotScheduler,
    AutopilotProcessor,

    // Reference jobs.
    SalesOverdueReminderJob,
    InventoryAutoReorderJob,
    LicenseAutoRenewalJob,

    // Scaffold builder.
    AutopilotJobScaffolds,

    // Multi-collection of every AutopilotJob — one provider per registration.
    {
      provide: AUTOPILOT_JOBS,
      useFactory: (
        sales: SalesOverdueReminderJob,
        inventory: InventoryAutoReorderJob,
        license: LicenseAutoRenewalJob,
        scaffolds: AutopilotJobScaffolds,
      ): AutopilotJob[] => [
        sales,
        inventory,
        license,
        ...scaffolds.buildAll(),
      ],
      inject: [
        SalesOverdueReminderJob,
        InventoryAutoReorderJob,
        LicenseAutoRenewalJob,
        AutopilotJobScaffolds,
      ],
    },
  ],
  exports: [AutopilotEngineService],
})
export class AutopilotModule {}
