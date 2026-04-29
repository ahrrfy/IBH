import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AutopilotEngineService } from '../autopilot.service';
import {
  AutopilotJob,
  AutopilotJobContext,
  AutopilotJobMeta,
  AutopilotJobResult,
} from '../autopilot.types';

// ─── T71 Job: crm.silent-churn-alert ────────────────────────────────────────
// Cron: 09:00 UTC Mondays.
// Goal: Detect high-value customers (rfmSegment = 'Champion' or 'Loyal') who
// have not placed an order in the last 90 days — "silent churn" — and raise
// a warning exception per customer so account managers can intervene.
//
// The Customer model carries rfmRecencyDays (days since last posted invoice)
// computed by the nightly RFM job (T44). We query customers whose
// rfmRecencyDays > 90 AND rfmSegment IN ('Champion','Loyal') rather than
// relying on lastOrderAt (which does not exist on the Customer model).
//
// If rfmRecencyDays is NULL (RFM not yet computed), the customer is skipped
// to avoid false positives.

const AT_RISK_SEGMENTS = ['Champion', 'Loyal'];
const CHURN_THRESHOLD_DAYS = 90;
const MAX_EXCEPTIONS_PER_RUN = 300;

@Injectable()
export class CrmSilentChurnAlertJob implements AutopilotJob {
  private readonly logger = new Logger(CrmSilentChurnAlertJob.name);

  readonly meta: AutopilotJobMeta = {
    id: 'crm.silent-churn-alert',
    domain: 'crm',
    schedule: '0 9 * * 1',
    companyScoped: true,
    titleAr: 'تنبيه الفقدان الصامت',
    titleEn: 'Silent Churn Alert',
    description:
      'Monday 09:00 sweep — detects Champion/Loyal customers with no purchase ' +
      'in 90+ days and raises a warning exception per customer.',
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: AutopilotEngineService,
  ) {}

  async execute(ctx: AutopilotJobContext): Promise<AutopilotJobResult> {
    // Query customers that were high-value but have gone silent.
    // rfmRecencyDays is computed nightly; skip customers where it is NULL.
    const silentCustomers = await this.prisma.customer.findMany({
      where: {
        companyId: ctx.companyId,
        rfmSegment: { in: AT_RISK_SEGMENTS },
        rfmRecencyDays: { gt: CHURN_THRESHOLD_DAYS },
        isActive: true,
        deletedAt: null,
      },
      select: {
        id: true,
        nameAr: true,
        rfmSegment: true,
        rfmRecencyDays: true,
      },
      take: MAX_EXCEPTIONS_PER_RUN,
      orderBy: { rfmRecencyDays: 'desc' }, // worst offenders first
    });

    if (silentCustomers.length === 0) {
      return {
        status: 'no_op',
        itemsProcessed: 0,
        exceptionsRaised: 0,
        details: { message: 'No silent-churn customers found.' },
      };
    }

    let exceptionsRaised = 0;

    for (const customer of silentCustomers) {
      const daysSince = customer.rfmRecencyDays ?? CHURN_THRESHOLD_DAYS;
      const segment = customer.rfmSegment ?? '';

      try {
        await this.engine.raiseException({
          jobId: this.meta.id,
          domain: 'crm',
          companyId: ctx.companyId,
          severity: 'medium',
          title: `فقدان صامت — ${customer.nameAr}`,
          description:
            `عميل ${customer.nameAr} — لا مشتريات منذ ${daysSince} يوم (كان ${segment})`,
          suggestedAction:
            'التواصل مع العميل وتقديم عرض خاص لاسترداد الولاء',
          payload: {
            customerId: customer.id,
            customerName: customer.nameAr,
            rfmSegment: segment,
            daysSinceLastOrder: daysSince,
          },
        });
        exceptionsRaised++;
      } catch (err) {
        this.logger.warn(
          `[crm.silent-churn-alert] raiseException failed for customer=${customer.id}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    this.logger.log(
      `[crm.silent-churn-alert] company=${ctx.companyId} — raised ${exceptionsRaised} silent-churn warnings`,
    );

    return {
      status: exceptionsRaised > 0 ? 'exception_raised' : 'no_op',
      itemsProcessed: silentCustomers.length,
      exceptionsRaised,
      details: { silentChurnCustomers: silentCustomers.length },
    };
  }
}
