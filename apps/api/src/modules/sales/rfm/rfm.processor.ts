import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { RfmService } from './rfm.service';

export const RFM_QUEUE = 'rfm';
export const RFM_RECOMPUTE_JOB = 'rfm.recompute-all';

/**
 * T44 — BullMQ processor for nightly RFM recompute.
 *
 * Runs in the same NestJS process; the BullModule is registered globally in
 * app.module.ts (Redis-backed). Repeat schedule is wired by RfmScheduler.
 */
@Processor(RFM_QUEUE)
export class RfmProcessor {
  private readonly logger = new Logger(RfmProcessor.name);

  constructor(private readonly rfm: RfmService) {}

  @Process(RFM_RECOMPUTE_JOB)
  async handleRecomputeAll(job: Job): Promise<{ companies: number; customers: number }> {
    this.logger.log(`Starting RFM recompute (job ${job.id})`);
    const t0 = Date.now();
    const result = await this.rfm.recomputeAll();
    this.logger.log(
      `RFM recompute done in ${Date.now() - t0}ms — ${result.customers} customers / ${result.companies} companies`,
    );
    return result;
  }
}
