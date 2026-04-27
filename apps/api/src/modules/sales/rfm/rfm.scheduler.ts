import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { RFM_QUEUE, RFM_RECOMPUTE_JOB } from './rfm.processor';

/**
 * T44 — Registers the nightly RFM recompute as a Bull repeatable job.
 *
 * Runs every day at 02:30 server time (low-traffic window for retail).
 * The `jobId` keeps the schedule idempotent across restarts so the
 * registration acts as upsert.
 */
@Injectable()
export class RfmScheduler implements OnModuleInit {
  private readonly logger = new Logger(RfmScheduler.name);

  constructor(@InjectQueue(RFM_QUEUE) private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    if (process.env.RFM_DISABLE_SCHEDULER === '1') {
      this.logger.warn('RFM scheduler disabled (RFM_DISABLE_SCHEDULER=1)');
      return;
    }

    // Idempotent: re-register on each boot so cron/options changes take effect.
    const repeatables = await this.queue.getRepeatableJobs();
    for (const r of repeatables) {
      if (r.name === RFM_RECOMPUTE_JOB) {
        await this.queue.removeRepeatableByKey(r.key);
      }
    }

    await this.queue.add(
      RFM_RECOMPUTE_JOB,
      {},
      {
        repeat: { cron: '30 2 * * *' }, // 02:30 every day
        removeOnComplete: 50,
        removeOnFail: 100,
        jobId: 'rfm.recompute-all.nightly',
      },
    );

    this.logger.log(`RFM nightly recompute scheduled (cron 30 2 * * *)`);
  }
}
