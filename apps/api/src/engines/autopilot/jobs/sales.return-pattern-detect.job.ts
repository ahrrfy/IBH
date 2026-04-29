import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AutopilotEngineService } from '../autopilot.service';
import {
  AutopilotJob,
  AutopilotJobContext,
  AutopilotJobMeta,
  AutopilotJobResult,
} from '../autopilot.types';

const LOOKBACK_DAYS = 30;
const HIGH_RETURN_THRESHOLD = 3;

/** Monday 05:00 — detect customers with abnormally high return frequency. */
@Injectable()
export class SalesReturnPatternDetectJob implements AutopilotJob {
  private readonly logger = new Logger(SalesReturnPatternDetectJob.name);

  readonly meta: AutopilotJobMeta = {
    id: 'sales.return-pattern-detect',
    domain: 'sales',
    schedule: '0 5 * * 1',
    companyScoped: true,
    titleAr: 'كشف أنماط الإرجاع المريبة',
    titleEn: 'Return Pattern Detect',
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: AutopilotEngineService,
  ) {}

  async execute(ctx: AutopilotJobContext): Promise<AutopilotJobResult> {
    const { companyId } = ctx;
    const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000);
    let exceptionsRaised = 0;

    type Row = { customerId: string; _count: { _all: number } };
    let rows: Row[] = [];
    try {
      rows = await (this.prisma.salesReturn as any).groupBy({
        by: ['customerId'],
        where: { companyId, createdAt: { gte: since } },
        _count: { _all: true },
        having: { _count: { _all: { gte: HIGH_RETURN_THRESHOLD } } },
        orderBy: [{ customerId: 'asc' }],
      });
    } catch (err) {
      this.logger.error(`[${this.meta.id}] ${err instanceof Error ? err.message : String(err)}`);
      return { status: 'failed', itemsProcessed: 0, exceptionsRaised: 0, details: { reason: 'db_error' } };
    }

    for (const r of rows) {
      await this.engine.raiseException({
        jobId: this.meta.id, domain: 'sales', companyId,
        severity: r._count._all >= 5 ? 'high' : 'medium',
        title: 'نمط إرجاع غير طبيعي',
        description: `العميل قدّم ${r._count._all} مرتجعات خلال ${LOOKBACK_DAYS} يوم`,
        suggestedAction: 'مراجعة سجل مرتجعات العميل والتحقق من سبب التكرار',
        payload: { customerId: r.customerId, returnCount: r._count._all, days: LOOKBACK_DAYS },
      });
      exceptionsRaised++;
    }

    return {
      status: exceptionsRaised > 0 ? 'exception_raised' : 'no_op',
      itemsProcessed: rows.length,
      exceptionsRaised,
      details: { since: since.toISOString(), threshold: HIGH_RETURN_THRESHOLD },
    };
  }
}