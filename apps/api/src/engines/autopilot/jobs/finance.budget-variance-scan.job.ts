import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AutopilotEngineService } from '../autopilot.service';
import {
  AutopilotJob,
  AutopilotJobContext,
  AutopilotJobMeta,
  AutopilotJobResult,
} from '../autopilot.types';
import type { AutopilotSeverity } from '../autopilot.types';

// ─── T71 Job: finance.budget-variance-scan ──────────────────────────────────
// Cron: 10:00 UTC daily.
// Goal: compare actual GL spending against budget per (account, cost centre,
// period). Alert once per threshold crossing: 80% (info), 100% (warning),
// 120% (critical). The `lastAlertedThreshold` column on BudgetLine prevents
// repeat notifications while spend stays in the same band.
//
// Actuals are summed from JournalEntryLine (debit side only, posted entries)
// joined through JournalEntry for companyId + period filtering.
// Budget lines whose amount is 0 are skipped to avoid division-by-zero.

/** Threshold bands in ascending order. */
const THRESHOLDS = [
  { pct: 1.2, band: 120, severity: 'critical' as AutopilotSeverity },
  { pct: 1.0, band: 100, severity: 'medium' as AutopilotSeverity },
  { pct: 0.8, band: 80,  severity: 'low'    as AutopilotSeverity },
] as const;

@Injectable()
export class FinanceBudgetVarianceScanJob implements AutopilotJob {
  private readonly logger = new Logger(FinanceBudgetVarianceScanJob.name);

  readonly meta: AutopilotJobMeta = {
    id: 'finance.budget-variance-scan',
    domain: 'finance',
    schedule: '0 10 * * *',
    companyScoped: true,
    titleAr: 'مسح انحراف الميزانية',
    titleEn: 'Budget Variance Scan',
    description:
      'Daily 10:00 UTC — alerts when actual spending reaches 80%/100%/120% of budget for any account/cost-centre line.',
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: AutopilotEngineService,
  ) {}

  async execute(ctx: AutopilotJobContext): Promise<AutopilotJobResult> {
    const currentYear  = ctx.startedAt.getFullYear();
    const currentMonth = ctx.startedAt.getMonth() + 1; // 1-indexed

    let linesProcessed  = 0;
    let exceptionsRaised = 0;

    try {
      // Fetch active budgets for this company in the current fiscal year.
      const budgets = await this.prisma.budget.findMany({
        where: {
          companyId: ctx.companyId,
          status: 'active',
          fiscalYear: currentYear,
        },
        select: {
          id: true,
          name: true,
          lines: {
            where: { period: currentMonth },
            select: {
              id: true,
              accountCode: true,
              costCenterId: true,
              amount: true,
              lastAlertedThreshold: true,
            },
          },
        },
      });

      if (budgets.length === 0) {
        return {
          status: 'no_op',
          itemsProcessed: 0,
          exceptionsRaised: 0,
          details: {
            reason: 'no-active-budgets',
            year: currentYear,
            month: currentMonth,
          },
        };
      }

      // Resolve the AccountingPeriod id for the current company/year/month so
      // we can scope JournalEntry actuals to the correct period.
      const accountingPeriod = await this.prisma.accountingPeriod.findUnique({
        where: {
          companyId_year_month: {
            companyId: ctx.companyId,
            year: currentYear,
            month: currentMonth,
          },
        },
        select: { id: true },
      });

      for (const budget of budgets) {
        for (const line of budget.lines) {
          linesProcessed++;

          const budgetAmount = Number(line.amount);
          if (budgetAmount <= 0) continue; // skip zero-budget lines

          // Sum actual debit postings for this account code in the current
          // period. If the accounting period doesn't exist yet, actuals = 0.
          let actualAmount = 0;

          if (accountingPeriod) {
            const aggregate = await this.prisma.journalEntryLine.aggregate({
              _sum: { amountIqd: true },
              where: {
                accountCode: line.accountCode,
                side: 'debit',
                ...(line.costCenterId ? { costCenterId: line.costCenterId } : {}),
                journalEntry: {
                  companyId: ctx.companyId,
                  periodId: accountingPeriod.id,
                  status: 'posted',
                },
              },
            });
            actualAmount = Number(aggregate._sum.amountIqd ?? 0);
          }

          const ratio = actualAmount / budgetAmount;

          // Find the highest threshold crossed (thresholds are in descending order).
          const crossed = THRESHOLDS.find((t) => ratio >= t.pct);
          if (!crossed) continue; // below 80% — nothing to raise

          // Skip if we already alerted at this threshold band (or higher) to
          // avoid flooding. lastAlertedThreshold stores the last band we alerted
          // (e.g. 80, 100, 120). Only alert if crossed.band > lastAlertedThreshold.
          if (crossed.band <= line.lastAlertedThreshold) continue;

          const pctDisplay  = Math.round(ratio * 100);
          const accountLabel = line.costCenterId
            ? `${line.accountCode} / مركز تكلفة ${line.costCenterId}`
            : line.accountCode;

          await this.engine.raiseException({
            jobId: this.meta.id,
            domain: 'finance',
            companyId: ctx.companyId,
            severity: crossed.severity,
            title: `انحراف ميزانية — ${budget.name}: ${accountLabel} وصل ${pctDisplay}%`,
            description:
              `الفعلي ${actualAmount.toLocaleString()} د.ع مقابل الميزانية ${budgetAmount.toLocaleString()} د.ع (${pctDisplay}%) ` +
              `— الحساب: ${line.accountCode}، الميزانية: ${budget.name}.`,
            suggestedAction:
              crossed.band >= 100
                ? 'راجع الإنفاق الفعلي وتأكد من التزام الأقسام بالميزانية'
                : 'تابع الإنفاق — اقترب من سقف الميزانية',
            payload: {
              budgetId: budget.id,
              budgetLineId: line.id,
              accountCode: line.accountCode,
              costCenterId: line.costCenterId ?? null,
              budgetAmount,
              actualAmount,
              ratioPercent: pctDisplay,
              thresholdBand: crossed.band,
            },
          });

          // Update lastAlertedThreshold to suppress re-alerts in the same band.
          await this.prisma.budgetLine.update({
            where: { id: line.id },
            data: { lastAlertedThreshold: crossed.band },
          });

          exceptionsRaised++;
          this.logger.warn(
            `[T71] budget-variance-scan: budget=${budget.id} line=${line.id} ratio=${pctDisplay}% band=${crossed.band}`,
          );
        }
      }

      return {
        status: exceptionsRaised > 0 ? 'exception_raised' : 'completed',
        itemsProcessed: linesProcessed,
        exceptionsRaised,
        details: {
          year: currentYear,
          month: currentMonth,
          budgetsScanned: budgets.length,
        },
      };
    } catch (err) {
      this.logger.error(
        `[T71] budget-variance-scan failed for company=${ctx.companyId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return {
        status: 'failed',
        itemsProcessed: linesProcessed,
        exceptionsRaised: 0,
        details: {
          error: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }
}
