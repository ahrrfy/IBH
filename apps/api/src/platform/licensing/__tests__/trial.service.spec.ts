import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TrialService } from '../trial.service';

/**
 * T61 — TrialService unit tests.
 *
 * Covers:
 *   - startTrial: date math, default duration, idempotency
 *   - extendTrial: appends, validates, restores grace→trial
 *   - convertTrialToPaid: flips status, sets period end (monthly/yearly)
 */

interface FakeSub {
  id: string;
  companyId: string;
  planId: string;
  status: string;
  startedAt: Date | null;
  trialStartedAt: Date | null;
  trialEndsAt: Date | null;
  gracePeriodEndsAt: Date | null;
  currentPeriodStartAt: Date | null;
  currentPeriodEndAt: Date | null;
  billingCycle: string;
  createdAt: Date;
  createdBy: string | null;
}

class FakePrisma {
  rows: FakeSub[] = [];
  private idSeq = 0;

  subscription = {
    findFirst: jest.fn(async ({ where, orderBy: _orderBy }: any) => {
      const matches = this.rows.filter((r) => {
        if (where.companyId && r.companyId !== where.companyId) return false;
        if (where.status?.in && !where.status.in.includes(r.status)) return false;
        return true;
      });
      matches.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return matches[0] ?? null;
    }),
    findUnique: jest.fn(async ({ where }: any) => {
      return this.rows.find((r) => r.id === where.id) ?? null;
    }),
    create: jest.fn(async ({ data }: any) => {
      const row: FakeSub = {
        id: `sub_${++this.idSeq}`,
        companyId: data.companyId,
        planId: data.planId,
        status: data.status,
        startedAt: data.startedAt ?? null,
        trialStartedAt: data.trialStartedAt ?? null,
        trialEndsAt: data.trialEndsAt ?? null,
        gracePeriodEndsAt: data.gracePeriodEndsAt ?? null,
        currentPeriodStartAt: data.currentPeriodStartAt ?? null,
        currentPeriodEndAt: data.currentPeriodEndAt ?? null,
        billingCycle: data.billingCycle ?? 'monthly',
        createdAt: new Date(),
        createdBy: data.createdBy ?? null,
      };
      this.rows.push(row);
      return row;
    }),
    update: jest.fn(async ({ where, data }: any) => {
      const row = this.rows.find((r) => r.id === where.id);
      if (!row) throw new Error('not found');
      Object.assign(row, data);
      return row;
    }),
  };
}

function makeService(prisma: FakePrisma) {
  return new TrialService(prisma as unknown as never);
}

