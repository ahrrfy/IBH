import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/platform/prisma/prisma.service';

/**
 * For every (variantId, warehouseId) pair in InventoryBalance, the qtyOnHand
 * must equal the sum of qtyChange in StockLedgerEntry. This is the F3 invariant
 * — InventoryBalance is a denormalized projection of the append-only ledger.
 */
describe('Inventory — balance reconciles with stock ledger (e2e)', () => {
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

  it('inventoryBalance.qtyOnHand === sum(stockLedger.qtyChange)', async () => {
    const balances = await prisma.inventoryBalance.findMany({ take: 30 });
    for (const b of balances) {
      const agg = await prisma.stockLedgerEntry.aggregate({
        where: { variantId: b.variantId, warehouseId: b.warehouseId },
        _sum: { qtyChange: true },
      });
      const sumLedger = Number(agg._sum.qtyChange ?? 0);
      const onHand = Number(b.qtyOnHand);
      expect(Math.abs(onHand - sumLedger)).toBeLessThan(0.001);
    }
  });
});
