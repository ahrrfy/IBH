import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AutopilotEngineService } from '../autopilot.service';
import {
  AutopilotJob,
  AutopilotJobContext,
  AutopilotJobMeta,
  AutopilotJobResult,
} from '../autopilot.types';

const DORMANT_DAYS = 90;

/** Sunday 11:00 — flag customers with no invoice in last 90 days. */
@Injectable()
export class SalesDormantCustomerReviveJob implements AutopilotJob {
  private readonly logger = new Logger(SalesDormantCustomerReviveJob.name);

  readonly meta: AutopilotJobMeta = {
    id: 'sales.dormant-customer-revive',
    domain: 'sales',
    schedule: '0 11 * * 0',
    companyScoped: true,
    titleAr: 'تنبيه العملاء غير النشطين',
    titleEn: 'Dormant Customer Revive',
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: AutopilotEngineService,
  ) {}

  async execute(ctx: AutopilotJobContext): Promise<AutopilotJobResult> {
    const { companyId } = ctx;
    const cutoff = new Date(Date.now() - DORMANT_DAYS * 86_400_000);
    let exceptionsRaised = 0;

    let dormant: Array<{ id: string; nameAr: string; phone: string | null }> = [];
    try {
      dormant = await this.prisma.customer.findMany({
        where: {
          companyId,
          deletedAt: null,
          isActive: true,
          salesInvoices: {
            some: { createdAt: { lt: cutoff } },
            none: { createdAt: { gte: cutoff } },
          },
        },
        select: { id: true, nameAr: true, phone: true },
        take: 50,
      });
    } catch (err) {
      this.logger.error(`[${this.meta.id}] ${err instanceof Error ? err.message : String(err)}`);
      return { status: 'failed', itemsProcessed: 0, exceptionsRaised: 0, details: { reason: 'db_error' } };
    }

    for (const c of dormant) {
      await this.engine.raiseException({
        jobId: this.meta.id, domain: 'sales', companyId, severity: 'low',
        title: 'عميل غير نشط منذ فترة طويلة',
        description: `العميل "${c.nameAr}" (${c.phone ?? 'بدون هاتف'}) لم يتسوّق منذ أكثر من ${DORMANT_DAYS} يوم`,
        suggestedAction: 'التواصل مع العميل بعرض خاص أو استطلاع رأي',
        payload: { customerId: c.id, dormantDays: DORMANT_DAYS },
      });
      exceptionsRaised++;
    }

    return {
      status: exceptionsRaised > 0 ? 'exception_raised' : 'no_op',
      itemsProcessed: dormant.length,
      exceptionsRaised,
      details: { dormantCount: dormant.length, thresholdDays: DORMANT_DAYS },
    };
  }
}