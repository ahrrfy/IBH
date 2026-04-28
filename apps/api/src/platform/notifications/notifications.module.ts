import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { NotificationListeners } from './notifications.listeners';
import {
  NotificationsEmailProcessor,
  NotificationsSmsProcessor,
  NotificationsWhatsappProcessor,
} from './notifications.processors';

/**
 * Notification Dispatch Engine (T46).
 *
 * Builds on the realtime gateway (T31) for in-app delivery and adds three
 * BullMQ queues for external channels (whatsapp / email / sms). Globally
 * exported so any business module can `inject(NotificationsService)` and
 * call `dispatch()` directly without an event hop.
 */
@Global()
@Module({
  imports: [
    // I046 — MUST use the variadic form (single registerQueue call with 3
    // queues), not 3 separate calls. Each `BullModule.registerQueue({})`
    // creates its own DynamicModule that includes a BullExplorer instance.
    // 3 separate calls → 3 BullExplorers → each scans every provider with
    // @Processor → each tries to call queue.process(name, handler) for the
    // same processor → bull throws `Cannot define the same handler twice`.
    // Variadic form keeps a single explorer scope. Rolled back from the
    // earlier "split into 3" attempt (commit 48a8534).
    BullModule.registerQueue(
      { name: 'notifications-whatsapp' },
      { name: 'notifications-email' },
      { name: 'notifications-sms' },
    ),
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationListeners,
    NotificationsWhatsappProcessor,
    NotificationsEmailProcessor,
    NotificationsSmsProcessor,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
