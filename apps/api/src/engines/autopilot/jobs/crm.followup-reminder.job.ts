import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AutopilotEngineService } from '../autopilot.service';
import {
  AutopilotJob,
  AutopilotJobContext,
  AutopilotJobMeta,
  AutopilotJobResult,
} from '../autopilot.types';

// ─── T71 Job: crm.followup-reminder ─────────────────────────────────────────
// Cron: 08:00 UTC daily.
// Goal: Raise an info-severity exception for every open lead that has gone
// ≥ 7 days since its last activity, prompting the assigned sales rep to
// follow up before the lead goes cold.
//
// "Overdue" definition: lead.updatedAt is used as a proxy for last interaction
// since Lead does not carry a dedicated nextFollowUpAt column.  A lead is
// considered overdue if updatedAt < NOW() - 7 days AND the lead is still open
// (status NOT IN converted | lost | closed).
//
// Produces one info-exception per overdue lead, capped at 200 per run to avoid
// flooding the exceptions inbox on neglected CRM data.

const OPEN_LEAD_STATUSES_EXCLUDED = ['converted', 'lost', 'closed'];
const OVERDUE_THRESHOLD_DAYS = 7;
const MAX_EXCEPTIONS_PER_RUN = 200;

@Injectable()
export class CrmFollowupReminderJob implements AutopilotJob {
  private readonly logger = new Logger(CrmFollowupReminderJob.name);

  readonly meta: AutopilotJobMeta = {
    id: 'crm.followup-reminder',
    domain: 'crm',
    schedule: '0 8 * * *',
    companyScoped: true,
    titleAr: 'تذكير المتابعات المعلقة',
    titleEn: 'Follow-up Reminder',
    description:
      'Daily 08:00 sweep — raises an info exception for every open lead ' +
      'with no activity in the last 7 days.',
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: AutopilotEngineService,
  ) {}

  async execute(ctx: AutopilotJobContext): Promise<AutopilotJobResult> {
    const now = new Date();
    const overdueCutoff = new Date(
      now.getTime() - OVERDUE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000,
    );

    // Find open leads not updated in the last 7 days.
    const overdueLeads = await this.prisma.lead.findMany({
      where: {
        companyId: ctx.companyId,
        status: { notIn: OPEN_LEAD_STATUSES_EXCLUDED as any[] },
        updatedAt: { lt: overdueCutoff },
      },
      select: {
        id: true,
        nameAr: true,
        updatedAt: true,
        assignedTo: true,
      },
      take: MAX_EXCEPTIONS_PER_RUN,
      orderBy: { updatedAt: 'asc' }, // oldest overdue first
    });

    if (overdueLeads.length === 0) {
      return {
        status: 'no_op',
        itemsProcessed: 0,
        exceptionsRaised: 0,
        details: { message: 'No overdue leads found.' },
      };
    }

    let exceptionsRaised = 0;

    for (const lead of overdueLeads) {
      const daysSinceUpdate = Math.floor(
        (now.getTime() - lead.updatedAt.getTime()) / 86_400_000,
      );

      try {
        await this.engine.raiseException({
          jobId: this.meta.id,
          domain: 'crm',
          companyId: ctx.companyId,
          severity: 'low',
          title: `متابعة متأخرة — ${lead.nameAr}`,
          description: `متابعة متأخرة — ${lead.nameAr} — منذ ${daysSinceUpdate} يوم`,
          suggestedAction: 'مراجعة العميل المحتمل وإضافة نشاط متابعة',
          payload: {
            leadId: lead.id,
            leadName: lead.nameAr,
            daysSinceUpdate,
            assignedTo: lead.assignedTo ?? null,
          },
        });
        exceptionsRaised++;
      } catch (err) {
        this.logger.warn(
          `[crm.followup-reminder] raiseException failed for lead=${lead.id}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    this.logger.log(
      `[crm.followup-reminder] company=${ctx.companyId} — raised ${exceptionsRaised} follow-up reminders`,
    );

    return {
      status: exceptionsRaised > 0 ? 'exception_raised' : 'no_op',
      itemsProcessed: overdueLeads.length,
      exceptionsRaised,
      details: { overdueLeadsFound: overdueLeads.length },
    };
  }
}
