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

interface InvoiceLineInput {
  variantId: string;
  description?: string;
  qty: number | string;
  unitPriceIqd: number | string;
  discountPct?: number | string;
  discountIqd?: number | string;
  salesOrderLineId?: string;
}

function computeLineTotal(l: InvoiceLineInput) {
  const qty = new Prisma.Decimal(l.qty);
  const price = new Prisma.Decimal(l.unitPriceIqd);
  const pct = new Prisma.Decimal(l.discountPct ?? 0);
  const disc = new Prisma.Decimal(l.discountIqd ?? 0);
  return qty.mul(price).mul(new Prisma.Decimal(1).minus(pct.div(100))).minus(disc);
}

@Injectable()
export class SalesInvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sequence: SequenceService,
    private readonly posting: PostingService,
    private readonly inventory: InventoryService,
  ) {}

  async findAll(companyId: string, opts: { page?: number; limit?: number; status?: string; customerId?: string; overdueOnly?: boolean } = {}) {
    const page = opts.page ?? 1;
    const limit = opts.limit ?? 50;
    const where: Prisma.SalesInvoiceWhereInput = { companyId };
    if (opts.status) where.status = opts.status as any;
    if (opts.customerId) where.customerId = opts.customerId;
    if (opts.overdueOnly) {
      where.balanceIqd = { gt: 0 };
      where.dueDate = { lt: new Date() };
      where.status = { in: ['posted', 'partially_paid'] as any };
    }
    const [items, total] = await this.prisma.$transaction([
      this.prisma.salesInvoice.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { customer: true, lines: true, payments: true },
      }),
      this.prisma.salesInvoice.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  async findOne(id: string, companyId: string) {
    const inv = await this.prisma.salesInvoice.findFirst({
      where: { id, companyId },
      include: { customer: true, lines: true, payments: true },
    });
    if (!inv) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        messageAr: 'الفاتورة غير موجودة',
      });
    }
    return inv;
  }

  private async buildLinesWithCost(
    companyId: string,
    warehouseId: string,
    lines: InvoiceLineInput[],
  ) {
    const out: any[] = [];
    for (const l of lines) {
      const bal = await this.prisma.inventoryBalance.findFirst({
        where: { companyId, warehouseId, variantId: l.variantId },
      });
      const unitCost = bal ? bal.avgCostIqd : new Prisma.Decimal(0);
      const qty = new Prisma.Decimal(l.qty);
      const lineTotal = computeLineTotal(l);
      const cogs = qty.mul(unitCost);
      out.push({
        variantId: l.variantId,
        description: l.description,
        qty,
        unitPriceIqd: new Prisma.Decimal(l.unitPriceIqd),
        discountPct: new Prisma.Decimal(l.discountPct ?? 0),
        discountIqd: new Prisma.Decimal(l.discountIqd ?? 0),
        lineTotalIqd: lineTotal,
        unitCostIqd: unitCost,
        cogsIqd: cogs,
        salesOrderLineId: l.salesOrderLineId,
      });
    }
    return out;
  }

  async createFromOrder(
    orderId: string,
    companyId: string,
    dto: { lines: InvoiceLineInput[]; dueDate?: string; paymentTerms?: string; notes?: string },
    session: UserSession,
  ) {
    const order = await this.prisma.salesOrder.findFirst({
      where: { id: orderId, companyId },
      include: { lines: true },
    });
    if (!order) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        messageAr: 'طلب البيع غير موجود',
      });
    }
    if (!['confirmed', 'partially_delivered'].includes(order.status)) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        messageAr: 'يجب تأكيد الطلب قبل إصدار فاتورة',
      });
    }

    const linesData = await this.buildLinesWithCost(companyId, order.warehouseId, dto.lines);

    const subtotal = linesData.reduce((acc, l) => acc.plus(l.lineTotalIqd), new Prisma.Decimal(0));
    const total = subtotal;

    const invoiceNumber = await this.sequence.next(companyId, 'INV');

    const invoice = await this.prisma.$transaction(async (tx) => {
      const inv = await tx.salesInvoice.create({
        data: {
          companyId,
          number: invoiceNumber,
          branchId: order.branchId,
          updatedBy: session.userId,
          customerId: order.customerId,
          salesOrderId: order.id,
          warehouseId: order.warehouseId,
          invoiceDate: new Date(),
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          paymentTerms: dto.paymentTerms,
          status: 'draft',
          subtotalIqd: subtotal,
          discountIqd: new Prisma.Decimal(0),
          taxIqd: new Prisma.Decimal(0),
          totalIqd: total,
          paidIqd: new Prisma.Decimal(0),
          balanceIqd: total,
          notes: dto.notes,
          createdBy: session.userId,
          lines: { create: linesData },
        },
        include: { lines: true },
      });

      for (const l of linesData) {
        if (l.salesOrderLineId) {
          await tx.salesOrderLine.update({
            where: { id: l.salesOrderLineId },
            data: { qtyInvoiced: { increment: l.qty } },
          });
        }
      }

      return inv;
    });

    await this.audit.log({
      companyId,
      userId: session.userId,
      userEmail: session.userId,
      action: 'sales_invoice.create',
      entityType: 'SalesInvoice',
      entityId: invoice.id,
      after: invoice,
    });

    return invoice;
  }

  async createStandalone(companyId: string, dto: any, session: UserSession) {
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

    const linesData = await this.buildLinesWithCost(companyId, dto.warehouseId, dto.lines);
    const subtotal = linesData.reduce((acc, l) => acc.plus(l.lineTotalIqd), new Prisma.Decimal(0));
    const headerDiscount = new Prisma.Decimal(dto.discountIqd ?? 0);
    const taxIqd = new Prisma.Decimal(dto.taxIqd ?? 0);
    const total = subtotal.minus(headerDiscount).plus(taxIqd);

    const invoiceNumber = await this.sequence.next(companyId, 'INV');

    const invoice = await this.prisma.salesInvoice.create({
      data: {
        companyId,
        number:       invoiceNumber,
        branchId:     dto.branchId,
        updatedBy:    session.userId,
        customerId:   dto.customerId,
        warehouseId:  dto.warehouseId,
        invoiceDate: new Date(dto.invoiceDate ?? Date.now()),
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        paymentTerms: dto.paymentTerms,
        status: 'draft',
        subtotalIqd: subtotal,
        discountIqd: headerDiscount,
        taxIqd,
        totalIqd: total,
        paidIqd: new Prisma.Decimal(0),
        balanceIqd: total,
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
      action: 'sales_invoice.create_standalone',
      entityType: 'SalesInvoice',
      entityId: invoice.id,
      after: invoice,
    });

    return invoice;
  }

  async post(id: string, companyId: string, session: UserSession) {
    const inv = await this.findOne(id, companyId);
    if (inv.status !== 'draft') {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        messageAr: 'لا يمكن ترحيل فاتورة ليست في حالة مسودة',
      });
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const totalCogs = inv.lines.reduce(
        (acc, l) => acc.plus(l.cogsIqd ?? new Prisma.Decimal(0)),
        new Prisma.Decimal(0),
      );

      const isCash = inv.paymentTerms === 'cash' || inv.totalIqd.eq(0);
      const lines: Array<{ accountCode: string; debit?: Prisma.Decimal; credit?: Prisma.Decimal; description: string }> = [
        {
          accountCode: isCash ? '2411' : '221',
          debit: inv.totalIqd,
          description: `Invoice ${inv.number}`,
        },
        {
          accountCode: isCash ? '511' : '512',
          credit: inv.totalIqd,
          description: `Revenue ${inv.number}`,
        },
      ];
      if (totalCogs.gt(0)) {
        lines.push(
          {
            accountCode: '611',
            debit: totalCogs,
            description: `COGS ${inv.number}`,
          },
          {
            accountCode: '212',
            credit: totalCogs,
            description: `Inventory out ${inv.number}`,
          },
        );
      }

      const je = await this.posting.postJournalEntry(
        {
          companyId,
          entryDate: new Date(),
          refType: 'SalesInvoice',
          refId: inv.id,
          description: `Sales Invoice ${inv.number}`,
          lines,
        },
        session,
        tx as any,
      );

      for (const line of inv.lines) {
        await this.inventory.move(
          {
            companyId,
            warehouseId:   inv.warehouseId,
            variantId:     line.variantId,
            qty:           Number(line.qty),
            direction:     'out',
            referenceType: 'SalesInvoice' as any,
            referenceId:   inv.id,
            unitCostIqd:   Number(line.unitCostIqd),
            performedBy:   session.userId,
          },
          tx,
        );
        // Note: salesOrderLineId not on SalesInvoiceLine schema; update via
        // aggregated qtyDelivered when posting directly from order (TODO).
      }

      if (!inv.totalIqd.eq(0) && !isCash) {
        await tx.customer.update({
          where: { id: inv.customerId },
          data: { creditBalanceIqd: { increment: inv.totalIqd } },
        });
      }

      return tx.salesInvoice.update({
        where: { id },
        data: {
          status: 'posted',
          postedAt: new Date(),
          postedBy: session.userId,
          journalEntryId: je.id,
        },
      });
    });

    await this.audit.log({
      companyId,
      userId: session.userId,
      userEmail: session.userId,
      action: 'sales_invoice.post',
      entityType: 'SalesInvoice',
      entityId: id,
      after: result,
    });

    return result;
  }

  async recordPayment(
    invoiceId: string,
    companyId: string,
    dto: { amountIqd: number | string; method: string; reference?: string; paymentDate?: string; notes?: string },
    session: UserSession,
  ) {
    const inv = await this.findOne(invoiceId, companyId);
    if (!['posted', 'partially_paid'].includes(inv.status)) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        messageAr: 'يمكن تسجيل الدفعات على الفواتير المرحلة فقط',
      });
    }
    const amount = new Prisma.Decimal(dto.amountIqd);
    if (amount.lte(0)) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        messageAr: 'المبلغ يجب أن يكون أكبر من صفر',
      });
    }
    if (amount.gt(inv.balanceIqd)) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        messageAr: 'المبلغ أكبر من الرصيد المستحق',
      });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.salesInvoicePayment.create({
        data: {
          invoiceId,
          amountIqd:     amount,
          method:        dto.method as any,
          reference:     dto.reference,
          paymentDate:   dto.paymentDate ? new Date(dto.paymentDate) : new Date(),
          cashAccountId: (dto as any).cashAccountId ?? '',  // caller should provide
          notes:         dto.notes,
          createdBy:     session.userId,
        },
      });

      const newPaid = inv.paidIqd.plus(amount);
      const newBalance = inv.totalIqd.minus(newPaid);
      const newStatus = newBalance.eq(0) ? 'paid' : 'partially_paid';

      await this.posting.postJournalEntry(
        {
          companyId,
          entryDate: new Date(),
          refType: 'SalesInvoicePayment',
          refId: invoiceId,
          description: `Payment for ${inv.number}`,
          lines: [
            {
              accountCode: '2411',
              debit: amount,
              description: `Cash receipt ${inv.number}`,
            },
            {
              accountCode: '221',
              credit: amount,
              description: `AR settlement ${inv.number}`,
            },
          ],
        },
        session,
        tx as any,
      );

      await tx.customer.update({
        where: { id: inv.customerId },
        data: { creditBalanceIqd: { decrement: amount } },
      });

      return tx.salesInvoice.update({
        where: { id: invoiceId },
        data: {
          paidIqd: newPaid,
          balanceIqd: newBalance,
          status: newStatus as any,
        },
      });
    });

    await this.audit.log({
      companyId,
      userId: session.userId,
      userEmail: session.userId,
      action: 'sales_invoice.payment',
      entityType: 'SalesInvoice',
      entityId: invoiceId,
      after: { amount: amount.toString(), status: updated.status },
    });

    return updated;
  }

  async reverse(id: string, companyId: string, reason: string, session: UserSession) {
    const inv = await this.findOne(id, companyId);
    if (inv.status !== 'posted' && inv.status !== 'partially_paid' && inv.status !== 'paid') {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        messageAr: 'لا يمكن عكس هذه الفاتورة',
      });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const totalCogs = inv.lines.reduce(
        (acc, l) => acc.plus(l.cogsIqd ?? new Prisma.Decimal(0)),
        new Prisma.Decimal(0),
      );

      await this.posting.postJournalEntry(
        {
          companyId,
          entryDate: new Date(),
          refType: 'SalesInvoiceReversal',
          refId: inv.id,
          description: `Reverse ${inv.number}: ${reason}`,
          lines: [
            { accountCode: '512', debit:  inv.totalIqd, description: 'Reverse revenue' },
            { accountCode: '221', credit: inv.totalIqd, description: 'Reverse AR' },
            ...(totalCogs.gt(0)
              ? [
                  { accountCode: '212', debit:  totalCogs, description: 'Reverse inventory' },
                  { accountCode: '611', credit: totalCogs, description: 'Reverse COGS' },
                ]
              : []),
          ],
        },
        session,
        tx,
      );

      for (const line of inv.lines) {
        await this.inventory.move(
          {
            companyId,
            warehouseId:   inv.warehouseId,
            variantId:     line.variantId,
            qty:           Number(line.qty),
            direction:     'in',
            referenceType: 'SalesInvoiceReversal' as any,
            referenceId:   inv.id,
            unitCostIqd:   Number(line.unitCostIqd),
            performedBy:   session.userId,
          },
          tx,
        );
      }

      await tx.customer.update({
        where: { id: inv.customerId },
        data: { creditBalanceIqd: { decrement: inv.balanceIqd } },
      });

      return tx.salesInvoice.update({
        where: { id },
        data: {
          status: 'reversed',
          reversedAt: new Date(),
          reversedBy: session.userId,
          reversalReason: reason,
          balanceIqd: new Prisma.Decimal(0),
        },
      });
    });

    await this.audit.log({
      companyId,
      userId: session.userId,
      userEmail: session.userId,
      action: 'sales_invoice.reverse',
      entityType: 'SalesInvoice',
      entityId: id,
      before: inv,
      after: updated,
    });

    return updated;
  }

  async getOverdue(companyId: string) {
    return this.prisma.salesInvoice.findMany({
      where: {
        companyId,
        balanceIqd: { gt: 0 },
        dueDate: { lt: new Date() },
        status: { in: ['posted', 'partially_paid'] as any },
      },
      include: { customer: true },
      orderBy: { dueDate: 'asc' },
    });
  }
}
