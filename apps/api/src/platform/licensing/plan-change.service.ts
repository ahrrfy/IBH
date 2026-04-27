import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FeatureCacheService } from './feature-cache.service';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * T68 — Plan Upgrade/Downgrade with Proration.
 *
 * Single owner of the "change a Subscription's plan mid-cycle" workflow.
 * Encapsulates the proration math, the LicenseEvent log entries, the
 * feature-cache invalidation (T65 instant UI refresh), and the customer
 * notification dispatch (T46).
 *
 * The legacy T63 admin endpoint `PATCH /admin/licensing/tenants/:id/plan`
 * delegates to this service so the admin UI keeps working unchanged but
 * now produces the prorated charge ledger entry the upcoming billing
 * module (T70) will consume.
 *
 * Decimal-safe: all monetary arithmetic flows through `Prisma.Decimal`.
 * Plain JS `number` is never used for IQD math.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Half-up IQD rounding — IQD has no decimal sub-units in practice. */
function roundIqd(d: Prisma.Decimal): Prisma.Decimal {
  return d.toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
}

export interface ChangePlanInput {
  subscriptionId: string;
  newPlanId: string;
  actorUserId: string | null;
  /** Defaults to "now". Clamped to [currentPeriodStartAt, currentPeriodEndAt]. */
  effectiveDate?: Date;
}

export interface ProrationLineItem {
  kind: 'old_plan_refund' | 'new_plan_charge';
  planId: string;
  planCode: string;
  amountIqd: string;
}

export interface ChangePlanResult {
  subscription: {
    id: string;
    companyId: string;
    planId: string;
    status: string;
    priceIqd: string;
  };
  prorationLineItems: ProrationLineItem[];
  netDeltaIqd: string;
  daysInPeriod: number;
  daysRemaining: number;
  effectiveDate: string;
  direction: 'upgraded' | 'downgraded' | 'unchanged_price';
}

@Injectable()
export class PlanChangeService {
  private readonly logger = new Logger(PlanChangeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly featureCache: FeatureCacheService,
    @Optional() private readonly notifications: NotificationsService | null,
  ) {}

