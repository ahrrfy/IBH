import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AutopilotEngineService } from '../autopilot.service';
import {
  AutopilotJob,
  AutopilotJobContext,
  AutopilotJobMeta,
  AutopilotJobResult,
} from '../autopilot.types';

// ─── inventory.deadstock-detect ──────────────────────────────────────────────
// Cron: 05:00 Sundays.
// Goal: identify variants that have positive stock (qtyOnHand > 0) but zero
// sales (neither SalesInvoiceLine nor POSReceiptLine) in the last 90 days.
// These are "dead stock" candidates — capital tied up in non-moving goods.
//
// Algorithm:
//   1. Fetch all variants with qtyOnHand > 0 for this company.
//   2. Find the set of variantIds that had sales activity in last 90 days
//      (union of SalesInvoiceLine + POSReceiptLine).
//   3. The difference = dead stock. Raise one 'warning' exception per variant.

@Injectable()
export class InventoryDeadstockDetectJob implements AutopilotJob {
  private readonly logger = new Logger(InventoryDeadstockDetectJob.name);

  readonly meta: AutopilotJobMeta = {
    id: 'inventory.deadstock-detect',
    domain: 'inventory',
    schedule: '0 5 * * 0',
    companyScoped: true,
    titleAr: 'رصد المخزون الراكد',
    titleEn: 'Deadstock Detector',
    description:
      'Sundays 05:00 — finds variants with positive stock but zero sales in the last 90 days; raises warnings so managers can act.',
  };

  constructor(
    private readonly db: PrismaService,
    private readonly engine: AutopilotEngineService,
  ) {}

  async execute(ctx: AutopilotJobContext): Promise<AutopilotJobResult> {
    const cutoff = new Date(
      ctx.startedAt.getTime() - 90 * 24 * 60 * 60 * 1000,
    );

    // ── 1. All variants with positive on-hand stock ─────────────────────────
    const balances = await this.db.inventoryBalance.findMany({
      where: {
        companyId: ctx.companyId,
        qtyOnHand: { gt: 0 },
      },
      select: {
        variantId: true,
        warehouseId: true,
        qtyOnHand: true,
        avgCostIqd: true,
      },
    });

    if (balances.length === 0) {
      return { status: 'no_op', itemsProcessed: 0, exceptionsRaised: 0 };
    }

    // Aggregate per variant (may span multiple warehouses)
    type BalanceSummary = { totalQty: number; totalValueIqd: number; warehouseIds: Set<string> };
    const variantBalances = new Map<string, BalanceSummary>();
    for (const b of balances) {
      const existing = variantBalances.get(b.variantId);
      const qty = Number(b.qtyOnHand);
      const value = qty * Number(b.avgCostIqd);
      if (existing) {
        existing.totalQty += qty;
        existing.totalValueIqd += value;
        existing.warehouseIds.add(b.warehouseId);
      } else {
        variantBalances.set(b.variantId, {
          totalQty: qty,
          totalValueIqd: value,
          warehouseIds: new Set([b.warehouseId]),
        });
      }
    }

    const allVariantIds = [...variantBalances.keys()];

    // ── 2. Find variants with ANY sales activity in last 90 days ────────────
    // SalesInvoiceLine — join through SalesInvoice for companyId scoping
    const activeSalesLines = await this.db.salesInvoiceLine.findMany({
      where: {
        variantId: { in: allVariantIds },
        invoice: {
          companyId: ctx.companyId,
          invoiceDate: { gte: cutoff },
        },
      },
      select: { variantId: true },
      distinct: ['variantId'],
    });

    // POSReceiptLine — join through POSReceipt for companyId scoping
    const activePosLines = await this.db.pOSReceiptLine.findMany({
      where: {
        variantId: { in: allVariantIds },
        receipt: {
          companyId: ctx.companyId,
          receiptDate: { gte: cutoff },
        },
      },
      select: { variantId: true },
      distinct: ['variantId'],
    });

    const activeVariantIds = new Set<string>([
      ...activeSalesLines.map((l) => l.variantId),
      ...activePosLines.map((l) => l.variantId),
    ]);

    // ── 3. Dead stock = in stock but no recent sales ─────────────────────────
    const deadVariantIds = allVariantIds.filter(
      (id) => !activeVariantIds.has(id),
    );

    if (deadVariantIds.length === 0) {
      return { status: 'no_op', itemsProcessed: allVariantIds.length, exceptionsRaised: 0 };
    }

    // ── 4. Resolve variant names ─────────────────────────────────────────────
    const variants = await this.db.productVariant.findMany({
      where: { id: { in: deadVariantIds } },
      select: {
        id: true,
        sku: true,
        template: { select: { nameAr: true } },
      },
    });
    const variantMap = new Map(variants.map((v) => [v.id, v]));

    // ── 5. Raise one warning per dead-stock variant ──────────────────────────
    let exceptionsRaised = 0;

    for (const variantId of deadVariantIds) {
      const summary = variantBalances.get(variantId);
      if (!summary) continue;

      const variantInfo = variantMap.get(variantId);
      const productName =
        variantInfo?.template?.nameAr ?? variantInfo?.sku ?? variantId;

      try {
        await this.engine.raiseException({
          jobId: this.meta.id,
          domain: 'inventory',
          companyId: ctx.companyId,
          severity: 'medium',
          title: `مخزون راكد — ${productName}`,
          description: `لا توجد مبيعات منذ 90 يوم — الكمية: ${summary.totalQty.toFixed(2)} — القيمة التقديرية: ${summary.totalValueIqd.toFixed(0)} د.ع`,
          suggestedAction:
            'مراجعة التسعير أو تفعيل عروض ترويجية أو إعادة توزيع المخزون على فرع آخر',
          payload: {
            variantId,
            sku: variantInfo?.sku,
            totalQtyOnHand: summary.totalQty,
            estimatedValueIqd: Math.round(summary.totalValueIqd),
            warehouseIds: [...summary.warehouseIds],
            lookbackDays: 90,
          },
        });
        exceptionsRaised++;
      } catch (err) {
        this.logger.error(
          `[deadstock-detect] failed to raise exception for variant=${variantId}`,
          err instanceof Error ? err.stack : String(err),
        );
      }
    }

    this.logger.log(
      `[deadstock-detect] company=${ctx.companyId} — ${allVariantIds.length} variants checked, ${deadVariantIds.length} dead stock, ${exceptionsRaised} exceptions raised`,
    );

    return {
      status: exceptionsRaised > 0 ? 'exception_raised' : 'no_op',
      itemsProcessed: allVariantIds.length,
      exceptionsRaised,
      details: {
        variantsWithStock: allVariantIds.length,
        activeVariants: activeVariantIds.size,
        deadStockVariants: deadVariantIds.length,
        lookbackDays: 90,
      },
    };
  }
}
