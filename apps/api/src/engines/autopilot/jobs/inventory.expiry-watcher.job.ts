import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AutopilotEngineService } from '../autopilot.service';
import {
  AutopilotJob,
  AutopilotJobContext,
  AutopilotJobMeta,
  AutopilotJobResult,
} from '../autopilot.types';

// ─── inventory.expiry-watcher ────────────────────────────────────────────────
// Cron: 06:00 daily.
// Goal: scan GRN lines for batches expiring within 60 days and raise
// severity-graded exceptions so warehouse staff can act before goods expire.
//
// Severity tiers (from GRN batch expiryDate):
//   - expired (daysToExpiry <= 0)   → critical
//   - <=14 days                     → critical
//   - <=30 days                     → warning (high)
//   - <=60 days                     → info (low)
//
// One exception per variant (groups multiple batches of the same variant
// to avoid notification flood).

@Injectable()
export class InventoryExpiryWatcherJob implements AutopilotJob {
  private readonly logger = new Logger(InventoryExpiryWatcherJob.name);

  readonly meta: AutopilotJobMeta = {
    id: 'inventory.expiry-watcher',
    domain: 'inventory',
    schedule: '0 6 * * *',
    companyScoped: true,
    titleAr: 'مراقبة المنتجات منتهية الصلاحية',
    titleEn: 'Expiry Watcher',
    description:
      'Daily 06:00 — scans GRN batch expiry dates; raises critical/warning/info exceptions for batches expiring within 60 days.',
  };

  constructor(
    private readonly db: PrismaService,
    private readonly engine: AutopilotEngineService,
  ) {}

  async execute(ctx: AutopilotJobContext): Promise<AutopilotJobResult> {
    const now = new Date();
    const horizon = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000); // +60 days

    // ── 1. Fetch all expiring GRN lines for this company ────────────────────
    const expiringLines = await this.db.gRNLine.findMany({
      where: {
        expiryDate: {
          not: null,
          lte: horizon,
        },
        grn: {
          companyId: ctx.companyId,
          status: { in: ['accepted', 'partially_accepted'] },
        },
      },
      select: {
        variantId: true,
        expiryDate: true,
        batchNumber: true,
        qtyAccepted: true,
        grn: {
          select: {
            warehouseId: true,
            supplierId: true,
          },
        },
      },
    });

    if (expiringLines.length === 0) {
      return { status: 'no_op', itemsProcessed: 0, exceptionsRaised: 0 };
    }

    // ── 2. Group by variantId: earliest expiry + batch count ────────────────
    type VariantExpiry = {
      batchCount: number;
      earliestExpiry: Date;
      warehouseIds: Set<string>;
    };
    const byVariant = new Map<string, VariantExpiry>();

    for (const line of expiringLines) {
      const expiry = line.expiryDate as Date;
      const existing = byVariant.get(line.variantId);
      if (existing) {
        existing.batchCount++;
        if (expiry < existing.earliestExpiry) {
          existing.earliestExpiry = expiry;
        }
        existing.warehouseIds.add(line.grn.warehouseId);
      } else {
        byVariant.set(line.variantId, {
          batchCount: 1,
          earliestExpiry: expiry,
          warehouseIds: new Set([line.grn.warehouseId]),
        });
      }
    }

    // ── 3. Resolve variant names (batch query) ───────────────────────────────
    const variantIds = [...byVariant.keys()];
    const variants = await this.db.productVariant.findMany({
      where: { id: { in: variantIds } },
      select: {
        id: true,
        sku: true,
        template: { select: { nameAr: true, nameEn: true } },
      },
    });
    const variantMap = new Map(variants.map((v) => [v.id, v]));

    // ── 4. Raise one exception per variant ──────────────────────────────────
    let exceptionsRaised = 0;

    for (const [variantId, info] of byVariant.entries()) {
      const msRemaining = info.earliestExpiry.getTime() - now.getTime();
      const daysToExpiry = Math.floor(msRemaining / (24 * 60 * 60 * 1000));

      const variantInfo = variantMap.get(variantId);
      const productName =
        variantInfo?.template?.nameAr ??
        variantInfo?.sku ??
        variantId;

      let severity: 'critical' | 'high' | 'low';
      let title: string;
      let description: string;

      if (daysToExpiry <= 0) {
        severity = 'critical';
        title = `مخزون منتهي الصلاحية — ${productName}`;
        description = `${info.batchCount} دفعة انتهت صلاحيتها — يجب سحبها من المخزون فوراً.`;
      } else if (daysToExpiry <= 14) {
        severity = 'critical';
        title = `انتهاء صلاحية وشيك — ${productName}`;
        description = `${info.batchCount} دفعة تنتهي صلاحيتها خلال ${daysToExpiry} يوم.`;
      } else if (daysToExpiry <= 30) {
        severity = 'high';
        title = `تنبيه صلاحية — ${productName}`;
        description = `${info.batchCount} دفعة تنتهي صلاحيتها خلال ${daysToExpiry} يوم.`;
      } else {
        severity = 'low';
        title = `إشعار صلاحية — ${productName}`;
        description = `${info.batchCount} دفعة تنتهي صلاحيتها خلال ${daysToExpiry} يوم.`;
      }

      try {
        await this.engine.raiseException({
          jobId: this.meta.id,
          domain: 'inventory',
          companyId: ctx.companyId,
          severity,
          title,
          description,
          suggestedAction:
            daysToExpiry <= 0
              ? 'سحب المخزون منتهي الصلاحية وتوثيق الإتلاف'
              : 'تقديم المبيعات أو تخفيض السعر لتصريف المخزون المقترب من الانتهاء',
          payload: {
            variantId,
            sku: variantInfo?.sku,
            batchCount: info.batchCount,
            daysToExpiry,
            earliestExpiry: info.earliestExpiry.toISOString(),
            warehouseIds: [...info.warehouseIds],
          },
        });
        exceptionsRaised++;
      } catch (err) {
        this.logger.error(
          `[expiry-watcher] failed to raise exception for variant=${variantId}`,
          err instanceof Error ? err.stack : String(err),
        );
      }
    }

    this.logger.log(
      `[expiry-watcher] company=${ctx.companyId} — ${byVariant.size} variants scanned, ${exceptionsRaised} exceptions raised`,
    );

    return {
      status: exceptionsRaised > 0 ? 'exception_raised' : 'no_op',
      itemsProcessed: byVariant.size,
      exceptionsRaised,
      details: {
        totalBatchLines: expiringLines.length,
        variantsWithExpiryIssues: byVariant.size,
      },
    };
  }
}
