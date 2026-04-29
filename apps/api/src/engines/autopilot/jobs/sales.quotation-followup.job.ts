import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AutopilotEngineService } from '../autopilot.service';
import {
  AutopilotJob,
  AutopilotJobContext,
  AutopilotJobMeta,
  AutopilotJobResult,
} from '../autopilot.types';

// ─── T71 Job: sales.quotation-followup ──────────────────────────────────────
// Cron: 09:00 UTC daily.
// Goal: Flag quotations in 'sent' or 'draft' status whose validity (validUntil)
// expires within the next 3 days, prompting the sales rep to follow up.
//
// The Quotation model uses `validUntil` (not expiresAt) as the expiry date.
// A quotation is flagged if:
//   - status IN ('sent', 'draft')
//   - validUntil is between NOW and NOW + 3 days
//
// One warning exception is raised per qualifying quotation.

const EXPIRY_WARNING_DAYS = 3;
const FLAGGABLE_STATUSES = ['sent', 'draft'];

@Injectable()
export class SalesQuotationFollowupJob implements AutopilotJob {
  private readonly logger = new Logger(SalesQuotationFollowupJob.name);

  readonly meta: AutopilotJobMeta = {
    id: 'sales.quotation-followup',
    domain: 'sales',
    schedule: '0 9 * * *',
    companyScoped: true,
    titleAr: 'متابعة عروض الأسعار',
    titleEn: 'Quotation Follow-up',
    description:
      'Daily 09:00 sweep — flags sent/draft quotations expiring within 3 days ' +
      'with no conversion so reps can follow up in time.',
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: AutopilotEngineService,
  ) {}

  async execute(ctx: AutopilotJobContext): Promise<AutopilotJobResult> {
    const now = new Date();
    const expiryWindowEnd = new Date(
      now.getTime() + EXPIRY_WARNING_DAYS * 24 * 60 * 60 * 1000,
    );

    // Quotations expiring soon that have NOT been converted.
    const expiringQuotations = await this.prisma.quotation.findMany({
      where: {
        companyId: ctx.companyId,
        status: { in: FLAGGABLE_STATUSES as any[] },
        validUntil: {
          gte: now,
          lte: expiryWindowEnd,
        },
        convertedToOrderId: null, // not yet converted
      },
      select: {
        id: true,
        number: true,
        validUntil: true,
        totalIqd: true,
        customer: { select: { nameAr: true } },
        createdBy: true,
      },
      take: 500,
      orderBy: { validUntil: 'asc' }, // most urgent first
    });

    if (expiringQuotations.length === 0) {
      return {
        status: 'no_op',
        itemsProcessed: 0,
        exceptionsRaised: 0,
        details: { message: 'No expiring quotations found.' },
      };
    }

    let exceptionsRaised = 0;

    for (const quotation of expiringQuotations) {
      const daysUntilExpiry = Math.ceil(
        (quotation.validUntil.getTime() - now.getTime()) / 86_400_000,
      );

      try {
        await this.engine.raiseException({
          jobId: this.meta.id,
          domain: 'sales',
          companyId: ctx.companyId,
          severity: 'medium',
          title: `عرض سعر منتهٍ قريباً — ${quotation.number}`,
          description:
            `عرض سعر ${quotation.number} ينتهي خلال ${daysUntilExpiry} يوم — لا متابعة` +
            ` (${quotation.customer.nameAr} — ${Number(quotation.totalIqd).toLocaleString()} د.ع)`,
          suggestedAction:
            'الاتصال بالعميل لمتابعة عرض السعر أو تجديد صلاحيته',
          payload: {
            quotationId: quotation.id,
            quotationNumber: quotation.number,
            customerName: quotation.customer.nameAr,
            validUntil: quotation.validUntil.toISOString(),
            daysUntilExpiry,
            totalIqd: Number(quotation.totalIqd),
            createdBy: quotation.createdBy,
          },
        });
        exceptionsRaised++;
      } catch (err) {
        this.logger.warn(
          `[sales.quotation-followup] raiseException failed for quotation=${quotation.id}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    this.logger.log(
      `[sales.quotation-followup] company=${ctx.companyId} — flagged ${exceptionsRaised} expiring quotations`,
    );

    return {
      status: exceptionsRaised > 0 ? 'exception_raised' : 'no_op',
      itemsProcessed: expiringQuotations.length,
      exceptionsRaised,
      details: { expiringQuotationsFound: expiringQuotations.length },
    };
  }
}
