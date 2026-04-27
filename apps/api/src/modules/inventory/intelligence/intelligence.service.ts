import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AuditService } from '../../../engines/audit/audit.service';
import { emitRealtime } from '../../../platform/realtime/emit-realtime';
import {
  ALL_RULES,
  DEFAULT_RULE_CONTEXT,
  FlagDraft,
  RULE_CATALOGUE,
  SkuSnapshot,
  toNumber,
} from './rules/Q01-Q12';

// ─── T42 — Smart Inventory Intelligence Service ─────────────────────────────
// Owns the Q01..Q12 rule engine. Builds SkuSnapshots once per scan and feeds
// every rule. Persists results to inventory_flags (UPSERT — only the latest
// state per SKU+rule is kept; resolutions are recorded by setting resolvedAt).
//
// F3: read-only. The engine NEVER moves stock and never writes to journal_*
// or stock_ledger — it only flags issues for human review.
// F4: Tier 3 only. Pure rule functions; no AI.

export interface ScanOptions {
  /** Limit the scan to these warehouses. Default: all warehouses for the company. */
  warehouseIds?: string[];
  /** Limit to these variants. Default: all storable variants. */
  variantIds?: string[];
  /** Trigger origin — appears in audit log. */
  triggeredBy?: string;
}

export interface ScanResult {
  scannedSkus: number;
  flagsCreated: number;
  flagsUpdated: number;
  flagsResolved: number;
  byRule: Record<string, number>;
  durationMs: number;
}

@Injectable()
export class InventoryIntelligenceService {
  private readonly logger = new Logger(InventoryIntelligenceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
  ) {}

  /** The full Q-rule catalogue. Used by the dashboard for legend rendering. */
  catalogue() {
    return RULE_CATALOGUE;
  }

  /**
   * Run the rule engine for one company. Designed to be cron-safe (idempotent
   * — re-running over the same data produces the same flags).
   */
  async scan(companyId: string, opts: ScanOptions = {}): Promise<ScanResult> {
    const start = Date.now();
    const snapshots = await this.buildSnapshots(companyId, opts);

    const drafts: Array<{ sku: SkuSnapshot; flag: FlagDraft }> = [];
    for (const sku of snapshots) {
      for (const rule of ALL_RULES) {
        const flag = rule(sku, DEFAULT_RULE_CONTEXT);
        if (flag) drafts.push({ sku, flag });
      }
    }

    const byRule: Record<string, number> = {};
    let created = 0;
    let updated = 0;

    // UPSERT each draft. We keep one row per (variant, warehouse, rule).
    for (const { sku, flag } of drafts) {
      byRule[flag.ruleCode] = (byRule[flag.ruleCode] ?? 0) + 1;
      const result = await this.prisma.inventoryFlag.upsert({
        where: {
          variantId_warehouseId_ruleCode: {
            variantId: sku.variantId,
            warehouseId: sku.warehouseId,
            ruleCode: flag.ruleCode,
          },
        },
        create: {
          companyId,
          variantId: sku.variantId,
          warehouseId: sku.warehouseId,
          ruleCode: flag.ruleCode,
          severity: flag.severity,
          messageAr: flag.messageAr,
          messageEn: flag.messageEn,
          metric: flag.metric != null ? new Prisma.Decimal(flag.metric) : null,
          threshold: flag.threshold != null ? new Prisma.Decimal(flag.threshold) : null,
          payload: (flag.payload ?? {}) as Prisma.InputJsonValue,
        },
        update: {
          severity: flag.severity,
          messageAr: flag.messageAr,
          messageEn: flag.messageEn,
          metric: flag.metric != null ? new Prisma.Decimal(flag.metric) : null,
          threshold: flag.threshold != null ? new Prisma.Decimal(flag.threshold) : null,
          payload: (flag.payload ?? {}) as Prisma.InputJsonValue,
          resolvedAt: null,
          resolvedBy: null,
        },
      });
      // Tell created vs updated via createdAt vs updatedAt distance — cheap heuristic.
      if (Math.abs(result.createdAt.getTime() - result.updatedAt.getTime()) < 50) {
        created++;
      } else {
        updated++;
      }
    }

    // Auto-resolve: any open flag whose (variantId, warehouseId, ruleCode) was
    // NOT raised this scan but has a snapshot in the scope is now healthy.
    const seenKey = (vid: string, wid: string, rc: string) => `${vid}|${wid}|${rc}`;
    const seen = new Set(drafts.map(({ sku, flag }) =>
      seenKey(sku.variantId, sku.warehouseId, flag.ruleCode),
    ));
    const variantIds = Array.from(new Set(snapshots.map((s) => s.variantId)));
    const warehouseIds = Array.from(new Set(snapshots.map((s) => s.warehouseId)));

    let resolved = 0;
    if (variantIds.length > 0 && warehouseIds.length > 0) {
      const open = await this.prisma.inventoryFlag.findMany({
        where: {
          companyId,
          resolvedAt: null,
          variantId: { in: variantIds },
          warehouseId: { in: warehouseIds },
        },
        select: { id: true, variantId: true, warehouseId: true, ruleCode: true },
      });
      const stale = open.filter(
        (f) => !seen.has(seenKey(f.variantId, f.warehouseId, f.ruleCode)),
      );
      if (stale.length > 0) {
        const now = new Date();
        await this.prisma.inventoryFlag.updateMany({
          where: { id: { in: stale.map((s) => s.id) } },
          data: { resolvedAt: now },
        });
        resolved = stale.length;
      }
    }

    const durationMs = Date.now() - start;
    this.logger.log(
      `[T42] scan companyId=${companyId} skus=${snapshots.length} ` +
      `flags=${drafts.length} (created=${created} updated=${updated} resolved=${resolved}) ` +
      `in ${durationMs}ms`,
    );

    emitRealtime(this.events, 'inventory.intelligence.scan', {
      companyId,
      scannedSkus: snapshots.length,
      flagsCreated: created,
      flagsUpdated: updated,
      flagsResolved: resolved,
    });

    if (opts.triggeredBy) {
      await this.audit.log({
        companyId,
        userId: opts.triggeredBy,
        action: 'inventory.intelligence.scan',
        entityType: 'InventoryFlag',
        metadata: { byRule, scannedSkus: snapshots.length, durationMs },
      });
    }

    return {
      scannedSkus: snapshots.length,
      flagsCreated: created,
      flagsUpdated: updated,
      flagsResolved: resolved,
      byRule,
      durationMs,
    };
  }

