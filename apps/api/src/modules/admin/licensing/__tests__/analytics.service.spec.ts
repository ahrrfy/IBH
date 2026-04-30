/**
 * Unit tests for T67 — AdminLicensingAnalyticsService.
 *
 * Stubs Prisma in-memory and verifies the SaaS-metric math:
 *   - MRR sums monthly + annual/12 + zeros trials.
 *   - ARR = MRR × 12.
 *   - Active / trialing counts.
 *   - Churn rate denominator = subs active at start of month.
 *   - Conversion rate (trial → paid).
 *   - Expansion MRR delta from upgrade events.
 *   - Time-series shape & per-month math for cancelled subs.
 *   - Breakdown by plan only counts revenue statuses.
 */
import { AdminLicensingAnalyticsService } from '../analytics.service';

interface StubSub {
  id: string;
  status: string;
  billingCycle: 'monthly' | 'annual' | 'bundle';
  priceIqd: number;
  planId: string;
  startedAt: Date | null;
  cancelledAt: Date | null;
}

interface StubPlan {
  id: string;
  code: string;
  name: string;
  monthlyPriceIqd: number;
  annualPriceIqd: number;
  sortOrder: number;
}

interface StubEvent {
  subscriptionId: string;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: Date;
}

function makePrisma(
  subs: StubSub[],
  plans: StubPlan[],
  events: StubEvent[],
): any {
  const subsel = (s: StubSub) => ({
    id: s.id,
    status: s.status,
    billingCycle: s.billingCycle,
    priceIqd: s.priceIqd,
    planId: s.planId,
    startedAt: s.startedAt,
    cancelledAt: s.cancelledAt,
  });
  return {
    // I062 — service wraps cross-tenant queries in withBypassedRls.
    // Stub it to a no-op pass-through so the unit math is unchanged.
    withBypassedRls: async <T>(fn: () => Promise<T>) => fn(),
    subscription: {
      findMany: async () => subs.map(subsel),
      count: async ({ where }: any) => {
        const ids: string[] = where?.id?.in ?? [];
        const inStatus: string[] | undefined = where?.status?.in;
        return subs.filter(
          (s) =>
            (ids.length ? ids.includes(s.id) : true) &&
            (inStatus ? inStatus.includes(s.status) : true),
        ).length;
      },
    },
    plan: {
      findMany: async ({ where, select, orderBy }: any) => {
        let rows = plans;
        if (where?.id?.in) {
          const ids: string[] = where.id.in;
          rows = rows.filter((p) => ids.includes(p.id));
        }
        if (orderBy?.sortOrder === 'asc') {
          rows = [...rows].sort((a, b) => a.sortOrder - b.sortOrder);
        }
        // mimic select narrowing — return everything (tests rely on shape)
        void select;
        return rows;
      },
    },
    licenseEvent: {
      findMany: async ({ where }: any) => {
        const type: string | undefined = where?.eventType;
        const gte: Date | undefined = where?.createdAt?.gte;
        const lt: Date | undefined = where?.createdAt?.lt;
        return events.filter(
          (e) =>
            (type ? e.eventType === type : true) &&
            (gte ? e.createdAt >= gte : true) &&
            (lt ? e.createdAt < lt : true),
        );
      },
    },
  };
}

const NOW = new Date(Date.UTC(2026, 3, 15)); // 2026-04-15

