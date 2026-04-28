import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { RfmService } from './rfm.service';
import { RfmController } from './rfm.controller';
import { RfmProcessor, RFM_QUEUE } from './rfm.processor';
import { RfmScheduler } from './rfm.scheduler';

/**
 * T44 — RFM module.
 *
 * Hosts the recompute service, manual controller, BullMQ processor,
 * and the bootstrap scheduler that registers the nightly repeatable job.
 *
 * In test environments (JEST_WORKER_ID / NODE_ENV=test) the BullMQ
 * processor + scheduler are NOT registered — each e2e spec spins up
 * AppModule, and a long-lived processor against an ephemeral Redis
 * connection caused 26 unrelated suites to fail with
 * "Queue.setHandler: Connection is closed".
 */
// I046 — RfmProcessor + RfmScheduler removed from providers. @nestjs/bull
// v10.2.3 BullExplorer double-registers @Process handlers causing the api
// to crash with "Cannot define the same handler twice". Service stays so
// callers can enqueue manually; cron will be re-wired in I047.
@Module({
  imports: [BullModule.registerQueue({ name: RFM_QUEUE })],
  controllers: [RfmController],
  providers: [RfmService],
  exports: [RfmService],
})
export class RfmModule {}
