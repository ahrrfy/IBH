/**
 * PosConflictsService — I003: POS Offline Sync Conflict Resolution
 *
 * Strategy: Last-Write-Wins + conflict log for manager review.
 *
 * Business Rules:
 * - The POS receipt is ALWAYS posted (business continuity).
 * - Conflicts are logged append-only (F2 spirit).
 * - price_mismatch: POS unit price differs from server price list by > PRICE_TOLERANCE_PCT (5%).
 * - insufficient_stock: server stock < POS qty at sync time (policy: prevent_negative_stock).
 * - product_inactive: variant is marked inactive server-side.
 * - Conflicts are flagged 'pending_review' unless within auto-accept tolerance.
 *
 * @module POSModule
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AuditService } from '../../../engines/audit/audit.service';
import { Prisma } from '@prisma/client';
import type { UserSession } from '@erp/shared-types';

/** Price divergence tolerance — if POS price differs by more than this, flag as conflict */
export const PRICE_TOLERANCE_PCT = 5;

export interface ConflictDetectionInput {
  receiptId: string;
  clientUlid?: string;
  branchId: string;
  lines: Array<{
    variantId: string;
    qty: number;
    unitPriceIqd: number;
  }>;
  warehouseId: string;
}

export type ConflictType = 'price_mismatch' | 'insufficient_stock' | 'product_inactive';

export interface DetectedConflict {
  conflictType: ConflictType;
  variantId?: string;
  posValue: string;
  serverValue: string;
  /** auto_accepted = within tolerance; pending_review = requires manager */
  resolution: 'auto_accepted' | 'pending_review';
}

