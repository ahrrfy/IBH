/**
 * AdminLicensingAnalyticsService — T67.
 *
 * Computes read-only SaaS analytics over Subscription / Plan / LicenseEvent:
 *  - MRR / ARR for the current month.
 *  - Active / trialing subscription counts.
 *  - Monthly time-series for last N months: MRR, new MRR, churned MRR,
 *    expansion MRR, churn-rate %, active count.
 *  - MRR breakdown by plan.
 *  - Conversion rate (trial → paid) over a 30-day window.
 *  - LTV approximation (= ARPU / monthly-churn-rate).
 *
 * No mutations, no audit log writes — analytics is pure read.
 *
 * Authorization is enforced by the controller via
 * `RequirePermission('License', 'admin')` (super-admin only).
 *
 * Implementation notes:
 *  - Subscription.priceIqd already stores the cycle-correct price; we
 *    normalize to monthly equivalent here (annual / 12) and treat trial
 *    rows as ₫0 contribution.
 *  - Time-series uses Prisma `findMany` once over the windowed events
 *    (created/upgraded/downgraded/cancelled/expired/suspended) plus a
 *    single subscription snapshot — no raw SQL is required and no PII
 *    leaves the service boundary.
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';

export interface AnalyticsSummary {
  asOf: string;
  mrrIqd: number;
  arrIqd: number;
  activeSubscriptions: number;
  trialingSubscriptions: number;
  churnRate30d: number;
  ltvIqd: number;
  conversionRate30d: number;
  expansionMrr30dIqd: number;
}

export interface AnalyticsTimeseriesPoint {
  month: string; // YYYY-MM
  mrrIqd: number;
  newMrrIqd: number;
  churnedMrrIqd: number;
  expansionMrrIqd: number;
  churnRate: number; // 0..100
  activeCount: number;
}

export interface AnalyticsBreakdownEntry {
  planId: string;
  planCode: string;
  planName: string;
  count: number;
  mrrIqd: number;
}

const REVENUE_STATUSES = new Set(['active', 'trial', 'grace']);
const PAID_STATUSES = new Set(['active', 'grace']);

/**
 * Convert any cycle-priced subscription row to a monthly-equivalent
 * IQD figure. Trials & cancellations contribute 0; annual divides by 12.
 */
function monthlyEquivalent(row: {
  status: string;
  billingCycle: string;
  priceIqd: any;
}): number {
  if (!REVENUE_STATUSES.has(row.status)) return 0;
  if (row.status === 'trial') return 0;
  const price = Number(row.priceIqd ?? 0);
  if (!Number.isFinite(price) || price <= 0) return 0;
  if (row.billingCycle === 'annual') return price / 12;
  return price; // monthly or any other cycle treated as the stored value
}

/**
 * Convert any plan to a monthly-equivalent IQD figure based on the cycle
 * the subscription is billed at.
 */
function planMonthlyEquivalent(
  plan: { monthlyPriceIqd: any; annualPriceIqd: any } | null,
  billingCycle: string,
): number {
  if (!plan) return 0;
  const monthly = Number(plan.monthlyPriceIqd ?? 0);
  const annual = Number(plan.annualPriceIqd ?? 0);
  if (billingCycle === 'annual' && annual > 0) return annual / 12;
  return monthly;
}

function ymKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function startOfMonthUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function addMonthsUtc(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
}

