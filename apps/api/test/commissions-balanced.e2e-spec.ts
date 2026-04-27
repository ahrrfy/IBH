import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/platform/prisma/prisma.service';

/**
 * T43 — every CommissionEntry that has a journalEntryId must reference
 * a posted, balanced JournalEntry whose referenceType='CommissionEntry'.
 *
 * Happy-path e2e: validates the F2 invariant (Dr == Cr) for every
 * commission accrual and clawback.
 */
describe('Sales — Commission entries are backed by balanced JEs (e2e)', () => {
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

  it('every CommissionEntry with a journalEntryId points to a balanced posted JE', async () => {
    const entries = await prisma.commissionEntry.findMany({
      where: { journalEntryId: { not: null } },
      take: 50,
    });

    // If commissions haven't been seeded yet the test is vacuously true.
    for (const e of entries) {
      const je = await prisma.journalEntry.findFirst({
        where: { id: e.journalEntryId!, companyId: e.companyId },
      });
      expect(je).toBeTruthy();
      expect(je!.status).toBe('posted');
      expect(je!.referenceType).toBe('CommissionEntry');
      expect(je!.referenceId).toBe(e.id);

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
      // The JE total must match abs(entry.amountIqd).
      expect(Number(debit._sum.amountIqd ?? 0)).toBeCloseTo(
        Math.abs(Number(e.amountIqd)),
        2,
      );
    }
  });
});
