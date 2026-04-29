import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AutopilotEngineService } from '../autopilot.service';
import {
  AutopilotJob,
  AutopilotJobContext,
  AutopilotJobMeta,
  AutopilotJobResult,
} from '../autopilot.types';

// ─── inventory.transfer-suggest ──────────────────────────────────────────────
// Cron: 07:00 Mondays.
// Goal: identify inter-warehouse stock imbalances where one warehouse is
// overstocked (qtyOnHand > 2 × reorderQty) while another warehouse has the
// same variant understocked (qtyOnHand < reorderQty). Raise info-level
// exceptions to suggest transfers without creating them automatically.
//
// Algorithm:
//   1. Load ReorderPoints for this company grouped by (variantId, warehouseId).
//   2. Load InventoryBalance for same scope.
//   3. For each variant: compare every (over, under) warehouse pair.
//   4. Raise one exception per imbalance pair found.

@Injectable()
export class InventoryTransferSuggestJob implements AutopilotJob {
  private readonly logger = new Logger(InventoryTransferSuggestJob.name);

  readonly meta: AutopilotJobMeta = {
    id: 'inventory.transfer-suggest',
    domain: 'inventory',
    schedule: '0 7 * * 1',
    companyScoped: true,
    titleAr: 'اقتراح نقل بين المستودعات',
    titleEn: 'Cross-Warehouse Transfer Suggest',
    description:
      'Mondays 07:00 — detects variants overstocked in one warehouse and understocked in another; raises info exceptions suggesting transfers.',
  };

  constructor(
    private readonly db: PrismaService,
    private readonly engine: AutopilotEngineService,
  ) {}