  /**
   * Change a subscription's plan with prorated billing math.
   *
   * Steps (all monetary arithmetic via Prisma.Decimal):
   *  1. Validate subscription is in an entitlement-granting status.
   *  2. Validate the target plan exists, is active, and is different.
   *  3. Compute days-in-period and days-remaining from the effective date.
   *  4. Compute prorated refund for old plan + prorated charge for new plan.
   *  5. In a transaction: update subscription.planId/priceIqd; write two
   *     LicenseEvents (the plan-change event + the prorated_charge event).
   *  6. Post-transaction: invalidate the feature cache (emits T31 event so
   *     all browsers refresh entitlements instantly via T65) and dispatch
   *     a `license.plan.changed` notification (T46) — both best-effort.
   */
  async changePlan(input: ChangePlanInput): Promise<ChangePlanResult> {
    const { subscriptionId, newPlanId, actorUserId } = input;

    const sub = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: { plan: true },
    });
    if (!sub) {
      throw new NotFoundException({
        code: 'SUBSCRIPTION_NOT_FOUND',
        messageAr: 'الاشتراك غير موجود',
      });
    }
    if (!['active', 'trial', 'grace'].includes(sub.status)) {
      throw new BadRequestException({
        code: 'SUBSCRIPTION_NOT_CHANGEABLE',
        messageAr: 'لا يمكن تغيير خطة اشتراك في هذه الحالة',
        details: { status: sub.status },
      });
    }
    if (sub.planId === newPlanId) {
      throw new BadRequestException({
        code: 'PLAN_UNCHANGED',
        messageAr: 'الخطة غير متغيّرة',
      });
    }

    const newPlan = await this.prisma.plan.findUnique({ where: { id: newPlanId } });
    if (!newPlan) {
      throw new NotFoundException({
        code: 'PLAN_NOT_FOUND',
        messageAr: 'الخطة غير موجودة',
      });
    }
    if (!newPlan.isActive) {
      throw new BadRequestException({
        code: 'PLAN_INACTIVE',
        messageAr: 'الخطة غير مفعّلة',
      });
    }

    // ── Period bounds ────────────────────────────────────────────────────
    // For trials (no current period set), fall back to a 30-day window
    // ending at trialEndsAt — proration still applies symmetrically.
    const now = new Date();
    const periodEnd =
      sub.currentPeriodEndAt ??
      sub.trialEndsAt ??
      new Date(now.getTime() + 30 * MS_PER_DAY);
    const periodStart =
      sub.currentPeriodStartAt ??
      sub.startedAt ??
      sub.trialStartedAt ??
      new Date(periodEnd.getTime() - 30 * MS_PER_DAY);

    if (periodEnd.getTime() <= periodStart.getTime()) {
      throw new BadRequestException({
        code: 'INVALID_PERIOD',
        messageAr: 'فترة الاشتراك غير صالحة',
      });
    }

    // Clamp effective date to [periodStart, periodEnd].
    const requested = input.effectiveDate ?? now;
    const effectiveMs = Math.min(
      Math.max(requested.getTime(), periodStart.getTime()),
      periodEnd.getTime(),
    );
    const effectiveDate = new Date(effectiveMs);

    const daysInPeriodNum =
      (periodEnd.getTime() - periodStart.getTime()) / MS_PER_DAY;
    const daysRemainingNum =
      (periodEnd.getTime() - effectiveDate.getTime()) / MS_PER_DAY;

    const daysInPeriod = new Prisma.Decimal(daysInPeriodNum);
    const daysRemaining = new Prisma.Decimal(daysRemainingNum);

    // ── Proration math ───────────────────────────────────────────────────
    // We always use the *monthly* equivalent price for proration regardless
    // of billingCycle: a single fair "per day" rate avoids double-counting
    // annual prepayments. Billing module (T70) will reconcile against the
    // actual invoice cadence when it consumes prorated_charge events.
    const oldPlanMonthly = new Prisma.Decimal(sub.plan.monthlyPriceIqd);
    const newPlanMonthly = new Prisma.Decimal(newPlan.monthlyPriceIqd);

    const ratio = daysInPeriod.isZero()
      ? new Prisma.Decimal(0)
      : daysRemaining.div(daysInPeriod);

    const oldPlanRefund = roundIqd(oldPlanMonthly.mul(ratio));
    const newPlanCharge = roundIqd(newPlanMonthly.mul(ratio));
    const netDelta = newPlanCharge.sub(oldPlanRefund);

    const direction: ChangePlanResult['direction'] = netDelta.isPositive()
      ? 'upgraded'
      : netDelta.isNegative()
        ? 'downgraded'
        : 'unchanged_price';
    const eventType: 'upgraded' | 'downgraded' = direction === 'downgraded'
      ? 'downgraded'
      : 'upgraded'; // unchanged_price still records as upgraded for analytics neutrality

    const newSubPriceIqd =
      sub.billingCycle === 'annual' ? newPlan.annualPriceIqd : newPlan.monthlyPriceIqd;

    const fromPlanId = sub.planId;
    const fromPlanCode = sub.plan.code;

    // ── Transaction: update + two LicenseEvent rows ─────────────────────
    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.subscription.update({
        where: { id: subscriptionId },
        data: { planId: newPlanId, priceIqd: newSubPriceIqd },
      });

      await tx.licenseEvent.create({
        data: {
          subscriptionId,
          eventType,
          payload: {
            fromPlanId,
            fromPlanCode,
            toPlanId: newPlanId,
            toPlanCode: newPlan.code,
            netDeltaIqd: netDelta.toString(),
            oldPlanRefundIqd: oldPlanRefund.toString(),
            newPlanChargeIqd: newPlanCharge.toString(),
            daysInPeriod: daysInPeriodNum,
            daysRemaining: daysRemainingNum,
            effectiveDate: effectiveDate.toISOString(),
          },
          createdBy: actorUserId,
        },
      });

      await tx.licenseEvent.create({
        data: {
          subscriptionId,
          eventType: 'prorated_charge',
          payload: {
            amountIqd: netDelta.toString(),
            currency: 'IQD',
            direction,
            relatedPlanChange: {
              fromPlanId,
              toPlanId: newPlanId,
            },
            effectiveDate: effectiveDate.toISOString(),
          },
          createdBy: actorUserId,
        },
      });

      return u;
    });

    // ── Post-tx side effects (best-effort) ──────────────────────────────
    try {
      await this.featureCache.invalidate(sub.companyId);
    } catch (err) {
      this.logger.warn(
        `featureCache.invalidate failed for ${sub.companyId}: ${
          err instanceof Error ? err.message : 'unknown'
        }`,
      );
    }

    if (this.notifications) {
      try {
        await this.notifications.dispatch({
          companyId: sub.companyId,
          userId: actorUserId ?? sub.companyId, // fallback target — billing admins
          eventType: 'license.plan.changed',
          title: 'تم تغيير خطة الاشتراك',
          body: `الخطة الجديدة: ${newPlan.name}. صافي الفرق: ${netDelta.toString()} IQD`,
          data: {
            fromPlanId,
            toPlanId: newPlanId,
            netDeltaIqd: netDelta.toString(),
            direction,
          },
        });
      } catch (err) {
        this.logger.warn(
          `notification dispatch failed: ${err instanceof Error ? err.message : 'unknown'}`,
        );
      }
    }

    return {
      subscription: {
        id: updated.id,
        companyId: updated.companyId,
        planId: updated.planId,
        status: updated.status,
        priceIqd: updated.priceIqd.toString(),
      },
      prorationLineItems: [
        {
          kind: 'old_plan_refund',
          planId: fromPlanId,
          planCode: fromPlanCode,
          amountIqd: oldPlanRefund.toString(),
        },
        {
          kind: 'new_plan_charge',
          planId: newPlanId,
          planCode: newPlan.code,
          amountIqd: newPlanCharge.toString(),
        },
      ],
      netDeltaIqd: netDelta.toString(),
      daysInPeriod: daysInPeriodNum,
      daysRemaining: daysRemainingNum,
      effectiveDate: effectiveDate.toISOString(),
      direction,
    };
  }
}