@Injectable()
export class AdminLicensingAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Build a single-figure dashboard summary for the current month.
   */
  async getSummary(now: Date = new Date()): Promise<AnalyticsSummary> {
    const monthStart = startOfMonthUtc(now);
    const monthEnd = addMonthsUtc(monthStart, 1);
    const last30Start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const allSubs = await this.prisma.subscription.findMany({
      select: {
        id: true,
        status: true,
        billingCycle: true,
        priceIqd: true,
        planId: true,
        startedAt: true,
        cancelledAt: true,
      },
    });

    let mrr = 0;
    let activeCount = 0;
    let trialingCount = 0;
    for (const s of allSubs) {
      mrr += monthlyEquivalent(s);
      if (s.status === 'active' || s.status === 'grace') activeCount += 1;
      if (s.status === 'trial') trialingCount += 1;
    }

    // Active at start of month — a subscription is "active at T" if it
    // started before T and was not cancelled/expired before T.
    const activeAtMonthStart = allSubs.filter((s) => {
      if (!s.startedAt) return false;
      if (s.startedAt >= monthStart) return false;
      if (s.cancelledAt && s.cancelledAt < monthStart) return false;
      return true;
    }).length;

    const cancelledThisMonth = allSubs.filter(
      (s) =>
        s.cancelledAt &&
        s.cancelledAt >= monthStart &&
        s.cancelledAt < monthEnd,
    ).length;

    const churnRateMonth =
      activeAtMonthStart > 0
        ? (cancelledThisMonth / activeAtMonthStart) * 100
        : 0;

    // Conversion rate (last 30d): trials created in window that have
    // since converted (status active/grace OR an `activated`/`upgraded`
    // event after creation).
    const trialsCreated = await this.prisma.licenseEvent.findMany({
      where: {
        eventType: 'trial_started',
        createdAt: { gte: last30Start, lt: now },
      },
      select: { subscriptionId: true },
    });
    const trialIds = Array.from(
      new Set(trialsCreated.map((e) => e.subscriptionId)),
    );
    let conversions = 0;
    if (trialIds.length) {
      conversions = await this.prisma.subscription.count({
        where: {
          id: { in: trialIds },
          status: { in: ['active', 'grace'] },
        },
      });
    }
    const conversionRate30d =
      trialIds.length > 0 ? (conversions / trialIds.length) * 100 : 0;

    // Expansion MRR (last 30d): for every `upgraded` event, look up the
    // delta between new and old plan monthly-equivalent prices.
    const upgrades = await this.prisma.licenseEvent.findMany({
      where: {
        eventType: 'upgraded',
        createdAt: { gte: last30Start, lt: now },
      },
      select: { payload: true, subscriptionId: true },
    });
    let expansionMrr = 0;
    if (upgrades.length) {
      const planIds = new Set<string>();
      for (const ev of upgrades) {
        const p = ev.payload as Record<string, unknown> | null;
        if (p?.fromPlanId) planIds.add(String(p.fromPlanId));
        if (p?.toPlanId) planIds.add(String(p.toPlanId));
      }
      const plans = planIds.size
        ? await this.prisma.plan.findMany({
            where: { id: { in: Array.from(planIds) } },
            select: { id: true, monthlyPriceIqd: true, annualPriceIqd: true },
          })
        : [];
      const planById = new Map(plans.map((p) => [p.id, p]));
      const subById = new Map(
        allSubs.map((s) => [s.id, s.billingCycle as string]),
      );
      for (const ev of upgrades) {
        const p = ev.payload as Record<string, unknown> | null;
        const fromId = p?.fromPlanId ? String(p.fromPlanId) : null;
        const toId = p?.toPlanId ? String(p.toPlanId) : null;
        const cycle = subById.get(ev.subscriptionId) ?? 'monthly';
        const fromMonthly = planMonthlyEquivalent(
          fromId ? planById.get(fromId) ?? null : null,
          cycle,
        );
        const toMonthly = planMonthlyEquivalent(
          toId ? planById.get(toId) ?? null : null,
          cycle,
        );
        const delta = toMonthly - fromMonthly;
        if (delta > 0) expansionMrr += delta;
      }
    }

    // LTV (rough): ARPU / monthly-churn-rate. If churn=0 and active>0 we
    // cap LTV at ARPU * 36 (3 yr) to avoid Infinity; if no actives, 0.
    const arpu = activeCount > 0 ? mrr / activeCount : 0;
    const monthlyChurn = churnRateMonth / 100;
    const ltv =
      monthlyChurn > 0
        ? arpu / monthlyChurn
        : activeCount > 0
          ? arpu * 36
          : 0;

    return {
      asOf: now.toISOString(),
      mrrIqd: round2(mrr),
      arrIqd: round2(mrr * 12),
      activeSubscriptions: activeCount,
      trialingSubscriptions: trialingCount,
      churnRate30d: round2(churnRateMonth),
      ltvIqd: round2(ltv),
      conversionRate30d: round2(conversionRate30d),
      expansionMrr30dIqd: round2(expansionMrr),
    };
  }

  /**
   * Return a month-by-month time-series for the last `months` months
   * (inclusive of the current month).
   */
  async getTimeseries(
    months = 12,
    now: Date = new Date(),
  ): Promise<{ months: AnalyticsTimeseriesPoint[] }> {
    const m = Math.min(Math.max(Math.floor(months) || 12, 1), 36);
    const firstMonthStart = addMonthsUtc(startOfMonthUtc(now), -(m - 1));
    const seriesEnd = addMonthsUtc(startOfMonthUtc(now), 1);

    const subs = await this.prisma.subscription.findMany({
      select: {
        id: true,
        status: true,
        billingCycle: true,
        priceIqd: true,
        startedAt: true,
        cancelledAt: true,
        planId: true,
      },
    });

    const upgrades = await this.prisma.licenseEvent.findMany({
      where: {
        eventType: 'upgraded',
        createdAt: { gte: firstMonthStart, lt: seriesEnd },
      },
      select: { subscriptionId: true, payload: true, createdAt: true },
    });

    const planIds = new Set<string>();
    for (const ev of upgrades) {
      const p = ev.payload as Record<string, unknown> | null;
      if (p?.fromPlanId) planIds.add(String(p.fromPlanId));
      if (p?.toPlanId) planIds.add(String(p.toPlanId));
    }
    for (const s of subs) planIds.add(s.planId);
    const plans = planIds.size
      ? await this.prisma.plan.findMany({
          where: { id: { in: Array.from(planIds) } },
          select: { id: true, monthlyPriceIqd: true, annualPriceIqd: true },
        })
      : [];
    const planById = new Map(plans.map((p) => [p.id, p]));
    const subCycleById = new Map(
      subs.map((s) => [s.id, s.billingCycle as string]),
    );

    const points: AnalyticsTimeseriesPoint[] = [];
    for (let i = 0; i < m; i += 1) {
      const monthStart = addMonthsUtc(firstMonthStart, i);
      const monthEnd = addMonthsUtc(monthStart, 1);

      // Active at start of month
      const activeAtStart = subs.filter((s) => {
        if (!s.startedAt) return false;
        if (s.startedAt >= monthStart) return false;
        if (s.cancelledAt && s.cancelledAt < monthStart) return false;
        return true;
      });

      // MRR for this month: sum of monthly-equivalents for subs that
      // were "live & paying" during the month. Approximation: count any
      // sub whose startedAt < monthEnd and cancelledAt either null or >=
      // monthStart, with status mapped to monthly contribution.
      let mrr = 0;
      let activeCount = 0;
      for (const s of subs) {
        if (s.startedAt && s.startedAt >= monthEnd) continue;
        if (s.cancelledAt && s.cancelledAt < monthStart) continue;
        // Trials active during this month contribute 0 but still count.
        const status = effectiveStatusForMonth(s, monthStart, monthEnd);
        const contribution = monthlyEquivalent({
          status,
          billingCycle: s.billingCycle,
          priceIqd: s.priceIqd,
        });
        mrr += contribution;
        if (PAID_STATUSES.has(status)) activeCount += 1;
      }

      const cancelledThisMonth = subs.filter(
        (s) =>
          s.cancelledAt &&
          s.cancelledAt >= monthStart &&
          s.cancelledAt < monthEnd,
      );
      const churnedMrr = cancelledThisMonth.reduce(
        (acc, s) =>
          acc +
          monthlyEquivalent({
            // their last paid contribution
            status: 'active',
            billingCycle: s.billingCycle,
            priceIqd: s.priceIqd,
          }),
        0,
      );
      const churnRate =
        activeAtStart.length > 0
          ? (cancelledThisMonth.length / activeAtStart.length) * 100
          : 0;

      const newSubsThisMonth = subs.filter(
        (s) =>
          s.startedAt &&
          s.startedAt >= monthStart &&
          s.startedAt < monthEnd &&
          (!s.cancelledAt || s.cancelledAt >= monthEnd),
      );
      const newMrr = newSubsThisMonth.reduce(
        (acc, s) =>
          acc +
          monthlyEquivalent({
            status: 'active',
            billingCycle: s.billingCycle,
            priceIqd: s.priceIqd,
          }),
        0,
      );

      const monthUpgrades = upgrades.filter(
        (ev) => ev.createdAt >= monthStart && ev.createdAt < monthEnd,
      );
      let expansionMrr = 0;
      for (const ev of monthUpgrades) {
        const p = ev.payload as Record<string, unknown> | null;
        const cycle = subCycleById.get(ev.subscriptionId) ?? 'monthly';
        const fromMonthly = planMonthlyEquivalent(
          p?.fromPlanId ? planById.get(String(p.fromPlanId)) ?? null : null,
          cycle,
        );
        const toMonthly = planMonthlyEquivalent(
          p?.toPlanId ? planById.get(String(p.toPlanId)) ?? null : null,
          cycle,
        );
        const delta = toMonthly - fromMonthly;
        if (delta > 0) expansionMrr += delta;
      }

      points.push({
        month: ymKey(monthStart),
        mrrIqd: round2(mrr),
        newMrrIqd: round2(newMrr),
        churnedMrrIqd: round2(churnedMrr),
        expansionMrrIqd: round2(expansionMrr),
        churnRate: round2(churnRate),
        activeCount,
      });
    }

    return { months: points };
  }

  /**
   * Group MRR by plan (for the current snapshot, not historical).
   */
  async getBreakdown(): Promise<{ byPlan: AnalyticsBreakdownEntry[] }> {
    const [plans, subs] = await Promise.all([
      this.prisma.plan.findMany({
        select: { id: true, code: true, name: true, sortOrder: true },
        orderBy: { sortOrder: 'asc' },
      }),
      this.prisma.subscription.findMany({
        select: {
          id: true,
          planId: true,
          status: true,
          billingCycle: true,
          priceIqd: true,
        },
      }),
    ]);

    const byPlan = new Map<string, { count: number; mrr: number }>();
    for (const s of subs) {
      const m = monthlyEquivalent(s);
      if (!REVENUE_STATUSES.has(s.status)) continue;
      const cur = byPlan.get(s.planId) ?? { count: 0, mrr: 0 };
      cur.count += 1;
      cur.mrr += m;
      byPlan.set(s.planId, cur);
    }

    const out: AnalyticsBreakdownEntry[] = plans.map((p) => {
      const v = byPlan.get(p.id) ?? { count: 0, mrr: 0 };
      return {
        planId: p.id,
        planCode: p.code,
        planName: p.name,
        count: v.count,
        mrrIqd: round2(v.mrr),
      };
    });

    return { byPlan: out };
  }
}

/**
 * Determine a subscription's effective status during a given month
 * window. Used for historical MRR — a sub that is now `cancelled` was
 * once `active` for prior months.
 */
function effectiveStatusForMonth(
  s: { status: string; startedAt: Date | null; cancelledAt: Date | null },
  monthStart: Date,
  monthEnd: Date,
): string {
  // Cancelled/expired in a future month → was paying during this month
  if (s.cancelledAt && s.cancelledAt >= monthEnd) return 'active';
  // Cancelled inside this month → still paid for it (treat as active)
  if (s.cancelledAt && s.cancelledAt >= monthStart && s.cancelledAt < monthEnd)
    return 'active';
  // Cancelled before the month → not active
  if (s.cancelledAt && s.cancelledAt < monthStart) return 'cancelled';
  return s.status;
}

function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}
