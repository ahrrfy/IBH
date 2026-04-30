import { Process, Processor, InjectQueue } from '@nestjs/bull';
import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import type { Queue } from 'bull';
import { $Enums } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * T69 — License Expiry Watcher Processor
 *
 * Runs daily at 06:00 UTC (BullMQ repeatable job, identical convention to
 * the T49 budget-variance cron). For each active subscription it computes
 * `daysUntilExpiry = floor((currentPeriodEndAt - now) / day)` and, when
 * the value matches one of the threshold bands [30, 14, 7, 3, 1, 0],
 * dispatches a reminder via {@link NotificationsService} (T46) to every
 * admin / super_admin user in the subscription's company.
 *
 * Idempotency is enforced by the LicenseReminderLog table: each
 * (subscriptionId, threshold) pair is unique, so re-running the cron in
 * the same UTC day cannot double-send. Re-runs are therefore safe and
 * cheap — a no-op once the band's row exists.
 *
 * On the day of expiry (threshold === 0) we additionally emit a
 * `license.expired` event so downstream consumers (UI, audit) can react.
 * License *suspension / enforcement* is intentionally out of scope here
 * (handled by T59/T66) — this processor only NOTIFIES.
 */
export const LICENSE_EXPIRY_QUEUE = 'license-expiry';
export const LICENSE_EXPIRY_JOB = 'scan';

/** Threshold bands (days remaining) — descending so the closest match wins. */
export const REMINDER_THRESHOLDS = [30, 14, 7, 3, 1, 0] as const;
export type ReminderThreshold = (typeof REMINDER_THRESHOLDS)[number];

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Subscription statuses we still want to nudge. Suspended/cancelled are silent. */
const NOTIFIABLE_STATUSES: $Enums.SubscriptionStatus[] = [
  $Enums.SubscriptionStatus.active,
  $Enums.SubscriptionStatus.trial,
  $Enums.SubscriptionStatus.grace,
];

export interface Clock {
  now(): Date;
}

const DEFAULT_CLOCK: Clock = { now: () => new Date() };

/**
 * Match a `daysRemaining` value to a reminder threshold band.
 * Returns null when no band applies (e.g. 45 days out, or already past expiry).
 *
 * Band semantics: we fire the *exact* day a threshold is hit. Cron runs
 * daily so each band is checked once. If the cron is offline for a day,
 * we still fire the *closest* band the user has not yet received — the
 * idempotency log makes this safe.
 */
export function matchThreshold(daysRemaining: number): ReminderThreshold | null {
  if (Number.isNaN(daysRemaining)) return null;
  // Past expiry → only the 0-band remains relevant for the "expired" notice.
  if (daysRemaining <= 0) return 0;
  for (const t of REMINDER_THRESHOLDS) {
    if (t === 0) continue;
    if (daysRemaining <= t) {
      // Walk down to the smallest band still ≥ daysRemaining-equivalent.
      // Picking the *largest* band ≤ daysRemaining means a license at 5d
      // hits the "3" band on day 3, "1" on day 1, "0" on expiry — exactly
      // once each, due to the unique log row.
    }
  }
  // Find largest threshold T such that daysRemaining <= T AND
  // daysRemaining > nextSmaller(T). This collapses to: pick the band
  // equal to or just above daysRemaining only when it equals a band.
  // Simpler: fire when daysRemaining matches a band exactly OR
  // when daysRemaining < band but no row yet exists. We delegate the
  // "no row yet" check to the caller (DB unique constraint), so here
  // we return the largest band that is >= daysRemaining.
  let chosen: ReminderThreshold | null = null;
  for (const t of REMINDER_THRESHOLDS) {
    if (t === 0) continue;
    if (daysRemaining <= t) chosen = t as ReminderThreshold;
  }
  return chosen;
}

