import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AutopilotEngineService } from '../autopilot.service';
import {
  AutopilotJob,
  AutopilotJobContext,
  AutopilotJobMeta,
  AutopilotJobResult,
} from '../autopilot.types';

const LOOKBACK_DAYS = 90;
const MIN_CO_PURCHASES = 5;
const MAX_PAIRS = 10;

/** Event-driven — finds product pairs frequently bought together in the last 90 days. */
@Injectable()
export class SalesCrossSellSuggesterJob implements AutopilotJob {
  private readonly logger = new Logger(SalesCrossSellSuggesterJob.name);

  readonly meta: AutopilotJobMeta = {
    id: 'sales.cross-sell-suggester',
    domain: 'sales',
    schedule: 'event-driven',
    companyScoped: true,
    titleAr: 'مقترحات البيع المتقاطع',
    titleEn: 'Cross-sell Suggester',
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: AutopilotEngineService,
  ) {}

  async execute(ctx: AutopilotJobContext): Promise<AutopilotJobResult> {
    const { companyId } = ctx;
    const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000);

    type PairRow = { variantA: string; variantB: string; cnt: bigint };
    let pairs: PairRow[] = [];
    try {
      pairs = await this.prisma.$queryRaw<PairRow[]>`
        SELECT a."variantId" AS "variantA", b."variantId" AS "variantB", COUNT(*) AS cnt
        FROM   sales_invoice_lines a
        JOIN   sales_invoice_lines b ON a."invoiceId" = b."invoiceId" AND a."variantId" < b."variantId"
        JOIN   sales_invoices i ON i.id = a."invoiceId"
        WHERE  i."companyId" = ${companyId}
          AND  i."createdAt" >= ${since}
          AND  i.status = 'posted'
        GROUP  BY a."variantId", b."variantId"
        HAVING COUNT(*) >= ${MIN_CO_PURCHASES}
        ORDER  BY cnt DESC
        LIMIT  ${MAX_PAIRS}
      `;
    } catch (err) {
      this.logger.error(`[${this.meta.id}] ${err instanceof Error ? err.message : String(err)}`);
      return { status: 'failed', itemsProcessed: 0, exceptionsRaised: 0, details: { reason: 'db_error' } };
    }

    if (pairs.length === 0) {
      return { status: 'no_op', itemsProcessed: 0, exceptionsRaised: 0 };
    }

    const summary = pairs
      .map((p) => `${p.variantA.slice(-6)}+${p.variantB.slice(-6)}: ${p.cnt}x`)
      .join(', ');

    await this.engine.raiseException({
      jobId: this.meta.id, domain: 'sales', companyId, severity: 'low',
      title: 'مقترحات بيع متقاطع',
      description: `أبرز ${pairs.length} زوج منتجات يُشترى معاً (${LOOKBACK_DAYS} يوم): ${summary}`,
      suggestedAction: 'دراسة إنشاء باقات مجمّعة أو عروض Buy X Get Y',
      payload: { pairs: pairs.map((p) => ({ a: p.variantA, b: p.variantB, count: Number(p.cnt) })) },
    });

    return {
      status: 'exception_raised',
      itemsProcessed: pairs.length,
      exceptionsRaised: 1,
      details: { pairsFound: pairs.length },
    };
  }
}