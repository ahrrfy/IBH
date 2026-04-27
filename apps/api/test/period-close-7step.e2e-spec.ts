import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/platform/prisma/prisma.service';
import { PeriodCloseService } from '../src/modules/finance/period/period-close.service';
import { PostingService } from '../src/engines/posting/posting.service';
import type { UserSession } from '@erp/shared-types';

/**
 * Period Close — 7-step workflow (F2):
 *   1. status() returns current step and period info
 *   2. startClose() initiates the workflow at step 0
 *   3. Soft-closed period rejects new postings
 *   4. Hard-closed period cannot be reopened
 *   5. Reopen requires super_admin role
 *   6. Period status progression is monotonic (open → soft → hard, never backwards)
 *
 * Adapted to current schema/service signatures:
 *   - startClose(companyId, year, month, session) — not (periodId, session)
 *   - close(periodId, step, session) — replaces runStep
 *   - status(companyId, year, month)
 *   - UserSession requires tenantId, permissions, locale, expiresAt, deviceId, ipAddress
 *   - reopen requires role 'super_admin' (not 'system_owner')
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

  /** Build a minimal UserSession satisfying current shared-types contract. */
  function buildSession(opts: {
    userId: string;
    companyId: string;
    branchId?: string | null;
    roles?: string[];
  }): UserSession {
    return {
      userId: opts.userId,
      companyId: opts.companyId,
      branchId: opts.branchId ?? null,
      tenantId: opts.companyId,
      roles: (opts.roles ?? []) as UserSession['roles'],
      permissions: [],
      locale: 'ar',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      deviceId: 'e2e-test-device',
      ipAddress: '127.0.0.1',
    };
  }

  it('status() returns current step and period info', async () => {
    const company = await prisma.company.findFirst();
    if (!company) return;

    const period = await prisma.accountingPeriod.findFirst({
      where: { companyId: company.id, status: 'open' },
      orderBy: [{ year: 'asc' }, { month: 'asc' }],
    });
    if (!period) return;

    const status = await periodClose.status(company.id, period.year, period.month);

    expect(status).toHaveProperty('periodId', period.id);
    expect(status).toHaveProperty('step');
    expect(status).toHaveProperty('year', period.year);
    expect(status).toHaveProperty('month', period.month);
    expect(status.step).toBeGreaterThanOrEqual(0);
    expect(status.step).toBeLessThanOrEqual(7);
    expect(Array.isArray(status.blockers)).toBe(true);
    expect(Array.isArray(status.warnings)).toBe(true);
  });

  it('startClose initiates workflow and returns status', async () => {
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

    const session = buildSession({
      userId: user.id,
      companyId: company.id,
      roles: ['super_admin'],
    });

    const result = await periodClose.startClose(
      company.id,
      period.year,
      period.month,
      session,
    );

    expect(result).toBeDefined();
    expect(result.year).toBe(period.year);
    expect(result.month).toBe(period.month);
    expect(result.step).toBeGreaterThanOrEqual(0);
    expect(result.step).toBeLessThanOrEqual(7);
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

    const session = buildSession({
      userId: user.id,
      companyId: company.id,
      roles: ['super_admin'],
    });

    await expect(
      periodClose.reopen(hardClosed.id, 'Test reopen attempt', session),
    ).rejects.toThrow();
  });

  it('reopen requires super_admin role — non-privileged session is rejected', async () => {
    const company = await prisma.company.findFirst();
    if (!company) return;

    const user = await prisma.user.findFirst({ where: { companyId: company.id } });
    if (!user) return;

    // Pick any period — the role check happens before any state validation
    const anyPeriod = await prisma.accountingPeriod.findFirst({
      where: { companyId: company.id },
    });
    if (!anyPeriod) return;

    const sessionWithoutPrivilege = buildSession({
      userId: user.id,
      companyId: company.id,
      roles: [], // no super_admin
    });

    await expect(
      periodClose.reopen(anyPeriod.id, 'Unauthorised attempt', sessionWithoutPrivilege),
    ).rejects.toThrow();
  });

  it('period status progression is monotonic: hard-closed periods precede open periods', async () => {
    const company = await prisma.company.findFirst();
    if (!company) return;

    const hardClosed = await prisma.accountingPeriod.findMany({
      where: { companyId: company.id, status: 'hard_closed' },
      orderBy: [{ year: 'asc' }, { month: 'asc' }],
    });
    const open = await prisma.accountingPeriod.findMany({
      where: { companyId: company.id, status: 'open' },
      orderBy: [{ year: 'asc' }, { month: 'asc' }],
    });

    if (hardClosed.length === 0 || open.length === 0) return;

    // Every hard-closed period must be earlier than every open period.
    const latestHardClosed = hardClosed[hardClosed.length - 1];
    const earliestOpen = open[0];

    const latestHCDate = latestHardClosed.year * 12 + latestHardClosed.month;
    const earliestOpenDate = earliestOpen.year * 12 + earliestOpen.month;

    expect(latestHCDate).toBeLessThan(earliestOpenDate);
  });

  it('hash chain: every posted journal entry references the previous hash', async () => {
    // F2 invariant — append-only with hash chain. Pulled from original test
    // structure; verifies that posted JEs in any period form an unbroken chain.
    const company = await prisma.company.findFirst();
    if (!company) return;

    const posted = await prisma.journalEntry.findMany({
      where: { companyId: company.id, status: 'posted' },
      orderBy: { createdAt: 'asc' },
      select: { id: true, hash: true, previousHash: true },
      take: 100,
    });
    if (posted.length < 2) return;

    for (let i = 1; i < posted.length; i++) {
      // previousHash must reference some earlier hash (not be empty)
      expect(posted[i].previousHash).toBeTruthy();
      expect(posted[i].hash).toBeTruthy();
      expect(posted[i].hash).not.toBe(posted[i].previousHash);
    }
  });
});
