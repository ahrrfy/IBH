import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AuditService } from '../../../engines/audit/audit.service';
import { SequenceService } from '../../../engines/sequence/sequence.service';
import { Prisma } from '@prisma/client';
import type { UserSession } from '@erp/shared-types';

export interface POLineInput {
  variantId: string;
  qtyOrdered: number | string;
  unitCostIqd: number | string;
  discountPct?: number;
}

export interface CreatePurchaseOrderDto {
  supplierId: string;
  warehouseId: string;
  branchId?: string;
  orderDate?: Date;
  expectedDate?: Date;
  lines: POLineInput[];
  currency?: string;
  exchangeRate?: number | string;
  paymentTerms?: string;
  terms?: string;
  notes?: string;
  discountIqd?: number | string;
  taxIqd?: number | string;
  shippingIqd?: number | string;
}

export interface FindPurchaseOrdersQuery {
  page?: number;
  limit?: number;
  supplierId?: string;
  status?: string;
  from?: string;
  to?: string;
}

@Injectable()
export class PurchaseOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sequence: SequenceService,
  ) {}

  private computeTotals(
    lines: POLineInput[],
    discountIqd = 0,
    taxIqd = 0,
    shippingIqd = 0,
  ) {
    let subtotal = new Prisma.Decimal(0);
    const computedLines = lines.map((l) => {
      const qty = new Prisma.Decimal(l.qtyOrdered);
      const unit = new Prisma.Decimal(l.unitCostIqd);
      const gross = qty.mul(unit);
      const disc = new Prisma.Decimal(l.discountPct ?? 0).div(100);
      const lineTotal = gross.sub(gross.mul(disc));
      subtotal = subtotal.add(lineTotal);
      return {
        ...l,
        qtyOrdered: qty,
        unitCostIqd: unit,
        discountPct: new Prisma.Decimal(l.discountPct ?? 0),
        lineTotalIqd: lineTotal,
      };
    });
    const discount = new Prisma.Decimal(discountIqd);
    const tax = new Prisma.Decimal(taxIqd);
    const shipping = new Prisma.Decimal(shippingIqd);
    const total = subtotal.sub(discount).add(tax).add(shipping);
    return {
      subtotalIqd: subtotal,
      discountIqd: discount,
      taxIqd: tax,
      shippingIqd: shipping,
      totalIqd: total,
      lines: computedLines,
    };
  }

  async create(
    companyId: string,
    dto: CreatePurchaseOrderDto,
    session: UserSession,
  ) {
    if (!dto.lines || dto.lines.length === 0) {
      throw new BadRequestException({
        code: 'PO_LINES_REQUIRED',
        messageAr: 'يجب إضافة بنود للطلب',
      });
    }

    const supplier = await this.prisma.supplier.findFirst({
      where: { id: dto.supplierId, companyId, deletedAt: null },
    });
    if (!supplier) {
      throw new NotFoundException({
        code: 'SUPPLIER_NOT_FOUND',
        messageAr: 'المورّد غير موجود',
      });
    }

    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: dto.warehouseId, companyId },
    });
    if (!warehouse) {
      throw new NotFoundException({
        code: 'WAREHOUSE_NOT_FOUND',
        messageAr: 'المستودع غير موجود',
      });
    }

    const variantIds = Array.from(new Set(dto.lines.map((l) => l.variantId)));
    const variants = await this.prisma.productVariant.findMany({
      where: { id: { in: variantIds } },
    });
    if (variants.length !== variantIds.length) {
      throw new BadRequestException({
        code: 'VARIANT_NOT_FOUND',
        messageAr: 'أحد الأصناف غير موجود',
      });
    }

    const totals = this.computeTotals(
      dto.lines,
      (dto.discountIqd as any) ?? 0,
      (dto.taxIqd as any) ?? 0,
      (dto.shippingIqd as any) ?? 0,
    );

    const number = await this.sequence.nextNumber({
      companyId,
      sequenceCode: 'PO',
    } as any);

    const po = await this.prisma.$transaction(async (tx) => {
      const created = await tx.purchaseOrder.create({
        data: {
          companyId,
          branchId:     dto.branchId ?? (session as any).branchId ?? '',
          number,
          supplierId:   dto.supplierId,
          orderDate:    dto.orderDate ?? new Date(),
          expectedDate: dto.expectedDate,
          status:       'draft' as any,
          warehouseId:  dto.warehouseId,
          subtotalIqd:  totals.subtotalIqd,
          discountIqd:  totals.discountIqd,
          taxIqd:       totals.taxIqd,
          shippingIqd:  totals.shippingIqd,
          totalIqd:     totals.totalIqd,
          currency:     dto.currency || 'IQD',
          exchangeRate: new Prisma.Decimal(dto.exchangeRate ?? 1),
          paymentTerms: dto.paymentTerms,
          terms:        dto.terms,
          notes:        dto.notes,
          createdBy:    session.userId,
          updatedBy:    session.userId,
          lines: {
            create: totals.lines.map((l) => ({
              variantId: l.variantId,
              qtyOrdered: l.qtyOrdered as any,
              qtyReceived: new Prisma.Decimal(0),
              qtyInvoiced: new Prisma.Decimal(0),
              qtyRejected: new Prisma.Decimal(0),
              unitCostIqd: l.unitCostIqd as any,
              discountPct: l.discountPct as any,
              lineTotalIqd: l.lineTotalIqd as any,
            })),
          },
        },
        include: { lines: true },
      });
      return created;
    });

    await this.audit.log({
      companyId,
      userId: session.userId,
      userEmail: session.userId,
      action: 'purchase.order.create',
      entityType: 'PurchaseOrder',
      entityId: po.id,
      after: po,
    } as any);

    return po;
  }

  async findAll(companyId: string, query: FindPurchaseOrdersQuery = {}) {
    const page = query.page && query.page > 0 ? Number(query.page) : 1;
    const limit = query.limit && query.limit > 0 ? Number(query.limit) : 25;
    const skip = (page - 1) * limit;

    const where: Prisma.PurchaseOrderWhereInput = { companyId };
    if (query.supplierId) where.supplierId = query.supplierId;
    if (query.status) (where as any).status = query.status;
    if (query.from || query.to) {
      where.orderDate = {};
      if (query.from) (where.orderDate as any).gte = new Date(query.from);
      if (query.to) (where.orderDate as any).lte = new Date(query.to);
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.purchaseOrder.findMany({
        where,
        skip,
        take: limit,
        orderBy: { orderDate: 'desc' },
        include: {
          supplier: { select: { id: true, code: true, nameAr: true } },
        },
      }),
      this.prisma.purchaseOrder.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async findOne(id: string, companyId: string) {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id, companyId },
      include: {
        supplier: true,
        lines: true,
        grns: { select: { id: true, number: true, status: true, receiptDate: true } },
        invoices: {
          select: { id: true, number: true, status: true, totalIqd: true, invoiceDate: true },
        },
      },
    });
    if (!po) {
      throw new NotFoundException({
        code: 'PO_NOT_FOUND',
        messageAr: 'أمر الشراء غير موجود',
      });
    }
    return po;
  }

  async update(
    id: string,
    companyId: string,
    dto: Partial<CreatePurchaseOrderDto>,
    session: UserSession,
  ) {
    const po = await this.findOne(id, companyId);
    if ((po.status as any) !== 'draft') {
      throw new BadRequestException({
        code: 'PO_NOT_EDITABLE',
        messageAr: 'لا يمكن تعديل أمر شراء غير مسودة',
      });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.lines) {
        await tx.purchaseOrderLine.deleteMany({ where: { purchaseOrderId: id } });
        const totals = this.computeTotals(
          dto.lines,
          (dto.discountIqd as any) ?? po.discountIqd,
          (dto.taxIqd as any) ?? po.taxIqd,
          (dto.shippingIqd as any) ?? po.shippingIqd,
        );
        return tx.purchaseOrder.update({
          where: { id },
          data: {
            supplierId: dto.supplierId ?? po.supplierId,
            warehouseId: dto.warehouseId ?? po.warehouseId,
            expectedDate: dto.expectedDate ?? po.expectedDate,
            notes: dto.notes ?? po.notes,
            currency: dto.currency ?? po.currency,
            exchangeRate: new Prisma.Decimal(
              dto.exchangeRate ?? (po.exchangeRate as any),
            ),
            paymentTerms: dto.paymentTerms ?? po.paymentTerms,
            terms: dto.terms ?? po.terms,
            subtotalIqd: totals.subtotalIqd,
            discountIqd: totals.discountIqd,
            taxIqd: totals.taxIqd,
            shippingIqd: totals.shippingIqd,
            totalIqd: totals.totalIqd,
            lines: {
              create: totals.lines.map((l) => ({
                variantId: l.variantId,
                qtyOrdered: l.qtyOrdered as any,
                qtyReceived: new Prisma.Decimal(0),
                qtyInvoiced: new Prisma.Decimal(0),
                qtyRejected: new Prisma.Decimal(0),
                unitCostIqd: l.unitCostIqd as any,
                discountPct: l.discountPct as any,
                lineTotalIqd: l.lineTotalIqd as any,
              })),
            },
          },
          include: { lines: true },
        });
      }
      return tx.purchaseOrder.update({
        where: { id },
        data: {
          supplierId: dto.supplierId ?? po.supplierId,
          warehouseId: dto.warehouseId ?? po.warehouseId,
          expectedDate: dto.expectedDate ?? po.expectedDate,
          notes: dto.notes ?? po.notes,
          paymentTerms: dto.paymentTerms ?? po.paymentTerms,
          terms: dto.terms ?? po.terms,
        },
        include: { lines: true },
      });
    });

    await this.audit.log({
      companyId,
      userId: session.userId,
      userEmail: session.userId,
      action: 'purchase.order.update',
      entityType: 'PurchaseOrder',
      entityId: id,
      before: po,
      after: updated,
    } as any);

    return updated;
  }

  async submit(id: string, companyId: string, session: UserSession) {
    const po = await this.findOne(id, companyId);
    if ((po.status as any) !== 'draft') {
      throw new BadRequestException({
        code: 'PO_INVALID_STATE',
        messageAr: 'لا يمكن إرسال أمر الشراء في حالته الحالية',
      });
    }
    const updated = await this.prisma.purchaseOrder.update({
      where: { id },
      data: {
        status: 'submitted' as any,
        submittedAt: new Date(),
        submittedBy: session.userId,
      },
    });
    await this.audit.log({
      companyId,
      userId: session.userId,
      userEmail: session.userId,
      action: 'purchase.order.submit',
      entityType: 'PurchaseOrder',
      entityId: id,
      before: po,
      after: updated,
    } as any);
    return updated;
  }

  async approve(id: string, companyId: string, session: UserSession) {
    const po = await this.findOne(id, companyId);
    if ((po.status as any) !== 'submitted') {
      throw new BadRequestException({
        code: 'PO_INVALID_STATE',
        messageAr: 'يجب إرسال أمر الشراء قبل الموافقة',
      });
    }
    const updated = await this.prisma.purchaseOrder.update({
      where: { id },
      data: {
        status: 'approved' as any,
        approvedAt: new Date(),
        approvedBy: session.userId,
      },
    });
    await this.audit.log({
      companyId,
      userId: session.userId,
      userEmail: session.userId,
      action: 'purchase.order.approve',
      entityType: 'PurchaseOrder',
      entityId: id,
      before: po,
      after: updated,
    } as any);
    return updated;
  }

  async cancel(
    id: string,
    companyId: string,
    reason: string,
    session: UserSession,
  ) {
    const po = await this.findOne(id, companyId);
    if (['received', 'cancelled', 'closed'].includes(po.status as any)) {
      throw new BadRequestException({
        code: 'PO_CANNOT_CANCEL',
        messageAr: 'لا يمكن إلغاء هذا الأمر',
      });
    }
    const updated = await this.prisma.purchaseOrder.update({
      where: { id },
      data: {
        status: 'cancelled' as any,
        cancelledAt: new Date(),
        cancelledBy: session.userId,
        notes: po.notes ? `${po.notes}\n[CANCEL] ${reason}` : `[CANCEL] ${reason}`,
      },
    });
    await this.audit.log({
      companyId,
      userId: session.userId,
      userEmail: session.userId,
      action: 'purchase.order.cancel',
      entityType: 'PurchaseOrder',
      entityId: id,
      before: po,
      after: updated,
    } as any);
    return updated;
  }
}
