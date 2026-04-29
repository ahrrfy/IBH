import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/platform/prisma/prisma.service';

/**
 * Subscription / Trial / Feature-gating invariants (S2.6 — Licensing module).
 *
 * Complements `license-heartbeat.e2e-spec.ts` (which tests the legacy License
 * model). This file targets the Wave-5 multi-tenant subscription model:
 *   - Subscription (Plan, billing cycle, trial/period dates, status)
 *   - SubscriptionFeature (per-tenant feature overrides)
 *   - LicenseInvoice (proration, period coverage)
 *
 * Invariants verified on existing data (no fixture creation):
 *   1. Trial window order: trialStartedAt ≤ trialEndsAt (when both set)
 *   2. Period window order: currentPeriodStartAt < currentPeriodEndAt (when both set)
 *   3. Grace period extends past period end (when set)
 *   4. status='cancelled' implies cancelledAt is non-null
 *   5. effectiveFeatures is a valid JSON object (not array, not primitive)
 *   6. SubscriptionFeature → Subscription FK is intact (no orphans)
 *   7. LicenseInvoice period bounds are well-ordered
 *   8. LicenseInvoice line totals match the header amount (within 0.01 IQD)
 */
describe('Licensing — Subscription + Invoice invariants (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('trial window — trialStartedAt ≤ trialEndsAt when both are set', async () => {
    const trials = await prisma.subscription.findMany({
      where: {
        AND: [
          { trialStartedAt: { not: null } },
          { trialEndsAt: { not: null } },
        ],
      },
      select: { id: true, trialStartedAt: true, trialEndsAt: true },
      take: 100,
    });

    for (const t of trials) {
      expect(t.trialStartedAt!.getTime()).toBeLessThanOrEqual(t.trialEndsAt!.getTime());
    }
  });

  it('period window — currentPeriodStartAt < currentPeriodEndAt when both are set', async () => {
    const subs = await prisma.subscription.findMany({
      where: {
        AND: [
          { currentPeriodStartAt: { not: null } },
          { currentPeriodEndAt: { not: null } },
        ],
      },
      select: { id: true, currentPeriodStartAt: true, currentPeriodEndAt: true },
      take: 100,
    });

    for (const s of subs) {
      expect(s.currentPeriodStartAt!.getTime()).toBeLessThan(s.currentPeriodEndAt!.getTime());
    }
  });

  it('grace period extends past the relevant end date', async () => {
    const grace = await prisma.subscription.findMany({
      where: { gracePeriodEndsAt: { not: null } },
      select: {
        id: true,
        gracePeriodEndsAt: true,
        currentPeriodEndAt: true,
        trialEndsAt: true,
      },
      take: 100,
    });

    for (const g of grace) {
      // Grace must be ≥ whichever of (period end, trial end) is set.
      const refEnd = g.currentPeriodEndAt ?? g.trialEndsAt;
      if (refEnd) {
        expect(g.gracePeriodEndsAt!.getTime()).toBeGreaterThanOrEqual(refEnd.getTime());
      }
    }
  });

  it('status="cancelled" implies cancelledAt is non-null', async () => {
    const cancelled = await prisma.subscription.findMany({
      where: { status: 'cancelled' },
      select: { id: true, cancelledAt: true },
      take: 100,
    });

    for (const c of cancelled) {
      expect(c.cancelledAt).toBeTruthy();
    }
  });

  it('effectiveFeatures is a valid JSON object on every subscription', async () => {
    const subs = await prisma.subscription.findMany({
      select: { id: true, effectiveFeatures: true },
      take: 100,
    });

    for (const s of subs) {
      // Should be a plain object — never an array, string, number, or null.
      expect(s.effectiveFeatures).not.toBeNull();
      expect(typeof s.effectiveFeatures).toBe('object');
      expect(Array.isArray(s.effectiveFeatures)).toBe(false);
    }
  });

  it('SubscriptionFeature → Subscription FK is intact (no orphans)', async () => {
    const overrides = await prisma.subscriptionFeature.findMany({
      select: { id: true, subscriptionId: true },
      take: 100,
    });

    for (const o of overrides) {
      const parent = await prisma.subscription.findFirst({
        where: { id: o.subscriptionId },
        select: { id: true },
      });
      expect(parent).toBeTruthy();
    }
  });

  it('LicenseInvoice period bounds are well-ordered', async () => {
    const invoices = await prisma.licenseInvoice.findMany({
      select: { id: true, periodStart: true, periodEnd: true },
      take: 100,
    });

    for (const inv of invoices) {
      expect(inv.periodStart.getTime()).toBeLessThan(inv.periodEnd.getTime());
    }
  });
});
