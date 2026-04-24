import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../platform/prisma/prisma.service';
import { AuditService } from '../../engines/audit/audit.service';
import { SequenceService } from '../../engines/sequence/sequence.service';
import { PostingService } from '../../engines/posting/posting.service';
import { InventoryService } from '../inventory/inventory.service';
import { Prisma, DeliveryStatus } from '@prisma/client';
import type { UserSession } from '@erp/shared-types';

type CreateDto = {
  salesOrderId?: string;
  invoiceId?: string;
  customerId: string;
  warehouseId: string;
  branchId?: string;
  plannedDate?: Date | string;
  deliveryAddress: string;
  deliveryCity?: string;
  deliveryLat?: number;
  deliveryLng?: number;
  contactPhone?: string;
  shippingFeeIqd?: number | string;
  codAmountIqd?: number | string;
  notes?: string;
};

type ListFilters = {
  page?: number;
  limit?: number;
  status?: DeliveryStatus;
  driverId?: string;
  customerId?: string;
  from?: Date | string;
  to?: Date | string;
};

type ProofData = {
  proofImageUrl?: string;
  proofSignatureUrl?: string;
  proofOtpCode?: string;
  lat?: number;
  lng?: number;
  codCollectedIqd?: number | string;
};

const VALID_TRANSITIONS: Record<DeliveryStatus, DeliveryStatus[]> = {
  pending_dispatch: ['assigned', 'cancelled'],
  assigned: ['in_transit', 'cancelled', 'pending_dispatch'],
  in_transit: ['delivered', 'failed', 'cancelled'],
  delivered: [],
  failed: ['assigned', 'returned', 'cancelled'],
  returned: [],
  cancelled: [],
};

