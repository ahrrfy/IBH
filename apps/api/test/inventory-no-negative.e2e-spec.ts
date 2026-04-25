import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/platform/prisma/prisma.service';

/**
 * F3: stock balances must never go negative without an explicit
 * override permission. This spec checks the standing condition —
 * every active inventory_balance row must have qty_on_hand >= 0.
 */
describe('Inventory — No negative on-hand (e2e)', () => {
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

  it('all inventory balances are non-negative', async () => {
    const negatives = await prisma.inventoryBalance.findMany({
      where: { qtyOnHand: { lt: 0 } },
      take: 10,
    });
    expect(negatives).toHaveLength(0);
  });
});
