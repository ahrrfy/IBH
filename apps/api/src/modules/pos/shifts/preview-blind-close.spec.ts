import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ShiftsService } from './shifts.service';

/**
 * Service-level test for `previewBlindClose`. Validates the contract that
 * the cashier UI relies on:
 *   1. invalid denominations are rejected (defensive against tampered clients)
 *   2. closed shifts cannot be previewed
 *   3. unknown shifts return 404
 *   4. happy path returns variance + tolerance flags computed against
 *      DB-side expected cash flows (mocked here)
 */
describe('ShiftsService.previewBlindClose', () => {
  function makeService(opts: {
    shift?: any;
    cashReceipts?: number;
    cashRefunds?: number;
    cashIn?: number;
    cashOut?: number;
    tolerance?: number;
  }) {
    const prisma = {
      shift: {
        findFirst: jest.fn().mockResolvedValue(opts.shift ?? null),
      },
      pOSReceiptPayment: {
        aggregate: jest.fn().mockImplementation(({ where }: any) => {
          const status = where?.receipt?.status;
          if (status === 'completed') {
            return { _sum: { amountIqd: opts.cashReceipts ?? 0 } };
          }
          return { _sum: { amountIqd: opts.cashRefunds ?? 0 } };
        }),
      },
      cashMovement: {
        aggregate: jest.fn().mockImplementation(({ where }: any) => {
          if (where?.toAccountId) return { _sum: { amountIqd: opts.cashIn ?? 0 } };
          return { _sum: { amountIqd: opts.cashOut ?? 0 } };
        }),
      },
    } as any;
    const policy = {
      getNumber: jest.fn().mockResolvedValue(opts.tolerance ?? 5000),
    } as any;
    const audit = { log: jest.fn() } as any;
    const sequence = { next: jest.fn() } as any;
    const posting = { postTemplate: jest.fn() } as any;
    return new ShiftsService(prisma, audit, sequence, posting, policy);
  }

  const session = {
    userId: '01HCASHIER0000000000000000',
    companyId: '01HCOMPANY0000000000000000',
    branchId: '01HBRANCH00000000000000000',
    roleId: 'r',
    permissions: [],
  } as any;

  it('throws NotFound when shift does not exist', async () => {
    const svc = makeService({ shift: null });
    await expect(
      svc.previewBlindClose('missing', [{ denom: 1000, count: 1 }], session),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects preview when shift is not open', async () => {
    const svc = makeService({
      shift: {
        id: 's1',
        companyId: session.companyId,
        status: 'closed',
        openingCashIqd: 100000,
        device: { cashAccountId: 'a1' },
      },
    });
    await expect(
      svc.previewBlindClose('s1', [{ denom: 1000, count: 1 }], session),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects denominations not in the IQD whitelist', async () => {
    const svc = makeService({
      shift: {
        id: 's1',
        companyId: session.companyId,
        status: 'open',
        openingCashIqd: 0,
        device: { cashAccountId: 'a1' },
      },
    });
    // 7777 is not a real IQD note — defends against client tampering.
    await expect(
      svc.previewBlindClose('s1', [{ denom: 7777, count: 1 }], session),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects negative or non-integer counts', async () => {
    const svc = makeService({
      shift: {
        id: 's1',
        companyId: session.companyId,
        status: 'open',
        openingCashIqd: 0,
        device: { cashAccountId: 'a1' },
      },
    });
    await expect(
      svc.previewBlindClose('s1', [{ denom: 1000, count: -1 }], session),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      svc.previewBlindClose('s1', [{ denom: 1000, count: 1.5 }], session),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('happy path: returns expected/counted/variance + tolerance flags', async () => {
    const svc = makeService({
      shift: {
        id: 's1',
        shiftNumber: 'SHIFT-001',
        companyId: session.companyId,
        status: 'open',
        openingCashIqd: 100_000,
        device: { cashAccountId: 'a1' },
      },
      cashReceipts: 250_000,
      cashRefunds: 10_000,
      cashIn: 0,
      cashOut: 20_000,
      tolerance: 5_000,
    });
    // expected = 100k + 250k − 10k + 0 − 20k = 320k
    // counted  = 6×50k + 1×10k + 2×5k = 320k → exact match
    const r = await svc.previewBlindClose(
      's1',
      [
        { denom: 50000, count: 6 },
        { denom: 10000, count: 1 },
        { denom: 5000, count: 2 },
      ],
      session,
    );
    expect(r.shiftId).toBe('s1');
    expect(r.shiftNumber).toBe('SHIFT-001');
    expect(r.expectedCashIqd).toBe('320000');
    expect(r.countedCashIqd).toBe('320000');
    expect(r.varianceIqd).toBe('0');
    expect(r.isExact).toBe(true);
    expect(r.requiresManagerApproval).toBe(false);
    expect(r.toleranceIqd).toBe(5_000);
  });

  it('flags manager approval when variance exceeds tolerance', async () => {
    const svc = makeService({
      shift: {
        id: 's1',
        shiftNumber: 'SHIFT-002',
        companyId: session.companyId,
        status: 'open',
        openingCashIqd: 100_000,
        device: { cashAccountId: 'a1' },
      },
      cashReceipts: 250_000,
      cashRefunds: 0,
      cashIn: 0,
      cashOut: 0,
      tolerance: 5_000,
    });
    // expected = 350,000 ; counted = 6×50k = 300k → variance −50k (short)
    const r = await svc.previewBlindClose(
      's1',
      [{ denom: 50000, count: 6 }],
      session,
    );
    expect(r.varianceIqd).toBe('-50000');
    expect(r.isShort).toBe(true);
    expect(r.exceedsTolerance).toBe(true);
    expect(r.requiresManagerApproval).toBe(true);
  });
});
