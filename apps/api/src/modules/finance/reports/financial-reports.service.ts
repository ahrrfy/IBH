import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { Prisma } from '@prisma/client';

interface ReportLine {
  accountId: string;
  accountCode: string;
  nameAr: string;
  nameEn: string | null;
  category: string;
  amountIqd: Prisma.Decimal;
  amountUsd?: Prisma.Decimal;
}

const ASSET_CATEGORIES = ['fixed_assets', 'current_assets'] as const;
const BS_CATEGORIES = ['fixed_assets', 'current_assets', 'liabilities', 'equity'] as const;
const PL_CATEGORIES = ['revenue', 'expense'] as const;

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
        category: { in: [...BS_CATEGORIES] },
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
      const isAsset = (ASSET_CATEGORIES as readonly string[]).includes(a.category);
      const balance = isAsset ? debit.minus(credit) : credit.minus(debit);
      const line: ReportLine = {
        accountId: a.id,
        accountCode: a.code,
        nameAr: a.nameAr,
        nameEn: a.nameEn,
        category: a.category,
        amountIqd: balance,
        amountUsd: rate ? balance.div(rate) : undefined,
      };
      if (isAsset) assets.push(line);
      else if (a.category === 'liabilities') liabilities.push(line);
      else equity.push(line);
    }

    const totalAssets = this.sum(assets);
    const totalLiabilities = this.sum(liabilities);
    const totalEquity = this.sum(equity);

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
   * COGS is identified by account code prefix '5' (Iraqi CoA convention) within expenses.
   */
  async incomeStatement(
    companyId: string,
    params: { from: Date; to: Date },
  ) {
    const accounts = await this.prisma.chartOfAccount.findMany({
      where: {
        companyId,
        category: { in: [...PL_CATEGORIES] },
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
      const balance = a.category === 'revenue' ? credit.minus(debit) : debit.minus(credit);
      const line: ReportLine = {
        accountId: a.id,
        accountCode: a.code,
        nameAr: a.nameAr,
        nameEn: a.nameEn,
        category: a.category,
        amountIqd: balance,
        amountUsd: rate ? balance.div(rate) : undefined,
      };
      if (a.category === 'revenue') revenue.push(line);
      else if (a.code.startsWith('5')) cogs.push(line);
      else expenses.push(line);
    }

    const totalRevenue = this.sum(revenue);
    const totalCogs = this.sum(cogs);
    const totalExpenses = this.sum(expenses);
    const grossProfit = totalRevenue.minus(totalCogs);
    const operatingIncome = grossProfit.minus(totalExpenses);
    const netIncome = operatingIncome;

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
   * Depreciation accounts identified by Arabic name match (إهلاك).
   */
  async cashFlow(companyId: string, params: { from: Date; to: Date }) {
    const income = await this.incomeStatement(companyId, params);

    const operating: ReportLine[] = [];
    const investing: ReportLine[] = [];
    const financing: ReportLine[] = [];

    const depAccounts = await this.prisma.chartOfAccount.findMany({
      where: {
        companyId,
        category: 'expense',
        isActive: true,
        OR: [
          { nameAr: { contains: 'إهلاك' } },
          { nameEn: { contains: 'epreciation' } },
        ],
      },
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
      category: 'operating',
      amountIqd: income.totals.netIncome,
    });
    operating.push({
      accountId: 'DEPRECIATION',
      accountCode: 'DEP',
      nameAr: 'الإهلاك',
      nameEn: 'Depreciation',
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
      where: { companyId, category: 'equity', isActive: true },
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
  ): Promise<Map<string, { debit: Prisma.Decimal; credit: Prisma.Decimal }>> {
    if (accountIds.length === 0) return new Map();
    const sums = await this.prisma.journalEntryLine.groupBy({
      by: ['accountId', 'side'],
      where: {
        accountId: { in: accountIds },
        journalEntry: {
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
    return map;
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
