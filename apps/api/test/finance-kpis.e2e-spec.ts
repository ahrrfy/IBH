import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/platform/prisma/prisma.service';
import { FinanceKpisService } from '../src/modules/finance/kpis/finance-kpis.service';
import { FinancialReportsService } from '../src/modules/finance/reports/financial-reports.service';

/**
 * T50 — Financial KPIs Dashboard.
 *
 * The KPI aggregator MUST agree with FinancialReportsService for revenue /
 * gross margin / net income — the dashboard is just a presentation layer over
 * existing read paths. Any divergence means we accidentally introduced a new
 * computation, which violates the read-only constraint.
 */
describe('Finance — KPIs Dashboard (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let kpis: FinanceKpisService;
  let reports: FinancialReportsService;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    kpis = app.get(FinanceKpisService);
    reports = app.get(FinancialReportsService);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('returns the full KPI bundle with drill-down links', async () => {
    const company = await prisma.company.findFirst();
    if (!company) return; // skip when seed not run

    const from = new Date(new Date().getFullYear(), 0, 1);
    const to = new Date();

    const dash = await kpis.getDashboard(company.id, { from, to });

    // Shape contract — every KPI has a value (or sub-shape) plus drill-down link.
    expect(dash.kpis.revenue.drillDown).toMatch(/^\//);
    expect(dash.kpis.grossMarginPct.drillDown).toMatch(/^\//);
    expect(dash.kpis.netIncome.drillDown).toMatch(/^\//);
    expect(dash.kpis.arAging.drillDown).toMatch(/^\//);
    expect(dash.kpis.cashPosition.drillDown).toMatch(/^\//);
    expect(dash.kpis.topExpenses.drillDown).toMatch(/^\//);

    // AR aging buckets always present (zero is fine).
    expect(typeof dash.kpis.arAging.buckets.bucket_0_30).toBe('number');
    expect(typeof dash.kpis.arAging.buckets.bucket_31_90).toBe('number');
    expect(typeof dash.kpis.arAging.buckets.bucket_90_plus).toBe('number');

    // Cash position derives `total = banks + hand`.
    expect(dash.kpis.cashPosition.total).toBeCloseTo(
      dash.kpis.cashPosition.cashInBanks + dash.kpis.cashPosition.cashInHand,
      2,
    );

    // Top expenses are sorted descending and never negative.
    const expenses = dash.kpis.topExpenses.rows;
    for (let i = 1; i < expenses.length; i++) {
      expect(expenses[i - 1].amountIqd).toBeGreaterThanOrEqual(expenses[i].amountIqd);
    }
    for (const r of expenses) {
      expect(r.amountIqd).toBeGreaterThan(0);
    }
  });

  it('matches FinancialReportsService.incomeStatement for revenue/margin/net-income (no divergent math)', async () => {
    const company = await prisma.company.findFirst();
    if (!company) return; // skip when seed not run

    const from = new Date(new Date().getFullYear(), 0, 1);
    const to = new Date();

    const dash = await kpis.getDashboard(company.id, { from, to });
    const is = await reports.incomeStatement(company.id, { from, to });

    expect(dash.kpis.revenue.value).toBeCloseTo(Number(is.totals.totalRevenue), 2);
    expect(dash.kpis.grossMarginPct.value).toBeCloseTo(Number(is.totals.grossMargin), 6);
    expect(dash.kpis.netIncome.value).toBeCloseTo(Number(is.totals.netIncome), 2);
  });
});
