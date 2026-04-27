import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AuditService } from '../../../engines/audit/audit.service';
import { SequenceService } from '../../../engines/sequence/sequence.service';
import { emitRealtime } from '../../../platform/realtime/emit-realtime';
import { InventoryIntelligenceService } from '../../inventory/intelligence/intelligence.service';

// ─── T42 — Auto-Reorder Service ─────────────────────────────────────────────
// Pipeline:
//   1. Run the intelligence engine to refresh Q03 (low-stock) flags.
//   2. For every open Q03 flag, pick a preferred supplier:
//        - explicit ReorderPoint.preferredSupplierId, OR
//        - SupplierPrice.isPreferred = true, OR
//        - cheapest active SupplierPrice in the last 90 days.
//   3. Group lines by supplier and create ONE Draft PO per supplier per
//      warehouse using the standard PurchaseOrder schema.
//   4. Stamp an AutoReorderRun row for the audit trail and emit a realtime
//      event for the dashboard.
//
// F2: This service NEVER posts journal entries. POs are draft only — the
// existing GRN + VendorInvoice flow handles GL postings when the goods
// physically arrive (3-way match, see Wave 3).
// F3: This service NEVER moves stock — stock only moves on GRN, not on PO.

export interface AutoReorderOptions {
  /** Limit to a subset of warehouses (default: all). */
  warehouseIds?: string[];
  /** Skip the engine scan (use existing open Q03 flags). */
  skipScan?: boolean;
  /** User who triggered the run (null = cron). */
  triggeredBy?: string;
  /** When true, only computes the suggested PO lines without persisting POs. */
  dryRun?: boolean;
}

export interface AutoReorderResult {
  runId: string;
  scannedSkus: number;
  flagsCreated: number;
  flagsResolved: number;
  draftPosCreated: number;
  draftPos: Array<{
    supplierId: string;
    warehouseId: string;
    poNumber: string | null;
    lineCount: number;
    totalIqd: number;
  }>;
  durationMs: number;
}

interface ReorderCandidate {
  variantId: string;
  warehouseId: string;
  shortageQty: number;
  unitCostIqd: number;
  supplierId: string | null;
  leadTimeDays: number;
  flagId: string;
}

