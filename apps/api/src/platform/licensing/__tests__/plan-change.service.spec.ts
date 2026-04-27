/**
 * T68 — Unit tests for PlanChangeService.
 *
 * Prisma is stubbed in-memory: subscription / plan / licenseEvent.
 * FeatureCacheService and NotificationsService are minimal mocks; the
 * test asserts they are invoked exactly once per successful change.
 *
 * Coverage (≥9 cases):
 *   - mid-cycle upgrade → positive netDelta + status preserved + planId changed
 *   - mid-cycle downgrade → negative netDelta + 'downgraded' event type
 *   - same-plan rejection
 *   - inactive plan rejection
 *   - subscription in `expired` status rejection
 *   - effective date in the past clamped to periodStart
 *   - effective date in the future clamped to periodEnd
 *   - decimal precision: 30-day month, 15 days remaining → exactly half price
 *   - feature-cache invalidation called once per successful change
 *   - two LicenseEvents written (plan-change + prorated_charge)
 */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PlanChangeService } from '../plan-change.service';

interface FakePlan {
  id: string;
  code: string;
  name: string;
  monthlyPriceIqd: Prisma.Decimal;
  annualPriceIqd: Prisma.Decimal;
  isActive: boolean;
}

interface FakeSub {
  id: string;
  companyId: string;
  planId: string;
  status: string;
  billingCycle: 'monthly' | 'annual' | 'bundle';
  priceIqd: Prisma.Decimal;
  startedAt: Date | null;
  trialStartedAt: Date | null;
  trialEndsAt: Date | null;
  currentPeriodStartAt: Date | null;
  currentPeriodEndAt: Date | null;
  gracePeriodEndsAt: Date | null;
}

interface FakeEvent {
  id: string;
  subscriptionId: string;
  eventType: string;
  payload: any;
  createdAt: Date;
  createdBy: string | null;
}

function plan(
  id: string,
  code: string,
  monthly: number,
  annual: number,
  isActive = true,
): FakePlan {
  return {
    id,
    code,
    name: code,
    monthlyPriceIqd: new Prisma.Decimal(monthly),
    annualPriceIqd: new Prisma.Decimal(annual),
    isActive,
  };
}

function makePrisma(plans: FakePlan[], subs: FakeSub[]) {
  const events: FakeEvent[] = [];
  let nextId = 1;
  const tx = {
    subscription: {
      findUnique: async ({ where, include }: any) => {
        const s = subs.find((x) => x.id === where.id);
        if (!s) return null;
        if (include?.plan) {
          return { ...s, plan: plans.find((p) => p.id === s.planId) };
        }
        return s;
      },
      update: async ({ where, data }: any) => {
        const s = subs.find((x) => x.id === where.id)!;
        Object.assign(s, data);
        return s;
      },
    },
    plan: {
      findUnique: async ({ where }: any) =>
        plans.find((p) => p.id === where.id) ?? null,
    },
    licenseEvent: {
      create: async ({ data }: any) => {
        const ev: FakeEvent = {
          id: `EV${nextId++}`,
          subscriptionId: data.subscriptionId,
          eventType: data.eventType,
          payload: data.payload,
          createdAt: new Date(),
          createdBy: data.createdBy ?? null,
        };
        events.push(ev);
        return ev;
      },
    },
  };
  const prisma: any = {
    ...tx,
    $transaction: async (fn: any) => fn(tx),
  };
  return { prisma, events };
}

function makeFeatureCache() {
  const calls: string[] = [];
  return {
    cache: { invalidate: async (companyId: string) => calls.push(companyId) } as any,
    calls,
  };
}

function makeNotifications() {
  const calls: any[] = [];
  return {
    notif: { dispatch: async (p: any) => calls.push(p) } as any,
    calls,
  };
}

const day = 24 * 60 * 60 * 1000;

