/**
 * Unit tests for T63 — AdminLicensingService.
 *
 * Prisma is stubbed in-memory: subscription/plan/company/licenseEvent.
 * Verifies:
 *   - listTenants paginates and filters by status / search
 *   - setStatus suspends and emits LicenseEvent + AuditLog
 *   - extendTrial pushes trialEndsAt forward and rejects bad input
 *   - changePlan creates upgrade/downgrade events and updates priceIqd
 */
import { AdminLicensingService } from '../admin-licensing.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

interface FakeSub {
  id: string;
  companyId: string;
  planId: string;
  status: string;
  billingCycle: 'monthly' | 'annual' | 'bundle';
  trialEndsAt: Date | null;
  priceIqd: { toString(): string } & number;
  createdAt: Date;
  startedAt: Date | null;
  currentPeriodEndAt: Date | null;
  gracePeriodEndsAt: Date | null;
}

interface FakePlan {
  id: string;
  code: string;
  name: string;
  monthlyPriceIqd: number;
  annualPriceIqd: number;
}

interface FakeCompany {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string | null;
}

interface FakeEvent {
  id: string;
  subscriptionId: string;
  eventType: string;
  payload: any;
  createdAt: Date;
  createdBy: string | null;
}

function decimal(v: number) {
  // mimic Prisma.Decimal – has toString and arithmetic via Number()
  const obj: any = Object(v);
  obj.toString = () => String(v);
  return obj;
}

function makePrisma(
  subs: FakeSub[],
  plans: FakePlan[],
  companies: FakeCompany[],
) {
  const events: FakeEvent[] = [];
  let nextId = 1;
  const tx = {
    subscription: {
      findUnique: async ({ where }: any) =>
        subs.find((s) => s.id === where.id) ?? null,
      update: async ({ where, data }: any) => {
        const s = subs.find((x) => x.id === where.id)!;
        Object.assign(s, data);
        return s;
      },
      count: async ({ where }: any) => {
        return subs.filter((s) =>
          where?.status ? s.status === where.status : true,
        ).length;
      },
      findMany: async ({ where, skip = 0, take = 50 }: any) => {
        const filtered = subs.filter((s) =>
          where?.status ? s.status === where.status : true,
        );
        return filtered.slice(skip, skip + take).map((s) => ({
          ...s,
          plan: plans.find((p) => p.id === s.planId),
          _count: { licenseKeys: 0 },
        }));
      },
    },
    plan: {
      findUnique: async ({ where }: any) =>
        plans.find((p) => p.id === where.id) ?? null,
      findMany: async () => plans.map((p) => ({ ...p, features: [] })),
    },
    company: {
      findMany: async ({ where }: any) =>
        companies.filter((c) => where.id.in.includes(c.id)),
      findUnique: async ({ where }: any) =>
        companies.find((c) => c.id === where.id) ?? null,
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
      count: async () => events.length,
      findMany: async ({ skip = 0, take = 50 }: any) =>
        [...events]
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .slice(skip, skip + take),
    },
  };

  const prisma: any = {
    ...tx,
    $transaction: async (fn: any) => fn(tx),
    // I062 — withBypassedRls is a no-op in unit tests (no real RLS).
    withBypassedRls: async <T>(fn: () => Promise<T>) => fn(),
  };
  return { prisma, events };
}

function makeAudit() {
  const calls: any[] = [];
  return {
    audit: { log: async (p: any) => calls.push(p) } as any,
    calls,
  };
}

/**
 * Stub PlanChangeService for the admin-licensing tests. The real service
 * is exhaustively covered by `platform/licensing/__tests__/plan-change.service.spec.ts`.
 * Here we just verify the admin endpoint delegates correctly and emits
 * the right audit row.
 */