@Injectable()
@Processor(LICENSE_EXPIRY_QUEUE)
export class ExpiryWatcherProcessor implements OnModuleInit {
  private readonly logger = new Logger(ExpiryWatcherProcessor.name);
  private clock: Clock = DEFAULT_CLOCK;

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(LICENSE_EXPIRY_QUEUE) private readonly queue: Queue,
    @Optional() private readonly notifications?: NotificationsService,
  ) {}

  /** Test-only hook: inject a deterministic clock. */
  setClock(clock: Clock): void {
    this.clock = clock;
  }

  /**
   * Schedule the daily job at 06:00 UTC. Idempotent: BullMQ deduplicates
   * by `jobId` so the registration survives multiple module bootstraps.
   */
  async onModuleInit(): Promise<void> {
    console.log(`[BOOT] ${new Date().toISOString()} ExpiryWatcherProcessor.onModuleInit start`);
    try {
      await this.queue.add(
        LICENSE_EXPIRY_JOB,
        {},
        {
          repeat: { cron: '0 6 * * *' },
          removeOnComplete: true,
          removeOnFail: 50,
          jobId: 'license-expiry-daily',
        },
      );
      this.logger.log('License expiry watcher cron scheduled (06:00 UTC daily)');
    } catch (err) {
      this.logger.warn(`Failed to schedule license expiry cron: ${err}`);
    }
    console.log(`[BOOT] ${new Date().toISOString()} ExpiryWatcherProcessor.onModuleInit done`);
  }

  @Process(LICENSE_EXPIRY_JOB)
  async run(): Promise<{ scanned: number; notified: number }> {
    return this.prisma.withBypassedRls(() => this.runInternal());
  }

  private async runInternal(): Promise<{ scanned: number; notified: number }> {
    const now = this.clock.now();
    // Look 31 days into the future and any expired-in-grace subscriptions.
    const horizon = new Date(now.getTime() + 31 * MS_PER_DAY);

    // I062 — cross-tenant scan; runInternal is invoked under bypass so
    // every tenant's subscription is visible.
    const subs = await this.prisma.subscription.findMany({
      where: {
        status: { in: NOTIFIABLE_STATUSES },
        currentPeriodEndAt: { not: null, lte: horizon },
      },
      include: {
        plan: { select: { name: true, code: true } },
      },
    });

    let notified = 0;
    for (const sub of subs) {
      if (!sub.currentPeriodEndAt) continue;
      const daysRemaining = Math.floor(
        (sub.currentPeriodEndAt.getTime() - now.getTime()) / MS_PER_DAY,
      );
      const band = matchThreshold(daysRemaining);
      if (band === null) continue;

      // Idempotency: claim the (subscriptionId, threshold) row first.
      // If it already exists we silently skip — the unique constraint
      // makes this race-safe across overlapping cron runs.
      let claimed = false;
      try {
        await this.prisma.licenseReminderLog.create({
          data: { subscriptionId: sub.id, threshold: band },
        });
        claimed = true;
      } catch (err) {
        // Unique-violation (P2002) → already sent. Anything else → log.
        const code = (err as { code?: string }).code;
        if (code !== 'P2002') {
          this.logger.warn(
            `licenseReminderLog insert failed for ${sub.id}/${band}: ${err}`,
          );
        }
      }
      if (!claimed) continue;

      await this.fireReminder(
        sub.id,
        sub.companyId,
        sub.currentPeriodEndAt,
        band,
        sub.plan?.name ?? sub.plan?.code ?? 'Subscription',
      );
      notified++;
    }

    this.logger.log(
      `License expiry scan: ${subs.length} subs in window, ${notified} reminders dispatched`,
    );
    return { scanned: subs.length, notified };
  }

  /**
   * Look up admin / super_admin users in the company and dispatch a
   * notification to each. Channel selection (in-app + WhatsApp + email)
   * is delegated to NotificationsService.dispatch which honors each
   * user's NotificationPreference row.
   */
  private async fireReminder(
    subscriptionId: string,
    companyId: string,
    expiresAt: Date,
    threshold: ReminderThreshold,
    planLabel: string,
  ): Promise<void> {
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

    const eventType =
      threshold === 0 ? 'license.expired' : 'license.expiry.reminder';
    const isExpired = threshold === 0;
    const title = isExpired
      ? `انتهت صلاحية الترخيص (${planLabel})`
      : `الترخيص ينتهي خلال ${threshold} يوم — ${planLabel}`;
    const body = isExpired
      ? `انتهت صلاحية الاشتراك في ${expiresAt.toISOString().slice(0, 10)}. ` +
        'النظام دخل فترة السماح — يرجى التجديد لتفادي تعليق الخدمة.'
      : `سينتهي اشتراك ${planLabel} في ${expiresAt.toISOString().slice(0, 10)}. ` +
        'يرجى المتابعة مع المسؤول المالي للتجديد قبل تاريخ الانتهاء.';

    if (!this.notifications) {
      this.logger.warn(
        `[LICENSE_EXPIRY band=${threshold}] sub=${subscriptionId} ` +
          `(no NotificationsService — skipping ${adminUsers.length} recipients)`,
      );
      return;
    }

    for (const u of adminUsers) {
      try {
        await this.notifications.dispatch({
          companyId,
          userId: u.id,
          eventType,
          title,
          body,
          data: {
            subscriptionId,
            threshold,
            expiresAt: expiresAt.toISOString(),
            planLabel,
          },
        });
      } catch (err) {
        this.logger.warn(
          `dispatch failed for user=${u.id} sub=${subscriptionId}: ${err}`,
        );
      }
    }
  }
}
