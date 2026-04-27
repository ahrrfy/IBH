import { Process, Processor, InjectQueue } from '@nestjs/bull';
import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import type { Queue } from 'bull';
import { $Enums } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * T61 — Trial Expiry Processor.
 *
 * Twin of the T69 expiry-watcher, but specialised for *trial* lifecycle
 * (the T69 watcher only handles `currentPeriodEndAt` for paid subs).
 *
 * Daily cron at 06:00 UTC:
 *   1. For each `status='trial'` sub past `trialEndsAt` → flip to
 *      `grace`, emit `license.trial.expired`.
 *   2. For each `status='grace'` sub past `gracePeriodEndsAt` → flip to
 *      `expired`, emit `license.trial.terminated`.
 *   3. For trials with `daysRemaining ∈ {7, 3, 1}` → emit
 *      `license.trial.reminder`.
 *
 * Idempotency reuses the `LicenseReminderLog` table from T69. To avoid
 * collision with T69's positive bands [30,14,7,3,1,0], this processor
 * uses **negative threshold values** as a separate namespace:
 *
 *   - `-7`   → trial reminder, 7 days remaining
 *   - `-3`   → trial reminder, 3 days remaining
 *   - `-1`   → trial reminder, 1 day remaining
 *   - `-100` → trial → grace transition (sentinel)
 *   - `-200` → grace → expired transition (sentinel)
 *
 * Re-running on the same UTC day is therefore a no-op (P2002 swallowed).
 */
export const TRIAL_EXPIRY_QUEUE = 'trial-expiry';
export const TRIAL_EXPIRY_JOB = 'scan';

/** Trial reminder bands (days remaining) — fired exactly once each. */
export const TRIAL_REMINDER_THRESHOLDS = [7, 3, 1] as const;
export type TrialReminderThreshold = (typeof TRIAL_REMINDER_THRESHOLDS)[number];

/** Sentinel threshold values written to LicenseReminderLog. */
export const TRIAL_LOG_THRESHOLD = {
  REMINDER_7: -7,
  REMINDER_3: -3,
  REMINDER_1: -1,
  TRIAL_TO_GRACE: -100,
  GRACE_TO_EXPIRED: -200,
} as const;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface Clock {
  now(): Date;
}

const DEFAULT_CLOCK: Clock = { now: () => new Date() };

/**
 * Match a `daysRemaining` value to a trial reminder band, or null if
 * none applies. Picks the largest band ≤ daysRemaining so a 5-day-out
 * trial fires the "3" band on day 3, "1" on day 1.
 */
export function matchTrialReminder(
  daysRemaining: number,
): TrialReminderThreshold | null {
  if (Number.isNaN(daysRemaining) || daysRemaining <= 0) return null;
  let chosen: TrialReminderThreshold | null = null;
  for (const t of TRIAL_REMINDER_THRESHOLDS) {
    if (daysRemaining <= t) chosen = t as TrialReminderThreshold;
  }
  return chosen;
}

function reminderLogThreshold(band: TrialReminderThreshold): number {
  if (band === 7) return TRIAL_LOG_THRESHOLD.REMINDER_7;
  if (band === 3) return TRIAL_LOG_THRESHOLD.REMINDER_3;
  return TRIAL_LOG_THRESHOLD.REMINDER_1;
}