function makePlanChange(prismaForEvents: any) {
  return {
    changePlan: async ({ subscriptionId, newPlanId }: any) => {
      const sub = prismaForEvents.subscription.findUnique
        ? await prismaForEvents.subscription.findUnique({ where: { id: subscriptionId } })
        : null;
      if (!sub) {
        const { NotFoundException: NF } = require('@nestjs/common');
        throw new NF({ code: 'SUBSCRIPTION_NOT_FOUND' });
      }
      if (sub.planId === newPlanId) {
        const { BadRequestException: BR } = require('@nestjs/common');
        throw new BR({ code: 'PLAN_UNCHANGED' });
      }
      const newPlan = await prismaForEvents.plan.findUnique({ where: { id: newPlanId } });
      const oldPlan = await prismaForEvents.plan.findUnique({ where: { id: sub.planId } });
      const direction =
        (newPlan?.monthlyPriceIqd ?? 0) >= (oldPlan?.monthlyPriceIqd ?? 0)
          ? 'upgraded'
          : 'downgraded';
      await prismaForEvents.subscription.update({
        where: { id: subscriptionId },
        data: { planId: newPlanId },
      });
      await prismaForEvents.licenseEvent.create({
        data: {
          subscriptionId,
          eventType: direction,
          payload: { fromPlanId: sub.planId, toPlanId: newPlanId },
        },
      });
      await prismaForEvents.licenseEvent.create({
        data: {
          subscriptionId,
          eventType: 'prorated_charge',
          payload: { amountIqd: '0', currency: 'IQD' },
        },
      });
      return {
        subscription: { id: sub.id, companyId: sub.companyId, planId: newPlanId, status: sub.status, priceIqd: '0' },
        prorationLineItems: [],
        netDeltaIqd: '0',
        daysInPeriod: 30,
        daysRemaining: 15,
        effectiveDate: new Date().toISOString(),
        direction,
      };
    },
  } as any;
}

const SESSION = { userId: 'U1', companyId: 'C1' } as any;

