import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Queue } from 'bull';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import {
  ALL_CHANNELS,
  DEFAULT_CHANNELS,
  DispatchPayload,
  NotificationChannel,
} from './notifications.types';

/**
 * NotificationsService (T46).
 *
 * Central entry point for *all* user-facing notifications in the ERP.
 * Callers (any module) invoke `dispatch()` with an event payload; this
 * service:
 *
 *   1. Looks up the per-user preference (or falls back to in-app only).
 *   2. Persists a `Notification` row (the in-app inbox is always kept).
 *   3. For each enabled channel, enqueues a job to a dedicated BullMQ queue.
 *      - `inApp`    → emit immediately via the T31 realtime gateway.
 *      - `whatsapp` → push to a queue consumed (eventually) by the
 *                     standalone whatsapp-bridge fastify service.
 *      - `email`    → log placeholder (no SMTP wiring yet).
 *      - `sms`      → log placeholder.
 *   4. Honors quiet hours for `whatsapp`/`sms` by deferring with `delay`.
 *
 * The service NEVER throws on individual channel failure — channels are
 * best-effort; the in-app row is the source of truth.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: RealtimeGateway,
    private readonly events: EventEmitter2,
    @InjectQueue('notifications-whatsapp') private readonly waQueue: Queue,
    @InjectQueue('notifications-email') private readonly emailQueue: Queue,
    @InjectQueue('notifications-sms') private readonly smsQueue: Queue,
  ) {}

  /**
   * Dispatch a notification. Persists the in-app row, fans out to enabled
   * channels, and emits a `notification.new` realtime event so connected
   * clients can refresh without polling.
   */
  async dispatch(payload: DispatchPayload): Promise<{ id: string }> {
    const { companyId, userId, eventType, title, body, data } = payload;

    const channels = await this.resolveChannels(userId, eventType);

    const created = await this.prisma.notification.create({
      data: {
        companyId,
        userId,
        eventType,
        title,
        body,
        data: (data ?? {}) as object,
      },
      select: { id: true, createdAt: true },
    });

    // ── inApp: realtime push ────────────────────────────────────────────
    if (channels.includes('inApp')) {
      try {
        this.gateway.broadcast([`user:${userId}`], 'notification.new', {
          id: created.id,
          eventType,
          title,
          body,
          data: data ?? {},
          createdAt: created.createdAt,
        });
      } catch (err) {
        this.logger.warn(
          `Realtime push failed for ${userId}/${eventType}: ${
            err instanceof Error ? err.message : 'unknown'
          }`,
        );
      }
    }

    // ── External channels: enqueue ──────────────────────────────────────
    const pref = await this.prisma.notificationPreference.findUnique({
      where: { userId_eventType: { userId, eventType } },
    });
    const delay = this.computeQuietHoursDelay(
      pref?.quietHoursStart ?? null,
      pref?.quietHoursEnd ?? null,
    );

    // I046: job names made unique per queue to avoid @nestjs/bull's
    // BullExplorer registering the same handler name on multiple queues
    // (which trips Bull's `Cannot define the same handler twice send`).
    if (channels.includes('whatsapp')) {
      await this.safeEnqueue(this.waQueue, 'whatsapp', { payload }, delay);
    }
    if (channels.includes('email')) {
      // Email is not subject to quiet hours.
      await this.safeEnqueue(this.emailQueue, 'email', { payload }, 0);
    }
    if (channels.includes('sms')) {
      await this.safeEnqueue(this.smsQueue, 'sms', { payload }, delay);
    }

    return { id: created.id };
  }

  /** Resolve the effective channel list for (userId, eventType). */
  private async resolveChannels(
    userId: string,
    eventType: string,
  ): Promise<NotificationChannel[]> {
    const pref = await this.prisma.notificationPreference.findUnique({
      where: { userId_eventType: { userId, eventType } },
      select: { channels: true },
    });
    if (!pref) return [...DEFAULT_CHANNELS];
    const valid = pref.channels.filter((c): c is NotificationChannel =>
      (ALL_CHANNELS as string[]).includes(c),
    );
    return valid.length > 0 ? valid : [...DEFAULT_CHANNELS];
  }

  /**
   * If `now` falls within [quietHoursStart, quietHoursEnd) (wrapping over
   * midnight is allowed), return the milliseconds until quietHoursEnd.
   * Otherwise return 0.
   *
   * Times are HH:MM strings interpreted in the server's local timezone.
   * For Iraq we run in Asia/Baghdad — adequate for v1; per-user TZ is a
   * future refinement.
   */
  private computeQuietHoursDelay(
    start: string | null,
    end: string | null,
  ): number {
    if (!start || !end) return 0;
    const startMin = this.toMinutes(start);
    const endMin = this.toMinutes(end);
    if (startMin === null || endMin === null) return 0;

    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();

    let inWindow: boolean;
    if (startMin === endMin) {
      inWindow = false;
    } else if (startMin < endMin) {
      inWindow = nowMin >= startMin && nowMin < endMin;
    } else {
      // Wraps midnight (e.g. 22:00 → 07:00)
      inWindow = nowMin >= startMin || nowMin < endMin;
    }
    if (!inWindow) return 0;

    // Compute next occurrence of `endMin` from `now`.
    const target = new Date(now);
    target.setSeconds(0, 0);
    target.setHours(Math.floor(endMin / 60), endMin % 60, 0, 0);
    if (target.getTime() <= now.getTime()) {
      target.setDate(target.getDate() + 1);
    }
    return target.getTime() - now.getTime();
  }

  private toMinutes(hhmm: string): number | null {
    const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h < 0 || h > 23 || min < 0 || min > 59) return null;
    return h * 60 + min;
  }

  private async safeEnqueue(
    queue: Queue,
    name: string,
    data: unknown,
    delay: number,
  ): Promise<void> {
    try {
      await queue.add(name, data, {
        delay,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: 1000,
        removeOnFail: 1000,
      });
    } catch (err) {
      this.logger.warn(
        `Enqueue failed for ${queue.name}: ${
          err instanceof Error ? err.message : 'unknown'
        }`,
      );
    }
  }

  // ─── Inbox queries ──────────────────────────────────────────────────────

  async list(
    userId: string,
    opts: { unread?: boolean; eventType?: string; limit: number; offset: number },
  ) {
    const where = {
      userId,
      ...(opts.unread ? { readAt: null } : {}),
      ...(opts.eventType ? { eventType: opts.eventType } : {}),
    };

    const [items, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: opts.limit,
        skip: opts.offset,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);

    return { items, total, unreadCount };
  }

  async markRead(userId: string, id: string): Promise<void> {
    const result = await this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
    if (result.count === 0) {
      // Either not found, not owned, or already read — only fail on the
      // first two. We can't distinguish without a second lookup.
      const exists = await this.prisma.notification.findFirst({
        where: { id, userId },
        select: { id: true },
      });
      if (!exists) throw new NotFoundException('notification not found');
    }
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    const r = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: r.count };
  }

  // ─── Preferences ────────────────────────────────────────────────────────

  async getPreferences(userId: string) {
    return this.prisma.notificationPreference.findMany({
      where: { userId },
      orderBy: { eventType: 'asc' },
    });
  }

  async upsertPreference(
    userId: string,
    input: {
      eventType: string;
      channels: NotificationChannel[];
      quietHoursStart?: string | null;
      quietHoursEnd?: string | null;
    },
  ) {
    const channels = input.channels.filter((c) =>
      (ALL_CHANNELS as string[]).includes(c),
    );
    return this.prisma.notificationPreference.upsert({
      where: {
        userId_eventType: { userId, eventType: input.eventType },
      },
      create: {
        userId,
        eventType: input.eventType,
        channels,
        quietHoursStart: input.quietHoursStart ?? null,
        quietHoursEnd: input.quietHoursEnd ?? null,
      },
      update: {
        channels,
        quietHoursStart: input.quietHoursStart ?? null,
        quietHoursEnd: input.quietHoursEnd ?? null,
      },
    });
  }
}
