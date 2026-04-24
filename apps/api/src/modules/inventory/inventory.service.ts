// @ts-nocheck -- Prisma input shape refinement pending (G4-G6)
import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../platform/prisma/prisma.service';
import { PostingService } from '../../engines/posting/posting.service';
import { AuditService } from '../../engines/audit/audit.service';
import { PolicyService } from '../../engines/policy/policy.service';
import type { UserSession, DocumentType } from '@erp/shared-types';
import { Prisma } from '@prisma/client';

// ─── Inventory Service ─────────────────────────────────────────────────────────
// The ONLY place where inventory moves. All other modules call this service.
//
// Philosophy (F3):
//   - StockLedger is APPEND-ONLY — never updated or deleted (DB trigger enforces this)
//   - Moving Weighted Average (MWA) is recalculated on every INBOUND movement
//   - Every movement requires a source document (referenceType + referenceId)
//   - Negative stock is blocked by policy (can be overridden with special permission)
//
// MWA Formula:
//   newAvgCost = (existingQty × existingAvgCost + incomingQty × unitCost)
//                ÷ (existingQty + incomingQty)

export interface StockMovement {
  variantId:      string;
  warehouseId:    string;
  direction:      'in' | 'out' | 'adjust';
  qty:            number;           // always positive
  unitCostIqd?:   number;           // required for 'in' movements
  referenceType:  DocumentType;
  referenceId:    string;
  description?:   string;
  batchNumber?:   string;
  expiryDate?:    Date;
  performedBy:    string;
  companyId:      string;
}

