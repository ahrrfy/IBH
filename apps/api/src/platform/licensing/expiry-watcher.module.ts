import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { LICENSE_EXPIRY_QUEUE } from './expiry-watcher.processor';
import { TRIAL_EXPIRY_QUEUE } from './trial-expiry.processor';
import { TrialService } from './trial.service';
// I047 — ExpiryWatcherProcessor + TrialExpiryProcessor classes removed from
// providers list to bypass @nestjs/bull's BullExplorer double-registration
// bug. Their queues remain registered (callers can still enqueue jobs);
// in-process consumption is paused until I048 picks a permanent solution
// (upgrade @nestjs/bull, switch to bullmq, or manual processor wiring).

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
    // I046 — variadic form (single registerQueue call). Two separate calls
    // create two BullExplorer instances which double-register every
    // @Processor in the app and trip "Cannot define the same handler twice".
    BullModule.registerQueue(
      { name: LICENSE_EXPIRY_QUEUE },
      { name: TRIAL_EXPIRY_QUEUE },
    ),
  ],
  providers: [TrialService],
  exports: [TrialService],
})
export class ExpiryWatcherModule {}
