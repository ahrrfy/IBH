import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../platform/prisma/prisma.service';

/**
 * T49 — Variance Service
 *
 * Compares budgeted figures (BudgetLine.amount) against actuals derived from
 * posted JournalEntryLine rows for the same (accountCode, costCenter, period).
 *
 * Actual amount per line = Σ(line.amountIqd where side='debit')
 *                       − Σ(line.amountIqd where side='credit')
 *
 * For expense / asset accounts the natural balance is debit, so a positive
 * net debit = spending. For revenue / liability / equity accounts, a positive
 * net credit = realised income. We compute a *signed actual* and let the
 * caller interpret direction relative to the absolute budget. To keep the
 * UI simple we report the magnitude that the budget tracks — i.e. the same
 * sign as the budget — and let the variance percentage describe utilization.
 */

export type VarianceStatus = 'under' | 'on-track' | 'warning' | 'over';

export interface VarianceRow {
  accountCode: string;
  costCenterId: string | null;
  period: number;
  budget: string; // Decimal as string (preserves precision for the wire)
  actual: string;
  variance: string; // actual − budget
  variancePct: number; // (actual / budget) * 100  — 0 when budget = 0
  status: VarianceStatus;
}

@Injectable()
export class VarianceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Compute variance per BudgetLine for a budget. When `period` is provided,
   * filters to that month; otherwise returns one row per line for the whole
   * fiscal year.
   */
  async getVariance(
    budgetId: string,
    companyId: string,
    period?: number,
  ): Promise<VarianceRow[]> {
    const budget = await this.prisma.budget.findFirst({
      where: { id: budgetId, companyId },
      include: {
        lines: period
          ? { where: { period } }
          : { orderBy: [{ period: 'asc' }, { accountCode: 'asc' }] },
      },
    });
    if (!budget) {
      throw new NotFoundException({
        code: 'BUDGET_NOT_FOUND',
        messageAr: 'الموازنة غير موجودة',
      });
    }

    const rows: VarianceRow[] = [];
    for (const line of budget.lines) {
      const actual = await this.computeActual(
        companyId,
        budget.fiscalYear,
        line.period,
        line.accountCode,
        line.costCenterId,
      );
      const budgetD = new Prisma.Decimal(line.amount);
      const actualD = new Prisma.Decimal(actual);
      const variance = actualD.minus(budgetD);
      const pct = budgetD.isZero()
        ? 0
        : Number(actualD.div(budgetD).times(100).toFixed(2));
      rows.push({
        accountCode: line.accountCode,
        costCenterId: line.costCenterId,
        period: line.period,
        budget: budgetD.toString(),
        actual: actualD.toString(),
        variance: variance.toString(),
        variancePct: pct,
        status: this.classify(pct),
      });
    }
    return rows;
  }

  /**
   * Sum posted journal entry lines for one (account, cc, period) bucket and
   * return the signed magnitude (debit − credit).
   */
  async computeActual(
    companyId: string,
    fiscalYear: number,
    period: number,
    accountCode: string,
    costCenterId: string | null,
  ): Promise<string> {
    const periodRow = await this.prisma.accountingPeriod.findFirst({
      where: { companyId, year: fiscalYear, month: period },
      select: { id: true },
    });
    if (!periodRow) return '0';

    const lines = await this.prisma.journalEntryLine.findMany({
      where: {
        accountCode,
        ...(costCenterId ? { costCenterId } : {}),
        journalEntry: {
          companyId,
          periodId: periodRow.id,
          status: 'posted',
        },
      },
      select: { side: true, amountIqd: true },
    });

    let debit = new Prisma.Decimal(0);
    let credit = new Prisma.Decimal(0);
    for (const l of lines) {
      if (l.side === 'debit') debit = debit.plus(l.amountIqd);
      else credit = credit.plus(l.amountIqd);
    }
    // Debit positive: matches expense/asset budgets which are the dominant
    // case. Revenue budgets typically have credit-natural amounts and the
    // FE flips the sign for display when the account category is revenue.
    return debit.minus(credit).toString();
  }

  /** Map utilization % to a discrete status band. */
  classify(pct: number): VarianceStatus {
    const p = Math.abs(pct);
    if (p < 80) return 'under';
    if (p <= 100) return 'on-track';
    if (p <= 120) return 'warning';
    return 'over';
  }

  /** Threshold band used by the alert cron (0 / 80 / 100 / 120). */
  band(pct: number): 0 | 80 | 100 | 120 {
    const p = Math.abs(pct);
    if (p >= 120) return 120;
    if (p >= 100) return 100;
    if (p >= 80) return 80;
    return 0;
  }
}