function fixtures(overrides: Partial<FakeSub> = {}) {
  const plans = [
    plan('P1', 'starter', 30_000, 300_000),
    plan('P2', 'business', 90_000, 900_000),
    plan('P3', 'inactive', 60_000, 600_000, false),
  ];
  const periodStart = new Date('2026-01-01T00:00:00.000Z');
  const periodEnd = new Date('2026-01-31T00:00:00.000Z');
  const subs: FakeSub[] = [
    {
      id: 'S1',
      companyId: 'CO1',
      planId: 'P1',
      status: 'active',
      billingCycle: 'monthly',
      priceIqd: new Prisma.Decimal(30_000),
      startedAt: periodStart,
      trialStartedAt: null,
      trialEndsAt: null,
      currentPeriodStartAt: periodStart,
      currentPeriodEndAt: periodEnd,
      gracePeriodEndsAt: null,
      ...overrides,
    },
  ];
  return { plans, subs, periodStart, periodEnd };
}

describe('PlanChangeService', () => {
  it('mid-cycle upgrade: positive netDelta, status preserved, planId changed', async () => {
    const { plans, subs, periodEnd } = fixtures();
    // Effective date = exactly 15 days before periodEnd → 15/30 = 0.5
    const effectiveDate = new Date(periodEnd.getTime() - 15 * day);
    const { prisma, events } = makePrisma(plans, subs);
    const { cache } = makeFeatureCache();
    const svc = new PlanChangeService(prisma, cache, null);

    const res = await svc.changePlan({
      subscriptionId: 'S1',
      newPlanId: 'P2',
      actorUserId: 'U1',
      effectiveDate,
    });

    expect(res.subscription.planId).toBe('P2');
    expect(res.subscription.status).toBe('active');
    expect(res.direction).toBe('upgraded');
    // 0.5 × (90_000 − 30_000) = 30_000
    expect(res.netDeltaIqd).toBe('30000');
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.eventType)).toEqual(['upgraded', 'prorated_charge']);
  });

  it('mid-cycle downgrade: negative netDelta + downgraded event type', async () => {
    const { plans, subs, periodEnd } = fixtures({ planId: 'P2', priceIqd: new Prisma.Decimal(90_000) });
    const effectiveDate = new Date(periodEnd.getTime() - 15 * day);
    const { prisma, events } = makePrisma(plans, subs);
    const { cache } = makeFeatureCache();
    const svc = new PlanChangeService(prisma, cache, null);

    const res = await svc.changePlan({
      subscriptionId: 'S1',
      newPlanId: 'P1',
      actorUserId: 'U1',
      effectiveDate,
    });
    expect(res.direction).toBe('downgraded');
    expect(res.netDeltaIqd).toBe('-30000');
    expect(events.find((e) => e.eventType === 'downgraded')).toBeTruthy();
    expect(events.find((e) => e.eventType === 'prorated_charge')).toBeTruthy();
  });

  it('rejects same-plan change (PLAN_UNCHANGED)', async () => {
    const { plans, subs } = fixtures();
    const { prisma } = makePrisma(plans, subs);
    const { cache } = makeFeatureCache();
    const svc = new PlanChangeService(prisma, cache, null);
    await expect(
      svc.changePlan({ subscriptionId: 'S1', newPlanId: 'P1', actorUserId: 'U1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects inactive plan (PLAN_INACTIVE)', async () => {
    const { plans, subs } = fixtures();
    const { prisma } = makePrisma(plans, subs);
    const { cache } = makeFeatureCache();
    const svc = new PlanChangeService(prisma, cache, null);
    await expect(
      svc.changePlan({ subscriptionId: 'S1', newPlanId: 'P3', actorUserId: 'U1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects subscription in expired status (SUBSCRIPTION_NOT_CHANGEABLE)', async () => {
    const { plans, subs } = fixtures({ status: 'expired' });
    const { prisma } = makePrisma(plans, subs);
    const { cache } = makeFeatureCache();
    const svc = new PlanChangeService(prisma, cache, null);
    await expect(
      svc.changePlan({ subscriptionId: 'S1', newPlanId: 'P2', actorUserId: 'U1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects unknown subscription (SUBSCRIPTION_NOT_FOUND)', async () => {
    const { plans, subs } = fixtures();
    const { prisma } = makePrisma(plans, subs);
    const { cache } = makeFeatureCache();
    const svc = new PlanChangeService(prisma, cache, null);
    await expect(
      svc.changePlan({ subscriptionId: 'NOPE', newPlanId: 'P2', actorUserId: 'U1' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('clamps past effectiveDate to periodStart (full-period proration)', async () => {
    const { plans, subs, periodStart } = fixtures();
    const past = new Date(periodStart.getTime() - 100 * day);
    const { prisma } = makePrisma(plans, subs);
    const { cache } = makeFeatureCache();
    const svc = new PlanChangeService(prisma, cache, null);

    const res = await svc.changePlan({
      subscriptionId: 'S1',
      newPlanId: 'P2',
      actorUserId: 'U1',
      effectiveDate: past,
    });
    // daysRemaining = full 30 days → netDelta = 90_000 − 30_000 = 60_000
    expect(res.netDeltaIqd).toBe('60000');
    expect(res.daysRemaining).toBe(30);
  });

  it('clamps future effectiveDate to periodEnd (zero proration)', async () => {
    const { plans, subs, periodEnd } = fixtures();
    const future = new Date(periodEnd.getTime() + 100 * day);
    const { prisma } = makePrisma(plans, subs);
    const { cache } = makeFeatureCache();
    const svc = new PlanChangeService(prisma, cache, null);

    const res = await svc.changePlan({
      subscriptionId: 'S1',
      newPlanId: 'P2',
      actorUserId: 'U1',
      effectiveDate: future,
    });
    expect(res.netDeltaIqd).toBe('0');
    expect(res.daysRemaining).toBe(0);
  });

  it('decimal precision: 30-day month with 15 days remaining → exactly half price', async () => {
    const { plans, subs, periodEnd } = fixtures();
    const effectiveDate = new Date(periodEnd.getTime() - 15 * day);
    const { prisma } = makePrisma(plans, subs);
    const { cache } = makeFeatureCache();
    const svc = new PlanChangeService(prisma, cache, null);

    const res = await svc.changePlan({
      subscriptionId: 'S1',
      newPlanId: 'P2',
      actorUserId: 'U1',
      effectiveDate,
    });
    // Half of 30_000 refund, half of 90_000 charge
    expect(res.prorationLineItems).toEqual([
      { kind: 'old_plan_refund', planId: 'P1', planCode: 'starter', amountIqd: '15000' },
      { kind: 'new_plan_charge', planId: 'P2', planCode: 'business', amountIqd: '45000' },
    ]);
    expect(res.netDeltaIqd).toBe('30000');
  });

  it('feature-cache invalidation called exactly once per successful change', async () => {
    const { plans, subs } = fixtures();
    const { prisma } = makePrisma(plans, subs);
    const { cache, calls } = makeFeatureCache();
    const svc = new PlanChangeService(prisma, cache, null);

    await svc.changePlan({ subscriptionId: 'S1', newPlanId: 'P2', actorUserId: 'U1' });
    expect(calls).toEqual(['CO1']);
  });

  it('writes prorated_charge event with amount, currency, and direction', async () => {
    const { plans, subs, periodEnd } = fixtures();
    const effectiveDate = new Date(periodEnd.getTime() - 15 * day);
    const { prisma, events } = makePrisma(plans, subs);
    const { cache } = makeFeatureCache();
    const svc = new PlanChangeService(prisma, cache, null);

    await svc.changePlan({
      subscriptionId: 'S1',
      newPlanId: 'P2',
      actorUserId: 'U1',
      effectiveDate,
    });
    const charge = events.find((e) => e.eventType === 'prorated_charge')!;
    expect(charge).toBeTruthy();
    expect(charge.payload.amountIqd).toBe('30000');
    expect(charge.payload.currency).toBe('IQD');
    expect(charge.payload.direction).toBe('upgraded');
  });

  it('dispatches T46 notification when notifications service is available', async () => {
    const { plans, subs } = fixtures();
    const { prisma } = makePrisma(plans, subs);
    const { cache } = makeFeatureCache();
    const { notif, calls } = makeNotifications();
    const svc = new PlanChangeService(prisma, cache, notif);

    await svc.changePlan({ subscriptionId: 'S1', newPlanId: 'P2', actorUserId: 'U1' });
    expect(calls).toHaveLength(1);
    expect(calls[0].eventType).toBe('license.plan.changed');
    expect(calls[0].companyId).toBe('CO1');
  });
});
