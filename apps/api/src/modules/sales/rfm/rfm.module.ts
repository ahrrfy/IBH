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
 */
@Module({
  imports: [BullModule.registerQueue({ name: RFM_QUEUE })],
  controllers: [RfmController],
  providers: [RfmService, RfmProcessor, RfmScheduler],
  exports: [RfmService],
})
export class RfmModule {}
