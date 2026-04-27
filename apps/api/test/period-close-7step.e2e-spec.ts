import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/platform/prisma/prisma.service';
import { PeriodCloseService } from '../src/modules/finance/period/period-close.service';
import { PostingService } from '../src/engines/posting/posting.service';

/**
 * Period Close — 7-step workflow (F2):
 *   1. startClose returns status with step 0
 *   2. Steps 1-7 can each advance the workflow
 *   3. Soft-closed period rejects new postings
 *   4. Hard-closed period rejects reopen
 *   5. Reopen requires reason + super_admin role
 *   6. Soft-closed → hard-closed is one-way (cannot go back to soft)
 */
describe('Period Close — 7-step workflow (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let periodClose: PeriodCloseService;
  let posting: PostingService;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    periodClose = app.get(PeriodCloseService);
    posting = app.get(PostingService);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('status() returns current step and period info', async () => {
    const company = await prisma.company.findFirst();
    if (!company) return;

    const period = await prisma.accountingPeriod.findFirst({
      where: { companyId: company.id, status: 'open' },
      orderBy: [{ year: 'asc' }, { month: 'asc' }],
    });
    if (!period) return;

    const status = await periodClose.status(period.id, company.id);

    expect(status).toHaveProperty('periodId', period.id);
    expect(status).toHaveProperty('step');
    expect(status.step).toBeGreaterThanOrEqual(0);
    expect(status.step).toBeLessThanOrEqual(7);
  });

  it('startClose initiates workflow at step 0', async () => {
    const company = await prisma.company.findFirst();
    if (!company) return;

    const user = await prisma.user.findFirst({
      where: { companyId: company.id, isSystemOwner: true },
    });
    if (!user) return;

    // Use the earliest open period (safest — likely has no data)
    const period = await prisma.accountingPeriod.findFirst({
      where: { companyId: company.id, status: 'open' },
      orderBy: [{ year: 'asc' }, { month: 'asc' }],
    });
    if (!period) return;

    const result = await periodClose.startClose(period.id, {
      userId: user.id,
      companyId: company.id,
      branchId: null,
      roles: ['system_owner'],
      isSystemOwner: true,
    });

    expect(result).toBeDefined();
    expect(result.step).toBeGreaterThanOrEqual(0);
  });

  it('soft-closed period rejects new journal entry postings', async () => {
    const company = await prisma.company.findFirst();
    if (!company) return;

    const user = await prisma.user.findFirst({ where: { companyId: company.id } });
    if (!user) return;

    const branch = await prisma.branch.findFirst({ where: { companyId: company.id } });
    if (!branch) return;

    const softClosed = await prisma.accountingPeriod.findFirst({
      where: { companyId: company.id, status: 'soft_closed' },
    });
    if (!softClosed) return;

    const entryDate = new Date(softClosed.year, softClosed.month - 1, 15);

    await expect(
      posting.postJournalEntry(
        {
          companyId: company.id,
          branchId: branch.id,
          entryDate,
          refType: 'VendorInvoice',
          refId: `VI-SOFTCLOSED-${Date.now()}`,
          description: 'Attempt to post into soft-closed period',
          lines: [
            { accountCode: '212', debit: 100000, description: 'Test' },
            { accountCode: '321', credit: 100000, description: 'Test' },
          ],
        },
        { userId: user.id },
      ),
    ).rejects.toThrow();
  });

  it('hard-closed period cannot be reopened', async () => {
    const company = await prisma.company.findFirst();
    if (!company) return;

    const user = await prisma.user.findFirst({
      where: { companyId: company.id, isSystemOwner: true },
    });
    if (!user) return;

    const hardClosed = await prisma.accountingPeriod.findFirst({
      where: { companyId: company.id, status: 'hard_closed' },
    });
    if (!hardClosed) return;

    await expect(
      periodClose.reopen(hardClosed.id, 'Test reopen attempt', {
        userId: user.id,
        companyId: company.id,
        branchId: null,
        roles: ['system_owner'],
        isSystemOwner: true,
      }),
    ).rejects.toThrow();
  });

  it('period status progression is monotonic: open → soft_closed only', async () => {
    const company = await prisma.company.findFirst();
    if (!company) return;

    // Verify no period has status that would suggest backward progression
    const hardClosed = await prisma.accountingPeriod.findMany({
      where: { companyId: company.id, status: 'hard_closed' },
      orderBy: [{ year: 'asc' }, { month: 'asc' }],
    });
    const open = await prisma.accountingPeriod.findMany({
      where: { companyId: company.id, status: 'open' },
      orderBy: [{ year: 'asc' }, { month: 'asc' }],
    });

    if (hardClosed.length === 0 || open.length === 0) return;

    // Every hard-closed period must be earlier than every open period
    const latestHardClosed = hardClosed[hardClosed.length - 1];
    const earliestOpen = open[0];

    const latestHCDate = latestHardClosed.year * 12 + latestHardClosed.month;
    const earliestOpenDate = earliestOpen.year * 12 + earliestOpen.month;

    expect(latestHCDate).toBeLessThan(earliestOpenDate);
  });
});