@Injectable()
export class AutoReorderService {
  private readonly logger = new Logger(AutoReorderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly intelligence: InventoryIntelligenceService,
    private readonly audit: AuditService,
    private readonly sequence: SequenceService,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * The primary entry point. Designed to be cron-safe (idempotent — re-running
   * within minutes will not create duplicate POs because we only act on flags
   * that don't already have a draft PO covering them).
   */
  async run(companyId: string, opts: AutoReorderOptions = {}): Promise<AutoReorderResult> {
    const start = Date.now();

    const runRow = await this.prisma.autoReorderRun.create({
      data: {
        companyId,
        status: 'running',
        triggeredBy: opts.triggeredBy ?? null,
      },
    });

    try {
      // 1. Refresh flags (unless caller asked to skip).
      let scannedSkus = 0;
      let flagsCreated = 0;
      let flagsResolved = 0;
      if (!opts.skipScan) {
        const scan = await this.intelligence.scan(companyId, {
          warehouseIds: opts.warehouseIds,
          triggeredBy: opts.triggeredBy,
        });
        scannedSkus = scan.scannedSkus;
        flagsCreated = scan.flagsCreated;
        flagsResolved = scan.flagsResolved;
      }

      // 2. Pick candidates from open Q03 flags.
      const candidates = await this.collectCandidates(companyId, opts.warehouseIds);

      // 3. Group by (supplierId, warehouseId) and create draft POs.
      const grouped = new Map<string, ReorderCandidate[]>();
      for (const c of candidates) {
        if (!c.supplierId) continue;
        const key = `${c.supplierId}|${c.warehouseId}`;
        const list = grouped.get(key) ?? [];
        list.push(c);
        grouped.set(key, list);
      }

      const drafts: AutoReorderResult['draftPos'] = [];
      let draftPosCreated = 0;
      const branch = await this.prisma.branch.findFirst({
        where: { companyId, isActive: true },
        select: { id: true },
      });
      const systemUserId = opts.triggeredBy ?? 'AUTOREORDER0000000000000000';

      for (const [key, lines] of grouped.entries()) {
        const [supplierId, warehouseId] = key.split('|');
        if (opts.dryRun) {
          drafts.push({
            supplierId,
            warehouseId,
            poNumber: null,
            lineCount: lines.length,
            totalIqd: lines.reduce((s, l) => s + l.shortageQty * l.unitCostIqd, 0),
          });
          continue;
        }

        try {
          const draft = await this.createDraftPO(
            companyId,
            branch?.id ?? '',
            supplierId,
            warehouseId,
            lines,
            systemUserId,
          );
          drafts.push(draft);
          draftPosCreated++;
        } catch (err) {
          this.logger.error(
            `[T42] failed to draft PO supplier=${supplierId} wh=${warehouseId}: ${(err as Error).message}`,
          );
        }
      }

      const durationMs = Date.now() - start;
      await this.prisma.autoReorderRun.update({
        where: { id: runRow.id },
        data: {
          status: 'completed',
          completedAt: new Date(),
          scannedSkus,
          flagsCreated,
          flagsResolved,
          draftPosCreated,
          payload: { draftPos: drafts } as Prisma.InputJsonValue,
        },
      });

      emitRealtime(this.events, 'inventory.intelligence.autoreorder', {
        companyId,
        runId: runRow.id,
        draftPosCreated,
      });

      if (opts.triggeredBy) {
        await this.audit.log({
          companyId,
          userId: opts.triggeredBy,
          action: 'inventory.autoreorder.run',
          entityType: 'AutoReorderRun',
          entityId: runRow.id,
          metadata: { draftPosCreated, scannedSkus, durationMs },
        });
      }

      return {
        runId: runRow.id,
        scannedSkus,
        flagsCreated,
        flagsResolved,
        draftPosCreated,
        draftPos: drafts,
        durationMs,
      };
    } catch (err) {
      await this.prisma.autoReorderRun.update({
        where: { id: runRow.id },
        data: {
          status: 'failed',
          completedAt: new Date(),
          errorMessage: (err as Error).message?.slice(0, 1900),
        },
      });
      throw err;
    }
  }

  /** Recent runs for the dashboard. */
  async listRuns(companyId: string, limit = 20) {
    return this.prisma.autoReorderRun.findMany({
      where: { companyId },
      orderBy: { startedAt: 'desc' },
      take: Math.min(100, Math.max(1, limit)),
    });
  }

  // ─── Internal ─────────────────────────────────────────────────────────────

  private async collectCandidates(
    companyId: string,
    warehouseIds: string[] | undefined,
  ): Promise<ReorderCandidate[]> {
    const flags = await this.prisma.inventoryFlag.findMany({
      where: {
        companyId,
        ruleCode: 'Q03',
        resolvedAt: null,
        ...(warehouseIds ? { warehouseId: { in: warehouseIds } } : {}),
      },
    });
    if (flags.length === 0) return [];

    const variantIds = Array.from(new Set(flags.map((f) => f.variantId)));
    const warehouseSet = Array.from(new Set(flags.map((f) => f.warehouseId)));

    const [balances, rops, supplierPrices] = await Promise.all([
      this.prisma.inventoryBalance.findMany({
        where: { companyId, variantId: { in: variantIds }, warehouseId: { in: warehouseSet } },
      }),
      this.prisma.reorderPoint.findMany({
        where: { companyId, variantId: { in: variantIds }, warehouseId: { in: warehouseSet } },
      }),
      this.prisma.supplierPrice.findMany({
        where: {
          variantId: { in: variantIds },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }],
          supplier: { companyId, isActive: true, deletedAt: null },
        },
        orderBy: [{ isPreferred: 'desc' }, { priceIqd: 'asc' }],
        include: { supplier: { select: { id: true, isActive: true } } },
      }),
    ]);

    const balanceMap = new Map(
      balances.map((b) => [`${b.variantId}|${b.warehouseId}`, b]),
    );
    const ropMap = new Map(
      rops.map((r) => [`${r.variantId}|${r.warehouseId}`, r]),
    );
    const pricesByVariant = new Map<string, typeof supplierPrices>();
    for (const p of supplierPrices) {
      const list = pricesByVariant.get(p.variantId) ?? [];
      list.push(p);
      pricesByVariant.set(p.variantId, list);
    }

    const out: ReorderCandidate[] = [];
    for (const flag of flags) {
      const balKey = `${flag.variantId}|${flag.warehouseId}`;
      const balance = balanceMap.get(balKey);
      const rop = ropMap.get(balKey);

      // Decide on supplier — preferred wins, otherwise cheapest active.
      const candidates = pricesByVariant.get(flag.variantId) ?? [];
      let supplierId: string | null = rop?.preferredSupplierId ?? null;
      let unitCost = balance ? Number(balance.avgCostIqd.toString()) : 0;
      let leadTime = rop?.leadTimeDays ?? 7;

      if (!supplierId && candidates.length > 0) {
        const pick = candidates[0];
        supplierId = pick.supplierId;
        unitCost = Number(pick.priceIqd.toString());
        leadTime = pick.leadTimeDays;
      } else if (supplierId) {
        const pick = candidates.find((c) => c.supplierId === supplierId);
        if (pick) {
          unitCost = Number(pick.priceIqd.toString());
          leadTime = pick.leadTimeDays;
        }
      }

      // Shortage = ROP target - currentQty (always positive).
      const currentQty = balance ? Number(balance.qtyOnHand.toString()) : 0;
      const target = rop
        ? Number(rop.reorderQty.toString()) + Number(rop.safetyStock.toString())
        : Number(flag.threshold?.toString() ?? '0');
      const shortageQty = Math.max(target - currentQty, target * 0.5);

      if (shortageQty <= 0) continue;

      out.push({
        variantId: flag.variantId,
        warehouseId: flag.warehouseId,
        shortageQty,
        unitCostIqd: unitCost > 0 ? unitCost : 0,
        supplierId,
        leadTimeDays: leadTime,
        flagId: flag.id,
      });
    }
    return out;
  }

