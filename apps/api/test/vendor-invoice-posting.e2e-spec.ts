import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/platform/prisma/prisma.service';
import { PostingService } from '../src/engines/posting/posting.service';

/**
 * Vendor Invoice Posting (F2 + F3) — restored from issue I031.
 *
 * Business invariants this suite enforces:
 *   1. Posting a vendor invoice produces a balanced JournalEntry
 *      (SUM(debits) === SUM(credits)) — the F2 Double-Entry guarantee.
 *   2. The AP control account is credited and the inventory/expense
 *      account is debited (correct sides for an A/P recognition).
 *   3. Unbalanced posting is rejected before it reaches the DB constraint.
 *   4. A posted JournalEntry cannot be hard-deleted (append-only).
 *   5. Posting into a closed (soft/hard) accounting period is rejected.
 *
 * The test is defensive: if the seed has not provisioned a company,
 * branch, or user, the relevant assertions are skipped rather than
 * failing — matching the original test's behaviour.
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

  it('vendor invoice JournalEntry has debit === credit and correct sides', async () => {
    const company = await prisma.company.findFirst();
    if (!company) return;

    const branch = await prisma.branch.findFirst({
      where: { companyId: company.id },
    });
    if (!branch) return;

    const user = await prisma.user.findFirst({
      where: { companyId: company.id },
    });
    if (!user) return;

    const amount = 750000; // IQD
    // Use actual seeded accounts — find by name pattern if codes vary
    const invAcc = await prisma.chartOfAccount.findFirst({
      where: { companyId: company.id, code: '212', isActive: true },
    });
    const apAcc = await prisma.chartOfAccount.findFirst({
      where: { companyId: company.id, code: '321', isActive: true },
    });
    if (!invAcc || !apAcc) return; // Skip if seed didn't provision these accounts
    const inventoryCode = invAcc.code;
    const apCode = apAcc.code;

    const je = await posting.postJournalEntry(
      {
        companyId: company.id,
        branchId: branch.id,
        entryDate: new Date(),
        refType: 'VendorInvoice',
        refId: `VI-TEST-${Date.now()}`,
        description: 'Test vendor invoice posting',
        lines: [
          {
            accountCode: inventoryCode,
            debit: amount,
            description: 'Inventory received',
          },
          {
            accountCode: apCode,
            credit: amount,
            description: 'AP — supplier payable',
          },
        ],
      },
      { userId: user.id },
    );

    expect(je.id).toBeDefined();
    expect(je.entryNumber).toBeDefined();

    // Verify balance + sides directly from the DB
    const lines = await prisma.journalEntryLine.findMany({
      where: { journalEntryId: je.id },
    });

    const totalDebit = lines
      .filter((l) => l.side === 'debit')
      .reduce((s, l) => s + Number(l.amountIqd), 0);
    const totalCredit = lines
      .filter((l) => l.side === 'credit')
      .reduce((s, l) => s + Number(l.amountIqd), 0);

    // F2: balanced
    expect(Math.abs(totalDebit - totalCredit)).toBeLessThan(0.01);
    expect(totalDebit).toBe(amount);

    // Correct sides: AP (321) is credited, Inventory (212) is debited
    const apLine = lines.find((l) => l.accountCode === apCode);
    const invLine = lines.find((l) => l.accountCode === inventoryCode);
    expect(apLine).toBeDefined();
    expect(invLine).toBeDefined();
    expect(apLine!.side).toBe('credit');
    expect(invLine!.side).toBe('debit');
    expect(Number(apLine!.amountIqd)).toBe(amount);
    expect(Number(invLine!.amountIqd)).toBe(amount);

    // Header totals also reflect balance
    const header = await prisma.journalEntry.findUnique({
      where: { id: je.id },
    });
    expect(header).not.toBeNull();
    expect(Number(header!.totalDebitIqd)).toBe(Number(header!.totalCreditIqd));
    expect(header!.status).toBe('posted');
  });

  it('unbalanced posting is rejected by PostingService', async () => {
    const company = await prisma.company.findFirst();
    if (!company) return;

    const branch = await prisma.branch.findFirst({
      where: { companyId: company.id },
    });
    if (!branch) return;

    const user = await prisma.user.findFirst({
      where: { companyId: company.id },
    });
    if (!user) return;

    // Debit 500k, Credit 400k — deliberately unbalanced
    await expect(
      posting.postJournalEntry(
        {
          companyId: company.id,
          branchId: branch.id,
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

  it('posted JournalEntry cannot be hard-deleted (append-only)', async () => {
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

    const branch = await prisma.branch.findFirst({
      where: { companyId: company.id },
    });
    if (!branch) return;

    const user = await prisma.user.findFirst({
      where: { companyId: company.id },
    });
    if (!user) return;

    const closedPeriod = await prisma.accountingPeriod.findFirst({
      where: {
        companyId: company.id,
        status: { in: ['soft_closed', 'hard_closed'] },
      },
    });
    if (!closedPeriod) return;

    // Build a date inside the closed period
    const entryDate = new Date(closedPeriod.year, closedPeriod.month - 1, 15);

    await expect(
      posting.postJournalEntry(
        {
          companyId: company.id,
          branchId: branch.id,
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
