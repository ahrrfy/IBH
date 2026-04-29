import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AutopilotEngineService } from '../autopilot.service';
import {
  AutopilotJob,
  AutopilotJobContext,
  AutopilotJobMeta,
  AutopilotJobResult,
} from '../autopilot.types';

// ─── T71 Job: finance.bank-reconciliation ───────────────────────────────────
// Cron: 09:00 UTC every Monday.
// Goal: detect bank accounts whose last reconciliation is stale (> 30 days).
// Business rule (F2): unreconciled bank accounts indicate a gap between the
// book balance and the actual bank statement — this must be flagged before
// month-end close. We check `lastReconciledAt` on each BankAccount; if it is
// NULL or older than 30 days we raise a warning.

const STALE_RECONCILIATION_DAYS = 30;

@Injectable()
export class FinanceBankReconciliationJob implements AutopilotJob {
  private readonly logger = new Logger(FinanceBankReconciliationJob.name);

  readonly meta: AutopilotJobMeta = {
    id: 'finance.bank-reconciliation',
    domain: 'finance',
    schedule: '0 9 * * 1',
    companyScoped: true,
    titleAr: 'فحص مطابقة البنوك',
    titleEn: 'Bank Reconciliation Check',
    description:
      'Every Monday 09:00 UTC — flags bank accounts whose reconciliation is more than 30 days stale.',
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: AutopilotEngineService,
  ) {}

  async execute(ctx: AutopilotJobContext): Promise<AutopilotJobResult> {
    const cutoff = new Date(
      ctx.startedAt.getTime() - STALE_RECONCILIATION_DAYS * 24 * 60 * 60 * 1000,
    );

    let accountsChecked = 0;
    let exceptionsRaised = 0;

    try {
      const accounts = await this.prisma.bankAccount.findMany({
        where: {
          companyId: ctx.companyId,
          isActive: true,
        },
        select: {
          id: true,
          bankName: true,
          accountNumber: true,
          lastReconciledAt: true,
        },
      });

      for (const account of accounts) {
        accountsChecked++;

        const isStale =
          account.lastReconciledAt === null ||
          account.lastReconciledAt < cutoff;

        if (!isStale) continue;

        const daysSinceReconciled =
          account.lastReconciledAt === null
            ? null
            : Math.floor(
                (ctx.startedAt.getTime() - account.lastReconciledAt.getTime()) /
                  86_400_000,
              );

        const accountLabel = `${account.bankName} (${account.accountNumber})`;

        await this.engine.raiseException({
          jobId: this.meta.id,
          domain: 'finance',
          companyId: ctx.companyId,
          severity: 'medium',
          title: `حساب بنكي غير مطابق: ${accountLabel}`,
          description:
            account.lastReconciledAt === null
              ? `حساب ${accountLabel} لم يُطابق مطلقاً.`
              : `حساب ${accountLabel} — آخر مطابقة كانت قبل ${daysSinceReconciled} يوم (أكثر من ${STALE_RECONCILIATION_DAYS} يوم).`,
          suggestedAction:
            'افتح وحدة المحاسبة > مطابقة البنوك وأجرِ مطابقة جديدة لهذا الحساب',
          payload: {
            bankAccountId: account.id,
            accountLabel,
            lastReconciledAt: account.lastReconciledAt?.toISOString() ?? null,
            daysSinceReconciled,
          },
        });

        exceptionsRaised++;
        this.logger.warn(
          `[T71] bank-reconciliation: stale account=${account.id} company=${ctx.companyId} daysSince=${daysSinceReconciled ?? 'never'}`,
        );
      }

      return {
        status: exceptionsRaised > 0 ? 'exception_raised' : 'no_op',
        itemsProcessed: accountsChecked,
        exceptionsRaised,
        details: { totalAccounts: accountsChecked },
      };
    } catch (err) {
      this.logger.error(
        `[T71] bank-reconciliation failed for company=${ctx.companyId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return {
        status: 'failed',
        itemsProcessed: accountsChecked,
        exceptionsRaised: 0,
        details: {
          error: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }
}
