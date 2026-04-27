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
