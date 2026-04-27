import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { $Enums, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * T61 — Trial Engine.
 *
 * Owns the lifecycle of a free-trial subscription:
 *
 *   pending → trial (startTrial) → grace (auto, day 0 of trial)
 *           → expired (auto, end of 7-day grace)
 *           → active  (convertTrialToPaid)
 *
 * The autonomous transitions (trial→grace and grace→expired) are driven
 * by {@link TrialExpiryProcessor}; this service exposes the *manual*
 * verbs used by onboarding flows and admin tools.
 *
 * **Read-only / suspension enforcement is NOT implemented here.** This
 * service only flips the `status` flag — the actual access guard lives
 * in T59 (LicenseGuard) / T66.
 */
@Injectable()
export class TrialService {
  private readonly logger = new Logger(TrialService.name);

  /** Default trial length in days. Spec: 30 days. */
  static readonly DEFAULT_TRIAL_DAYS = 30;
  /** Grace period appended after trial expiry. Spec: 7 days. */
  static readonly GRACE_PERIOD_DAYS = 7;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Start a free trial for a company.
   *
   * Idempotent: if the company already has a non-terminal trial
   * subscription (status ∈ {pending, trial, grace, active}), the existing
   * row is returned unchanged. This lets onboarding be retried safely
   * without creating duplicate trials.
   *
   * @param companyId   tenant id
   * @param planId      plan to trial
   * @param durationDays optional override; defaults to 30
   * @param actorUserId optional creator id (audit)
   * @returns the trial Subscription
   */
  async startTrial(
    companyId: string,
    planId: string,
    durationDays: number = TrialService.DEFAULT_TRIAL_DAYS,
    actorUserId?: string,
  ): Promise<Prisma.SubscriptionGetPayload<Record<string, never>>> {
    if (!Number.isFinite(durationDays) || durationDays <= 0) {
      throw new BadRequestException('durationDays must be a positive number');
    }

    // Idempotency guard — return any active-ish subscription for this co.
    const existing = await this.prisma.subscription.findFirst({
      where: {
        companyId,
        status: {
          in: [
            $Enums.SubscriptionStatus.pending,
            $Enums.SubscriptionStatus.trial,
            $Enums.SubscriptionStatus.grace,
            $Enums.SubscriptionStatus.active,
          ],
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) {
      this.logger.debug(
        `startTrial: company=${companyId} already has subscription=${existing.id} (${existing.status}) — returning existing`,
      );
      return existing;
    }

    const now = new Date();
    const trialEndsAt = new Date(
      now.getTime() + durationDays * 24 * 60 * 60 * 1000,
    );
    const gracePeriodEndsAt = new Date(
      trialEndsAt.getTime() +
        TrialService.GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000,
    );

    const created = await this.prisma.subscription.create({
      data: {
        companyId,
        planId,
        status: $Enums.SubscriptionStatus.trial,
        startedAt: now,
        trialStartedAt: now,
        trialEndsAt,
        gracePeriodEndsAt,
        createdBy: actorUserId,
      },
    });
    this.logger.log(
      `startTrial: created subscription=${created.id} for company=${companyId} (trialEndsAt=${trialEndsAt.toISOString()})`,
    );
    return created;
  }

  /**
   * Extend an in-progress trial by `additionalDays`. Admin-triggered.
   *
   * Allowed only while the subscription is still in `trial` or `grace`.
   * Appends to `trialEndsAt`; `gracePeriodEndsAt` slides forward by the
   * same delta to preserve the 7-day cushion.
   */
  async extendTrial(
    subscriptionId: string,
    additionalDays: number,
    actorUserId: string,
  ): Promise<Prisma.SubscriptionGetPayload<Record<string, never>>> {
    if (!Number.isFinite(additionalDays) || additionalDays <= 0) {
      throw new BadRequestException(
        'additionalDays must be a positive number',
      );
    }
    if (!actorUserId) {
      throw new BadRequestException('actorUserId is required for audit');
    }

    const sub = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
    });
    if (!sub) {
      throw new NotFoundException(`Subscription ${subscriptionId} not found`);
    }
    if (
      sub.status !== $Enums.SubscriptionStatus.trial &&
      sub.status !== $Enums.SubscriptionStatus.grace
    ) {
      throw new BadRequestException(
        `Cannot extend trial in status=${sub.status}`,
      );
    }
    if (!sub.trialEndsAt || !sub.gracePeriodEndsAt) {
      throw new BadRequestException(
        'Subscription is missing trial timestamps',
      );
    }

    const deltaMs = additionalDays * 24 * 60 * 60 * 1000;
    const newTrialEnd = new Date(sub.trialEndsAt.getTime() + deltaMs);
    const newGraceEnd = new Date(sub.gracePeriodEndsAt.getTime() + deltaMs);

    // If the subscription had already slipped to grace, move it back to
    // trial — the extension restores the trial window.
    const newStatus =
      sub.status === $Enums.SubscriptionStatus.grace
        ? $Enums.SubscriptionStatus.trial
        : sub.status;

    const updated = await this.prisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        trialEndsAt: newTrialEnd,
        gracePeriodEndsAt: newGraceEnd,
        status: newStatus,
      },
    });
    this.logger.log(
      `extendTrial: subscription=${subscriptionId} +${additionalDays}d by user=${actorUserId} — new trialEndsAt=${newTrialEnd.toISOString()}`,
    );
    return updated;
  }

  /**
   * Convert a trial (or grace) subscription into a paid `active` one.
   *
   * The caller is expected to have collected payment beforehand. We set
   * `currentPeriodStartAt` = now and `currentPeriodEndAt` = +30 days
   * (monthly) or +365 days (yearly) based on the subscription's billing
   * cycle. The trial / grace timestamps are preserved for audit but
   * no longer drive enforcement.
   */
  async convertTrialToPaid(
    subscriptionId: string,
  ): Promise<Prisma.SubscriptionGetPayload<Record<string, never>>> {
    const sub = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
    });
    if (!sub) {
      throw new NotFoundException(`Subscription ${subscriptionId} not found`);
    }
    if (
      sub.status !== $Enums.SubscriptionStatus.trial &&
      sub.status !== $Enums.SubscriptionStatus.grace
    ) {
      throw new BadRequestException(
        `Cannot convert subscription in status=${sub.status}`,
      );
    }

    const now = new Date();
    const periodDays = sub.billingCycle === $Enums.BillingCycle.annual ? 365 : 30;
    const periodEndAt = new Date(
      now.getTime() + periodDays * 24 * 60 * 60 * 1000,
    );

    const updated = await this.prisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        status: $Enums.SubscriptionStatus.active,
        currentPeriodStartAt: now,
        currentPeriodEndAt: periodEndAt,
      },
    });
    this.logger.log(
      `convertTrialToPaid: subscription=${subscriptionId} → active until ${periodEndAt.toISOString()}`,
    );
    return updated;
  }
}
