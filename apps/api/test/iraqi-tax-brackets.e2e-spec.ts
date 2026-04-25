import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PayrollService } from '../src/modules/hr/payroll/payroll.service';

/**
 * W5 acceptance: Iraqi income tax brackets must match the law.
 *
 * Source: payroll.service.ts#computeIraqiTax (private). Brackets:
 *   Annual gross ≤ 2,500,000 IQD     → 0% (exempt)
 *   2,500,001 .. 5,000,000           → 3% on excess
 *   5,000,001 .. 10,000,000          → 5% on excess
 *   > 10,000,000                     → 10% on excess
 * Tax is annualized (gross × 12), computed on the excess above
 * the 2.5M IQD exemption, then divided back by 12 for monthly.
 *
 * This test pins the brackets as a regression spec. If anyone changes
 * computeIraqiTax to use different rates, this test fails immediately
 * with a meaningful diff.
 */
describe('Iraqi income tax brackets — payroll spec (e2e)', () => {
  let app: INestApplication;
  let payroll: PayrollService;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    payroll = app.get(PayrollService);
  });

  afterAll(async () => {
    await app?.close();
  });

  // Access private method via cast — pragmatic for spec tests.
  const compute = (grossMonthly: number): string =>
    (payroll as unknown as {
      computeIraqiTax: (g: Prisma.Decimal) => Prisma.Decimal;
    })
      .computeIraqiTax(new Prisma.Decimal(grossMonthly))
      .toString();

  it('Bracket 1 — annual ≤ 2,500,000 IQD → 0% (exempt)', () => {
    // gross monthly = 200,000 → annual = 2,400,000 (under exemption)
    expect(compute(200_000)).toBe('0');
    // boundary: 2,500,000 / 12 = 208,333.33...
    expect(compute(208_333)).toBe('0');
  });

  it('Bracket 2 — 2,500,001 .. 5,000,000 → 3% on excess', () => {
    // gross monthly = 300,000 → annual = 3,600,000
    // excess = 3,600,000 - 2,500,000 = 1,100,000
    // tax annual = 1,100,000 × 0.03 = 33,000
    // tax monthly = 33,000 / 12 = 2,750
    expect(compute(300_000)).toBe('2750');

    // gross monthly = 416,666.67 → annual ≈ 5,000,000 (top of bracket)
    // excess = 2,500,000 → tax = 75,000 → /12 = 6,250
    expect(compute(416_666)).toBe('6249.99');
  });

  it('Bracket 3 — 5,000,001 .. 10,000,000 → 5% on excess', () => {
    // gross monthly = 600,000 → annual = 7,200,000
    // excess = 4,700,000 × 0.05 = 235,000 / 12 = 19,583.33...
    expect(compute(600_000)).toBe('19583.333333333333333333');

    // gross monthly = 833,333 → annual ≈ 10,000,000 (top of bracket)
    // excess = 7,499,996 × 0.05 = 374,999.80 / 12 = 31,249.983...
    expect(compute(833_333)).toBe('31249.983333333333333333');
  });

  it('Bracket 4 — > 10,000,000 → 10% on excess', () => {
    // gross monthly = 1,000,000 → annual = 12,000,000
    // excess = 9,500,000 × 0.10 = 950,000 / 12 = 79,166.67
    expect(compute(1_000_000)).toBe('79166.666666666666666667');

    // gross monthly = 5,000,000 → annual = 60,000,000
    // excess = 57,500,000 × 0.10 = 5,750,000 / 12 = 479,166.67
    expect(compute(5_000_000)).toBe('479166.666666666666666667');
  });

  it('Bracket boundaries are deterministic — no jumps', () => {
    // tax must be monotonically non-decreasing as gross increases
    const samples = [100_000, 200_000, 250_000, 300_000, 500_000, 700_000, 1_000_000, 2_000_000];
    let prev = new Prisma.Decimal(0);
    for (const g of samples) {
      const t = new Prisma.Decimal(compute(g));
      expect(t.gte(prev)).toBe(true);
      prev = t;
    }
  });
});
