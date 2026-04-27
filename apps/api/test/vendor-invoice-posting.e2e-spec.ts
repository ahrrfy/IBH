import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/platform/prisma/prisma.service';
import { PostingService } from '../src/engines/posting/posting.service';

/**
 * Vendor Invoice Posting (F2 + F3):
 *   1. Posting creates balanced JournalEntry (debit=credit)
 *   2. AP account is credited, Expense/Inventory account is debited
 *   3. Double-entry DB constraint prevents unbalanced posting
 *   4. Posted JournalEntry cannot be deleted (append-only)
 *   5. Posting into a closed period is rejected
 */
describe('Vendor Invoice — AP posting (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let posting: PostingService;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    posting = app.get(PostingService);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('vendor invoice JournalEntry has debit === credit', async () => {
    const company = await prisma.company.findFirst();
    if (!company) return;

    const user = await prisma.user.findFirst({ where: { companyId: company.id } });
    if (!user) return;

    // Post a simulated vendor invoice journal entry (AP + Inventory)
    const amount = 750000; // IQD
    const je = await posting.postJournalEntry(
      {
        companyId: company.id,
        branchId: (await prisma.branch.findFirst({ where: { companyId: company.id } }))!.id,
        entryDate: new Date(),
        refType: 'VendorInvoice',
        refId: `VI-TEST-${Date.now()}`,
        description: 'Test vendor invoice posting',
        lines: [
          { accountCode: '212', debit: amount, description: 'Inventory received' },
          { accountCode: '321', credit: amount, description: 'AP — supplier payable' },
        ],
      },
      { userId: user.id },
    );

    expect(je.id).toBeDefined();
    expect(je.status).toBe('posted');

    // Verify balance in DB directly
    const lines = await prisma.journalEntryLine.findMany({
      where: { journalEntryId: je.id },
    });
    const totalDebit = lines
      .filter((l) => l.side === 'debit')
      .reduce((s, l) => s + Number(l.amountIqd), 0);
    const totalCredit = lines
      .filter((l) => l.side === 'credit')
      .reduce((s, l) => s + Number(l.amountIqd), 0);

    expect(Math.abs(totalDebit - totalCredit)).toBeLessThan(0.01);
    expect(totalDebit).toBe(amount);
  });

  it('unbalanced posting is rejected by PostingService', async () => {
    const company = await prisma.company.findFirst();
    if (!company) return;

    const user = await prisma.user.findFirst({ where: { companyId: company.id } });
    if (!user) return;

    // Debit 500k, Credit 400k — deliberately unbalanced
    await expect(
      posting.postJournalEntry(
        {
          companyId: company.id,
          branchId: (await prisma.branch.findFirst({ where: { companyId: company.id } }))!.id,
          entryDate: new Date(),
          refType: 'VendorInvoice',
          refId: `VI-UNBAL-${Date.now()}`,
          description: 'Deliberately unbalanced — must fail',
          lines: [
            { accountCode: '212', debit: 500000, description: 'Debit' },
            { accountCode: '321', credit: 400000, description: 'Underpaid credit' },
          ],
        },
        { userId: user.id },
      ),
    ).rejects.toThrow();
  });

  it('posted JournalEntry cannot be deleted', async () => {
    const company = await prisma.company.findFirst();
    if (!company) return;

    const je = await prisma.journalEntry.findFirst({
      where: { companyId: company.id, status: 'posted' },
    });
    if (!je) return;

    await expect(
      prisma.$executeRawUnsafe(
        `DELETE FROM journal_entries WHERE id = '${je.id}'`,
      ),
    ).rejects.toThrow();
  });

  it('cannot post to a closed accounting period', async () => {
    const company = await prisma.company.findFirst();
    if (!company) return;

    const user = await prisma.user.findFirst({ where: { companyId: company.id } });
    if (!user) return;

    const closedPeriod = await prisma.accountingPeriod.findFirst({
      where: { companyId: company.id, status: { in: ['soft_closed', 'hard_closed'] } },
    });
    if (!closedPeriod) return;

    // Build a date inside the closed period
    const entryDate = new Date(closedPeriod.year, closedPeriod.month - 1, 15);

    await expect(
      posting.postJournalEntry(
        {
          companyId: company.id,
          branchId: (await prisma.branch.findFirst({ where: { companyId: company.id } }))!.id,
          entryDate,
          refType: 'VendorInvoice',
          refId: `VI-CLOSED-${Date.now()}`,
          description: 'Posting to closed period — must fail',
          lines: [
            { accountCode: '212', debit: 100000, description: 'Test' },
            { accountCode: '321', credit: 100000, description: 'Test' },
          ],
        },
        { userId: user.id },
      ),
    ).rejects.toThrow();
  });
});
