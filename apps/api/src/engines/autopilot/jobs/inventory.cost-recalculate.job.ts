import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AutopilotEngineService } from '../autopilot.service';
import {
  AutopilotJob,
  AutopilotJobContext,
  AutopilotJobMeta,
  AutopilotJobResult,
} from '../autopilot.types';

const SAMPLE_LIMIT = 200;
const TOLERANCE_IQD = 0.01;

/**
 * Daily 02:00 — F3 defense: verify ProductVariant.avgCostIqd matches the MWA
 * derived from StockLedger IN entries. Flags variants where the stored cost
 * deviates by more than 0.01 IQD.
 */
@Injectable()
export class InventoryCostRecalculateJob implements AutopilotJob {
  private readonly logger = new Logger(InventoryCostRecalculateJob.name);

  readonly meta: AutopilotJobMeta = {
    id: 'inventory.cost-recalculate',
    domain: 'inventory',
    schedule: '0 2 * * *',
    companyScoped: true,
    titleAr: 'إعادة احتساب متوسط التكلفة',
    titleEn: 'MWA Cost Recalculate',
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: AutopilotEngineService,
  ) {}

  async execute(ctx: AutopilotJobContext): Promise<AutopilotJobResult> {
    const { companyId } = ctx;
    let exceptionsRaised = 0;

    let variants: Array<{ id: string; sku: string; avgCostIqd: unknown }> = [];
    try {
      variants = await this.prisma.productVariant.findMany({
        where: { companyId, isActive: true, deletedAt: null, avgCostIqd: { gt: 0 } },
        select: { id: true, sku: true, avgCostIqd: true },
        take: SAMPLE_LIMIT,
      });
    } catch (err) {
      this.logger.error(`[${this.meta.id}] ${err instanceof Error ? err.message : String(err)}`);
      return { status: 'failed', itemsProcessed: 0, exceptionsRaised: 0, details: { reason: 'db_error' } };
    }

    if (variants.length === 0) {
      return { status: 'no_op', itemsProcessed: 0, exceptionsRaised: 0 };
    }

    for (const v of variants) {
      const ledger = await this.prisma.stockLedgerEntry.findMany({
        where: { companyId, variantId: v.id, qtyChange: { gt: 0 } },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { qtyChange: true, unitCostIqd: true },
      });

      let runningQty = 0;
      let runningValue = 0;
      for (const row of ledger) {
        const qty  = Number(row.qtyChange);
        const cost = Number(row.unitCostIqd ?? 0);
        runningQty   += qty;
        runningValue += qty * cost;
      }

      const computedMwa = runningQty > 0 ? runningValue / runningQty : 0;
      const stored = Number(v.avgCostIqd);
      const diff   = Math.abs(computedMwa - stored);

      if (diff > TOLERANCE_IQD && computedMwa > 0) {
        await this.engine.raiseException({
          jobId: this.meta.id, domain: 'inventory', companyId,
          severity: diff > 1000 ? 'high' : 'medium',
          title: 'انحراف في متوسط التكلفة',
          description: `SKU ${v.sku}: avgCostIqd المخزن ${stored.toFixed(3)} يختلف عن المحسوب ${computedMwa.toFixed(3)} (فرق ${diff.toFixed(3)} د.ع)`,
          suggestedAction: 'مراجعة سجل المخزون وإعادة احتساب المتوسط يدوياً',
          payload: { variantId: v.id, sku: v.sku, stored, computed: computedMwa, diff },
        });
        exceptionsRaised++;
      }
    }

    return {
      status: exceptionsRaised > 0 ? 'exception_raised' : 'completed',
      itemsProcessed: variants.length,
      exceptionsRaised,
      details: { sampled: variants.length, drifted: exceptionsRaised },
    };
  }
}