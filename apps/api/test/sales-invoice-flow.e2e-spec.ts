import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/platform/prisma/prisma.service';

/**
 * Sales invoice posting must produce a balanced JE that links back
 * to the invoice via referenceType='SalesInvoice' / referenceId.
 * For every posted SalesInvoice we expect exactly one posted JE.
 */
describe('Sales — Invoice ↔ Journal Entry link (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('every posted SalesInvoice has a posted JE referencing it', async () => {
    prisma = app.get(PrismaService);
    const invoices = await prisma.salesInvoice.findMany({
      where: { status: { in: ['posted', 'paid', 'partially_paid'] } },
      select: { id: true, journalEntryId: true, companyId: true },
      take: 20,
    });

    for (const inv of invoices) {
      expect(inv.journalEntryId).toBeTruthy();
      const je = await prisma.journalEntry.findFirst({
        where: { id: inv.journalEntryId!, companyId: inv.companyId },
      });
      expect(je).toBeTruthy();
      expect(je!.status).toBe('posted');
      expect(je!.referenceType).toBe('SalesInvoice');
      expect(je!.referenceId).toBe(inv.id);

      // And the JE itself balances
      const debit = await prisma.journalEntryLine.aggregate({
        where: { journalEntryId: je!.id, side: 'debit' },
        _sum: { amountIqd: true },
      });
      const credit = await prisma.journalEntryLine.aggregate({
        where: { journalEntryId: je!.id, side: 'credit' },
        _sum: { amountIqd: true },
      });
      expect(Number(debit._sum.amountIqd ?? 0))
        .toBeCloseTo(Number(credit._sum.amountIqd ?? 0), 2);
    }
  });
});
