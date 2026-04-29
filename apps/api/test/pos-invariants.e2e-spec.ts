import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/platform/prisma/prisma.service';

/**
 * POS module invariants (S2.5 — expand existing pos-idempotency.e2e-spec).
 *
 * Verifies on existing data (no fixture creation):
 *   1. POSReceipt: subtotalIqd − discountIqd + taxIqd === totalIqd
 *      (within 0.01 IQD tolerance for Decimal rounding)
 *   2. POSReceipt: sum(line.lineTotalIqd) === subtotalIqd
 *   3. POSReceipt: sum(payment.amountIqd) ≥ totalIqd − changeGivenIqd
 *      (cash receipts may overpay → triggers changeGivenIqd)
 *   4. POSReceiptLine: lineTotalIqd === qty × unitPriceIqd − discountIqd
 *   5. Shift: closedAt is after openedAt when set
 *   6. Shift: cashDifferenceIqd === closingCashIqd − expectedCashIqd
 *   7. Shift: only ONE 'open' shift per posDeviceId (concurrency safety)
 *   8. Voided receipts have voidedAt + voidReason populated
 */
describe('POS — Receipt + Shift invariants (e2e)', () => {
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

  it('POSReceipt: subtotal − discount + tax = total (within 0.01 IQD)', async () => {
    const receipts = await prisma.pOSReceipt.findMany({
      select: {
        id: true,
        subtotalIqd: true,
        discountIqd: true,
        taxIqd: true,
        totalIqd: true,
      },
      take: 50,
    });

    for (const r of receipts) {
      const expectedTotal =
        Number(r.subtotalIqd) - Number(r.discountIqd) + Number(r.taxIqd);
      expect(Number(r.totalIqd)).toBeCloseTo(expectedTotal, 2);
    }
  });

  it('POSReceipt: sum(line.lineTotalIqd) equals subtotalIqd', async () => {
    const receipts = await prisma.pOSReceipt.findMany({
      select: { id: true, subtotalIqd: true },
      take: 30,
    });

    for (const r of receipts) {
      const linesSum = await prisma.pOSReceiptLine.aggregate({
        where: { receiptId: r.id },
        _sum: { lineTotalIqd: true },
      });
      expect(Number(linesSum._sum.lineTotalIqd ?? 0)).toBeCloseTo(
        Number(r.subtotalIqd),
        2,
      );
    }
  });

  it('POSReceipt: sum(payment.amountIqd) ≥ total − changeGiven (overpay → change)', async () => {
    const receipts = await prisma.pOSReceipt.findMany({
      where: { status: 'completed' },
      select: { id: true, totalIqd: true, changeGivenIqd: true },
      take: 30,
    });

    for (const r of receipts) {
      const paid = await prisma.pOSReceiptPayment.aggregate({
        where: { receiptId: r.id },
        _sum: { amountIqd: true },
      });
      const paidAmount = Number(paid._sum.amountIqd ?? 0);
      const minRequired = Number(r.totalIqd) - Number(r.changeGivenIqd);
      // Allow 0.01 IQD tolerance for Decimal rounding
      expect(paidAmount + 0.01).toBeGreaterThanOrEqual(minRequired);
    }
  });

  it('POSReceiptLine: lineTotalIqd = qty × unitPrice − discount', async () => {
    const lines = await prisma.pOSReceiptLine.findMany({
      select: {
        id: true,
        qty: true,
        unitPriceIqd: true,
        discountIqd: true,
        lineTotalIqd: true,
      },
      take: 100,
    });

    for (const l of lines) {
      const expected =
        Number(l.qty) * Number(l.unitPriceIqd) - Number(l.discountIqd);
      expect(Number(l.lineTotalIqd)).toBeCloseTo(expected, 2);
    }
  });

  it('Shift: closedAt is after openedAt when set', async () => {
    const closed = await prisma.shift.findMany({
      where: { status: 'closed' },
      select: { id: true, openedAt: true, closedAt: true },
      take: 50,
    });

    for (const s of closed) {
      expect(s.closedAt).toBeTruthy();
      expect(s.closedAt!.getTime()).toBeGreaterThan(s.openedAt.getTime());
    }
  });

  it('Shift: cashDifferenceIqd = closingCashIqd − expectedCashIqd', async () => {
    const closed = await prisma.shift.findMany({
      where: {
        AND: [
          { closingCashIqd: { not: null } },
          { expectedCashIqd: { not: null } },
          { cashDifferenceIqd: { not: null } },
        ],
      },
      select: {
        id: true,
        closingCashIqd: true,
        expectedCashIqd: true,
        cashDifferenceIqd: true,
      },
      take: 50,
    });

    for (const s of closed) {
      const expected = Number(s.closingCashIqd) - Number(s.expectedCashIqd);
      expect(Number(s.cashDifferenceIqd)).toBeCloseTo(expected, 2);
    }
  });

  it('Shift: at most ONE open shift per posDeviceId', async () => {
    const open = await prisma.shift.findMany({
      where: { status: 'open' },
      select: { posDeviceId: true },
      take: 200,
    });
    const seen = new Set<string>();
    for (const s of open) {
      // If two open shifts on same device → would fail concurrency safety
      const found = seen.has(s.posDeviceId);
      if (found) {
        throw new Error(`Two open shifts found on device ${s.posDeviceId} — concurrency violation`);
      }
      seen.add(s.posDeviceId);
    }
  });

  it('Voided receipts have voidedAt and voidReason populated', async () => {
    const voided = await prisma.pOSReceipt.findMany({
      where: { status: 'voided' },
      select: { id: true, voidedAt: true, voidReason: true },
      take: 50,
    });

    for (const v of voided) {
      expect(v.voidedAt).toBeTruthy();
      expect(v.voidReason).toBeTruthy();
    }
  });
});
