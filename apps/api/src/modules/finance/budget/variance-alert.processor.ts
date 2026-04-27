import { Process, Processor, InjectQueue } from '@nestjs/bull';
import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import type { Queue } from 'bull';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { VarianceService } from './variance.service';
import { NotificationsService } from '../../../platform/notifications/notifications.service';

export const BUDGET_VARIANCE_QUEUE = 'budget-variance-alerts';
export const BUDGET_VARIANCE_JOB = 'scan';

/**
 * T49 — Variance Alert Processor
 *
 * Runs daily (BullMQ repeatable job, configured at module init). For every
 * active budget, walks each line and computes the current-month utilization.
 * If the line crosses a higher threshold band (80% / 100% / 120%) since the
 * last alert, fires a notification and bumps `lastAlertedThreshold`.
 *
 * Notifications go through {@link NotificationsService} when available; if
 * the dependency isn't wired (legacy bootstraps, tests) we fall back to a
 * structured log line so the cron is still observable.
 */
@Injectable()
@Processor(BUDGET_VARIANCE_QUEUE)
export class VarianceAlertProcessor implements OnModuleInit {
  private readonly logger = new Logger(VarianceAlertProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly variance: VarianceService,
    @InjectQueue(BUDGET_VARIANCE_QUEUE) private readonly queue: Queue,
    @Optional() private readonly notifications?: NotificationsService,
  ) {}

  /**
   * Schedule a daily repeatable job at 06:00 UTC. Idempotent: if the same
   * repeat key already exists, BullMQ deduplicates.
   */
  async onModuleInit(): Promise<void> {
    try {
      await this.queue.add(
        BUDGET_VARIANCE_JOB,
        {},
        {
          repeat: { cron: '0 6 * * *' },
          removeOnComplete: true,
          removeOnFail: 50,
          jobId: 'budget-variance-daily',
        },
      );
      this.logger.log('Budget variance alert cron scheduled (06:00 UTC daily)');
    } catch (err) {
      this.logger.warn(`Failed to schedule budget variance cron: ${err}`);
    }
  }

  @Process(BUDGET_VARIANCE_JOB)
  async run(): Promise<{ scanned: number; alerted: number }> {
    const now = new Date();
    const currentMonth = now.getUTCMonth() + 1;
    const currentYear = now.getUTCFullYear();

    const activeBudgets = await this.prisma.budget.findMany({
      where: { status: 'active', fiscalYear: currentYear },
      include: { lines: { where: { period: currentMonth } } },
    });

    let alerted = 0;
    for (const b of activeBudgets) {
      for (const line of b.lines) {
        const actual = await this.variance.computeActual(
          b.companyId,
          b.fiscalYear,
          line.period,
          line.accountCode,
          line.costCenterId,
        );
        const budgetN = Number(line.amount.toString());
        if (budgetN === 0) continue;
        const pct = (Number(actual) / budgetN) * 100;
        const band = this.variance.band(pct);

        if (band > line.lastAlertedThreshold) {
          await this.fireAlert(b, line, pct, band);
          await this.prisma.budgetLine.update({
            where: { id: line.id },
            data: { lastAlertedThreshold: band },
          });
          alerted++;
        }
      }
    }
    this.logger.log(
      `Variance scan: ${activeBudgets.length} budgets, ${alerted} new alerts`,
    );
    return { scanned: activeBudgets.length, alerted };
  }

  private async fireAlert(
    budget: { id: string; companyId: string; createdBy: string; name: string },
    line: { accountCode: string; costCenterId: string | null; period: number },
    pct: number,
    band: number,
  ): Promise<void> {
    const title = `تنبيه موازنة: ${budget.name}`;
    const body =
      `الحساب ${line.accountCode}` +
      (line.costCenterId ? ` (مركز ${line.costCenterId})` : '') +
      ` بلغ ${pct.toFixed(0)}% من الموازنة المخصصة للشهر ${line.period}.`;

    if (this.notifications) {
      try {
        await this.notifications.dispatch({
          companyId: budget.companyId,
          userId: budget.createdBy,
          eventType: 'budget.threshold',
          title,
          body,
          data: {
            budgetId: budget.id,
            accountCode: line.accountCode,
            costCenterId: line.costCenterId,
            period: line.period,
            band,
            pct: Number(pct.toFixed(2)),
          },
        });
        return;
      } catch (err) {
        this.logger.warn(`NotificationsService.dispatch failed: ${err}`);
      }
    }
    // Fallback: structured log
    this.logger.warn(
      `[BUDGET_THRESHOLD ${band}%] budget=${budget.id} account=${line.accountCode} ` +
        `cc=${line.costCenterId ?? '-'} period=${line.period} pct=${pct.toFixed(2)}`,
    );
  }
}
