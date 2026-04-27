import { Prisma } from '@prisma/client';
import { CommissionsService } from './commissions.service';

/**
 * Unit tests — T43 Sales Commissions.
 *
 * These tests focus on the two non-DB invariants the listener relies on:
 *   1. computeRate() returns the correct % for flat & tiered plans.
 *   2. The JE lines we send to the posting engine are ALWAYS balanced
 *      (Dr == Cr) for accruals, clawbacks, and adjustments — F2.
 *
 * The test reaches into the service via a mocked PostingService that
 * captures the lines passed to postJournalEntry and asserts balance.
 */
describe('CommissionsService', () => {
  describe('computeRate', () => {
    const svc = new CommissionsService(
      {} as any,
      {} as any,
      {} as any,
      { emit: () => true } as any,
    );

    it('returns flat pct for kind=flat', () => {
      const pct = svc.computeRate(
        { kind: 'flat', flatPct: new Prisma.Decimal('5'), rules: [] },
        new Prisma.Decimal('100000'),
      );
      expect(pct.toString()).toBe('5');
    });

    it('returns the matching tier for kind=tiered', () => {
      const plan = {
        kind: 'tiered',
        flatPct: new Prisma.Decimal(0),
        rules: [
          {
            fromAmount: new Prisma.Decimal(0),
            toAmount: new Prisma.Decimal('1000000'),
            pct: new Prisma.Decimal('2'),
          },
          {
            fromAmount: new Prisma.Decimal('1000000'),
            toAmount: new Prisma.Decimal('5000000'),
            pct: new Prisma.Decimal('4'),
          },
          {
            fromAmount: new Prisma.Decimal('5000000'),
            toAmount: null,
            pct: new Prisma.Decimal('6'),
          },
        ],
      };
      expect(svc.computeRate(plan, new Prisma.Decimal('500000')).toString()).toBe('2');
      expect(svc.computeRate(plan, new Prisma.Decimal('2000000')).toString()).toBe('4');
      expect(svc.computeRate(plan, new Prisma.Decimal('9999999')).toString()).toBe('6');
    });
  });

  describe('recordEntry — balanced double-entry (F2)', () => {
    it('produces a balanced JE for an accrual', async () => {
      const captured: Array<{
        accountCode: string;
        debit?: Prisma.Decimal | number;
        credit?: Prisma.Decimal | number;
      }> = [];

      const fakePrisma: any = {
        $transaction: async (cb: any) =>
          cb({
            commissionEntry: {
              create: async ({ data }: any) => ({ id: 'CE1', ...data }),
              update: async () => ({}),
              findUniqueOrThrow: async () => ({
                id: 'CE1',
                amountIqd: new Prisma.Decimal('5000'),
                journalEntryId: 'JE1',
              }),
            },
          }),
      };
      const fakeAudit: any = { log: async () => undefined };
      const fakePosting: any = {
        postJournalEntry: async (params: any) => {
          for (const l of params.lines) captured.push(l);
          return { id: 'JE1', entryNumber: 'JE-1' };
        },
      };
      const fakeEvents: any = { emit: () => true };

      const svc = new CommissionsService(
        fakePrisma,
        fakeAudit,
        fakePosting,
        fakeEvents,
      );

      await svc.recordEntry(
        {
          companyId: 'CO1',
          branchId: 'BR1',
          planId: 'P1',
          employeeId: 'EMP1',
          promoterName: null,
          kind: 'accrual',
          refType: 'SalesInvoice',
          refId: 'INV1',
          baseAmountIqd: new Prisma.Decimal('100000'),
          pctApplied: new Prisma.Decimal('5'),
          amountIqd: new Prisma.Decimal('5000'),
          notes: null,
          createdBy: 'U1',
        },
        'U1',
      );

      const debit = captured
        .reduce(
          (a, l) => a.plus(new Prisma.Decimal(l.debit ?? 0)),
          new Prisma.Decimal(0),
        )
        .toNumber();
      const credit = captured
        .reduce(
          (a, l) => a.plus(new Prisma.Decimal(l.credit ?? 0)),
          new Prisma.Decimal(0),
        )
        .toNumber();

      expect(captured.length).toBe(2);
      expect(debit).toBe(5000);
      expect(credit).toBe(5000);
      // accrual → Dr Expense (6611), Cr Payable (4321)
      const drCode = captured.find((l) => l.debit)!.accountCode;
      const crCode = captured.find((l) => l.credit)!.accountCode;
      expect(drCode).toBe('6611');
      expect(crCode).toBe('4321');
    });

    it('flips sides for a clawback (negative amount)', async () => {
      const captured: Array<{
        accountCode: string;
        debit?: Prisma.Decimal | number;
        credit?: Prisma.Decimal | number;
      }> = [];

      const fakePrisma: any = {
        $transaction: async (cb: any) =>
          cb({
            commissionEntry: {
              create: async ({ data }: any) => ({ id: 'CE2', ...data }),
              update: async () => ({}),
              findUniqueOrThrow: async () => ({ id: 'CE2', journalEntryId: 'JE2' }),
            },
          }),
      };
      const fakePosting: any = {
        postJournalEntry: async (params: any) => {
          for (const l of params.lines) captured.push(l);
          return { id: 'JE2', entryNumber: 'JE-2' };
        },
      };
      const svc = new CommissionsService(
        fakePrisma,
        { log: async () => undefined } as any,
        fakePosting,
        { emit: () => true } as any,
      );

      await svc.recordEntry(
        {
          companyId: 'CO1',
          branchId: 'BR1',
          planId: 'P1',
          employeeId: 'EMP1',
          promoterName: null,
          kind: 'clawback',
          refType: 'SalesReturn',
          refId: 'RET1',
          baseAmountIqd: new Prisma.Decimal('-50000'),
          pctApplied: new Prisma.Decimal('5'),
          amountIqd: new Prisma.Decimal('-2500'),
          notes: null,
          createdBy: 'U1',
        },
        'U1',
      );

      // For a clawback we Dr Payable, Cr Expense — sides flipped.
      const drLine = captured.find((l) => l.debit)!;
      const crLine = captured.find((l) => l.credit)!;
      expect(drLine.accountCode).toBe('4321');
      expect(crLine.accountCode).toBe('6611');
      expect(new Prisma.Decimal(drLine.debit ?? 0).toString()).toBe('2500');
      expect(new Prisma.Decimal(crLine.credit ?? 0).toString()).toBe('2500');
    });
  });
});
