import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { NotificationsService } from '../../../platform/notifications/notifications.service';
import { AutopilotEngineService } from '../autopilot.service';
import {
  AutopilotJob,
  AutopilotJobContext,
  AutopilotJobMeta,
  AutopilotJobResult,
} from '../autopilot.types';

// ─── T71 Job: sales.overdue-reminder ────────────────────────────────────────
// Cron: 09:00 daily.
// Goal: nudge the sales rep (createdBy) for every posted invoice whose dueDate
// has passed and the customer balance is still > 0. Skips invoices that
// already had a reminder dispatched in the last 7 days. Raises a HIGH-severity
// exception for invoices that are >30 days overdue AND amount > IQD 5,000,000.

const REMINDER_EVENT_TYPE = 'sales.overdue.reminder';
const REMINDER_COOLDOWN_DAYS = 7;
const HIGH_SEVERITY_DAYS = 30;
const HIGH_SEVERITY_AMOUNT_IQD = 5_000_000;

@Injectable()
export class SalesOverdueReminderJob implements AutopilotJob {
  private readonly logger = new Logger(SalesOverdueReminderJob.name);

  readonly meta: AutopilotJobMeta = {
    id: 'sales.overdue-reminder',
    domain: 'sales',
    schedule: '0 9 * * *',
    companyScoped: true,
    titleAr: 'تذكير الفواتير المتأخرة',
    titleEn: 'Overdue Invoice Reminder',
    description:
      'Daily 09:00 sweep — nudges the rep for every posted invoice past dueDate with outstanding balance.',
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly engine: AutopilotEngineService,
  ) {}

  async execute(ctx: AutopilotJobContext): Promise<AutopilotJobResult> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const cooldownCutoff = new Date(
      today.getTime() - REMINDER_COOLDOWN_DAYS * 24 * 60 * 60 * 1000,
    );
    const highSeverityCutoff = new Date(
      today.getTime() - HIGH_SEVERITY_DAYS * 24 * 60 * 60 * 1000,
    );

    // Pull every posted invoice past due with outstanding balance.
    const overdue = await this.prisma.salesInvoice.findMany({
      where: {
        companyId: ctx.companyId,
        status: 'posted',
        dueDate: { lt: today },
        balanceIqd: { gt: 0 },
      },
      select: {
        id: true,
        number: true,
        customerId: true,
        balanceIqd: true,
        totalIqd: true,
        dueDate: true,
        createdBy: true,
        customer: { select: { nameAr: true } },
      },
      take: 500,
    });

    let processed = 0;
    let exceptionsRaised = 0;

    for (const inv of overdue) {
      // Cooldown — skip if a reminder was already sent for this invoice in
      // the last 7 days. We check the in-app notification log directly.
      const recentReminder = await this.prisma.notification.findFirst({
        where: {
          companyId: ctx.companyId,
          eventType: REMINDER_EVENT_TYPE,
          createdAt: { gte: cooldownCutoff },
          data: { path: ['invoiceId'], equals: inv.id },
        },
        select: { id: true },
      });
      if (recentReminder) continue;

      processed++;
      const balance = Number(inv.balanceIqd);
      const dueDate = inv.dueDate ?? today;
      const overdueDays = Math.max(
        1,
        Math.floor((today.getTime() - dueDate.getTime()) / 86_400_000),
      );

      // Always notify the invoice creator (sales rep).
      try {
        await this.notifications.dispatch({
          companyId: ctx.companyId,
          userId: inv.createdBy,
          eventType: REMINDER_EVENT_TYPE,
          title: `فاتورة متأخرة #${inv.number}`,
          body: `الفاتورة #${inv.number} للعميل ${
            inv.customer?.nameAr ?? ''
          } متأخرة ${overdueDays} يوم — الرصيد ${balance.toLocaleString()} د.ع`,
          data: {
            invoiceId: inv.id,
            customerId: inv.customerId,
            balanceIqd: balance,
            overdueDays,
          },
        });
      } catch (err) {
        this.logger.warn(
          `[T71] dispatch failed for invoice=${inv.id}: ${
            err instanceof Error ? err.message : 'unknown'
          }`,
        );
      }

      // Escalation: raise an exception when overdue is severe.
      if (
        dueDate < highSeverityCutoff &&
        balance > HIGH_SEVERITY_AMOUNT_IQD
      ) {
        await this.engine.raiseException({
          jobId: this.meta.id,
          domain: 'sales',
          companyId: ctx.companyId,
          severity: 'high',
          title: `فاتورة متأخرة جداً #${inv.number}`,
          description: `الفاتورة #${inv.number} متأخرة ${overdueDays} يوم والرصيد ${balance.toLocaleString()} د.ع — مطلوب تدخل يدوي.`,
          suggestedAction: 'مراجعة العميل وتسوية الرصيد أو إرسال إنذار قانوني',
          payload: {
            invoiceId: inv.id,
            customerId: inv.customerId,
            balanceIqd: balance,
            overdueDays,
          },
        });
        exceptionsRaised++;
      }
    }

    return {
      status: exceptionsRaised > 0 ? 'exception_raised' : 'completed',
      itemsProcessed: processed,
      exceptionsRaised,
      details: { totalOverdue: overdue.length },
    };
  }
}
