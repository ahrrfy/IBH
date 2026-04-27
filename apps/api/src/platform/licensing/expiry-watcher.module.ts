import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import {
  ExpiryWatcherProcessor,
  LICENSE_EXPIRY_QUEUE,
} from './expiry-watcher.processor';

/**
 * T69 — License Expiry Watcher Module.
 *
 * Hosts a single BullMQ processor that runs daily at 06:00 UTC and emits
 * reminder notifications via the T46 NotificationsService when an active
 * subscription approaches its `currentPeriodEndAt`. NotificationsModule is
 * registered as @Global, so we don't need to re-import it here.
 */
@Module({
  imports: [BullModule.registerQueue({ name: LICENSE_EXPIRY_QUEUE })],
  providers: [ExpiryWatcherProcessor],
  exports: [ExpiryWatcherProcessor],
})
export class ExpiryWatcherModule {}
