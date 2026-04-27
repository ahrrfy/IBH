import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import {
  ExpiryWatcherProcessor,
  LICENSE_EXPIRY_QUEUE,
} from './expiry-watcher.processor';
import {
  TrialExpiryProcessor,
  TRIAL_EXPIRY_QUEUE,
} from './trial-expiry.processor';
import { TrialService } from './trial.service';

/**
 * T69 + T61 — License Expiry Watcher Module.
 *
 * Hosts two daily BullMQ processors at 06:00 UTC:
 *   - ExpiryWatcherProcessor (T69): paid-subscription period-end reminders
 *   - TrialExpiryProcessor   (T61): trial → grace → expired transitions
 * plus the manual TrialService verbs (startTrial, extendTrial, convertTrialToPaid).
 *
 * NotificationsModule is registered as @Global so we don't re-import it.
 */
@Module({
  imports: [
    BullModule.registerQueue({ name: LICENSE_EXPIRY_QUEUE }),
    BullModule.registerQueue({ name: TRIAL_EXPIRY_QUEUE }),
  ],
  providers: [ExpiryWatcherProcessor, TrialExpiryProcessor, TrialService],
  exports: [ExpiryWatcherProcessor, TrialExpiryProcessor, TrialService],
})
export class ExpiryWatcherModule {}
