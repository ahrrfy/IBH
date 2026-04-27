import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { AutoReorderService } from './auto-reorder.service';

// We avoid importing the `Job` type from `bull` directly (it's a transitive
// dep of @nestjs/bull) — defining the data shape locally keeps this file's
// dependency surface minimal.
interface BullJob<T> { data: T }

// ─── BullMQ Processor (T42) ─────────────────────────────────────────────────
// Wires AutoReorderService into the BullMQ queue infrastructure that's already
// configured in app.module.ts. Once the platform-level scheduler (cron) is
// wired up (separate task — outside T42 scope), it can enqueue
// `inventory:auto-reorder` jobs nightly per company. For now the controller
// endpoint is the canonical trigger; this processor is here so jobs queued
// by other services (e.g. a future scheduler) get handled.

export interface AutoReorderJobData {
  companyId: string;
  warehouseIds?: string[];
  skipScan?: boolean;
  triggeredBy?: string;
}

export const AUTO_REORDER_QUEUE = 'inventory:auto-reorder';
export const AUTO_REORDER_RUN_JOB = 'run';

@Processor(AUTO_REORDER_QUEUE)
export class AutoReorderProcessor {
  private readonly logger = new Logger(AutoReorderProcessor.name);

  constructor(private readonly service: AutoReorderService) {}

  @Process(AUTO_REORDER_RUN_JOB)
  async handleRun(job: BullJob<AutoReorderJobData>): Promise<void> {
    const { companyId, warehouseIds, skipScan, triggeredBy } = job.data;
    this.logger.log(`[T42] processing auto-reorder for company=${companyId}`);
    try {
      const result = await this.service.run(companyId, {
        warehouseIds,
        skipScan,
        triggeredBy,
      });
      this.logger.log(
        `[T42] company=${companyId} draftPos=${result.draftPosCreated} ` +
        `flagsCreated=${result.flagsCreated} resolved=${result.flagsResolved}`,
      );
    } catch (err) {
      this.logger.error(`[T42] auto-reorder failed for company=${companyId}`, err);
      throw err;
    }
  }
}
