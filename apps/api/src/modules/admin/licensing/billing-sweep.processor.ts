import { Process, Processor, InjectQueue } from '@nestjs/bull';
import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import type { Queue } from 'bull';
import { BillingService } from './billing.service';

/**
 * T70 — Billing Sweep Processor
 *
 * Runs daily at 02:00 UTC (off-peak). Calls {@link BillingService.generatePeriodInvoices}
 * which is fully idempotent — unique constraint on (subscriptionId, periodStart,
 * periodEnd) guarantees re-runs never create duplicate invoices.
 *
 * Manual trigger available via POST /admin/billing/generate (BillingController).
 * This cron complements that endpoint with automatic nightly execution.
 */
export const BILLING_SWEEP_QUEUE = 'billing-sweep';
export const BILLING_SWEEP_JOB   = 'generate-period-invoices';

@Injectable()
@Processor(BILLING_SWEEP_QUEUE)
export class BillingSweepProcessor implements OnModuleInit {
  private readonly logger = new Logger(BillingSweepProcessor.name);

  constructor(
    @Optional() @InjectQueue(BILLING_SWEEP_QUEUE) private readonly queue: Queue | undefined,
    private readonly billing: BillingService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.queue) return;
    try {
      // Remove stale repeatables from prior deploys before re-scheduling.
      const existing = await this.queue.getRepeatableJobs();
      for (const job of existing) {
        if (job.name === BILLING_SWEEP_JOB) {
          await this.queue.removeRepeatableByKey(job.key);
        }
      }
      await this.queue.add(
        BILLING_SWEEP_JOB,
        {},
        {
          repeat: { cron: '0 2 * * *' }, // 02:00 UTC daily
          jobId: 'billing-sweep-daily',
          removeOnComplete: 50,
          removeOnFail: 20,
        },
      );
      this.logger.log('Billing sweep cron scheduled (02:00 UTC daily)');
    } catch (err) {
      this.logger.warn(`Failed to schedule billing sweep cron: ${err}`);
    }
  }

  @Process(BILLING_SWEEP_JOB)
  async handleSweep(): Promise<void> {
    this.logger.log('Billing sweep starting');
    try {
      const result = await this.billing.generatePeriodInvoices();
      this.logger.log(
        `Billing sweep done — scanned: ${result.scanned}, created: ${result.created}, skipped: ${result.skipped}`,
      );
    } catch (err) {
      this.logger.error(`Billing sweep failed: ${err}`);
      throw err;
    }
  }
}
