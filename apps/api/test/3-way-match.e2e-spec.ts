import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/platform/prisma/prisma.service';

/**
 * 3-Way Match (W3): a vendor invoice may only post when invoice qty
 * matches the corresponding PO + GRN qty within tolerance — the
 * `matchStatus` column records the outcome of that check.
 *
 * This spec asserts that no posted vendor invoice carries a hard
 * mismatch flag. Posted invoices must be either 'ok' or null
 * (legacy / no PO linked); they must never be 'po_qty_mismatch'
 * or 'price_mismatch'.
 */
describe('Purchases — 3-way match status (e2e)', () => {
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

  it('no posted invoice has a hard mismatch flag', async () => {
    const bad = await prisma.vendorInvoice.findMany({
      where: {
        status: 'posted',
        matchStatus: { in: ['po_qty_mismatch', 'price_mismatch'] },
      },
      take: 10,
    });
    expect(bad).toHaveLength(0);
  });
});