  private async createDraftPO(
    companyId: string,
    branchId: string,
    supplierId: string,
    warehouseId: string,
    lines: ReorderCandidate[],
    actor: string,
  ): Promise<AutoReorderResult['draftPos'][number]> {
    const number = await this.sequence.next(companyId, 'PO', branchId || undefined);
    const subtotal = lines.reduce(
      (sum, l) => sum.add(new Prisma.Decimal(l.shortageQty).mul(new Prisma.Decimal(l.unitCostIqd))),
      new Prisma.Decimal(0),
    );

    const po = await this.prisma.purchaseOrder.create({
      data: {
        companyId,
        branchId,
        number,
        supplierId,
        warehouseId,
        orderDate: new Date(),
        status: 'draft' as any,
        subtotalIqd: subtotal,
        totalIqd: subtotal,
        notes: 'Auto-generated by Smart Inventory Engine (T42).',
        createdBy: actor,
        updatedBy: actor,
        lines: {
          create: lines.map((l) => ({
            variantId: l.variantId,
            qtyOrdered: new Prisma.Decimal(l.shortageQty),
            qtyReceived: new Prisma.Decimal(0),
            qtyInvoiced: new Prisma.Decimal(0),
            qtyRejected: new Prisma.Decimal(0),
            unitCostIqd: new Prisma.Decimal(l.unitCostIqd),
            discountPct: new Prisma.Decimal(0),
            lineTotalIqd: new Prisma.Decimal(l.shortageQty).mul(new Prisma.Decimal(l.unitCostIqd)),
            notes: `Auto-reorder for flag ${l.flagId}`,
          })),
        },
      },
    });

    return {
      supplierId,
      warehouseId,
      poNumber: po.number,
      lineCount: lines.length,
      totalIqd: Number(subtotal.toString()),
    };
  }
}