  async execute(ctx: AutopilotJobContext): Promise<AutopilotJobResult> {
    // ── 1. Load reorder points ───────────────────────────────────────────────
    const reorderPoints = await this.db.reorderPoint.findMany({
      where: { companyId: ctx.companyId },
      select: {
        variantId: true,
        warehouseId: true,
        reorderQty: true,
      },
    });

    if (reorderPoints.length === 0) {
      // No reorder points configured — cannot determine thresholds
      return { status: 'no_op', itemsProcessed: 0, exceptionsRaised: 0 };
    }

    // Build a map: variantId → warehouseId → reorderQty
    type ReorderMap = Map<string, Map<string, number>>;
    const reorderMap: ReorderMap = new Map();
    for (const rp of reorderPoints) {
      if (!reorderMap.has(rp.variantId)) {
        reorderMap.set(rp.variantId, new Map());
      }
      reorderMap.get(rp.variantId)!.set(rp.warehouseId, Number(rp.reorderQty));
    }

    // ── 2. Load current inventory balances for variants that have reorder points
    const variantIdsWithReorder = [...reorderMap.keys()];
    const balances = await this.db.inventoryBalance.findMany({
      where: {
        companyId: ctx.companyId,
        variantId: { in: variantIdsWithReorder },
      },
      select: {
        variantId: true,
        warehouseId: true,
        qtyOnHand: true,
      },
    });

    if (balances.length === 0) {
      return { status: 'no_op', itemsProcessed: 0, exceptionsRaised: 0 };
    }

    // Build balance map: variantId → warehouseId → qtyOnHand
    type BalanceMap = Map<string, Map<string, number>>;
    const balanceMap: BalanceMap = new Map();
    for (const b of balances) {
      if (!balanceMap.has(b.variantId)) {
        balanceMap.set(b.variantId, new Map());
      }
      balanceMap.get(b.variantId)!.set(b.warehouseId, Number(b.qtyOnHand));
    }

    // ── 3. Detect imbalance pairs ────────────────────────────────────────────
    type ImbalancePair = {
      variantId: string;
      overWarehouseId: string;
      overQty: number;
      underWarehouseId: string;
      underQty: number;
      reorderQty: number;
    };
    const imbalances: ImbalancePair[] = [];

    for (const [variantId, warehouseReorders] of reorderMap.entries()) {
      const variantBalances = balanceMap.get(variantId);
      if (!variantBalances) continue;

      // Classify warehouses for this variant
      const overstocked: Array<{ warehouseId: string; qty: number; reorderQty: number }> = [];
      const understocked: Array<{ warehouseId: string; qty: number; reorderQty: number }> = [];

      for (const [warehouseId, reorderQty] of warehouseReorders.entries()) {
        if (reorderQty <= 0) continue;
        const qty = variantBalances.get(warehouseId) ?? 0;
        if (qty > 2 * reorderQty) {
          overstocked.push({ warehouseId, qty, reorderQty });
        } else if (qty < reorderQty) {
          understocked.push({ warehouseId, qty, reorderQty });
        }
      }

      // Pair each overstocked with each understocked (cap at 3 pairs per variant
      // to avoid explosion)
      const maxPairsPerVariant = 3;
      let pairs = 0;
      for (const over of overstocked) {
        for (const under of understocked) {
          if (pairs >= maxPairsPerVariant) break;
          imbalances.push({
            variantId,
            overWarehouseId: over.warehouseId,
            overQty: over.qty,
            underWarehouseId: under.warehouseId,
            underQty: under.qty,
            reorderQty: under.reorderQty,
          });
          pairs++;
        }
        if (pairs >= maxPairsPerVariant) break;
      }
    }

    if (imbalances.length === 0) {
      return { status: 'no_op', itemsProcessed: balances.length, exceptionsRaised: 0 };
    }

    // ── 4. Resolve names for affected variants and warehouses ────────────────
    const imbalanceVariantIds = [...new Set(imbalances.map((i) => i.variantId))];
    const allWarehouseIds = [
      ...new Set(imbalances.flatMap((i) => [i.overWarehouseId, i.underWarehouseId])),
    ];

    const [variants, warehouses] = await Promise.all([
      this.db.productVariant.findMany({
        where: { id: { in: imbalanceVariantIds } },
        select: { id: true, sku: true, template: { select: { nameAr: true } } },
      }),
      this.db.warehouse.findMany({
        where: { id: { in: allWarehouseIds } },
        select: { id: true, nameAr: true, nameEn: true },
      }),
    ]);

    const variantMap = new Map(variants.map((v) => [v.id, v]));
    const warehouseMap = new Map(warehouses.map((w) => [w.id, w]));

    // ── 5. Raise one info exception per imbalance pair ───────────────────────
    let exceptionsRaised = 0;

    for (const pair of imbalances) {
      const variantInfo = variantMap.get(pair.variantId);
      const overWh = warehouseMap.get(pair.overWarehouseId);
      const underWh = warehouseMap.get(pair.underWarehouseId);

      const productName =
        variantInfo?.template?.nameAr ?? variantInfo?.sku ?? pair.variantId;
      const overName = overWh?.nameAr ?? overWh?.nameEn ?? pair.overWarehouseId;
      const underName = underWh?.nameAr ?? underWh?.nameEn ?? pair.underWarehouseId;

      const suggestedQty = Math.floor(
        (pair.overQty - pair.reorderQty) / 2,
      );

      try {
        await this.engine.raiseException({
          jobId: this.meta.id,
          domain: 'inventory',
          companyId: ctx.companyId,
          severity: 'low',
          title: `نقل مقترح — ${productName}`,
          description: `من ${overName} (${pair.overQty.toFixed(0)} وحدة) إلى ${underName} (${pair.underQty.toFixed(0)} وحدة — تحت نقطة الإعادة ${pair.reorderQty.toFixed(0)}). الكمية المقترحة: ${suggestedQty} وحدة.`,
          suggestedAction: `إنشاء أمر نقل مخزون: ${suggestedQty} وحدة من ${overName} إلى ${underName}`,
          payload: {
            variantId: pair.variantId,
            sku: variantInfo?.sku,
            fromWarehouseId: pair.overWarehouseId,
            toWarehouseId: pair.underWarehouseId,
            fromQty: pair.overQty,
            toQty: pair.underQty,
            reorderQty: pair.reorderQty,
            suggestedTransferQty: suggestedQty,
          },
        });
        exceptionsRaised++;
      } catch (err) {
        this.logger.error(
          `[transfer-suggest] failed to raise exception for variant=${pair.variantId}`,
          err instanceof Error ? err.stack : String(err),
        );
      }
    }

    this.logger.log(
      `[transfer-suggest] company=${ctx.companyId} — ${imbalances.length} imbalance pairs found, ${exceptionsRaised} exceptions raised`,
    );

    return {
      status: exceptionsRaised > 0 ? 'exception_raised' : 'no_op',
      itemsProcessed: balances.length,
      exceptionsRaised,
      details: {
        variantsEvaluated: variantIdsWithReorder.length,
        imbalancePairsFound: imbalances.length,
      },
    };
  }
}