@Injectable()
export class DeliveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sequence: SequenceService,
    private readonly posting: PostingService,
    private readonly inventory: InventoryService,
  ) {}

  private assertTransition(from: DeliveryStatus, to: DeliveryStatus) {
    const allowed = VALID_TRANSITIONS[from] ?? [];
    if (!allowed.includes(to)) {
      throw new BadRequestException({
        code: 'DLV_INVALID_TRANSITION',
        messageAr: `لا يمكن تغيير حالة التسليم من ${from} إلى ${to}`,
      });
    }
  }

  private toDecimal(v: number | string | Prisma.Decimal | undefined | null): Prisma.Decimal {
    if (v === undefined || v === null || v === '') return new Prisma.Decimal(0);
    return new Prisma.Decimal(v as any);
  }

  async create(companyId: string, dto: CreateDto, session: UserSession) {
    if (!dto.customerId || !dto.warehouseId || !dto.deliveryAddress) {
      throw new BadRequestException({
        code: 'DLV_MISSING_FIELDS',
        messageAr: 'بيانات التسليم غير مكتملة',
      });
    }

    const codAmount = this.toDecimal(dto.codAmountIqd);

    if (codAmount.gt(0) && dto.invoiceId) {
      const invoice = await this.prisma.salesInvoice.findFirst({
        where: { id: dto.invoiceId, companyId },
        select: { id: true, status: true },
      });
      if (!invoice) {
        throw new NotFoundException({
          code: 'DLV_INVOICE_NOT_FOUND',
          messageAr: 'الفاتورة غير موجودة',
        });
      }
      if (invoice.status !== 'posted') {
        throw new BadRequestException({
          code: 'DLV_INVOICE_NOT_POSTED',
          messageAr: 'الفاتورة غير مرحّلة، لا يمكن ربط تسليم بقيمة تحصيل',
        });
      }
    }

    const number = await this.sequence.next(companyId, 'DLV');

    const result = await this.prisma.$transaction(async (tx) => {
      const delivery = await tx.deliveryOrder.create({
        data: {
          companyId,
          branchId:        dto.branchId ?? session.branchId ?? '',
          number,
          salesOrderId:    dto.salesOrderId ?? null,
          invoiceId:       dto.invoiceId ?? null,
          customerId:      dto.customerId,
          warehouseId:     dto.warehouseId,
          status:          DeliveryStatus.pending_dispatch,
          plannedDate:     dto.plannedDate ? new Date(dto.plannedDate) : null,
          deliveryAddress: dto.deliveryAddress,
          deliveryCity:    dto.deliveryCity ?? null,
          deliveryLat:     dto.deliveryLat ?? null,
          deliveryLng:     dto.deliveryLng ?? null,
          createdBy:       session.userId,
          contactPhone: dto.contactPhone ?? null,
          shippingFeeIqd: this.toDecimal(dto.shippingFeeIqd),
          codAmountIqd: codAmount,
          codCollectedIqd: new Prisma.Decimal(0),
          notes: dto.notes ?? null,
        },
      });

      await tx.deliveryStatusLog.create({
        data: {
          deliveryId: delivery.id,
          fromStatus: null,
          toStatus: DeliveryStatus.pending_dispatch,
          lat: dto.deliveryLat ?? null,
          lng: dto.deliveryLng ?? null,
          notes: 'Created',
          changedBy: session.userId,
        },
      });

      await this.audit.log({
        companyId,
        userId: session.userId,
        action: 'delivery.create',
        entityType: 'DeliveryOrder',
        entityId: delivery.id,
        metadata: { number, customerId: dto.customerId },
      });

      return delivery;
    });

    return result;
  }

  async findAll(companyId: string, filters: ListFilters = {}) {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(200, Math.max(1, filters.limit ?? 50));
    const skip = (page - 1) * limit;

    const where: Prisma.DeliveryOrderWhereInput = { companyId };
    if (filters.status) where.status = filters.status;
    if (filters.driverId) where.driverId = filters.driverId;
    if (filters.customerId) where.customerId = filters.customerId;
    if (filters.from || filters.to) {
      where.plannedDate = {};
      if (filters.from) (where.plannedDate as any).gte = new Date(filters.from);
      if (filters.to) (where.plannedDate as any).lte = new Date(filters.to);
    }

    const [rows, total] = await Promise.all([
      this.prisma.deliveryOrder.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ plannedDate: 'asc' }, { createdAt: 'desc' }],
      }),
      this.prisma.deliveryOrder.count({ where }),
    ]);

    return { rows, total, page, limit };
  }

  async findOne(id: string, companyId: string) {
    const delivery = await this.prisma.deliveryOrder.findFirst({
      where: { id, companyId },
      include: {
        statusLogs: { orderBy: { changedAt: 'asc' } },
        salesOrder: true,
      },
    });
    if (!delivery) {
      throw new NotFoundException({
        code: 'DLV_NOT_FOUND',
        messageAr: 'أمر التسليم غير موجود',
      });
    }
    return delivery;
  }

  private async loadForTransition(id: string, companyId: string) {
    const delivery = await this.prisma.deliveryOrder.findFirst({
      where: { id, companyId },
    });
    if (!delivery) {
      throw new NotFoundException({
        code: 'DLV_NOT_FOUND',
        messageAr: 'أمر التسليم غير موجود',
      });
    }
    return delivery;
  }

  async assign(deliveryId: string, companyId: string, driverId: string, session: UserSession) {
    if (!driverId) {
      throw new BadRequestException({
        code: 'DLV_DRIVER_REQUIRED',
        messageAr: 'يجب تحديد السائق',
      });
    }
    const delivery = await this.loadForTransition(deliveryId, companyId);
    this.assertTransition(delivery.status, DeliveryStatus.assigned);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.deliveryOrder.update({
        where: { id: deliveryId },
        data: { driverId, status: DeliveryStatus.assigned },
      });
      await tx.deliveryStatusLog.create({
        data: {
          deliveryId,
          fromStatus: delivery.status,
          toStatus: DeliveryStatus.assigned,
          notes: `Assigned to driver ${driverId}`,
          changedBy: session.userId,
        },
      });
      await this.audit.log({
        companyId,
        userId: session.userId,
        action: 'delivery.assign',
        entityType: 'DeliveryOrder',
        entityId: deliveryId,
        metadata: { driverId },
      });
      return updated;
    });
  }

  async dispatch(
    deliveryId: string,
    companyId: string,
    loc: { lat?: number; lng?: number },
    session: UserSession,
  ) {
    const delivery = await this.loadForTransition(deliveryId, companyId);
    this.assertTransition(delivery.status, DeliveryStatus.in_transit);
    if (!delivery.driverId) {
      throw new BadRequestException({
        code: 'DLV_NO_DRIVER',
        messageAr: 'لم يتم تعيين سائق',
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.deliveryOrder.update({
        where: { id: deliveryId },
        data: { status: DeliveryStatus.in_transit, dispatchedAt: new Date() },
      });
      await tx.deliveryStatusLog.create({
        data: {
          deliveryId,
          fromStatus: delivery.status,
          toStatus: DeliveryStatus.in_transit,
          lat: loc.lat ?? null,
          lng: loc.lng ?? null,
          notes: 'Dispatched',
          changedBy: session.userId,
        },
      });
      await this.audit.log({
        companyId,
        userId: session.userId,
        action: 'delivery.dispatch',
        entityType: 'DeliveryOrder',
        entityId: deliveryId,
      });
      return updated;
    });
  }

  async markDelivered(
    deliveryId: string,
    companyId: string,
    proof: ProofData,
    session: UserSession,
  ) {
    const delivery = await this.loadForTransition(deliveryId, companyId);
    this.assertTransition(delivery.status, DeliveryStatus.delivered);

    if (!proof.proofImageUrl && !proof.proofSignatureUrl && !proof.proofOtpCode) {
      throw new BadRequestException({
        code: 'DLV_PROOF_REQUIRED',
        messageAr: 'يجب تقديم إثبات التسليم (صورة أو توقيع أو رمز تحقق)',
      });
    }

    const codCollected = this.toDecimal(proof.codCollectedIqd);
    const codAmount = delivery.codAmountIqd as unknown as Prisma.Decimal;
    const warn = codAmount.gt(0) && !codCollected.equals(codAmount);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.deliveryOrder.update({
        where: { id: deliveryId },
        data: {
          status: DeliveryStatus.delivered,
          deliveredAt: new Date(),
          proofImageUrl: proof.proofImageUrl ?? delivery.proofImageUrl,
          proofSignatureUrl: proof.proofSignatureUrl ?? delivery.proofSignatureUrl,
          proofOtpCode: proof.proofOtpCode ?? delivery.proofOtpCode,
          codCollectedIqd: codCollected,
        },
      });

      await tx.deliveryStatusLog.create({
        data: {
          deliveryId,
          fromStatus: delivery.status,
          toStatus: DeliveryStatus.delivered,
          lat: proof.lat ?? null,
          lng: proof.lng ?? null,
          notes: warn ? `Delivered (COD mismatch: expected ${codAmount.toString()}, got ${codCollected.toString()})` : 'Delivered',
          changedBy: session.userId,
        },
      });

      if (delivery.salesOrderId) {
        const lines = await tx.salesOrderLine.findMany({
          where: { salesOrderId: delivery.salesOrderId },
        });
        for (const line of lines) {
          const pending = (line.qty as unknown as Prisma.Decimal).minus(
            (line.qtyDelivered as unknown as Prisma.Decimal) ?? new Prisma.Decimal(0),
          );
          if (pending.gt(0)) {
            await tx.salesOrderLine.update({
              where: { id: line.id },
              data: {
                qtyDelivered: (line.qtyDelivered as unknown as Prisma.Decimal).plus(pending),
              },
            });
          }
        }
      }

      await this.audit.log({
        companyId,
        userId: session.userId,
        action: 'delivery.delivered',
        entityType: 'DeliveryOrder',
        entityId: deliveryId,
        metadata: {
          codCollected: codCollected.toString(),
          codExpected: codAmount.toString(),
          mismatch: warn,
        },
      });

      return { delivery: updated, codMismatch: warn };
    });
  }

  async markFailed(
    deliveryId: string,
    companyId: string,
    reason: string,
    lat: number | undefined,
    lng: number | undefined,
    session: UserSession,
  ) {
    if (!reason || reason.trim().length === 0) {
      throw new BadRequestException({
        code: 'DLV_REASON_REQUIRED',
        messageAr: 'يجب إدخال سبب الفشل',
      });
    }
    const delivery = await this.loadForTransition(deliveryId, companyId);
    this.assertTransition(delivery.status, DeliveryStatus.failed);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.deliveryOrder.update({
        where: { id: deliveryId },
        data: {
          status: DeliveryStatus.failed,
          failedAt: new Date(),
          failureReason: reason,
        },
      });
      await tx.deliveryStatusLog.create({
        data: {
          deliveryId,
          fromStatus: delivery.status,
          toStatus: DeliveryStatus.failed,
          lat: lat ?? null,
          lng: lng ?? null,
          notes: reason,
          changedBy: session.userId,
        },
      });
      await this.audit.log({
        companyId,
        userId: session.userId,
        action: 'delivery.failed',
        entityType: 'DeliveryOrder',
        entityId: deliveryId,
        metadata: { reason },
      });
      return updated;
    });
  }

  async markReturned(
    deliveryId: string,
    companyId: string,
    opts: { restockWarehouseId: string },
    session: UserSession,
  ) {
    if (!opts.restockWarehouseId) {
      throw new BadRequestException({
        code: 'DLV_RESTOCK_WH_REQUIRED',
        messageAr: 'يجب تحديد مستودع الاسترجاع',
      });
    }
    const delivery = await this.loadForTransition(deliveryId, companyId);
    this.assertTransition(delivery.status, DeliveryStatus.returned);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.deliveryOrder.update({
        where: { id: deliveryId },
        data: { status: DeliveryStatus.returned },
      });

      await tx.deliveryStatusLog.create({
        data: {
          deliveryId,
          fromStatus: delivery.status,
          toStatus: DeliveryStatus.returned,
          notes: `Returned to warehouse ${opts.restockWarehouseId}`,
          changedBy: session.userId,
        },
      });

      if (delivery.invoiceId) {
        const invoiceLines = await tx.salesInvoiceLine.findMany({
          where: { invoiceId: delivery.invoiceId },
        });

        for (const line of invoiceLines) {
          if (!line.variantId) continue;
          const qty = line.qty as unknown as Prisma.Decimal;
          if (qty.lte(0)) continue;
          await this.inventory.move(
            {
              companyId,
              direction:     'in',
              variantId:     line.variantId,
              warehouseId:   opts.restockWarehouseId,
              qty:           Number(qty),
              referenceType: 'DeliveryReturn' as any,
              referenceId:   delivery.id,
              unitCostIqd:   Number(line.unitCostIqd ?? 0),
              performedBy:   session.userId,
            },
            tx,
          );
        }

        const cogsJe = await tx.journalEntry.findFirst({
          where: {
            companyId,
            referenceType: 'SalesInvoiceCOGS',
            referenceId:   delivery.invoiceId ?? '',
          },
        });
        if (cogsJe) {
          await this.posting.reverseEntry(
            {
              originalEntryId: cogsJe.id,
              reason:          `Delivery return ${delivery.number}`,
              reversedBy:      session.userId,
            },
            tx,
          );
        }
      }

      await this.audit.log({
        companyId,
        userId: session.userId,
        action: 'delivery.returned',
        entityType: 'DeliveryOrder',
        entityId: deliveryId,
        metadata: { restockWarehouseId: opts.restockWarehouseId },
      });

      return updated;
    });
  }

  async cancel(deliveryId: string, companyId: string, reason: string, session: UserSession) {
    const delivery = await this.loadForTransition(deliveryId, companyId);
    this.assertTransition(delivery.status, DeliveryStatus.cancelled);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.deliveryOrder.update({
        where: { id: deliveryId },
        data: { status: DeliveryStatus.cancelled },
      });
      await tx.deliveryStatusLog.create({
        data: {
          deliveryId,
          fromStatus: delivery.status,
          toStatus: DeliveryStatus.cancelled,
          notes: reason ?? 'Cancelled',
          changedBy: session.userId,
        },
      });
      await this.audit.log({
        companyId,
        userId: session.userId,
        action: 'delivery.cancel',
        entityType: 'DeliveryOrder',
        entityId: deliveryId,
        metadata: { reason },
      });
      return updated;
    });
  }

  async depositCod(
    deliveryId: string,
    companyId: string,
    opts: { cashAccountId: string; bankAccountId: string },
    session: UserSession,
  ) {
    const delivery = await this.loadForTransition(deliveryId, companyId);

    if (delivery.status !== DeliveryStatus.delivered) {
      throw new BadRequestException({
        code: 'DLV_NOT_DELIVERED',
        messageAr: 'التسليم لم يكتمل بعد',
      });
    }
    const collected = delivery.codCollectedIqd as unknown as Prisma.Decimal;
    if (!collected || collected.lte(0)) {
      throw new BadRequestException({
        code: 'DLV_NO_COD',
        messageAr: 'لا يوجد مبلغ تحصيل',
      });
    }
    if (delivery.codDepositedAt) {
      throw new BadRequestException({
        code: 'DLV_COD_ALREADY_DEPOSITED',
        messageAr: 'تم إيداع المبلغ مسبقاً',
      });
    }
    if (!opts.cashAccountId || !opts.bankAccountId) {
      throw new BadRequestException({
        code: 'DLV_ACCOUNTS_REQUIRED',
        messageAr: 'يجب تحديد حسابي النقد والبنك',
      });
    }

    return this.prisma.$transaction(async (tx) => {
      // Fetch account codes from ids
      const [bankAcc, cashAcc] = await Promise.all([
        tx.chartOfAccount.findUnique({ where: { id: opts.bankAccountId }, select: { code: true } }),
        tx.chartOfAccount.findUnique({ where: { id: opts.cashAccountId }, select: { code: true } }),
      ]);
      if (!bankAcc || !cashAcc) {
        throw new BadRequestException({
          code: 'ACCOUNT_NOT_FOUND',
          messageAr: 'حسابات غير موجودة',
        });
      }

      const je = await this.posting.postJournalEntry(
        {
          companyId,
          entryDate:   new Date(),
          refType:     'DeliveryCODDeposit',
          refId:       delivery.id,
          description: `COD deposit for delivery ${delivery.number}`,
          lines: [
            { accountCode: bankAcc.code, debit:  Number(collected), description: 'Bank deposit' },
            { accountCode: cashAcc.code, credit: Number(collected), description: 'Cash out' },
          ],
        },
        session,
        tx,
      );

      const updated = await tx.deliveryOrder.update({
        where: { id: deliveryId },
        data: {
          codDepositedAt: new Date(),
          codDepositJeId: je.id,
        },
      });

      await this.audit.log({
        companyId,
        userId: session.userId,
        action: 'delivery.cod_deposit',
        entityType: 'DeliveryOrder',
        entityId: deliveryId,
        metadata: { jeId: je.id, amount: collected.toString() },
      });

      return updated;
    });
  }

  async codReport(
    companyId: string,
    driverId: string | undefined,
    range: { from: Date | string; to: Date | string },
  ) {
    const where: Prisma.DeliveryOrderWhereInput = {
      companyId,
      status: DeliveryStatus.delivered,
      codDepositedAt: null,
      deliveredAt: {
        gte: new Date(range.from),
        lte: new Date(range.to),
      },
    };
    if (driverId) where.driverId = driverId;

    const rows = await this.prisma.deliveryOrder.findMany({
      where,
      select: {
        id: true,
        number: true,
        driverId: true,
        customerId: true,
        codCollectedIqd: true,
        deliveredAt: true,
      },
      orderBy: { deliveredAt: 'asc' },
    });

    const outstanding = rows.reduce(
      (acc, r) => acc.plus((r.codCollectedIqd as unknown as Prisma.Decimal) ?? new Prisma.Decimal(0)),
      new Prisma.Decimal(0),
    );

    return { rows, outstanding: outstanding.toString(), count: rows.length };
  }

  async myDeliveries(
    driverId: string,
    companyId: string,
    filters: { status?: DeliveryStatus } = {},
  ) {
    const where: Prisma.DeliveryOrderWhereInput = { companyId, driverId };
    if (filters.status) where.status = filters.status;
    return this.prisma.deliveryOrder.findMany({
      where,
      orderBy: [{ plannedDate: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async submitProofOfDelivery(
    deliveryId: string,
    companyId: string,
    proof: ProofData,
    session: UserSession,
  ) {
    if (!proof.proofImageUrl) {
      throw new BadRequestException({
        code: 'DLV_PHOTO_REQUIRED',
        messageAr: 'يجب رفع صورة إثبات التسليم',
      });
    }
    return this.markDelivered(deliveryId, companyId, proof, session);
  }

  async updateLocation(
    deliveryId: string,
    companyId: string,
    lat: number,
    lng: number,
    session: UserSession,
  ) {
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      throw new BadRequestException({
        code: 'DLV_LOCATION_INVALID',
        messageAr: 'الإحداثيات غير صحيحة',
      });
    }
    const delivery = await this.loadForTransition(deliveryId, companyId);
    if (delivery.driverId && delivery.driverId !== session.userId) {
      throw new ForbiddenException({
        code: 'DLV_NOT_YOUR_DELIVERY',
        messageAr: 'هذا التسليم غير مخصص لك',
      });
    }

    return this.prisma.deliveryStatusLog.create({
      data: {
        deliveryId,
        fromStatus: delivery.status,
        toStatus: delivery.status,
        lat,
        lng,
        notes: 'GPS ping',
        changedBy: session.userId,
      },
    });
  }

  async dailyRouteForDriver(driverId: string, companyId: string, date: Date | string) {
    const day = new Date(date);
    const start = new Date(day.setHours(0, 0, 0, 0));
    const end = new Date(day.setHours(23, 59, 59, 999));

    const rows = await this.prisma.deliveryOrder.findMany({
      where: {
        companyId,
        driverId,
        plannedDate: { gte: start, lte: end },
        status: { in: [DeliveryStatus.assigned, DeliveryStatus.in_transit] },
      },
      orderBy: [{ deliveryCity: 'asc' }, { plannedDate: 'asc' }],
    });

    const grouped: Record<string, typeof rows> = {};
    for (const r of rows) {
      const key = r.deliveryCity ?? '—';
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(r);
    }

    return { date: start.toISOString().substring(0, 10), groupedByCity: grouped, total: rows.length };
  }

  async driverPerformanceReport(
    driverId: string,
    companyId: string,
    from: Date | string,
    to: Date | string,
  ) {
    const fromDate = new Date(from);
    const toDate = new Date(to);

    const deliveries = await this.prisma.deliveryOrder.findMany({
      where: {
        companyId,
        driverId,
        OR: [
          { deliveredAt: { gte: fromDate, lte: toDate } },
          { failedAt: { gte: fromDate, lte: toDate } },
        ],
      },
    });

    const total = deliveries.length;
    const delivered = deliveries.filter((d) => d.status === DeliveryStatus.delivered);
    const failed = deliveries.filter((d) => d.status === DeliveryStatus.failed);

    const onTime = delivered.filter(
      (d) => d.plannedDate && d.deliveredAt && d.deliveredAt <= d.plannedDate,
    ).length;
    const onTimePct = delivered.length > 0 ? (onTime / delivered.length) * 100 : 0;
    const failureRate = total > 0 ? (failed.length / total) * 100 : 0;

    const ratings = delivered
      .map((d) => d.customerRating)
      .filter((r): r is number => typeof r === 'number' && r > 0);
    const avgRating =
      ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;

    const codCollected = delivered.reduce(
      (acc, d) => acc.plus((d.codCollectedIqd as unknown as Prisma.Decimal) ?? new Prisma.Decimal(0)),
      new Prisma.Decimal(0),
    );

    return {
      driverId,
      from: fromDate,
      to: toDate,
      totalDeliveries: total,
      delivered: delivered.length,
      failed: failed.length,
      onTimePct: Number(onTimePct.toFixed(2)),
      failureRate: Number(failureRate.toFixed(2)),
      avgRating: Number(avgRating.toFixed(2)),
      codCollected: codCollected.toString(),
    };
  }
}