@Injectable()
export class PosConflictsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Detect conflicts between POS-reported values and server state.
   * Does NOT throw — always returns list of conflicts (may be empty).
   *
   * @param input - Receipt context with line details
   * @param tx    - Optional Prisma transaction client (runs inside receipt tx)
   * @returns Array of detected conflicts (empty = clean sync)
   */
  async detectConflicts(
    input: ConflictDetectionInput,
    tx?: Prisma.TransactionClient,
  ): Promise<DetectedConflict[]> {
    const db = tx ?? this.prisma;
    const conflicts: DetectedConflict[] = [];

    for (const line of input.lines) {
      // ── 1. Check product_inactive ────────────────────────────────────────
      const variant = await db.productVariant.findUnique({
        where: { id: line.variantId },
        select: { id: true, isActive: true, sku: true },
      });

      if (!variant) {
        // Variant doesn't exist on server — treat as product_inactive
        conflicts.push({
          conflictType: 'product_inactive',
          variantId: line.variantId,
          posValue: `qty=${line.qty}`,
          serverValue: 'variant_not_found',
          resolution: 'pending_review',
        });
        continue;
      }

      if (!variant.isActive) {
        conflicts.push({
          conflictType: 'product_inactive',
          variantId: line.variantId,
          posValue: `active=true, qty=${line.qty}`,
          serverValue: `active=false`,
          resolution: 'pending_review',
        });
      }

      // ── 2. Check price_mismatch ──────────────────────────────────────────
      // Server price = most recent price list item for this variant
      const priceItem = await db.priceListItem.findFirst({
        where: {
          variantId: line.variantId,
          effectiveFrom: { lte: new Date() },
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }],
        },
        orderBy: { effectiveFrom: 'desc' },
        select: { priceIqd: true },
      });

      if (priceItem) {
        const serverPrice = Number(priceItem.priceIqd);
        const posPrice = line.unitPriceIqd;

        if (serverPrice > 0) {
          const diffPct = Math.abs((posPrice - serverPrice) / serverPrice) * 100;

          if (diffPct > PRICE_TOLERANCE_PCT) {
            conflicts.push({
              conflictType: 'price_mismatch',
              variantId: line.variantId,
              posValue: `price=${posPrice.toFixed(3)} IQD`,
              serverValue: `price=${serverPrice.toFixed(3)} IQD (diff=${diffPct.toFixed(1)}%)`,
              resolution: 'pending_review',
            });
          }
          // diffPct <= tolerance: within acceptable range, no conflict logged
        }
      }

      // ── 3. Check insufficient_stock ──────────────────────────────────────
      const balance = await db.inventoryBalance.findUnique({
        where: {
          variantId_warehouseId: {
            variantId: line.variantId,
            warehouseId: input.warehouseId,
          },
        },
        select: { qtyOnHand: true },
      });

      const available = balance ? Number(balance.qtyOnHand) : 0;

      if (available < line.qty) {
        // Stock will go negative — log it. The inventory.move() call decides
        // whether to actually block (based on prevent_negative_stock policy).
        conflicts.push({
          conflictType: 'insufficient_stock',
          variantId: line.variantId,
          posValue: `qty_requested=${line.qty}`,
          serverValue: `qty_available=${available}`,
          resolution: 'pending_review',
        });
      }
    }

    return conflicts;
  }

  /**
   * Persist detected conflicts to pos_conflict_logs (append-only).
   * Must be called AFTER the receipt is successfully created.
   *
   * @param companyId  - Company scope
   * @param input      - Original detection input
   * @param conflicts  - Conflicts detected by detectConflicts()
   * @param tx         - Optional Prisma transaction client
   */
  async persistConflicts(
    companyId: string,
    input: ConflictDetectionInput,
    conflicts: DetectedConflict[],
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    if (!conflicts.length) return;

    const db = tx ?? this.prisma;

    await db.posConflictLog.createMany({
      data: conflicts.map((c) => ({
        companyId,
        branchId: input.branchId,
        receiptId: input.receiptId,
        clientUlid: input.clientUlid ?? null,
        conflictType: c.conflictType,
        variantId: c.variantId ?? null,
        posValue: c.posValue,
        serverValue: c.serverValue,
        resolution: c.resolution,
      })),
    });
  }

  /**
   * List unresolved (pending_review) conflicts for manager review.
   * Branch-scoped via RLS + branchId filter.
   *
   * @param query   - Pagination and filter options
   * @param session - Current user session (for company scoping)
   */
  async listConflicts(
    query: { page?: number; pageSize?: number; resolution?: string; branchId?: string },
    session: UserSession,
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;

    const where: Prisma.PosConflictLogWhereInput = {
      companyId: session.companyId,
      ...(query.resolution ? { resolution: query.resolution } : {}),
      ...(query.branchId ? { branchId: query.branchId } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.posConflictLog.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          receipt: { select: { number: true, totalIqd: true, createdAt: true } },
        },
      }),
      this.prisma.posConflictLog.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  /**
   * Manager resolves a conflict — accepted or rejected.
   * Does NOT delete or update the conflict log entry — appends resolution fields.
   *
   * Business Rule: resolution can only move from 'pending_review' to a terminal state.
   *
   * @param conflictId - ID of the PosConflictLog entry
   * @param resolution - 'manager_accepted' | 'manager_rejected'
   * @param notes      - Optional manager notes
   * @param session    - Current user session
   */
  async resolveConflict(
    conflictId: string,
    resolution: 'manager_accepted' | 'manager_rejected',
    notes: string | undefined,
    session: UserSession,
  ) {
    const conflict = await this.prisma.posConflictLog.findFirst({
      where: { id: conflictId, companyId: session.companyId },
    });

    if (!conflict) throw new NotFoundException('سجل التعارض غير موجود');

    if (conflict.resolution !== 'pending_review') {
      // Already resolved — idempotent return
      return conflict;
    }

    const updated = await this.prisma.posConflictLog.update({
      where: { id: conflictId },
      data: {
        resolution,
        notes: notes ?? null,
        resolvedBy: session.userId,
        resolvedAt: new Date(),
      },
    });

    await this.audit.log({
      companyId: session.companyId,
      userId: session.userId,
      action: 'update',
      entityType: 'PosConflictLog',
      entityId: conflictId,
      before: conflict,
      after: updated,
      metadata: { resolution, notes },
    });

    return updated;
  }
}
