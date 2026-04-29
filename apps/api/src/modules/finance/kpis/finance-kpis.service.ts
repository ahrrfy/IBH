import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { FinancialReportsService } from '../reports/financial-reports.service';

/**
 * T50 — Financial KPIs Dashboard (read-only aggregator).
 *
 * This service is *purely* a read aggregator that consumes:
 *   - FinancialReportsService (income statement → revenue, gross margin, net income)
 *   - existing journal_entry_lines (top expenses by account, drill-down via GL)
 *   - existing sales_invoices (AR aging buckets) — same shape as financeDashboard
 *   - existing bank_accounts + cash_movements (cash position) — same shape as financeDashboard
 *
 * F2 / F3 invariants — NO writes, NO schema changes, NO new persistent state.
 * RLS is enforced through PrismaService just like every other read path.
 */
@Injectable()
export class FinanceKpisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: FinancialReportsService,
  ) {}

  /**
   * Return the full KPI bundle used by the dashboard UI.
   *
   * @param companyId tenant scope (RLS layer also enforces this)
   * @param params period bounds for revenue / margin / net income KPIs.
   *               If omitted: current calendar month (1st → today).
   */
  async getDashboard(
    companyId: string,
    params: { from?: Date; to?: Date } = {},
  ) {
    const now = new Date();
    const from = params.from ?? new Date(now.getFullYear(), now.getMonth(), 1);
    const to = params.to ?? now;

    const [income, arAging, cashPosition, topExpenses] = await Promise.all([
      this.reports.incomeStatement(companyId, { from, to }),
      this.arAging(companyId),
      this.cashPosition(companyId),
      this.topExpensesByAccount(companyId, from, to, 5),
    ]);

    const totals = income.totals;

    return {
      period: { from, to },
      kpis: {
        revenue: {
          value: Number(totals.totalRevenue),
          drillDown: '/finance/income-statement',
        },
        grossMarginPct: {
          value: Number(totals.grossMargin), // 0..1
          drillDown: '/finance/income-statement',
        },
        netIncome: {
          value: Number(totals.netIncome),
          drillDown: '/finance/income-statement',
        },
        arAging: {
          buckets: arAging,
          drillDown: '/reports/ar-aging',
        },
        cashPosition: {
          cashInBanks: cashPosition.cashInBanks,
          cashInHand: cashPosition.cashInHand,
          total: cashPosition.cashInBanks + cashPosition.cashInHand,
          drillDown: '/finance/banks',
        },
        topExpenses: {
          rows: topExpenses,
          drillDown: '/finance/income-statement',
        },
      },
    };
  }

  /**
   * AR aging buckets by invoice date.
   * Mirrors `dashboards.service.ts#financeDashboard` exactly so KPIs and the
   * full-dashboard widget never disagree.
   */
  private async arAging(companyId: string) {
    const rows: Array<{ bucket_0_30: number | null; bucket_31_90: number | null; bucket_90_plus: number | null }> =
      await this.prisma.$queryRawUnsafe(
        `SELECT
           SUM(CASE WHEN NOW() - "invoiceDate" <= INTERVAL '30 days' THEN "balanceIqd" ELSE 0 END)::float AS bucket_0_30,
           SUM(CASE WHEN NOW() - "invoiceDate" > INTERVAL '30 days' AND NOW() - "invoiceDate" <= INTERVAL '90 days' THEN "balanceIqd" ELSE 0 END)::float AS bucket_31_90,
           SUM(CASE WHEN NOW() - "invoiceDate" > INTERVAL '90 days' THEN "balanceIqd" ELSE 0 END)::float AS bucket_90_plus
         FROM "sales_invoices" WHERE "companyId" = $1 AND "balanceIqd" > 0`,
        companyId,
      );
    const r = rows?.[0] ?? { bucket_0_30: 0, bucket_31_90: 0, bucket_90_plus: 0 };
    return {
      bucket_0_30: Number(r.bucket_0_30 ?? 0),
      bucket_31_90: Number(r.bucket_31_90 ?? 0),
      bucket_90_plus: Number(r.bucket_90_plus ?? 0),
    };
  }

  /** Cash on hand + in banks. */
  private async cashPosition(companyId: string) {
    // I047 — BankAccount field is `type` (BankAccountType enum), not
    // `accountType`. Identical fix to dashboards.service.ts. Without this
    // the /finance/kpis/dashboard query 500'd silently.
    const rows: Array<{ kind: string; balance: number }> = await this.prisma.$queryRawUnsafe(
      `SELECT ba."type" AS kind,
              COALESCE(SUM(CASE
                WHEN cm."toAccountId" IS NOT NULL AND cm."fromAccountId" IS NULL THEN cm."amountIqd"
                WHEN cm."fromAccountId" IS NOT NULL AND cm."toAccountId" IS NULL THEN -cm."amountIqd"
                ELSE 0 END), 0)::float AS balance
       FROM "bank_accounts" ba
       LEFT JOIN "cash_movements" cm ON cm."bankAccountId" = ba.id
       WHERE ba."companyId" = $1
       GROUP BY ba."type"`,
      companyId,
    );
    const cashInBanks = rows.filter((r) => r.kind !== 'cash').reduce((s, r) => s + Number(r.balance), 0);
    const cashInHand = rows.filter((r) => r.kind === 'cash').reduce((s, r) => s + Number(r.balance), 0);
    return { cashInBanks, cashInHand };
  }

  /**
   * Top N expense accounts in [from, to] by net debit (debit - credit).
   * Uses ChartOfAccount + JournalEntryLine groupBy — NO raw SQL, double-entry
   * sign convention identical to FinancialReportsService.incomeStatement.
   */
  private async topExpensesByAccount(
    companyId: string,
    from: Date,
    to: Date,
    limit: number,
  ) {
    const accounts = await this.prisma.chartOfAccount.findMany({
      where: { companyId, category: 'expense', isActive: true },
      select: { id: true, code: true, nameAr: true, nameEn: true },
    });
    if (accounts.length === 0) return [];

    const sums = await this.prisma.journalEntryLine.groupBy({
      by: ['accountId', 'side'],
      where: {
        accountId: { in: accounts.map((a) => a.id) },
        journalEntry: {
          companyId,
          status: 'posted',
          entryDate: { gte: from, lte: to },
        },
      },
      _sum: { amountIqd: true },
    });

    const map = new Map<string, { debit: Prisma.Decimal; credit: Prisma.Decimal }>();
    for (const s of sums) {
      const cur = map.get(s.accountId) ?? {
        debit: new Prisma.Decimal(0),
        credit: new Prisma.Decimal(0),
      };
      const amt = s._sum.amountIqd ?? new Prisma.Decimal(0);
      if (s.side === 'debit') cur.debit = cur.debit.plus(amt);
      else cur.credit = cur.credit.plus(amt);
      map.set(s.accountId, cur);
    }

    return accounts
      .map((a) => {
        const b = map.get(a.id) ?? { debit: new Prisma.Decimal(0), credit: new Prisma.Decimal(0) };
        const balance = b.debit.minus(b.credit); // expense convention: debit > credit
        return {
          accountId: a.id,
          accountCode: a.code,
          nameAr: a.nameAr,
          nameEn: a.nameEn,
          amountIqd: Number(balance),
        };
      })
      .filter((r) => r.amountIqd > 0)
      .sort((a, b) => b.amountIqd - a.amountIqd)
      .slice(0, limit);
  }
}
