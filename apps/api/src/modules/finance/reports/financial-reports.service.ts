import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { Prisma } from '@prisma/client';

interface ReportLine {
  accountId: string;
  accountCode: string;
  nameAr: string;
  nameEn: string | null;
  level: number;
  category: string;
  amountIqd: Prisma.Decimal;
  amountUsd?: Prisma.Decimal;
}

@Injectable()
export class FinancialReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Balance Sheet: Assets = Liabilities + Equity
   */
  async balanceSheet(companyId: string, asOf: Date) {
    const accounts = await this.prisma.chartOfAccount.findMany({
      where: {
        companyId,
        type: { in: ['asset', 'liability', 'equity'] },
        isActive: true,
      },
      orderBy: { code: 'asc' },
    });

    const balances = await this.accountBalances(companyId, accounts.map((a) => a.id), undefined, asOf);
    const rate = await this.usdRate(companyId, asOf);

    const assets: ReportLine[] = [];
    const liabilities: ReportLine[] = [];
    const equity: ReportLine[] = [];

    for (const a of accounts) {
      const { debit, credit } = balances.get(a.id) ?? {
        debit: new Prisma.Decimal(0),
        credit: new Prisma.Decimal(0),
      };
      const balance =
        a.type === 'asset' ? debit.minus(credit) : credit.minus(debit);
      const line: ReportLine = {
        accountId: a.id,
        accountCode: a.code,
        nameAr: a.nameAr,
        nameEn: a.nameEn,
        level: a.level,
        category: a.category,
        amountIqd: balance,
        amountUsd: rate ? balance.div(rate) : undefined,
      };
      if (a.type === 'asset') assets.push(line);
      else if (a.type === 'liability') liabilities.push(line);
      else equity.push(line);
    }

    const totalAssets = this.sum(assets);
    const totalLiabilities = this.sum(liabilities);
    const totalEquity = this.sum(equity);

    // Retained earnings = net income YTD (revenue - expenses)
    const ytdStart = new Date(asOf.getFullYear(), 0, 1);
    const income = await this.incomeStatement(companyId, { from: ytdStart, to: asOf });

    return {
      asOf,
      exchangeRate: rate,
      sections: {
        assets,
        liabilities,
        equity,
      },
      totals: {
        totalAssets,
        totalLiabilities,
        totalEquity,
        retainedEarningsYTD: income.totals.netIncome,
        liabilitiesAndEquity: totalLiabilities.plus(totalEquity).plus(income.totals.netIncome),
        balanced: totalAssets.equals(totalLiabilities.plus(totalEquity).plus(income.totals.netIncome)),
      },
    };
  }

  /**
   * Income Statement: Revenue - COGS - Expenses = Net Income
   */
  async incomeStatement(
    companyId: string,
    params: { from: Date; to: Date },
  ) {
    const accounts = await this.prisma.chartOfAccount.findMany({
      where: {
        companyId,
        type: { in: ['revenue', 'expense'] },
        isActive: true,
      },
      orderBy: { code: 'asc' },
    });
    const balances = await this.accountBalances(
      companyId,
      accounts.map((a) => a.id),
      params.from,
      params.to,
    );
    const rate = await this.usdRate(companyId, params.to);

    const revenue: ReportLine[] = [];
    const cogs: ReportLine[] = [];
    const expenses: ReportLine[] = [];

    for (const a of accounts) {
      const { debit, credit } = balances.get(a.id) ?? {
        debit: new Prisma.Decimal(0),
        credit: new Prisma.Decimal(0),
      };
      const balance =
        a.type === 'revenue' ? credit.minus(debit) : debit.minus(credit);
      const line: ReportLine = {
        accountId: a.id,
        accountCode: a.code,
        nameAr: a.nameAr,
        nameEn: a.nameEn,
        level: a.level,
        category: a.category,
        amountIqd: balance,
        amountUsd: rate ? balance.div(rate) : undefined,
      };
      if (a.type === 'revenue') revenue.push(line);
      else if (a.category === 'cogs') cogs.push(line);
      else expenses.push(line);
    }

    const totalRevenue = this.sum(revenue);
    const totalCogs = this.sum(cogs);
    const totalExpenses = this.sum(expenses);
    const grossProfit = totalRevenue.minus(totalCogs);
    const operatingIncome = grossProfit.minus(totalExpenses);
    const netIncome = operatingIncome; // simplified: no separate non-operating

    const grossMargin = totalRevenue.gt(0) ? grossProfit.div(totalRevenue) : new Prisma.Decimal(0);
    const operatingMargin = totalRevenue.gt(0) ? operatingIncome.div(totalRevenue) : new Prisma.Decimal(0);
    const netMargin = totalRevenue.gt(0) ? netIncome.div(totalRevenue) : new Prisma.Decimal(0);

    return {
      from: params.from,
      to: params.to,
      exchangeRate: rate,
      sections: { revenue, cogs, expenses },
      totals: {
        totalRevenue,
        totalCogs,
        grossProfit,
        totalExpenses,
        operatingIncome,
        netIncome,
        grossMargin,
        operatingMargin,
        netMargin,
      },
    };
  }

  /**
   * Cash Flow Statement (indirect method — simplified).
   */
  async cashFlow(companyId: string, params: { from: Date; to: Date }) {
    const income = await this.incomeStatement(companyId, params);

    // Operating: net income + non-cash items (depreciation) + changes in WC (stubbed to categories)
    const operating: ReportLine[] = [];
    const investing: ReportLine[] = [];
    const financing: ReportLine[] = [];

    // Depreciation for period
    const depAccounts = await this.prisma.chartOfAccount.findMany({
      where: { companyId, category: 'depreciation_expense', isActive: true },
    });
    const depBal = await this.accountBalances(
      companyId,
      depAccounts.map((a) => a.id),
      params.from,
      params.to,
    );
    let depreciation = new Prisma.Decimal(0);
    for (const a of depAccounts) {
      const b = depBal.get(a.id);
      if (b) depreciation = depreciation.plus(b.debit.minus(b.credit));
    }

    operating.push({
      accountId: 'NET_INCOME',
      accountCode: 'NI',
      nameAr: 'صافي الدخل',
      nameEn: 'Net Income',
      level: 0,
      category: 'operating',
      amountIqd: income.totals.netIncome,
    });
    operating.push({
      accountId: 'DEPRECIATION',
      accountCode: 'DEP',
      nameAr: 'الإهلاك',
      nameEn: 'Depreciation',
      level: 0,
      category: 'operating',
      amountIqd: depreciation,
    });

    const totalOperating = this.sum(operating);
    const totalInvesting = this.sum(investing);
    const totalFinancing = this.sum(financing);
    const netChange = totalOperating.plus(totalInvesting).plus(totalFinancing);

    return {
      from: params.from,
      to: params.to,
      sections: { operating, investing, financing },
      totals: {
        totalOperating,
        totalInvesting,
        totalFinancing,
        netChangeInCash: netChange,
      },
    };
  }

  /**
   * Statement of Changes in Equity.
   */
  async statementOfEquity(
    companyId: string,
    params: { from: Date; to: Date },
  ) {
    const equityAccounts = await this.prisma.chartOfAccount.findMany({
      where: { companyId, type: 'equity', isActive: true },
      orderBy: { code: 'asc' },
    });

    const opening = await this.accountBalances(
      companyId,
      equityAccounts.map((a) => a.id),
      undefined,
      new Date(params.from.getTime() - 1),
    );
    const closing = await this.accountBalances(
      companyId,
      equityAccounts.map((a) => a.id),
      undefined,
      params.to,
    );

    const lines = equityAccounts.map((a) => {
      const o = opening.get(a.id) ?? {
        debit: new Prisma.Decimal(0),
        credit: new Prisma.Decimal(0),
      };
      const c = closing.get(a.id) ?? {
        debit: new Prisma.Decimal(0),
        credit: new Prisma.Decimal(0),
      };
      const openingBal = o.credit.minus(o.debit);
      const closingBal = c.credit.minus(c.debit);
      return {
        accountId: a.id,
        accountCode: a.code,
        nameAr: a.nameAr,
        nameEn: a.nameEn,
        opening: openingBal,
        change: closingBal.minus(openingBal),
        closing: closingBal,
      };
    });

    const income = await this.incomeStatement(companyId, params);

    return {
      from: params.from,
      to: params.to,
      lines,
      netIncomeForPeriod: income.totals.netIncome,
      totals: {
        opening: lines.reduce((s, l) => s.plus(l.opening), new Prisma.Decimal(0)),
        closing: lines.reduce((s, l) => s.plus(l.closing), new Prisma.Decimal(0)),
      },
    };
  }

  // ---- helpers ----

  private async accountBalances(
    companyId: string,
    accountIds: string[],
    from?: Date,
    to?: Date,
  ) {
    if (accountIds.length === 0) return new Map<string, { debit: Prisma.Decimal; credit: Prisma.Decimal }>();
    const sums = await this.prisma.journalEntryLine.groupBy({
      by: ['accountId'],
      where: {
        accountId: { in: accountIds },
        entry: {
          companyId,
          status: 'posted',
          ...(from || to
            ? {
                entryDate: {
                  ...(from ? { gte: from } : {}),
                  ...(to ? { lte: to } : {}),
                },
              }
            : {}),
        },
      },
      _sum: { debitIqd: true, creditIqd: true },
    });
    return new Map(
      sums.map((s) => [
        s.accountId,
        {
          debit: s._sum.debitIqd ?? new Prisma.Decimal(0),
          credit: s._sum.creditIqd ?? new Prisma.Decimal(0),
        },
      ]),
    );
  }

  private async usdRate(companyId: string, asOf: Date): Promise<Prisma.Decimal | null> {
    const r = await this.prisma.exchangeRate.findFirst({
      where: {
        companyId,
        fromCurrency: 'USD',
        toCurrency: 'IQD',
        effectiveDate: { lte: asOf },
      },
      orderBy: { effectiveDate: 'desc' },
    });
    return r?.rate ?? null;
  }

  private sum(lines: ReportLine[]): Prisma.Decimal {
    return lines.reduce((s, l) => s.plus(l.amountIqd), new Prisma.Decimal(0));
  }
}
