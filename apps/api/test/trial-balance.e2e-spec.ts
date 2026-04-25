import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/platform/prisma/prisma.service';

/**
 * Trial Balance must always balance for posted entries (F2).
 * Sum of all debit-side amounts must equal sum of credit-side amounts
 * across every posted JournalEntryLine in a company. Hand-rolled
 * aggregation here so the test fails closed even if reporting code
 * has a bug.
 */
describe('Finance — Trial Balance balanced (e2e)', () => {
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

  it('sum(debit) === sum(credit) for posted entries', async () => {
    const company = await prisma.company.findFirst();
    if (!company) return; // skip when seed not run

    const debit = await prisma.journalEntryLine.aggregate({
      where: { side: 'debit',  journalEntry: { companyId: company.id, status: 'posted' } },
      _sum: { amountIqd: true },
    });
    const credit = await prisma.journalEntryLine.aggregate({
      where: { side: 'credit', journalEntry: { companyId: company.id, status: 'posted' } },
      _sum: { amountIqd: true },
    });

    const d = Number(debit._sum.amountIqd ?? 0);
    const c = Number(credit._sum.amountIqd ?? 0);
    expect(Math.abs(d - c)).toBeLessThan(0.01);
  });
});
