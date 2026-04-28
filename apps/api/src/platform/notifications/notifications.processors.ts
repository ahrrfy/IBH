import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import type { QueueJobBase } from './notifications.types';

/**
 * Queue processors (T46).
 *
 * For v1 we don't have SMTP / SMS providers wired and the WhatsApp bridge
 * is a separate fastify service that polls Redis lists. These processors
 * therefore just log structured payloads — picking them up in the bridge
 * service or swapping in a real SMTP/SMS client is a 1-line change.
 *
 * Each processor lives on its own queue so a slow/failing channel can't
 * starve the others.
 */

@Processor('notifications-whatsapp')
export class NotificationsWhatsappProcessor {
  private readonly logger = new Logger(NotificationsWhatsappProcessor.name);

  // I046 — method name made unique per processor so @nestjs/bull's discovery
  // can't conflate handlers across queues even with the variadic registerQueue
  // bug (since fixed in notifications.module.ts).
  @Process('send')
  async handleWhatsappSend(job: Job<QueueJobBase>): Promise<void> {
    if (process.env['JEST_WORKER_ID']) return; // skip Redis I/O in jest (I036)
    const { payload } = job.data;
    this.logger.log(
      `[whatsapp] queued for user=${payload.userId} event=${payload.eventType} title="${payload.title}"`,
    );
    // Real delivery is performed by apps/whatsapp-bridge consuming the
    // 'erp:queue:notifications-whatsapp' Redis list.
  }
}

@Processor('notifications-email')
export class NotificationsEmailProcessor {
  private readonly logger = new Logger(NotificationsEmailProcessor.name);

  @Process('send')
  async handleEmailSend(job: Job<QueueJobBase>): Promise<void> {
    if (process.env['JEST_WORKER_ID']) return; // skip Redis I/O in jest (I036)
    const { payload } = job.data;
    this.logger.log(
      `[email] would send to user=${payload.userId} event=${payload.eventType} title="${payload.title}"`,
    );
    // TODO: wire SMTP transport (nodemailer) here when the email module ships.
  }
}

@Processor('notifications-sms')
export class NotificationsSmsProcessor {
  private readonly logger = new Logger(NotificationsSmsProcessor.name);

  @Process('send')
  async handleSmsSend(job: Job<QueueJobBase>): Promise<void> {
    if (process.env['JEST_WORKER_ID']) return; // skip Redis I/O in jest (I036)
    const { payload } = job.data;
    this.logger.log(
      `[sms] would send to user=${payload.userId} event=${payload.eventType} title="${payload.title}"`,
    );
    // TODO: wire SMS provider (e.g. local Iraqi gateway) when available.
  }
}
