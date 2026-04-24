import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { UserSession } from '@erp/shared-types';
import { PrismaService } from '../../../engines/prisma/prisma.service';
import { AuditService } from '../../../engines/audit/audit.service';
import { SequenceService } from '../../../engines/sequence/sequence.service';
import { PolicyService } from '../../../engines/policy/policy.service';
import { InventoryService } from '../../inventory/inventory.service';

interface LineInput {
  variantId: string;
  description?: string;
  qty: number | string;
  unitPriceIqd: number | string;
  discountPct?: number | string;
  discountIqd?: number | string;
}

function computeLineTotal(l: LineInput) {
  const qty = new Prisma.Decimal(l.qty);
  const price = new Prisma.Decimal(l.unitPriceIqd);
  const pct = new Prisma.Decimal(l.discountPct ?? 0);
  const disc = new Prisma.Decimal(l.discountIqd ?? 0);
  const gross = qty.mul(price);
  return gross.mul(new Prisma.Decimal(1).minus(pct.div(100))).minus(disc);
}

@Injectable()
export class SalesOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sequence: SequenceService,
    private readonly policy: PolicyService,
    private readonly inventory: InventoryService,
  ) {}

  async findAll(companyId: string, opts: { page?: number; limit?: number; status?: string; customerId?: string } = {}) {
    const page = opts.page ?? 1;
    const limit = opts.limit ?? 50;
    const where: Prisma.SalesOrderWhereInput = { companyId };
    if (opts.status) where.status = opts.status as any;
    if (opts.customerId) where.customerId = opts.customerId;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.salesOrder.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { customer: true, lines: true },
      }),
      this.prisma.salesOrder.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  async findOne(id: string, companyId: string) {
    const o = await this.prisma.salesOrder.findFirst({
      where: { id, companyId },
      include: { customer: true, lines: true },
    });
    if (!o) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        messageAr: 'طلب البيع غير موجود',
      });
    }
    return o;
  }

  async create(companyId: string, dto: any, session: UserSession) {
    if (!dto.lines || dto.lines.length === 0) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        messageAr: 'يجب إضافة بند واحد على الأقل',
      });
    }
    const customer = await this.prisma.customer.findFirst({
      where: { id: dto.customerId, companyId, deletedAt: null },
    });
    if (!customer) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        messageAr: 'العميل غير موجود',
      });
    }

    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: dto.warehouseId, companyId },
    });
    if (!warehouse) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        messageAr: 'المخزن غير موجود',
      });
    }

    for (const l of dto.lines as LineInput[]) {
      const bal = await this.prisma.inventoryBalance.findFirst({
        where: { companyId, warehouseId: dto.warehouseId, variantId: l.variantId },
      });
      const avail = bal ? bal.qtyAvailable : new Prisma.Decimal(0);
      if (avail.lt(new Prisma.Decimal(l.qty))) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          messageAr: `الكمية المتاحة غير كافية للصنف ${l.variantId}`,
        });
      }
    }

    const linesData = (dto.lines as LineInput[]).map((l) => ({
      variantId: l.variantId,
      description: l.description,
      qty: new Prisma.Decimal(l.qty),
      unitPriceIqd: new Prisma.Decimal(l.unitPriceIqd),
      discountPct: new Prisma.Decimal(l.discountPct ?? 0),
      discountIqd: new Prisma.Decimal(l.discountIqd ?? 0),
      lineTotalIqd: computeLineTotal(l),
      qtyDelivered: new Prisma.Decimal(0),
      qtyInvoiced: new Prisma.Decimal(0),
    }));

    const subtotal = linesData.reduce(
      (acc, l) => acc.plus(l.lineTotalIqd),
      new Prisma.Decimal(0),
    );
    const headerDiscount = new Prisma.Decimal(dto.discountIqd ?? 0);
    const taxIqd = new Prisma.Decimal(dto.taxIqd ?? 0);
    const total = subtotal.minus(headerDiscount).plus(taxIqd);

    const channel = dto.channel ?? 'in_store';
    const paymentMethod = dto.paymentMethod ?? 'cash';
    const requiresCreditCheck = !(channel === 'in_store' && paymentMethod === 'cash');
    if (requiresCreditCheck) {
      const projected = customer.creditBalanceIqd.plus(total);
      if (projected.gt(customer.creditLimitIqd)) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          messageAr: 'تم تجاوز حد الائتمان للعميل',
        });
      }
    }

    const orderNumber = await this.sequence.next(companyId, 'SO');

    const order = await this.prisma.$transaction(async (tx) => {
      const so = await tx.salesOrder.create({
        data: {
          companyId,
          orderNumber,
          customerId: dto.customerId,
          warehouseId: dto.warehouseId,
          orderDate: new Date(dto.orderDate ?? Date.now()),
          status: 'draft',
          channel: channel as any,
          paymentMethod: paymentMethod as any,
          subtotalIqd: subtotal,
          discountIqd: headerDiscount,
          taxIqd,
          totalIqd: total,
          notes: dto.notes,
          createdBy: session.userId,
          lines: { create: linesData },
        },
        include: { lines: true },
      });

      for (const line of so.lines) {
        await this.inventory.reserve(
          {
            companyId,
            warehouseId: dto.warehouseId,
            variantId: line.variantId,
            qty: line.qty,
            refType: 'SalesOrder',
            refId: so.id,
          },
          session,
          tx as any,
        );
      }

      return so;
    });

    await this.audit.log({
      companyId,
      userId: session.userId,
      userEmail: session.userId,
      action: 'sales_order.create',
      entityType: 'SalesOrder',
      entityId: order.id,
      after: order,
    });

    return order;
  }

  async confirm(id: string, companyId: string, session: UserSession) {
    const o = await this.findOne(id, companyId);
    if (o.status !== 'draft') {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        messageAr: 'يمكن تأكيد المسودات فقط',
      });
    }
    const updated = await this.prisma.salesOrder.update({
      where: { id },
      data: { status: 'confirmed', confirmedAt: new Date() },
    });
    await this.audit.log({
      companyId,
      userId: session.userId,
      userEmail: session.userId,
      action: 'sales_order.confirm',
      entityType: 'SalesOrder',
      entityId: id,
      after: updated,
    });
    return updated;
  }

  async cancel(id: string, companyId: string, reason: string, session: UserSession) {
    const o = await this.findOne(id, companyId);
    if (['delivered', 'cancelled'].includes(o.status)) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        messageAr: 'لا يمكن إلغاء هذا الطلب',
      });
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      for (const line of o.lines) {
        try {
          await this.inventory.releaseReservation(
            {
              companyId,
              warehouseId: o.warehouseId,
              variantId: line.variantId,
              qty: line.qty.minus(line.qtyDelivered),
              refType: 'SalesOrder',
              refId: o.id,
            },
            session,
            tx as any,
          );
        } catch (_) {
          // ignore if nothing to release
        }
      }
      return tx.salesOrder.update({
        where: { id },
        data: {
          status: 'cancelled',
          cancelledAt: new Date(),
          cancelledBy: session.userId,
          cancellationReason: reason,
        },
      });
    });

    await this.audit.log({
      companyId,
      userId: session.userId,
      userEmail: session.userId,
      action: 'sales_order.cancel',
      entityType: 'SalesOrder',
      entityId: id,
      before: o,
      after: updated,
    });
    return updated;
  }

  async recomputeStatus(id: string, companyId: string) {
    const o = await this.findOne(id, companyId);
    if (['cancelled', 'draft'].includes(o.status)) return o;
    const allDelivered = o.lines.every((l) => l.qtyDelivered.gte(l.qty));
    const allInvoiced = o.lines.every((l) => l.qtyInvoiced.gte(l.qty));
    const someDelivered = o.lines.some((l) => l.qtyDelivered.gt(0));

    let status = o.status;
    if (allDelivered && allInvoiced) status = 'delivered' as any;
    else if (someDelivered) status = 'partially_delivered' as any;

    if (status !== o.status) {
      return this.prisma.salesOrder.update({ where: { id }, data: { status } });
    }
    return o;
  }
}