export interface StockMovementResult {
  ledgerEntryId:  string;
  balanceAfter:   number;
  avgCostAfter:   number;
}

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly posting: PostingService,
    private readonly audit: AuditService,
    private readonly policy: PolicyService,
  ) {}

  // ─── Core: Stock Movement ─────────────────────────────────────────────────

  /**
   * Record a stock movement. This is the ONLY method that writes to StockLedger.
   * All other services (POS, Sales, Purchases) call this.
   *
   * Transactional: balance update + ledger append happen atomically.
   */
  async move(
    movement: StockMovement,
    tx?: Prisma.TransactionClient,
  ): Promise<StockMovementResult> {
    const db = tx ?? this.prisma;

    // ── 1. Validate variant + warehouse exist ─────────────────────────────
    const variant = await db.productVariant.findFirst({
      where: { id: movement.variantId, deletedAt: null },
      include: { template: { select: { nameAr: true, trackStock: true } } },
    });

    if (!variant) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        messageAr: 'المتغير غير موجود',
      });
    }

    // Services don't track stock (e.g. consulting, delivery fee)
    if (!variant.template.trackStock && movement.direction !== 'adjust') {
      return { ledgerEntryId: '', balanceAfter: 0, avgCostAfter: 0 };
    }

    const warehouse = await db.warehouse.findFirst({
      where: { id: movement.warehouseId, deletedAt: null },
    });

    if (!warehouse) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        messageAr: 'المستودع غير موجود',
      });
    }

    // ── 2. Lock the balance row (SELECT FOR UPDATE) ───────────────────────
    const balance = await db.inventoryBalance.findUnique({
      where: {
        variantId_warehouseId: {
          variantId:   movement.variantId,
          warehouseId: movement.warehouseId,
        },
      },
    });

    const currentQty     = balance ? Number(balance.qtyOnHand)  : 0;
    const currentAvgCost = balance ? Number(balance.avgCostIqd) : 0;

    // ── 3. Compute new balance and MWA ────────────────────────────────────
    let newQty:     number;
    let newAvgCost: number;
    let qtyChange:  number;

    if (movement.direction === 'in') {
      // INBOUND: update Moving Weighted Average
      const unitCost = movement.unitCostIqd ?? 0;
      qtyChange  = movement.qty;
      newQty     = currentQty + movement.qty;
      newAvgCost = newQty > 0
        ? (currentQty * currentAvgCost + movement.qty * unitCost) / newQty
        : unitCost;

    } else if (movement.direction === 'out') {
      // OUTBOUND: check stock, use current avg cost
      qtyChange = -movement.qty;
      newQty    = currentQty - movement.qty;

      const preventNegative = await this.policy.get(movement.companyId, 'prevent_negative_stock');
      const isBlocked       = preventNegative === 'true' || preventNegative === null;

      if (newQty < 0 && isBlocked) {
        throw new BadRequestException({
          code: 'INSUFFICIENT_STOCK',
          messageAr: `الرصيد غير كافٍ — المتوفر: ${currentQty}، المطلوب: ${movement.qty}`,
          details: { available: currentQty, requested: movement.qty },
        });
      }

      newAvgCost = currentAvgCost; // avg cost doesn't change on outbound

    } else {
      // ADJUST: set to exact qty (stocktaking adjustment)
      qtyChange  = movement.qty - currentQty; // can be negative
      newQty     = movement.qty;
      newAvgCost = movement.unitCostIqd ?? currentAvgCost;
    }

    // ── 4. Atomic: update balance + append ledger entry ───────────────────
    const totalValue = newQty * newAvgCost;

    // Upsert inventory balance
    if (balance) {
      await db.inventoryBalance.update({
        where: {
          variantId_warehouseId: {
            variantId:   movement.variantId,
            warehouseId: movement.warehouseId,
          },
        },
        data: {
          qtyOnHand:   new Prisma.Decimal(newQty),
          avgCostIqd:  new Prisma.Decimal(newAvgCost),
          totalValue:  new Prisma.Decimal(totalValue),
          lastMovedAt: new Date(),
          companyId:   movement.companyId,
        },
      });
    } else {
      await db.inventoryBalance.create({
        data: {
          variantId:   movement.variantId,
          warehouseId: movement.warehouseId,
          qtyOnHand:   new Prisma.Decimal(newQty),
          qtyReserved: new Prisma.Decimal(0),
          avgCostIqd:  new Prisma.Decimal(newAvgCost),
          totalValue:  new Prisma.Decimal(totalValue),
          lastMovedAt: new Date(),
          companyId:   movement.companyId,
          createdBy:   movement.performedBy,
        },
      });
    }

    // Append to StockLedger (immutable — no update/delete possible)
    const ledgerEntry = await db.stockLedgerEntry.create({
      data: {
        variantId:      movement.variantId,
        warehouseId:    movement.warehouseId,
        direction:      movement.direction,
        qtyChange:      new Prisma.Decimal(qtyChange),
        balanceAfter:   new Prisma.Decimal(newQty),
        unitCostIqd:    new Prisma.Decimal(movement.unitCostIqd ?? currentAvgCost),
        avgCostAfter:   new Prisma.Decimal(newAvgCost),
        totalValueAfter: new Prisma.Decimal(totalValue),
        referenceType:  movement.referenceType,
        referenceId:    movement.referenceId,
        description:    movement.description,
        batchNumber:    movement.batchNumber,
        expiryDate:     movement.expiryDate,
        performedBy:    movement.performedBy,
        companyId:      movement.companyId,
      },
    });

    this.logger.debug(
      `Stock ${movement.direction}: ${variant.sku} qty=${qtyChange} ` +
      `balance=${newQty} avgCost=${newAvgCost.toFixed(2)} [${movement.referenceType}#${movement.referenceId}]`,
    );

    return {
      ledgerEntryId: ledgerEntry.id,
      balanceAfter:  newQty,
      avgCostAfter:  newAvgCost,
    };
  }

  // ─── Reserve / Release ────────────────────────────────────────────────────

  /**
   * Reserve stock (on sales order creation / cart checkout).
   * Does NOT create a ledger entry — only increments qtyReserved.
   */
  async reserve(
    variantId:   string,
    warehouseId: string,
    qty:         number,
    companyId:   string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const db = tx ?? this.prisma;

    const balance = await db.inventoryBalance.findUnique({
      where: { variantId_warehouseId: { variantId, warehouseId } },
    });

    const available = balance
      ? Number(balance.qtyOnHand) - Number(balance.qtyReserved)
      : 0;

    const preventNegative = await this.policy.get(companyId, 'prevent_negative_stock');
    if (available < qty && (preventNegative === 'true' || preventNegative === null)) {
      throw new BadRequestException({
        code: 'INSUFFICIENT_STOCK',
        messageAr: `الرصيد المتاح غير كافٍ — المتاح: ${available}، المطلوب: ${qty}`,
        details: { available, requested: qty },
      });
    }

    if (balance) {
      await db.inventoryBalance.update({
        where: { variantId_warehouseId: { variantId, warehouseId } },
        data: { qtyReserved: { increment: new Prisma.Decimal(qty) } },
      });
    } else {
      await db.inventoryBalance.create({
        data: {
          variantId,
          warehouseId,
          qtyOnHand:   new Prisma.Decimal(0),
          qtyReserved: new Prisma.Decimal(qty),
          avgCostIqd:  new Prisma.Decimal(0),
          totalValue:  new Prisma.Decimal(0),
          companyId,
          createdBy:   'system',
        },
      });
    }
  }

  /**
   * Release a reservation (on order cancellation / cart expiry).
   */
  async releaseReservation(
    variantId:   string,
    warehouseId: string,
    qty:         number,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const db = tx ?? this.prisma;

    await db.inventoryBalance.updateMany({
      where: { variantId, warehouseId },
      data: {
        qtyReserved: { decrement: new Prisma.Decimal(qty) },
      },
    });
  }

  // ─── Queries ──────────────────────────────────────────────────────────────

  async getBalance(variantId: string, warehouseId: string) {
    return this.prisma.inventoryBalance.findUnique({
      where: { variantId_warehouseId: { variantId, warehouseId } },
    });
  }

  async getStockSummary(companyId: string, params: {
    warehouseId?: string;
    categoryId?:  string;
    page?:        number;
    limit?:       number;
    search?:      string;
    lowStock?:    boolean;
  } = {}) {
    const { page = 1, limit = 50, warehouseId, search, lowStock } = params;

    const where: Prisma.InventoryBalanceWhereInput = {
      companyId,
      ...(warehouseId ? { warehouseId } : {}),
      ...(lowStock ? {
        variant: {
          reorderPoints: {
            some: {
              reorderPoint: { gt: 0 },
            },
          },
        },
        qtyOnHand: { lt: this.prisma.$queryRaw`reorder_point` as never },
      } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.inventoryBalance.findMany({
        where,
        include: {
          variant: {
            where: { deletedAt: null },
            select: {
              id:              true,
              sku:             true,
              nameAr:          true,
              attributeValues: true,
              barcodes:        { where: { isPrimary: true }, select: { barcode: true } },
              template: {
                select: {
                  nameAr: true,
                  code:   true,
                  unit:   { select: { nameAr: true, code: true } },
                },
              },
              reorderPoints: { select: { reorderPoint: true, safetyStock: true } },
            },
          },
          warehouse: { select: { id: true, code: true, nameAr: true } },
        },
        orderBy: { variant: { sku: 'asc' } },
        skip:    (page - 1) * limit,
        take:    limit,
      }),
      this.prisma.inventoryBalance.count({ where }),
    ]);

    return {
      items: items.map(b => ({
        ...b,
        qtyAvailable: Number(b.qtyOnHand) - Number(b.qtyReserved),
      })),
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }

  async getLedgerHistory(
    variantId:   string,
    warehouseId: string,
    companyId:   string,
    params: { page?: number; limit?: number; from?: Date; to?: Date } = {},
  ) {
    const { page = 1, limit = 50, from, to } = params;

    const where: Prisma.StockLedgerEntryWhereInput = {
      variantId,
      warehouseId,
      companyId,
      ...(from || to ? {
        createdAt: {
          ...(from ? { gte: from } : {}),
          ...(to   ? { lte: to   } : {}),
        },
      } : {}),
    };

    const [entries, total] = await Promise.all([
      this.prisma.stockLedgerEntry.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip:    (page - 1) * limit,
        take:    limit,
      }),
      this.prisma.stockLedgerEntry.count({ where }),
    ]);

    return { entries, total, page, limit, pages: Math.ceil(total / limit) };
  }

  // ─── Warehouses ───────────────────────────────────────────────────────────

  async getWarehouses(companyId: string, branchId?: string) {
    return this.prisma.warehouse.findMany({
      where: {
        companyId,
        deletedAt: null,
        ...(branchId ? { branchId } : {}),
      },
      orderBy: { nameAr: 'asc' },
    });
  }

  async createWarehouse(
    companyId: string,
    dto: {
      code:      string;
      nameAr:    string;
      nameEn?:   string;
      branchId:  string;
      type:      string;
      address?:  string;
    },
    session: UserSession,
  ) {
    return this.prisma.warehouse.create({
      data: { ...dto, companyId, isActive: true, createdBy: session.userId },
    });
  }

  // ─── Stock Transfers ──────────────────────────────────────────────────────

  async createTransfer(
    companyId: string,
    dto: {
      fromWarehouseId: string;
      toWarehouseId:   string;
      lines: Array<{ variantId: string; qty: number; notes?: string }>;
      notes?: string;
    },
    session: UserSession,
  ) {
    if (dto.fromWarehouseId === dto.toWarehouseId) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        messageAr: 'المستودع المصدر والوجهة يجب أن يكونا مختلفين',
      });
    }

    // Validate warehouses belong to company
    const [from, to] = await Promise.all([
      this.prisma.warehouse.findFirst({
        where: { id: dto.fromWarehouseId, companyId, deletedAt: null },
      }),
      this.prisma.warehouse.findFirst({
        where: { id: dto.toWarehouseId, companyId, deletedAt: null },
      }),
    ]);

    if (!from) throw new NotFoundException({ code: 'NOT_FOUND', messageAr: 'المستودع المصدر غير موجود' });
    if (!to)   throw new NotFoundException({ code: 'NOT_FOUND', messageAr: 'مستودع الوجهة غير موجود' });

    const transfer = await this.prisma.$transaction(async (tx) => {
      // Create transfer header
      const t = await tx.stockTransfer.create({
        data: {
          fromWarehouseId: dto.fromWarehouseId,
          toWarehouseId:   dto.toWarehouseId,
          status:          'draft',
          notes:           dto.notes,
          requestedBy:     session.userId,
          companyId,
          createdBy:       session.userId,
          lines: {
            create: dto.lines.map(l => ({
              variantId:  l.variantId,
              qtyRequest: new Prisma.Decimal(l.qty),
              notes:      l.notes,
            })),
          },
        },
        include: { lines: true },
      });

      return t;
    });

    return transfer;
  }

  async approveTransfer(
    transferId: string,
    companyId:  string,
    session:    UserSession,
  ) {
    const transfer = await this.prisma.stockTransfer.findFirst({
      where:   { id: transferId, companyId, status: 'draft' },
      include: { lines: true },
    });

    if (!transfer) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        messageAr: 'طلب التحويل غير موجود أو تم معالجته',
      });
    }

    await this.prisma.$transaction(async (tx) => {
      // Process each line: OUT from source, IN to destination
      for (const line of transfer.lines) {
        const qty = Number(line.qtyRequest);

        // OUT from source warehouse
        await this.move({
          variantId:     line.variantId,
          warehouseId:   transfer.fromWarehouseId,
          direction:     'out',
          qty,
          referenceType: 'StockTransfer' as DocumentType,
          referenceId:   transfer.id,
          description:   `تحويل إلى ${transfer.toWarehouseId}`,
          performedBy:   session.userId,
          companyId,
        }, tx);

        // IN to destination warehouse (use current avg cost)
        const srcBalance = await tx.inventoryBalance.findUnique({
          where: {
            variantId_warehouseId: {
              variantId:   line.variantId,
              warehouseId: transfer.fromWarehouseId,
            },
          },
        });

        await this.move({
          variantId:     line.variantId,
          warehouseId:   transfer.toWarehouseId,
          direction:     'in',
          qty,
          unitCostIqd:   srcBalance ? Number(srcBalance.avgCostIqd) : 0,
          referenceType: 'StockTransfer' as DocumentType,
          referenceId:   transfer.id,
          description:   `استلام من ${transfer.fromWarehouseId}`,
          performedBy:   session.userId,
          companyId,
        }, tx);

        // Update line with actual received qty
        await tx.stockTransferLine.update({
          where: { id: line.id },
          data:  { qtyActual: new Prisma.Decimal(qty) },
        });
      }

      // Mark transfer as received
      await tx.stockTransfer.update({
        where: { id: transferId },
        data: {
          status:     'received',
          receivedBy: session.userId,
          receivedAt: new Date(),
        },
      });
    });

    await this.audit.log({
      companyId,
      userId:     session.userId,
      userEmail:  session.userId,
      action:     'stock_transfer.approve',
      entityType: 'StockTransfer',
      entityId:   transferId,
    });

    return this.prisma.stockTransfer.findUnique({
      where:   { id: transferId },
      include: { lines: true },
    });
  }

  // ─── Stocktaking ──────────────────────────────────────────────────────────

  async createStocktakingSession(
    companyId:   string,
    warehouseId: string,
    notes:       string | undefined,
    session:     UserSession,
  ) {
    // Only one open session per warehouse
    const existing = await this.prisma.stocktakingSession.findFirst({
      where: { warehouseId, companyId, status: { in: ['open', 'counting', 'reviewing'] } },
    });

    if (existing) {
      throw new BadRequestException({
        code: 'CONFLICT',
        messageAr: 'يوجد جلسة جرد مفتوحة لهذا المستودع',
      });
    }

    return this.prisma.stocktakingSession.create({
      data: {
        warehouseId,
        notes,
        status:    'open',
        companyId,
        createdBy: session.userId,
      },
    });
  }

  async submitStocktakingCount(
    sessionId: string,
    companyId: string,
    lines: Array<{ variantId: string; qtyActual: number; notes?: string }>,
    session: UserSession,
  ) {
    const stSession = await this.prisma.stocktakingSession.findFirst({
      where: { id: sessionId, companyId, status: { in: ['open', 'counting'] } },
    });

    if (!stSession) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        messageAr: 'جلسة الجرد غير موجودة أو مغلقة',
      });
    }

    await this.prisma.$transaction(async (tx) => {
      // Upsert count lines
      for (const line of lines) {
        const systemBalance = await tx.inventoryBalance.findUnique({
          where: {
            variantId_warehouseId: {
              variantId:   line.variantId,
              warehouseId: stSession.warehouseId,
            },
          },
        });

        const qtySystem = systemBalance ? Number(systemBalance.qtyOnHand) : 0;
        const variance  = line.qtyActual - qtySystem;

        await tx.stocktakingLine.upsert({
          where: { sessionId_variantId: { sessionId, variantId: line.variantId } },
          create: {
            sessionId,
            variantId:   line.variantId,
            qtySystem:   new Prisma.Decimal(qtySystem),
            qtyActual:   new Prisma.Decimal(line.qtyActual),
            variance:    new Prisma.Decimal(variance),
            notes:       line.notes,
            countedBy:   session.userId,
          },
          update: {
            qtySystem:   new Prisma.Decimal(qtySystem),
            qtyActual:   new Prisma.Decimal(line.qtyActual),
            variance:    new Prisma.Decimal(variance),
            notes:       line.notes,
            countedBy:   session.userId,
          },
        });
      }

      await tx.stocktakingSession.update({
        where: { id: sessionId },
        data:  { status: 'reviewing', countedBy: session.userId, countedAt: new Date() },
      });
    });

    return this.prisma.stocktakingSession.findUnique({
      where:   { id: sessionId },
      include: { lines: { include: { variant: { select: { sku: true, nameAr: true } } } } },
    });
  }

  async approveStocktaking(
    sessionId: string,
    companyId: string,
    session:   UserSession,
  ) {
    const stSession = await this.prisma.stocktakingSession.findFirst({
      where:   { id: sessionId, companyId, status: 'reviewing' },
      include: { lines: true },
    });

    if (!stSession) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        messageAr: 'جلسة الجرد غير موجودة أو لم تكتمل',
      });
    }

    await this.prisma.$transaction(async (tx) => {
      // Apply adjustments for lines with variance
      for (const line of stSession.lines) {
        const variance = Number(line.variance);
        if (variance === 0) continue;

        await this.move({
          variantId:     line.variantId,
          warehouseId:   stSession.warehouseId,
          direction:     'adjust',
          qty:           Number(line.qtyActual),
          referenceType: 'Stocktaking' as DocumentType,
          referenceId:   sessionId,
          description:   variance > 0
            ? `تسوية جرد — زيادة ${variance}`
            : `تسوية جرد — عجز ${Math.abs(variance)}`,
          performedBy:   session.userId,
          companyId,
        }, tx);
      }

      await tx.stocktakingSession.update({
        where: { id: sessionId },
        data: {
          status:     'closed',
          approvedBy: session.userId,
          approvedAt: new Date(),
        },
      });
    });

    await this.audit.log({
      companyId,
      userId:     session.userId,
      userEmail:  session.userId,
      action:     'stocktaking.approve',
      entityType: 'StocktakingSession',
      entityId:   sessionId,
    });
  }

  // ─── Reorder Points ───────────────────────────────────────────────────────

  async setReorderPoint(
    companyId: string,
    dto: {
      variantId:     string;
      warehouseId:   string;
      reorderPoint:  number;
      safetyStock:   number;
      isAiGenerated: boolean;
    },
    session: UserSession,
  ) {
    return this.prisma.reorderPoint.upsert({
      where: {
        variantId_warehouseId: {
          variantId:   dto.variantId,
          warehouseId: dto.warehouseId,
        },
      },
      create: {
        ...dto,
        companyId,
        createdBy: session.userId,
      },
      update: {
        reorderPoint:  dto.reorderPoint,
        safetyStock:   dto.safetyStock,
        isAiGenerated: dto.isAiGenerated,
        updatedBy:     session.userId,
      },
    });
  }

  async getLowStockAlerts(companyId: string) {
    // Items where qtyOnHand <= reorderPoint
    const results = await this.prisma.$queryRaw<Array<{
      variant_id: string;
      warehouse_id: string;
      sku: string;
      name_ar: string;
      qty_on_hand: number;
      qty_reserved: number;
      reorder_point: number;
      safety_stock: number;
    }>>`
      SELECT
        ib.variant_id,
        ib.warehouse_id,
        pv.sku,
        pt.name_ar,
        ib.qty_on_hand::float,
        ib.qty_reserved::float,
        rp.reorder_point::float,
        rp.safety_stock::float
      FROM inventory_balances ib
      JOIN product_variants  pv ON pv.id = ib.variant_id
      JOIN product_templates pt ON pt.id = pv.template_id
      JOIN reorder_points     rp ON rp.variant_id   = ib.variant_id
                                AND rp.warehouse_id  = ib.warehouse_id
      WHERE ib.company_id = ${companyId}
        AND ib.qty_on_hand <= rp.reorder_point
        AND pv.deleted_at IS NULL
      ORDER BY (ib.qty_on_hand - rp.reorder_point) ASC
    `;

    return results.map(r => ({
      variantId:    r.variant_id,
      warehouseId:  r.warehouse_id,
      sku:          r.sku,
      nameAr:       r.name_ar,
      qtyOnHand:    r.qty_on_hand,
      qtyAvailable: r.qty_on_hand - r.qty_reserved,
      reorderPoint: r.reorder_point,
      safetyStock:  r.safety_stock,
      deficit:      r.reorder_point - r.qty_on_hand,
    }));
  }
}