describe('TrialService.startTrial', () => {
  it('creates a trial subscription with 30-day window and 7-day grace', async () => {
    const prisma = new FakePrisma();
    const svc = makeService(prisma);
    const before = Date.now();
    const sub = await svc.startTrial('co_1', 'plan_1');
    const after = Date.now();

    expect(sub.status).toBe('trial');
    expect(sub.trialStartedAt).not.toBeNull();
    expect(sub.trialEndsAt).not.toBeNull();
    expect(sub.gracePeriodEndsAt).not.toBeNull();

    const trialEnd = sub.trialEndsAt!.getTime();
    const expectedEndMin = before + 30 * 86_400_000;
    const expectedEndMax = after + 30 * 86_400_000;
    expect(trialEnd).toBeGreaterThanOrEqual(expectedEndMin);
    expect(trialEnd).toBeLessThanOrEqual(expectedEndMax);

    const graceEnd = sub.gracePeriodEndsAt!.getTime();
    expect(graceEnd - trialEnd).toBe(7 * 86_400_000);
  });

  it('honours custom durationDays', async () => {
    const prisma = new FakePrisma();
    const svc = makeService(prisma);
    const sub = await svc.startTrial('co_1', 'plan_1', 14);
    const span = sub.gracePeriodEndsAt!.getTime() - sub.trialStartedAt!.getTime();
    expect(span).toBe((14 + 7) * 86_400_000);
  });

  it('rejects non-positive duration', async () => {
    const prisma = new FakePrisma();
    const svc = makeService(prisma);
    await expect(svc.startTrial('co_1', 'plan_1', 0)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(svc.startTrial('co_1', 'plan_1', -5)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('is idempotent: returns the existing trial when one is active', async () => {
    const prisma = new FakePrisma();
    const svc = makeService(prisma);
    const first = await svc.startTrial('co_1', 'plan_1');
    const second = await svc.startTrial('co_1', 'plan_1');
    expect(second.id).toBe(first.id);
    expect(prisma.subscription.create).toHaveBeenCalledTimes(1);
  });

  it('is idempotent against an existing active (paid) subscription', async () => {
    const prisma = new FakePrisma();
    prisma.rows.push({
      id: 'sub_paid',
      companyId: 'co_1',
      planId: 'plan_1',
      status: 'active',
      startedAt: new Date(),
      trialStartedAt: null,
      trialEndsAt: null,
      gracePeriodEndsAt: null,
      currentPeriodStartAt: new Date(),
      currentPeriodEndAt: new Date(Date.now() + 30 * 86_400_000),
      billingCycle: 'monthly',
      createdAt: new Date(),
      createdBy: null,
    });
    const svc = makeService(prisma);
    const sub = await svc.startTrial('co_1', 'plan_1');
    expect(sub.id).toBe('sub_paid');
    expect(prisma.subscription.create).not.toHaveBeenCalled();
  });
});

describe('TrialService.extendTrial', () => {
  it('appends additionalDays to trialEndsAt and gracePeriodEndsAt', async () => {
    const prisma = new FakePrisma();
    const svc = makeService(prisma);
    const sub = await svc.startTrial('co_1', 'plan_1');
    const origTrialEnd = sub.trialEndsAt!.getTime();
    const origGraceEnd = sub.gracePeriodEndsAt!.getTime();

    const extended = await svc.extendTrial(sub.id, 5, 'user_admin');
    expect(extended.trialEndsAt!.getTime() - origTrialEnd).toBe(5 * 86_400_000);
    expect(extended.gracePeriodEndsAt!.getTime() - origGraceEnd).toBe(
      5 * 86_400_000,
    );
  });

  it('rejects non-positive additionalDays', async () => {
    const prisma = new FakePrisma();
    const svc = makeService(prisma);
    const sub = await svc.startTrial('co_1', 'plan_1');
    await expect(svc.extendTrial(sub.id, 0, 'u')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects missing actorUserId', async () => {
    const prisma = new FakePrisma();
    const svc = makeService(prisma);
    const sub = await svc.startTrial('co_1', 'plan_1');
    await expect(svc.extendTrial(sub.id, 5, '')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('throws NotFound for unknown subscription', async () => {
    const prisma = new FakePrisma();
    const svc = makeService(prisma);
    await expect(
      svc.extendTrial('missing', 5, 'u'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects extending an expired or active subscription', async () => {
    const prisma = new FakePrisma();
    const svc = makeService(prisma);
    const sub = await svc.startTrial('co_1', 'plan_1');
    sub.status = 'expired';
    await expect(
      svc.extendTrial(sub.id, 5, 'u'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('restores a grace subscription back to trial', async () => {
    const prisma = new FakePrisma();
    const svc = makeService(prisma);
    const sub = await svc.startTrial('co_1', 'plan_1');
    sub.status = 'grace';
    const updated = await svc.extendTrial(sub.id, 10, 'u');
    expect(updated.status).toBe('trial');
  });
});

describe('TrialService.convertTrialToPaid', () => {
  it('flips status to active and sets a 30-day monthly period', async () => {
    const prisma = new FakePrisma();
    const svc = makeService(prisma);
    const sub = await svc.startTrial('co_1', 'plan_1');
    const before = Date.now();
    const updated = await svc.convertTrialToPaid(sub.id);
    const after = Date.now();

    expect(updated.status).toBe('active');
    expect(updated.currentPeriodStartAt).not.toBeNull();
    expect(updated.currentPeriodEndAt).not.toBeNull();
    const span =
      updated.currentPeriodEndAt!.getTime() -
      updated.currentPeriodStartAt!.getTime();
    expect(span).toBe(30 * 86_400_000);
    expect(updated.currentPeriodStartAt!.getTime()).toBeGreaterThanOrEqual(
      before,
    );
    expect(updated.currentPeriodStartAt!.getTime()).toBeLessThanOrEqual(after);
  });

  it('uses 365 days for yearly billing cycle', async () => {
    const prisma = new FakePrisma();
    const svc = makeService(prisma);
    const sub = await svc.startTrial('co_1', 'plan_1');
    sub.billingCycle = 'annual';
    const updated = await svc.convertTrialToPaid(sub.id);
    const span =
      updated.currentPeriodEndAt!.getTime() -
      updated.currentPeriodStartAt!.getTime();
    expect(span).toBe(365 * 86_400_000);
  });

  it('rejects converting a non-trial/non-grace subscription', async () => {
    const prisma = new FakePrisma();
    const svc = makeService(prisma);
    const sub = await svc.startTrial('co_1', 'plan_1');
    sub.status = 'expired';
    await expect(svc.convertTrialToPaid(sub.id)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('throws NotFound for unknown subscription', async () => {
    const prisma = new FakePrisma();
    const svc = makeService(prisma);
    await expect(svc.convertTrialToPaid('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