@Injectable()
@Processor(TRIAL_EXPIRY_QUEUE)
export class TrialExpiryProcessor implements OnModuleInit {
  private readonly logger = new Logger(TrialExpiryProcessor.name);
  private clock: Clock = DEFAULT_CLOCK;

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(TRIAL_EXPIRY_QUEUE) private readonly queue: Queue,
    @Optional() private readonly notifications?: NotificationsService,
  ) {}

  /** Test-only hook: inject a deterministic clock. */
  setClock(clock: Clock): void {
    this.clock = clock;
  }

  /**
   * Schedule the daily job at 06:00 UTC, mirroring T69. BullMQ dedupes
   * by `jobId` so repeated bootstraps are safe.
   */
  async onModuleInit(): Promise<void> {
    try {
      await this.queue.add(
        TRIAL_EXPIRY_JOB,
        {},
        {
          repeat: { cron: '0 6 * * *' },
          removeOnComplete: true,
          removeOnFail: 50,
          jobId: 'trial-expiry-daily',
        },
      );
      this.logger.log('Trial expiry processor cron scheduled (06:00 UTC daily)');
    } catch (err) {
      this.logger.warn(`Failed to schedule trial expiry cron: ${err}`);
    }
  }

  @Process(TRIAL_EXPIRY_JOB)
  async run(): Promise<{
    transitionedToGrace: number;
    transitionedToExpired: number;
    remindersSent: number;
  }> {
    const now = this.clock.now();

    let transitionedToGrace = 0;
    let transitionedToExpired = 0;
    let remindersSent = 0;

    // ── 1. trial → grace (past trialEndsAt) ─────────────────────────
    const trialsPastEnd = await this.prisma.subscription.findMany({
      where: {
        status: $Enums.SubscriptionStatus.trial,
        trialEndsAt: { not: null, lte: now },
      },
      include: { plan: { select: { name: true, code: true } } },
    });
    for (const sub of trialsPastEnd) {
      const claimed = await this.claimLogRow(
        sub.id,
        TRIAL_LOG_THRESHOLD.TRIAL_TO_GRACE,
      );
      if (!claimed) continue;
      try {
        await this.prisma.subscription.update({
          where: { id: sub.id },
          data: { status: $Enums.SubscriptionStatus.grace },
        });
        transitionedToGrace++;
        await this.fireTrialNotice(
          sub.id,
          sub.companyId,
          'license.trial.expired',
          'انتهت الفترة التجريبية — دخول فترة السماح',
          'انتهت الفترة التجريبية. لديك 7 أيام كفترة سماح قبل تعليق الخدمة. يرجى التجديد لتفادي انقطاع العمل.',
          {
            subscriptionId: sub.id,
            planLabel: sub.plan?.name ?? sub.plan?.code ?? 'Trial',
            trialEndsAt: sub.trialEndsAt?.toISOString() ?? null,
            gracePeriodEndsAt: sub.gracePeriodEndsAt?.toISOString() ?? null,
          },
        );
      } catch (err) {
        this.logger.warn(
          `trial→grace failed for sub=${sub.id}: ${err}`,
        );
      }
    }

    // ── 2. grace → expired (past gracePeriodEndsAt) ─────────────────
    const gracePastEnd = await this.prisma.subscription.findMany({
      where: {
        status: $Enums.SubscriptionStatus.grace,
        gracePeriodEndsAt: { not: null, lte: now },
      },
      include: { plan: { select: { name: true, code: true } } },
    });
    for (const sub of gracePastEnd) {
      const claimed = await this.claimLogRow(
        sub.id,
        TRIAL_LOG_THRESHOLD.GRACE_TO_EXPIRED,
      );
      if (!claimed) continue;
      try {
        await this.prisma.subscription.update({
          where: { id: sub.id },
          data: { status: $Enums.SubscriptionStatus.expired },
        });
        transitionedToExpired++;
        await this.fireTrialNotice(
          sub.id,
          sub.companyId,
          'license.trial.terminated',
          'انتهت فترة السماح — تم إيقاف الاشتراك',
          'انتهت فترة السماح وتم تعليق الاشتراك. للوصول إلى البيانات يرجى التجديد فوراً.',
          {
            subscriptionId: sub.id,
            planLabel: sub.plan?.name ?? sub.plan?.code ?? 'Trial',
            gracePeriodEndsAt: sub.gracePeriodEndsAt?.toISOString() ?? null,
          },
        );
      } catch (err) {
        this.logger.warn(
          `grace→expired failed for sub=${sub.id}: ${err}`,
        );
      }
    }

    // ── 3. Reminder bands (7/3/1 days before trialEndsAt) ──────────
    const horizon = new Date(now.getTime() + 8 * MS_PER_DAY);
    const upcomingTrials = await this.prisma.subscription.findMany({
      where: {
        status: $Enums.SubscriptionStatus.trial,
        trialEndsAt: { not: null, gt: now, lte: horizon },
      },
      include: { plan: { select: { name: true, code: true } } },
    });
    for (const sub of upcomingTrials) {
      if (!sub.trialEndsAt) continue;
      const daysRemaining = Math.floor(
        (sub.trialEndsAt.getTime() - now.getTime()) / MS_PER_DAY,
      );
      const band = matchTrialReminder(daysRemaining);
      if (band === null) continue;

      const claimed = await this.claimLogRow(
        sub.id,
        reminderLogThreshold(band),
      );
      if (!claimed) continue;

      await this.fireTrialNotice(
        sub.id,
        sub.companyId,
        'license.trial.reminder',
        `الفترة التجريبية تنتهي خلال ${band} يوم`,
        `تنتهي الفترة التجريبية خلال ${band} يوم. يرجى التجديد لضمان استمرار الخدمة.`,
        {
          subscriptionId: sub.id,
          daysRemaining: band,
          planLabel: sub.plan?.name ?? sub.plan?.code ?? 'Trial',
          trialEndsAt: sub.trialEndsAt.toISOString(),
        },
      );
      remindersSent++;
    }

    this.logger.log(
      `Trial expiry scan: trial→grace=${transitionedToGrace}, grace→expired=${transitionedToExpired}, reminders=${remindersSent}`,
    );
    return { transitionedToGrace, transitionedToExpired, remindersSent };
  }

  /**
   * Try to write the idempotency row. Returns true on first write,
   * false if the (subscriptionId, threshold) row already exists
   * (Prisma P2002 unique violation). Other DB errors are logged and
   * treated as "not claimed" so the caller skips the side effect.
   */
  private async claimLogRow(
    subscriptionId: string,
    threshold: number,
  ): Promise<boolean> {
    try {
      await this.prisma.licenseReminderLog.create({
        data: { subscriptionId, threshold },
      });
      return true;
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === 'P2002') return false;
      this.logger.warn(
        `licenseReminderLog insert failed for ${subscriptionId}/${threshold}: ${err}`,
      );
      return false;
    }
  }

  /**
   * Fan out a notification to every admin/super_admin user in the
   * company. Mirrors the T69 watcher exactly so operators see a
   * consistent recipient set across both crons.
   */
  private async fireTrialNotice(
    subscriptionId: string,
    companyId: string,
    eventType: string,
    title: string,
    body: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    if (!this.notifications) {
      this.logger.warn(
        `[TRIAL_NOTICE event=${eventType}] sub=${subscriptionId} ` +
          '(no NotificationsService — skipping fan-out)',
      );
      return;
    }

    const adminUsers = await this.prisma.user.findMany({
      where: {
        companyId,
        status: 'active',
        deletedAt: null,
        userRoles: {
          some: {
            role: { name: { in: ['super_admin', 'company_admin', 'admin'] } },
          },
        },
      },
      select: { id: true },
    });

    for (const u of adminUsers) {
      try {
        await this.notifications.dispatch({
          companyId,
          userId: u.id,
          eventType,
          title,
          body,
          data,
        });
      } catch (err) {
        this.logger.warn(
          `dispatch failed for user=${u.id} sub=${subscriptionId} event=${eventType}: ${err}`,
        );
      }
    }
  }
}
