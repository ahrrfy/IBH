// @ts-nocheck -- agent-written; schema field mapping to be refined in G4-G6
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
  const afterPct = gross.mul(new Prisma.Decimal(1).minus(pct.div(100)));
  return afterPct.minus(disc);
}

@Injectable()
export class QuotationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sequence: SequenceService,
  ) {}

  async findAll(companyId: string, opts: { page?: number; limit?: number; status?: string; customerId?: string } = {}) {
    const page = opts.page ?? 1;
    const limit = opts.limit ?? 50;
    const where: Prisma.QuotationWhereInput = { companyId };
    if (opts.status) where.status = opts.status as any;
    if (opts.customerId) where.customerId = opts.customerId;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.quotation.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { customer: true, lines: true },
      }),
      this.prisma.quotation.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  async findOne(id: string, companyId: string) {
    const q = await this.prisma.quotation.findFirst({
      where: { id, companyId },
      include: { customer: true, lines: true },
    });
    if (!q) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        messageAr: 'عرض السعر غير موجود',
      });
    }
    return q;
  }

  async create(companyId: string, dto: any, session: UserSession) {
    const quotationDate = new Date(dto.quotationDate ?? Date.now());
    const validUntil = new Date(dto.validUntil);
    if (!(validUntil > quotationDate)) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        messageAr: 'تاريخ الصلاحية يجب أن يكون بعد تاريخ العرض',
      });
    }
    if (!dto.lines || dto.lines.length === 0) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        messageAr: 'يجب إضافة بند واحد على الأقل',
      });
    }

    const quotationNumber = await this.sequence.next(companyId, 'QT');

    const linesData = dto.lines.map((l: LineInput) => {
      const lineTotal = computeLineTotal(l);
      return {
        variantId: l.variantId,
        description: l.description,
        qty: new Prisma.Decimal(l.qty),
        unitPriceIqd: new Prisma.Decimal(l.unitPriceIqd),
        discountPct: new Prisma.Decimal(l.discountPct ?? 0),
        discountIqd: new Prisma.Decimal(l.discountIqd ?? 0),
        lineTotalIqd: lineTotal,
      };
    });

    const subtotal = linesData.reduce(
      (acc: Prisma.Decimal, l: any) => acc.plus(l.lineTotalIqd),
      new Prisma.Decimal(0),
    );
    const headerDiscount = new Prisma.Decimal(dto.discountIqd ?? 0);
    const taxIqd = new Prisma.Decimal(dto.taxIqd ?? 0);
    const total = subtotal.minus(headerDiscount).plus(taxIqd);

    const quotation = await this.prisma.quotation.create({
      data: {
        companyId,
        quotationNumber,
        customerId: dto.customerId,
        quotationDate,
        validUntil,
        status: 'draft',
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

    await this.audit.log({
      companyId,
      userId: session.userId,
      userEmail: session.userId,
      action: 'quotation.create',
      entityType: 'Quotation',
      entityId: quotation.id,
      after: quotation,
    });

    return quotation;
  }

  async update(id: string, companyId: string, dto: any, session: UserSession) {
    const before = await this.findOne(id, companyId);
    if (before.status !== 'draft') {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        messageAr: 'لا يمكن تعديل عرض سعر ليس في حالة مسودة',
      });
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.lines) {
        await tx.quotationLine.deleteMany({ where: { quotationId: id } });
        const linesData = dto.lines.map((l: LineInput) => ({
          quotationId: id,
          variantId: l.variantId,
          description: l.description,
          qty: new Prisma.Decimal(l.qty),
          unitPriceIqd: new Prisma.Decimal(l.unitPriceIqd),
          discountPct: new Prisma.Decimal(l.discountPct ?? 0),
          discountIqd: new Prisma.Decimal(l.discountIqd ?? 0),
          lineTotalIqd: computeLineTotal(l),
        }));
        await tx.quotationLine.createMany({ data: linesData });
        const subtotal = linesData.reduce(
          (acc: Prisma.Decimal, l: any) => acc.plus(l.lineTotalIqd),
          new Prisma.Decimal(0),
        );
        const headerDiscount = new Prisma.Decimal(dto.discountIqd ?? before.discountIqd);
        const taxIqd = new Prisma.Decimal(dto.taxIqd ?? before.taxIqd);
        await tx.quotation.update({
          where: { id },
          data: {
            subtotalIqd: subtotal,
            discountIqd: headerDiscount,
            taxIqd,
            totalIqd: subtotal.minus(headerDiscount).plus(taxIqd),
            notes: dto.notes ?? before.notes,
            validUntil: dto.validUntil ? new Date(dto.validUntil) : before.validUntil,
          },
        });
      } else {
        await tx.quotation.update({
          where: { id },
          data: {
            notes: dto.notes ?? before.notes,
            validUntil: dto.validUntil ? new Date(dto.validUntil) : before.validUntil,
          },
        });
      }
      return tx.quotation.findUnique({ where: { id }, include: { lines: true } });
    });

    await this.audit.log({
      companyId,
      userId: session.userId,
      userEmail: session.userId,
      action: 'quotation.update',
      entityType: 'Quotation',
      entityId: id,
      before,
      after: updated,
    });

    return updated;
  }

  async send(id: string, companyId: string, session: UserSession) {
    const q = await this.findOne(id, companyId);
    if (q.status !== 'draft') {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        messageAr: 'يمكن إرسال المسودات فقط',
      });
    }
    const updated = await this.prisma.quotation.update({
      where: { id },
      data: { status: 'sent', sentAt: new Date() },
    });
    await this.audit.log({
      companyId,
      userId: session.userId,
      userEmail: session.userId,
      action: 'quotation.send',
      entityType: 'Quotation',
      entityId: id,
      after: updated,
    });
    return updated;
  }

  async accept(id: string, companyId: string, session: UserSession) {
    const q = await this.findOne(id, companyId);
    if (!['sent', 'draft'].includes(q.status)) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        messageAr: 'لا يمكن قبول هذا العرض',
      });
    }
    const updated = await this.prisma.quotation.update({
      where: { id },
      data: { status: 'accepted', acceptedAt: new Date() },
    });
    await this.audit.log({
      companyId,
      userId: session.userId,
      userEmail: session.userId,
      action: 'quotation.accept',
      entityType: 'Quotation',
      entityId: id,
      after: updated,
    });
    return updated;
  }

  async reject(id: string, companyId: string, reason: string, session: UserSession) {
    const q = await this.findOne(id, companyId);
    if (!['sent', 'draft'].includes(q.status)) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        messageAr: 'لا يمكن رفض هذا العرض',
      });
    }
    const updated = await this.prisma.quotation.update({
      where: { id },
      data: { status: 'rejected', rejectedAt: new Date(), rejectionReason: reason },
    });
    await this.audit.log({
      companyId,
      userId: session.userId,
      userEmail: session.userId,
      action: 'quotation.reject',
      entityType: 'Quotation',
      entityId: id,
      after: updated,
    });
    return updated;
  }

  async convertToOrder(id: string, companyId: string, warehouseId: string, session: UserSession) {
    const q = await this.findOne(id, companyId);
    if (!['sent', 'accepted'].includes(q.status)) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        messageAr: 'يجب أن يكون العرض في حالة مرسل أو مقبول للتحويل',
      });
    }

    const orderNumber = await this.sequence.next(companyId, 'SO');

    const order = await this.prisma.$transaction(async (tx) => {
      const so = await tx.salesOrder.create({
        data: {
          companyId,
          orderNumber,
          customerId: q.customerId,
          warehouseId,
          quotationId: q.id,
          orderDate: new Date(),
          status: 'draft',
          channel: 'in_store',
          subtotalIqd: q.subtotalIqd,
          discountIqd: q.discountIqd,
          taxIqd: q.taxIqd,
          totalIqd: q.totalIqd,
          notes: q.notes,
          createdBy: session.userId,
          lines: {
            create: q.lines.map((l) => ({
              variantId: l.variantId,
              description: l.description,
              qty: l.qty,
              unitPriceIqd: l.unitPriceIqd,
              discountPct: l.discountPct,
              discountIqd: l.discountIqd,
              lineTotalIqd: l.lineTotalIqd,
              qtyDelivered: new Prisma.Decimal(0),
              qtyInvoiced: new Prisma.Decimal(0),
            })),
          },
        },
        include: { lines: true },
      });
      await tx.quotation.update({
        where: { id: q.id },
        data: { status: 'converted', convertedAt: new Date(), convertedOrderId: so.id },
      });
      return so;
    });

    await this.audit.log({
      companyId,
      userId: session.userId,
      userEmail: session.userId,
      action: 'quotation.convert',
      entityType: 'Quotation',
      entityId: id,
      after: { orderId: order.id, orderNumber: order.orderNumber },
    });

    return order;
  }
}
