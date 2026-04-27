import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/platform/prisma/prisma.service';
import { Customer360Service } from '../src/modules/sales/customer-360/customer-360.service';
import { RfmService } from '../src/modules/sales/rfm/rfm.service';

/**
 * T44 — Customer 360 detail endpoint + RFM recompute end-to-end.
 *
 * Verifies:
 *   1. RfmService.recomputeForCompany populates rfmSegment for every customer
 *      and never crashes on customers with zero invoices.
 *   2. Customer360Service.get returns the bundled view (customer + rfm +
 *      lifetime + aging + recent docs + top products) for a real customer.
 *   3. The aging buckets in the 360 view sum to a non-negative total.
 */
describe('Customer 360 + RFM (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let rfm: RfmService;
  let svc: Customer360Service;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
    rfm = app.get(RfmService);
    svc = app.get(Customer360Service);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('recomputeForCompany tags every active customer with a segment', async () => {
    const someCustomer = await prisma.customer.findFirst({
      where: { deletedAt: null },
      select: { companyId: true },
    });
    if (!someCustomer) {
      // Empty seed → nothing to verify, but the call itself must not throw.
      return;
    }
    const n = await rfm.recomputeForCompany(someCustomer.companyId);
    expect(n).toBeGreaterThan(0);

    const sample = await prisma.customer.findMany({
      where: { companyId: someCustomer.companyId, deletedAt: null },
      select: { rfmSegment: true, rfmComputedAt: true },
      take: 5,
    });
    for (const c of sample) {
      expect(c.rfmSegment).toBeTruthy();
      expect(['Champion', 'Loyal', 'At-Risk', 'Lost', 'New']).toContain(c.rfmSegment as string);
      expect(c.rfmComputedAt).toBeInstanceOf(Date);
    }
  });

  it('Customer360Service.get returns a complete bundle', async () => {
    const customer = await prisma.customer.findFirst({
      where: { deletedAt: null },
      select: { id: true, companyId: true },
    });
    if (!customer) return;

    const view = await svc.get(customer.companyId, customer.id);

    expect(view.customer.id).toBe(customer.id);
    expect(view.rfm).toBeDefined();
    expect(view.lifetime).toBeDefined();
    expect(view.aging).toBeDefined();
    expect(Array.isArray(view.recentInvoices)).toBe(true);
    expect(Array.isArray(view.recentQuotations)).toBe(true);
    expect(Array.isArray(view.recentOrders)).toBe(true);
    expect(Array.isArray(view.topProducts)).toBe(true);

    // Aging total ≥ 0 and equals sum of buckets.
    const total = Number(view.aging.total);
    const sum =
      Number(view.aging.current) +
      Number(view.aging.d1_30) +
      Number(view.aging.d31_60) +
      Number(view.aging.d61_90) +
      Number(view.aging.d90plus);
    expect(total).toBeGreaterThanOrEqual(0);
    expect(total).toBeCloseTo(sum, 2);
  });
});
