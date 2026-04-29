import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/platform/prisma/prisma.service';

/**
 * COD Settlement invariants (S2.4 — Delivery module coverage).
 *
 * Verifies on existing data (no fixture creation):
 *   1. netDueIqd === totalCodCollectedIqd − totalCommissionIqd − totalShippingCostIqd
 *      (DB-level math invariant — Decimal(18,3) precision tolerance)
 *   2. Period uniqueness: (deliveryCompanyId, periodStart, periodEnd) unique
 *      (enforced by `cod_settlements_company_period_key` index)
 *   3. Posted/paid settlements have a postedJeId (no orphan postings)
 *   4. The linked JE balances (debit total = credit total)
 *   5. Cross-tenant safety: a delivery's companyId matches its settlement's companyId
 *
 * Trivially passes when no settlements exist yet (greenfield CI), but provides
 * a hard invariant gate the moment any settlement row appears.
 */
describe('Delivery — COD Settlement invariants (e2e)', () => {
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

  it('netDueIqd equals collected − commission − shippingCost on every settlement', async () => {
    const settlements = await prisma.codSettlement.findMany({
      select: {
        id: true,
        totalCodCollectedIqd: true,
        totalCommissionIqd: true,
        totalShippingCostIqd: true,
        netDueIqd: true,
      },
      take: 50,
    });

    for (const s of settlements) {
      const expectedNet =
        Number(s.totalCodCollectedIqd) -
        Number(s.totalCommissionIqd) -
        Number(s.totalShippingCostIqd);
      expect(Number(s.netDueIqd)).toBeCloseTo(expectedNet, 2);
    }
  });

  it('period uniqueness — (deliveryCompanyId, periodStart, periodEnd) is unique', async () => {
    // The unique index enforces this at the DB level. We assert the absence of
    // duplicates as a sanity check (would indicate index corruption or a CI
    // env that bypassed migrations).
    const all = await prisma.codSettlement.findMany({
      select: { deliveryCompanyId: true, periodStart: true, periodEnd: true },
      take: 200,
    });
    const seen = new Set<string>();
    for (const s of all) {
      const key = `${s.deliveryCompanyId}|${s.periodStart.toISOString()}|${s.periodEnd.toISOString()}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it('posted/paid settlements have postedJeId and the JE balances', async () => {
    const posted = await prisma.codSettlement.findMany({
      where: { status: { in: ['posted', 'paid'] } },
      select: { id: true, postedJeId: true, companyId: true },
      take: 20,
    });

    for (const s of posted) {
      expect(s.postedJeId).toBeTruthy();
      const je = await prisma.journalEntry.findFirst({
        where: { id: s.postedJeId!, companyId: s.companyId },
      });
      expect(je).toBeTruthy();
      expect(je!.status).toBe('posted');

      const debit = await prisma.journalEntryLine.aggregate({
        where: { journalEntryId: je!.id, side: 'debit' },
        _sum: { amountIqd: true },
      });
      const credit = await prisma.journalEntryLine.aggregate({
        where: { journalEntryId: je!.id, side: 'credit' },
        _sum: { amountIqd: true },
      });
      expect(Number(debit._sum.amountIqd ?? 0)).toBeCloseTo(
        Number(credit._sum.amountIqd ?? 0),
        2,
      );
    }
  });

  it('cross-tenant safety — delivery.companyId always matches its settlement.companyId', async () => {
    const deliveries = await prisma.deliveryOrder.findMany({
      where: { codSettlementId: { not: null } },
      select: { id: true, companyId: true, codSettlementId: true },
      take: 50,
    });

    for (const d of deliveries) {
      const s = await prisma.codSettlement.findFirst({
        where: { id: d.codSettlementId! },
        select: { companyId: true },
      });
      expect(s).toBeTruthy();
      expect(s!.companyId).toBe(d.companyId);
    }
  });
});
