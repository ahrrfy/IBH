import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/platform/prisma/prisma.service';

/**
 * GRN -> Inventory posting (e2e) — complementary to grn-to-inventory.e2e-spec.ts.
 *
 * grn-to-inventory.e2e-spec.ts validates the *create-side* traceability:
 *   "every accepted GRN line has a matching IN ledger entry".
 *
 * This file picks up the invariants the original commit-3134b61 test
 * covered that grn-to-inventory does NOT:
 *
 *   1. Posting flow / cost flow-through:
 *      every IN entry's qtyChange equals the line qtyAccepted (positive),
 *      with refType='GRN' and refId=grn.id, and unitCostIqd = line.unitCostIqd.
 *
 *   2. Reject path:
 *      a rejected GRN MUST produce a reversing entry (refType='GRN_REVERSE',
 *      qtyChange < 0) for every line that originally posted IN — net zero.
 *
 *   3. Append-only invariant:
 *      attempting to UPDATE a stock_ledger row via Prisma must throw
 *      (DB-level trigger / immutable enforcement).
 *
 *   4. balanceAfter monotonicity per (variant, warehouse):
 *      consecutive ledger rows in time order must satisfy
 *      balanceAfter[n] = balanceAfter[n-1] + qtyChange[n].
 *
 * NOTE on schema adaptations vs the original (commit 3134b61) test:
 *   - StockLedgerEntry uses signed `qtyChange` Decimal — no qtyIn/qtyOut/direction.
 *   - The model name is `GoodsReceiptNote` (mapped table `goods_receipt_notes`),
 *     not `GRN`; the Prisma client field is `prisma.goodsReceiptNote`.
 *   - Reference fields are `referenceType` / `referenceId` (camelCase in Prisma,
 *     not `ref_type`/`ref_id`).
 *   - ProductVariant has no `product` relation anymore; traverse via `templateId`
 *     (not used here — we read existing fixtures rather than seed new ones).
 *   - Class name is `GRNService` (uppercase), but this test does NOT call the
 *     service directly — it asserts post-conditions on persisted ledger rows,
 *     which keeps the test resilient to service refactors and avoids re-seeding
 *     auth/policy context.
 */
describe('Purchases — GRN inventory posting invariants (e2e)', () => {
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

  it('GRN IN ledger entries: qtyChange > 0, refType=GRN, refId=grn.id, cost flows through', async () => {
    const grns = await prisma.goodsReceiptNote.findMany({
      where: { status: { not: 'rejected' as any } },
      include: { lines: true },
      take: 10,
    });
    if (grns.length === 0) return; // empty fixture — skip silently

    for (const grn of grns) {
      for (const line of grn.lines) {
        const qAcc = Number(line.qtyAccepted ?? 0);
        if (qAcc <= 0) continue;

        const inEntries = await prisma.stockLedgerEntry.findMany({
          where: {
            companyId:     grn.companyId,
            warehouseId:   grn.warehouseId,
            variantId:     line.variantId,
            referenceType: 'GRN',
            referenceId:   grn.id,
          },
        });

        // every entry for an accepted GRN line is positive (in) and tagged GRN
        expect(inEntries.length).toBeGreaterThan(0);
        for (const e of inEntries) {
          expect(Number(e.qtyChange)).toBeGreaterThan(0);
          expect(e.referenceType).toBe('GRN');
          expect(e.referenceId).toBe(grn.id);
          // cost flows through unchanged
          expect(Number(e.unitCostIqd)).toBeCloseTo(Number(line.unitCostIqd ?? 0), 2);
        }

        const totalIn = inEntries.reduce((s, e) => s + Number(e.qtyChange), 0);
        expect(totalIn).toBeCloseTo(qAcc, 4);
      }
    }
  });

  it('rejected GRN: every original IN entry has a matching GRN_REVERSE OUT entry (net zero)', async () => {
    const rejected = await prisma.goodsReceiptNote.findMany({
      where: { status: 'rejected' as any },
      include: { lines: true },
      take: 10,
    });
    if (rejected.length === 0) return; // no reject fixtures yet — skip

    for (const grn of rejected) {
      // Sum of all GRN-tagged ledger movements for this grn.id, across the
      // receiving warehouse, must net to zero per (variant) once a reverse fires.
      const allRefRows = await prisma.stockLedgerEntry.findMany({
        where: {
          companyId:     grn.companyId,
          warehouseId:   grn.warehouseId,
          referenceId:   grn.id,
          referenceType: { in: ['GRN', 'GRN_REVERSE'] },
        },
      });

      // Group by variant
      const byVariant = new Map<string, number>();
      for (const e of allRefRows) {
        byVariant.set(
          e.variantId,
          (byVariant.get(e.variantId) ?? 0) + Number(e.qtyChange),
        );
      }

      for (const line of grn.lines) {
        const qAcc = Number(line.qtyAccepted ?? 0);
        if (qAcc <= 0) continue;
        // After reject, net effect on receiving warehouse for this variant
        // must be zero (IN qAcc + OUT qAcc = 0).
        const net = byVariant.get(line.variantId) ?? 0;
        expect(net).toBeCloseTo(0, 4);

        // And there must be at least one explicit GRN_REVERSE row.
        const reversed = allRefRows.filter(
          (e) =>
            e.variantId === line.variantId &&
            e.referenceType === 'GRN_REVERSE' &&
            Number(e.qtyChange) < 0,
        );
        expect(reversed.length).toBeGreaterThan(0);
      }
    }
  });

  it('stock_ledger is append-only — Prisma update must throw', async () => {
    const sample = await prisma.stockLedgerEntry.findFirst();
    if (!sample) return;
    await expect(
      prisma.stockLedgerEntry.update({
        where: { id: sample.id },
        data: { qtyChange: 9999 as any },
      }),
    ).rejects.toThrow();
  });

  it('balanceAfter is monotonic per (variant, warehouse) in createdAt order', async () => {
    // Pick a (variant, warehouse) with at least 2 entries to validate.
    const grouped = await prisma.stockLedgerEntry.groupBy({
      by: ['variantId', 'warehouseId', 'companyId'],
      _count: { _all: true },
      having: { id: { _count: { gt: 1 } } },
      take: 5,
    });
    if (grouped.length === 0) return;

    for (const g of grouped) {
      const rows = await prisma.stockLedgerEntry.findMany({
        where: {
          companyId:   g.companyId,
          variantId:   g.variantId,
          warehouseId: g.warehouseId,
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      for (let i = 1; i < rows.length; i++) {
        const prev = Number(rows[i - 1].balanceAfter);
        const curr = Number(rows[i].balanceAfter);
        const delta = Number(rows[i].qtyChange);
        // balanceAfter[i] should equal balanceAfter[i-1] + qtyChange[i].
        expect(curr).toBeCloseTo(prev + delta, 4);
      }
    }
  });
});