  /** Read flags for the dashboard. */
  async listFlags(companyId: string, query: {
    ruleCode?: string;
    severity?: 'info' | 'warning' | 'critical';
    warehouseId?: string;
    onlyOpen?: boolean;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(200, Math.max(1, query.limit ?? 50));
    const where: Prisma.InventoryFlagWhereInput = {
      companyId,
      ...(query.ruleCode ? { ruleCode: query.ruleCode } : {}),
      ...(query.severity ? { severity: query.severity } : {}),
      ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
      ...(query.onlyOpen === false ? {} : { resolvedAt: null }),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.inventoryFlag.findMany({
        where,
        orderBy: [{ severity: 'desc' }, { detectedAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.inventoryFlag.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  /** Mark a flag as resolved (manual override). */
  async resolveFlag(companyId: string, flagId: string, userId: string, reason?: string) {
    const flag = await this.prisma.inventoryFlag.findFirst({
      where: { id: flagId, companyId },
    });
    if (!flag) return null;
    const updated = await this.prisma.inventoryFlag.update({
      where: { id: flag.id },
      data: { resolvedAt: new Date(), resolvedBy: userId },
    });
    await this.audit.log({
      companyId,
      userId,
      action: 'inventory.flag.resolve',
      entityType: 'InventoryFlag',
      entityId: flag.id,
      reason,
      after: updated,
    });
    return updated;
  }

  /** Aggregate counts per rule for the dashboard header. */
  async summary(companyId: string) {
    const open = await this.prisma.inventoryFlag.groupBy({
      by: ['ruleCode', 'severity'],
      where: { companyId, resolvedAt: null },
      _count: { _all: true },
    });
    const byRule: Record<string, { critical: number; warning: number; info: number }> = {};
    for (const c of RULE_CATALOGUE) {
      byRule[c.code] = { critical: 0, warning: 0, info: 0 };
    }
    for (const row of open) {
      const sev = row.severity as 'critical' | 'warning' | 'info';
      const bucket = byRule[row.ruleCode];
      if (bucket) bucket[sev] = row._count._all;
    }
    return { byRule };
  }

  // ─── Snapshot builder (reads only) ─────────────────────────────────────────
  private async buildSnapshots(
    companyId: string,
    opts: ScanOptions,
  ): Promise<SkuSnapshot[]> {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 86_400_000);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);

    // 1) Load InventoryBalance rows in scope.
    const balances = await this.prisma.inventoryBalance.findMany({
      where: {
        companyId,
        ...(opts.warehouseIds ? { warehouseId: { in: opts.warehouseIds } } : {}),
        ...(opts.variantIds ? { variantId: { in: opts.variantIds } } : {}),
      },
      include: {
        variant: {
          select: {
            id: true,
            isActive: true,
            template: { select: { nameAr: true, type: true } },
          },
        },
      },
      take: 5000, // safety cap; cron processes companies in chunks
    });

    if (balances.length === 0) return [];

    const variantIds = Array.from(new Set(balances.map((b) => b.variantId)));
    const warehouseIds = Array.from(new Set(balances.map((b) => b.warehouseId)));

    // 2) Reorder configuration.
    const rops = await this.prisma.reorderPoint.findMany({
      where: { companyId, variantId: { in: variantIds }, warehouseId: { in: warehouseIds } },
    });
    const ropMap = new Map(rops.map((r) => [`${r.variantId}|${r.warehouseId}`, r]));

    // 3) Latest selling price per variant from active price lists.
    const prices = await this.prisma.priceListItem.findMany({
      where: {
        variantId: { in: variantIds },
        priceList: { companyId, isActive: true },
      },
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
      select: { variantId: true, priceIqd: true },
    });
    const priceMap = new Map<string, number>();
    for (const p of prices) {
      if (!priceMap.has(p.variantId)) priceMap.set(p.variantId, toNumber(p.priceIqd));
    }

    // 4) Sales velocity (last 90d) — from POSReceiptLine + SalesInvoiceLine.
    const sales90 = await this.salesByVariant(companyId, variantIds, ninetyDaysAgo);
    const sales30 = await this.salesByVariant(companyId, variantIds, thirtyDaysAgo);

    // 5) Per-(variant, warehouse) ledger metadata: last movement, last inbound cost,
    //    earliest open batch expiry.
    const ledgerMeta = await this.ledgerMeta(companyId, variantIds, warehouseIds);

    return balances.map((b) => {
      const key = `${b.variantId}|${b.warehouseId}`;
      const rop = ropMap.get(key);
      const meta = ledgerMeta.get(key) ?? {
        lastMovementAt: null,
        lastInboundCostIqd: null,
        earliestExpiryAt: null,
      };
      const earliestExpiry = meta.earliestExpiryAt;
      const daysToExpiry = earliestExpiry
        ? Math.floor((earliestExpiry.getTime() - Date.now()) / 86_400_000)
        : null;

      return {
        variantId: b.variantId,
        warehouseId: b.warehouseId,
        companyId,
        qtyOnHand: toNumber(b.qtyOnHand),
        qtyReserved: toNumber(b.qtyReserved),
        avgCostIqd: toNumber(b.avgCostIqd),
        reorderQty: rop ? toNumber(rop.reorderQty) : null,
        leadTimeDays: rop ? rop.leadTimeDays : null,
        safetyStock: rop ? toNumber(rop.safetyStock) : null,
        sellingPriceIqd: priceMap.get(b.variantId) ?? null,
        salesQtyLast30: sales30.qty.get(b.variantId) ?? 0,
        salesQtyLast90: sales90.qty.get(b.variantId) ?? 0,
        salesIqdLast90: sales90.amount.get(b.variantId) ?? 0,
        cogsIqdLast90: 0,
        lastMovementAt: meta.lastMovementAt,
        lastInboundCostIqd: meta.lastInboundCostIqd,
        earliestExpiryAt: earliestExpiry,
        daysToEarliestExpiry: daysToExpiry,
        templateNameAr: b.variant?.template?.nameAr ?? '',
        templateType: b.variant?.template?.type ?? 'product',
        isActive: b.variant?.isActive ?? true,
      } satisfies SkuSnapshot;
    });
  }

  private async salesByVariant(
    companyId: string,
    variantIds: string[],
    since: Date,
  ): Promise<{ qty: Map<string, number>; amount: Map<string, number> }> {
    const qty = new Map<string, number>();
    const amount = new Map<string, number>();
    if (variantIds.length === 0) return { qty, amount };

    const invoiceLines = await this.prisma.salesInvoiceLine.findMany({
      where: {
        variantId: { in: variantIds },
        invoice: { companyId, status: 'posted', invoiceDate: { gte: since } },
      },
      select: { variantId: true, qty: true, lineTotalIqd: true },
    });
    for (const l of invoiceLines) {
      qty.set(l.variantId, (qty.get(l.variantId) ?? 0) + toNumber(l.qty));
      amount.set(l.variantId, (amount.get(l.variantId) ?? 0) + toNumber(l.lineTotalIqd));
    }

    const posLines = await this.prisma.pOSReceiptLine.findMany({
      where: {
        variantId: { in: variantIds },
        receipt: { companyId, status: 'completed', receiptDate: { gte: since } },
      },
      select: { variantId: true, qty: true, lineTotalIqd: true },
    });
    for (const l of posLines) {
      qty.set(l.variantId, (qty.get(l.variantId) ?? 0) + toNumber(l.qty));
      amount.set(l.variantId, (amount.get(l.variantId) ?? 0) + toNumber(l.lineTotalIqd));
    }
    return { qty, amount };
  }

  private async ledgerMeta(
    companyId: string,
    variantIds: string[],
    warehouseIds: string[],
  ): Promise<Map<string, {
    lastMovementAt: Date | null;
    lastInboundCostIqd: number | null;
    earliestExpiryAt: Date | null;
  }>> {
    const map = new Map<string, {
      lastMovementAt: Date | null;
      lastInboundCostIqd: number | null;
      earliestExpiryAt: Date | null;
    }>();
    if (variantIds.length === 0 || warehouseIds.length === 0) return map;

    // Last movement timestamp per (variant, warehouse).
    const lastMoves = await this.prisma.stockLedgerEntry.groupBy({
      by: ['variantId', 'warehouseId'],
      where: {
        companyId,
        variantId: { in: variantIds },
        warehouseId: { in: warehouseIds },
      },
      _max: { createdAt: true },
    });
    for (const r of lastMoves) {
      const key = `${r.variantId}|${r.warehouseId}`;
      const existing = map.get(key) ?? { lastMovementAt: null, lastInboundCostIqd: null, earliestExpiryAt: null };
      existing.lastMovementAt = r._max.createdAt ?? null;
      map.set(key, existing);
    }

    // Last inbound cost per (variant, warehouse) — most recent entry with positive
    // qtyChange. StockLedgerEntry has no `direction` column (F3: direction is
    // implicit in the sign of qtyChange).
    const lastInbound = await this.prisma.stockLedgerEntry.findMany({
      where: {
        companyId,
        qtyChange: { gt: 0 },
        variantId: { in: variantIds },
        warehouseId: { in: warehouseIds },
      },
      orderBy: { createdAt: 'desc' },
      distinct: ['variantId', 'warehouseId'],
      select: { variantId: true, warehouseId: true, unitCostIqd: true },
    });
    for (const r of lastInbound) {
      const key = `${r.variantId}|${r.warehouseId}`;
      const existing = map.get(key) ?? { lastMovementAt: null, lastInboundCostIqd: null, earliestExpiryAt: null };
      existing.lastInboundCostIqd = r.unitCostIqd ? toNumber(r.unitCostIqd) : null;
      map.set(key, existing);
    }

    // Batch expiry tracking is out of scope for T42 — the current StockLedger
    // schema does not carry batch/expiry columns. Q04 will silently no-op
    // until a future task adds a BatchLedger model. This is a deliberate
    // forward-compatible stub: the rule is wired and will activate as soon as
    // earliestExpiryAt is populated.

    return map;
  }
}
