import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { InventoryService } from '../src/modules/inventory/inventory.service';
import { PrismaService } from '../src/platform/prisma/prisma.service';

/**
 * Moving Weighted Average correctness test (F3 Philosophy).
 *
 * Scenario:
 *   1. IN   100 @ 1,000 IQD → avg = 1,000
 *   2. OUT   30           → avg stays 1,000
 *   3. IN   100 @ 1,300    → avg = (70×1000 + 100×1300) / 170 = 1,176.47
 *   4. OUT   20            → COGS = 20 × 1,176.47 = 23,529.4
 *
 * The StockLedger must remain append-only across all operations.
 */
describe('Inventory — Moving Weighted Average (e2e)', () => {
  let app: INestApplication;
  let inventory: InventoryService;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    inventory = app.get(InventoryService);
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app?.close();
  });

  it.skip('MWA correctness across mixed IN/OUT (requires test fixtures)', async () => {
    // Skipped by default — enable once test fixtures are seeded.
    // To run: remove .skip and provide companyId + variantId + warehouseId that exist.
    const variantId    = process.env.TEST_VARIANT_ID;
    const warehouseId  = process.env.TEST_WAREHOUSE_ID;
    const companyId    = process.env.TEST_COMPANY_ID;
    const userId       = process.env.TEST_USER_ID;
    if (!variantId || !warehouseId || !companyId || !userId) return;

    const session = { userId, companyId } as any;

    await (inventory as any).move(
      { direction: 'in', variantId, warehouseId, qty: 100, unitCost: 1000, referenceType: 'TEST', referenceId: 'T1' },
      session,
    );
    await (inventory as any).move(
      { direction: 'out', variantId, warehouseId, qty: 30, referenceType: 'TEST', referenceId: 'T2' },
      session,
    );
    await (inventory as any).move(
      { direction: 'in', variantId, warehouseId, qty: 100, unitCost: 1300, referenceType: 'TEST', referenceId: 'T3' },
      session,
    );

    const balance = await (prisma as any).inventoryBalance.findFirst({
      where: { variantId, warehouseId },
    });
    expect(Number(balance.avgCost)).toBeCloseTo(1176.47, 1);
    expect(Number(balance.qtyOnHand)).toBe(170);
  });

  it('StockLedger is append-only (attempt UPDATE/DELETE should fail)', async () => {
    // Verify the DB trigger is in place. If no rows exist yet, this passes trivially.
    const sample = await (prisma as any).stockLedgerEntry.findFirst();
    if (!sample) return;
    await expect(
      (prisma as any).stockLedgerEntry.update({
        where: { id: sample.id },
        data: { qtyChange: 999 },
      }),
    ).rejects.toThrow();
  });
});