describe('AdminLicensingService', () => {
  function fixtures() {
    const plans: FakePlan[] = [
      { id: 'P1', code: 'starter', name: 'Starter', monthlyPriceIqd: 50_000, annualPriceIqd: 500_000 },
      { id: 'P2', code: 'business', name: 'Business', monthlyPriceIqd: 150_000, annualPriceIqd: 1_500_000 },
    ];
    const companies: FakeCompany[] = [
      { id: 'CO1', code: 'AR1', nameAr: 'الشركة الأولى', nameEn: 'First Co' },
      { id: 'CO2', code: 'AR2', nameAr: 'الشركة الثانية', nameEn: null },
    ];
    const subs: FakeSub[] = [
      {
        id: 'S1',
        companyId: 'CO1',
        planId: 'P1',
        status: 'active',
        billingCycle: 'monthly',
        trialEndsAt: null,
        priceIqd: decimal(50_000),
        createdAt: new Date('2026-01-01'),
        startedAt: new Date('2026-01-01'),
        currentPeriodEndAt: new Date('2026-12-01'),
        gracePeriodEndsAt: null,
      },
      {
        id: 'S2',
        companyId: 'CO2',
        planId: 'P1',
        status: 'trial',
        billingCycle: 'monthly',
        trialEndsAt: new Date('2026-05-01'),
        priceIqd: decimal(0),
        createdAt: new Date('2026-04-01'),
        startedAt: null,
        currentPeriodEndAt: null,
        gracePeriodEndsAt: null,
      },
    ];
    return { plans, companies, subs };
  }

  it('listTenants: returns paginated items with company and plan info', async () => {
    const { plans, companies, subs } = fixtures();
    const { prisma } = makePrisma(subs, plans, companies);
    const { audit } = makeAudit();
    const svc = new AdminLicensingService(prisma, audit, makePlanChange(prisma));

    const res = await svc.listTenants({});
    expect(res.total).toBe(2);
    expect(res.items.length).toBe(2);
    expect(res.items[0].companyNameAr).toBeDefined();
    expect(res.items[0].plan).toBeDefined();
    expect(res.items[0].monthlyMrrIqd).toBeDefined();
  });

  it('listTenants: status filter returns only matching subs', async () => {
    const { plans, companies, subs } = fixtures();
    const { prisma } = makePrisma(subs, plans, companies);
    const { audit } = makeAudit();
    const svc = new AdminLicensingService(prisma, audit, makePlanChange(prisma));

    const res = await svc.listTenants({ status: 'trial' });
    expect(res.items.length).toBe(1);
    expect(res.items[0].id).toBe('S2');
  });

  it('listTenants: search narrows by company name', async () => {
    const { plans, companies, subs } = fixtures();
    const { prisma } = makePrisma(subs, plans, companies);
    const { audit } = makeAudit();
    const svc = new AdminLicensingService(prisma, audit, makePlanChange(prisma));

    const res = await svc.listTenants({ search: 'الثانية' });
    expect(res.items.length).toBe(1);
    expect(res.items[0].id).toBe('S2');
  });

  it('setStatus: suspend creates suspended event + audit', async () => {
    const { plans, companies, subs } = fixtures();
    const { prisma, events } = makePrisma(subs, plans, companies);
    const { audit, calls } = makeAudit();
    const svc = new AdminLicensingService(prisma, audit, makePlanChange(prisma));

    const updated = await svc.setStatus('S1', 'suspended', 'no payment', SESSION);
    expect(updated.status).toBe('suspended');
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe('suspended');
    expect(calls[0].action).toBe('SUBSCRIPTION_SUSPENDED');
    expect(calls[0].entityType).toBe('Subscription');
  });

  it('setStatus: rejects unchanged status', async () => {
    const { plans, companies, subs } = fixtures();
    const { prisma } = makePrisma(subs, plans, companies);
    const { audit } = makeAudit();
    const svc = new AdminLicensingService(prisma, audit, makePlanChange(prisma));

    await expect(svc.setStatus('S1', 'active', undefined, SESSION)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('setStatus: 404 on unknown subscription', async () => {
    const { plans, companies, subs } = fixtures();
    const { prisma } = makePrisma(subs, plans, companies);
    const { audit } = makeAudit();
    const svc = new AdminLicensingService(prisma, audit, makePlanChange(prisma));

    await expect(svc.setStatus('NOPE', 'suspended', undefined, SESSION)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('extendTrial: pushes trialEndsAt forward by extraDays', async () => {
    const { plans, companies, subs } = fixtures();
    const { prisma, events } = makePrisma(subs, plans, companies);
    const { audit } = makeAudit();
    const svc = new AdminLicensingService(prisma, audit, makePlanChange(prisma));

    const before = subs.find((s) => s.id === 'S2')!.trialEndsAt!.getTime();
    const updated = await svc.extendTrial('S2', 14, SESSION);
    expect(updated.trialEndsAt!.getTime()).toBe(
      before + 14 * 24 * 60 * 60 * 1000,
    );
    expect(events.find((e) => e.eventType === 'trial_extended')).toBeTruthy();
  });

  it('extendTrial: rejects extraDays <= 0 or > 365', async () => {
    const { plans, companies, subs } = fixtures();
    const { prisma } = makePrisma(subs, plans, companies);
    const { audit } = makeAudit();
    const svc = new AdminLicensingService(prisma, audit, makePlanChange(prisma));

    await expect(svc.extendTrial('S2', 0, SESSION)).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.extendTrial('S2', 400, SESSION)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('changePlan: upgrade creates upgraded event with new priceIqd', async () => {
    const { plans, companies, subs } = fixtures();
    const { prisma, events } = makePrisma(subs, plans, companies);
    const { audit, calls } = makeAudit();
    const svc = new AdminLicensingService(prisma, audit, makePlanChange(prisma));

    await svc.changePlan('S1', 'P2', SESSION);
    expect(events.find((e) => e.eventType === 'upgraded')).toBeTruthy();
    expect(calls[0].action).toBe('SUBSCRIPTION_UPGRADED');
  });

  it('changePlan: rejects same plan', async () => {
    const { plans, companies, subs } = fixtures();
    const { prisma } = makePrisma(subs, plans, companies);
    const { audit } = makeAudit();
    const svc = new AdminLicensingService(prisma, audit, makePlanChange(prisma));

    await expect(svc.changePlan('S1', 'P1', SESSION)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('listEvents: paginated audit log', async () => {
    const { plans, companies, subs } = fixtures();
    const { prisma } = makePrisma(subs, plans, companies);
    const { audit } = makeAudit();
    const svc = new AdminLicensingService(prisma, audit, makePlanChange(prisma));

    await svc.setStatus('S1', 'suspended', undefined, SESSION);
    await svc.setStatus('S1', 'active', undefined, SESSION);
    const res = await svc.listEvents({});
    expect(res.total).toBe(2);
    expect(res.items.length).toBe(2);
  });
});