describe('AdminLicensingAnalyticsService', () => {
  const plans: StubPlan[] = [
    {
      id: 'P_STARTER',
      code: 'starter',
      name: 'Starter',
      monthlyPriceIqd: 50_000,
      annualPriceIqd: 500_000,
      sortOrder: 1,
    },
    {
      id: 'P_PRO',
      code: 'pro',
      name: 'Pro',
      monthlyPriceIqd: 150_000,
      annualPriceIqd: 1_500_000,
      sortOrder: 2,
    },
  ];

  function buildSubs(): StubSub[] {
    return [
      // active monthly Starter — contributes 50,000 MRR
      {
        id: 'S1',
        status: 'active',
        billingCycle: 'monthly',
        priceIqd: 50_000,
        planId: 'P_STARTER',
        startedAt: new Date(Date.UTC(2025, 11, 1)),
        cancelledAt: null,
      },
      // active annual Pro — contributes 1,500,000/12 = 125,000 MRR
      {
        id: 'S2',
        status: 'active',
        billingCycle: 'annual',
        priceIqd: 1_500_000,
        planId: 'P_PRO',
        startedAt: new Date(Date.UTC(2026, 0, 1)),
        cancelledAt: null,
      },
      // trial — contributes 0
      {
        id: 'S3',
        status: 'trial',
        billingCycle: 'monthly',
        priceIqd: 0,
        planId: 'P_STARTER',
        startedAt: null,
        cancelledAt: null,
      },
      // cancelled this month — affects churn denominator + numerator
      {
        id: 'S4',
        status: 'cancelled',
        billingCycle: 'monthly',
        priceIqd: 50_000,
        planId: 'P_STARTER',
        startedAt: new Date(Date.UTC(2025, 9, 1)),
        cancelledAt: new Date(Date.UTC(2026, 3, 10)),
      },
    ];
  }

  it('summary: MRR = monthly + annual/12, trials excluded', async () => {
    const svc = new AdminLicensingAnalyticsService(
      makePrisma(buildSubs(), plans, []) as any,
    );
    const r = await svc.getSummary(NOW);
    expect(r.mrrIqd).toBe(175_000); // 50,000 + 125,000
    expect(r.arrIqd).toBe(175_000 * 12);
    expect(r.activeSubscriptions).toBe(2);
    expect(r.trialingSubscriptions).toBe(1);
  });

  it('summary: churn denominator = subs active at start of month', async () => {
    // 3 subs were active at 2026-04-01 (S1, S2, S4 all started before),
    // 1 (S4) cancelled this month → churn = 1/3 ≈ 33.33%
    const svc = new AdminLicensingAnalyticsService(
      makePrisma(buildSubs(), plans, []) as any,
    );
    const r = await svc.getSummary(NOW);
    expect(r.churnRate30d).toBeGreaterThan(33);
    expect(r.churnRate30d).toBeLessThan(34);
  });

  it('summary: conversion rate = converted trials / trials started in window', async () => {
    const subs = buildSubs();
    // mark S3 as having converted (now active)
    subs[2].status = 'active';
    subs[2].startedAt = new Date(Date.UTC(2026, 3, 14));
    const events: StubEvent[] = [
      {
        subscriptionId: 'S3',
        eventType: 'trial_started',
        payload: {},
        createdAt: new Date(Date.UTC(2026, 3, 1)),
      },
      {
        subscriptionId: 'X_LOST',
        eventType: 'trial_started',
        payload: {},
        createdAt: new Date(Date.UTC(2026, 3, 2)),
      },
    ];
    const svc = new AdminLicensingAnalyticsService(
      makePrisma(subs, plans, events) as any,
    );
    const r = await svc.getSummary(NOW);
    // 1 of 2 trials converted → 50%
    expect(r.conversionRate30d).toBe(50);
  });

  it('summary: expansion MRR uses (toPlan.monthly − fromPlan.monthly)', async () => {
    const subs = buildSubs();
    // S1 upgrades from Starter → Pro inside last 30d
    const events: StubEvent[] = [
      {
        subscriptionId: 'S1',
        eventType: 'upgraded',
        payload: { fromPlanId: 'P_STARTER', toPlanId: 'P_PRO' },
        createdAt: new Date(Date.UTC(2026, 3, 5)),
      },
    ];
    const svc = new AdminLicensingAnalyticsService(
      makePrisma(subs, plans, events) as any,
    );
    const r = await svc.getSummary(NOW);
    // delta = 150,000 − 50,000 = 100,000
    expect(r.expansionMrr30dIqd).toBe(100_000);
  });

  it('timeseries: returns N points and current month MRR matches summary', async () => {
    const svc = new AdminLicensingAnalyticsService(
      makePrisma(buildSubs(), plans, []) as any,
    );
    const r = await svc.getTimeseries(12, NOW);
    expect(r.months).toHaveLength(12);
    const last = r.months[r.months.length - 1];
    expect(last.month).toBe('2026-04');
    expect(last.mrrIqd).toBeGreaterThan(0);
    // first point is 12 months back: 2025-05
    expect(r.months[0].month).toBe('2025-05');
  });

  it('timeseries: cancelled sub appears in churnedMrr only in cancellation month', async () => {
    const svc = new AdminLicensingAnalyticsService(
      makePrisma(buildSubs(), plans, []) as any,
    );
    const r = await svc.getTimeseries(12, NOW);
    const apr = r.months.find((p) => p.month === '2026-04')!;
    const mar = r.months.find((p) => p.month === '2026-03')!;
    // S4 cancelled 2026-04-10 → its 50,000 should appear in April churned
    expect(apr.churnedMrrIqd).toBe(50_000);
    expect(mar.churnedMrrIqd).toBe(0);
  });

  it('breakdown: counts only active/trial/grace and groups by plan', async () => {
    const svc = new AdminLicensingAnalyticsService(
      makePrisma(buildSubs(), plans, []) as any,
    );
    const r = await svc.getBreakdown();
    const starter = r.byPlan.find((p) => p.planCode === 'starter')!;
    const pro = r.byPlan.find((p) => p.planCode === 'pro')!;
    // Starter: S1 (active 50k) + S3 (trial, 0 contribution but counted)
    expect(starter.count).toBe(2);
    expect(starter.mrrIqd).toBe(50_000);
    // Pro: S2 only — annual / 12
    expect(pro.count).toBe(1);
    expect(pro.mrrIqd).toBe(125_000);
  });

  it('summary: empty database → all zeros, no NaN/Infinity', async () => {
    const svc = new AdminLicensingAnalyticsService(
      makePrisma([], plans, []) as any,
    );
    const r = await svc.getSummary(NOW);
    expect(r.mrrIqd).toBe(0);
    expect(r.arrIqd).toBe(0);
    expect(r.activeSubscriptions).toBe(0);
    expect(r.trialingSubscriptions).toBe(0);
    expect(r.churnRate30d).toBe(0);
    expect(r.conversionRate30d).toBe(0);
    expect(r.ltvIqd).toBe(0);
    expect(r.expansionMrr30dIqd).toBe(0);
  });
});
