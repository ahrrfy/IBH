import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { UserSession } from '@erp/shared-types';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AuditService } from '../../../engines/audit/audit.service';
import { SequenceService } from '../../../engines/sequence/sequence.service';
import { PostingService } from '../../../engines/posting/posting.service';
import { InventoryService } from '../../inventory/inventory.service';

interface ReturnLineInput {
  invoiceLineId: string;
  variantId: string;
  qty: number | string;
  unitPriceIqd: number | string;
  isRestockable: boolean;
  reason?: string;
}

@Injectable()
export class SalesReturnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sequence: SequenceService,
    private readonly posting: PostingService,
    private readonly inventory: InventoryService,
  ) {}

  async findAll(companyId: string, opts: { page?: number; limit?: number; status?: string } = {}) {
    const page = opts.page ?? 1;
    const limit = opts.limit ?? 50;
    const where: Prisma.SalesReturnWhereInput = { companyId };
    if (opts.status) where.status = opts.status as any;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.salesReturn.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { lines: true, originalInvoice: true },
      }),
      this.prisma.salesReturn.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  async findOne(id: string, companyId: string) {
    const r = await this.prisma.salesReturn.findFirst({
      where: { id, companyId },
      include: { lines: true, originalInvoice: true },
    });
    if (!r) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        messageAr: 'المرتجع غير موجود',
      });
    }
    return r;
  }

  async create(companyId: string, dto: any, session: UserSession) {
    if (!dto.lines || dto.lines.length === 0) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        messageAr: 'يجب إضافة بند واحد على الأقل',
      });
    }
    const invoice = await this.prisma.salesInvoice.findFirst({
      where: { id: dto.originalInvoiceId, companyId },
      include: { lines: true },
    });
    if (!invoice) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        messageAr: 'الفاتورة الأصلية غير موجودة',
      });
    }
    if (!['posted', 'partially_paid', 'paid'].includes(invoice.status)) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        messageAr: 'يجب أن تكون الفاتورة مرحلة للإرجاع',
      });
    }

    const linesData: any[] = [];
    let subtotal = new Prisma.Decimal(0);
    let totalCogs = new Prisma.Decimal(0);
    for (const l of dto.lines as ReturnLineInput[]) {
      const invLine = invoice.lines.find((x) => x.id === l.invoiceLineId);
      if (!invLine) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          messageAr: 'بند الفاتورة غير موجود',
        });
      }
      const qty = new Prisma.Decimal(l.qty);
      if (qty.gt(invLine.qty)) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          messageAr: 'كمية الإرجاع أكبر من كمية الفاتورة',
        });
      }
      const unitPrice = new Prisma.Decimal(l.unitPriceIqd);
      const lineTotal = qty.mul(unitPrice);
      const cogs = qty.mul(invLine.unitCostIqd ?? new Prisma.Decimal(0));
      subtotal = subtotal.plus(lineTotal);
      totalCogs = totalCogs.plus(cogs);
      linesData.push({
        invoiceLineId: l.invoiceLineId,
        variantId: l.variantId,
        qty,
        unitPriceIqd: unitPrice,
        lineTotalIqd: lineTotal,
        unitCostIqd: invLine.unitCostIqd ?? new Prisma.Decimal(0),
        cogsIqd: cogs,
        isRestockable: l.isRestockable,
        reason: l.reason,
      });
    }

    const returnNumber = await this.sequence.next(companyId, 'SRN');

    const ret = await this.prisma.salesReturn.create({
      data: {
        companyId,
        number:            returnNumber,
        branchId:          invoice.branchId,
        originalInvoiceId: invoice.id,
        warehouseId:       invoice.warehouseId,
        returnDate:        new Date(dto.returnDate ?? Date.now()),
        status:            'draft',
        reason:            (dto.reason ?? 'other') as any,
        refundMethod:      (dto as any).refundMethod ?? 'cash',
        subtotalIqd:       subtotal,
        totalIqd:          subtotal,
        notes:             dto.notes,
        createdBy:         session.userId,
        lines: { create: linesData },
      },
      include: { lines: true },
    });

    await this.audit.log({
      companyId,
      userId: session.userId,
      userEmail: session.userId,
      action: 'sales_return.create',
      entityType: 'SalesReturn',
      entityId: ret.id,
      after: ret,
    });

    return ret;
  }

  async approve(id: string, companyId: string, session: UserSession) {
    const ret = await this.findOne(id, companyId);
    if (ret.status !== 'draft') {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        messageAr: 'لا يمكن اعتماد مرتجع ليس في حالة مسودة',
      });
    }
    const invoice = await this.prisma.salesInvoice.findFirst({
      where: { id: ret.originalInvoiceId, companyId },
    });
    if (!invoice) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        messageAr: 'الفاتورة الأصلية غير موجودة',
      });
    }

    const damagedWh = await this.prisma.warehouse.findFirst({
      where: { companyId, type: 'damaged' as any },
    });

    // No cogsIqd on return line — derive from unitCost × qty
    const totalCogs = ret.lines.reduce(
      (acc, l) => acc.plus(l.unitCostIqd.mul(l.qty)),
      new Prisma.Decimal(0),
    );

    const approved = await this.prisma.$transaction(async (tx) => {
      const isCash = invoice.paymentTerms === 'cash';
      const jeLines: Array<{ accountCode: string; debit?: Prisma.Decimal; credit?: Prisma.Decimal; description: string }> = [
        { accountCode: '4100',                   debit:  ret.totalIqd, description: `Return revenue ${ret.number}` },
        { accountCode: isCash ? '1100' : '1200', credit: ret.totalIqd, description: `Return ${isCash ? 'cash' : 'AR'} ${ret.number}` },
      ];
      if (totalCogs.gt(0)) {
        jeLines.push(
          { accountCode: '1300', debit:  totalCogs, description: `Return inventory ${ret.number}` },
          { accountCode: '5100', credit: totalCogs, description: `Return COGS ${ret.number}` },
        );
      }

      const je = await this.posting.postJournalEntry(
        {
          companyId,
          entryDate:   new Date(),
          refType:     'SalesReturn',
          refId:       ret.id,
          description: `Sales Return ${ret.number}`,
          lines:       jeLines,
        },
        session,
        tx,
      );

      for (const line of ret.lines) {
        const destWh = line.isRestockable
          ? ret.warehouseId
          : damagedWh?.id ?? ret.warehouseId;
        await this.inventory.move(
          {
            companyId,
            warehouseId:   destWh,
            variantId:     line.variantId,
            qty:           Number(line.qty),
            direction:     'in',
            referenceType: 'SalesReturn' as any,
            referenceId:   ret.id,
            unitCostIqd:   Number(line.unitCostIqd),
            performedBy:   session.userId,
          },
          tx,
        );
      }

      if (!isCash) {
        await tx.customer.update({
          where: { id: invoice.customerId },
          data:  { creditBalanceIqd: { decrement: ret.totalIqd } },
        });
      }

      return tx.salesReturn.update({
        where: { id },
        data: {
          status:         'approved',
          approvedAt:     new Date(),
          approvedBy:     session.userId,
          journalEntryId: je.id,
        },
      });
    });

    await this.audit.log({
      companyId,
      userId: session.userId,
      userEmail: session.userId,
      action: 'sales_return.approve',
      entityType: 'SalesReturn',
      entityId: id,
      after: approved,
    });

    return approved;
  }

  async reject(id: string, companyId: string, reason: string, session: UserSession) {
    const ret = await this.findOne(id, companyId);
    if (ret.status !== 'draft') {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        messageAr: 'لا يمكن رفض مرتجع ليس في حالة مسودة',
      });
    }
    const updated = await this.prisma.salesReturn.update({
      where: { id },
      data: { status: 'cancelled', notes: (ret.notes ?? '') + `\n[rejected]: ${reason}` },
    });
    await this.audit.log({
      companyId,
      userId: session.userId,
      userEmail: session.userId,
      action: 'sales_return.reject',
      entityType: 'SalesReturn',
      entityId: id,
      after: updated,
    });
    return updated;
  }
}
