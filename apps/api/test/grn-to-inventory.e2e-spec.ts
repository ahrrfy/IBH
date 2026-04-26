import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/platform/prisma/prisma.service';

/**
 * Wave 3 acceptance test — GRN → Inventory.
 *
 * Every accepted GRN line must produce a matching `stock_ledger`
 * append-only entry with referenceType='GRN' and referenceId=grn.id.
 * This is the F3 invariant in code form: no inventory movement
 * without a source document, and no source document without a
 * matching movement.
 *
 * The test also asserts the unitCostIqd flows through unchanged
 * (so MWA recalculation in inventory.service has the right input)
 * and the warehouseId is the receiving warehouse, not a global one.
 */
describe('Purchases — GRN → Inventory ledger link (e2e)', () => {
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

  it('every GRN line with qtyAccepted > 0 has a matching stock_ledger IN entry', async () => {
    // GRN status enum: draft | quality_check | accepted | rejected.
    // Inventory moves happen at create time (regardless of QC outcome),
    // so any non-rejected GRN should have ledger entries.
    const grns = await prisma.goodsReceiptNote.findMany({
      where: { status: { not: 'rejected' as any } },
      include: { lines: true },
      take: 10,
    });

    if (grns.length === 0) return; // empty fixture — skip

    for (const grn of grns) {
      for (const line of grn.lines) {
        const qAcc = Number(line.qtyAccepted ?? 0);
        if (qAcc <= 0) continue;

        const ledgerEntries = await prisma.stockLedgerEntry.findMany({
          where: {
            companyId:     grn.companyId,
            warehouseId:   grn.warehouseId,
            variantId:     line.variantId,
            referenceType: 'GRN',
            referenceId:   grn.id,
          },
        });

        // At least one IN entry for this line; sum equals the accepted qty.
        const inEntries = ledgerEntries.filter((e) => e.direction === 'in');
        expect(inEntries.length).toBeGreaterThan(0);
        const totalIn = inEntries.reduce((s, e) => s + Number(e.qty), 0);
        expect(totalIn).toBeCloseTo(qAcc, 4);

        // Cost flows through unchanged. Allow tiny FP drift on conversion.
        const expectedCost = Number(line.unitCostIqd ?? 0);
        for (const entry of inEntries) {
          expect(Number(entry.unitCostIqd ?? 0)).toBeCloseTo(expectedCost, 2);
        }
      }
    }
  });

  it('no GRN-referenced ledger entry exists without a corresponding GRN', async () => {
    // The reverse direction — orphan ledger entries break audit traceability.
    const ledgerEntries = await prisma.stockLedgerEntry.findMany({
      where: { referenceType: { in: ['GRN', 'GRN_REJECT', 'GRN_REVERSE'] } },
      select: { id: true, referenceId: true, companyId: true, referenceType: true },
      take: 50,
    });

    if (ledgerEntries.length === 0) return;

    const grnIds = Array.from(
      new Set(ledgerEntries.map((e) => e.referenceId).filter((id): id is string => !!id)),
    );
    const existing = await prisma.goodsReceiptNote.findMany({
      where: { id: { in: grnIds } },
      select: { id: true },
    });
    const existingIds = new Set(existing.map((g) => g.id));

    const orphans = ledgerEntries.filter((e) => !existingIds.has(e.referenceId));
    if (orphans.length > 0) {
      throw new Error(
        `Found ${orphans.length} stock_ledger entries with GRN refs but no matching GRN row: ` +
          orphans
            .slice(0, 5)
            .map((o) => `${o.referenceType}:${o.referenceId}`)
            .join(', '),
      );
    }
  });
});
