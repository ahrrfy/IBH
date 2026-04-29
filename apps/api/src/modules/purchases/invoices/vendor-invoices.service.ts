import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AuditService } from '../../../engines/audit/audit.service';
import { SequenceService } from '../../../engines/sequence/sequence.service';
import { PostingService } from '../../../engines/posting/posting.service';
import { PolicyService } from '../../../engines/policy/policy.service';
import { Prisma } from '@prisma/client';
import type { UserSession } from '@erp/shared-types';

export interface VendorInvoiceLineInput {
  variantId?: string;
  description: string;
  qty: number | string;
  unitCostIqd: number | string;
  accountId?: string;
}

export interface CreateVendorInvoiceDto {
  supplierId: string;
  vendorRef: string;
  purchaseOrderId?: string;
  invoiceDate: Date;
  dueDate?: Date;
  branchId?: string;
  lines: VendorInvoiceLineInput[];
  discountIqd?: number | string;
  taxIqd?: number | string;
  shippingIqd?: number | string;
  currency?: string;
  exchangeRate?: number | string;
  notes?: string;
  attachmentUrl?: string;
}

export interface FindVendorInvoicesQuery {
  page?: number;
  limit?: number;
  supplierId?: string;
  status?: string;
  overdue?: boolean | string;
  from?: string;
  to?: string;
}

export interface RecordPaymentDto {
  amountIqd: number | string;
  method: string;
  cashAccountId: string;
  reference?: string;
  notes?: string;
  paymentDate?: Date;
}

@Injectable()
export class VendorInvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sequence: SequenceService,
    private readonly posting: PostingService,
    private readonly policy: PolicyService,
  ) {}

  private computeTotals(
    lines: VendorInvoiceLineInput[],
    discountIqd = 0,
    taxIqd = 0,
    shippingIqd = 0,
  ) {
    let subtotal = new Prisma.Decimal(0);
    const computed = lines.map((l) => {
      const qty = new Prisma.Decimal(l.qty);
      const unit = new Prisma.Decimal(l.unitCostIqd);
      const lineTotal = qty.mul(unit);
      subtotal = subtotal.add(lineTotal);
      return {
        ...l,
        qty,
        unitCostIqd: unit,
        lineTotalIqd: lineTotal,
      };
    });
    const disc = new Prisma.Decimal(discountIqd);
    const tax = new Prisma.Decimal(taxIqd);
    const ship = new Prisma.Decimal(shippingIqd);
    const total = subtotal.sub(disc).add(tax).add(ship);
    return {
      subtotalIqd: subtotal,
      discountIqd: disc,
      taxIqd: tax,
      shippingIqd: ship,
      totalIqd: total,
      lines: computed,
    };
  }

  async create(
    companyId: string,
    dto: CreateVendorInvoiceDto,
    session: UserSession,
  ) {
    if (!dto.lines || dto.lines.length === 0) {
      throw new BadRequestException({
        code: 'VINV_LINES_REQUIRED',
        messageAr: 'يجب إضافة بنود للفاتورة',
      });
    }

    // check duplicate vendorRef (scoped to current tenant — F1)
    const dup = await this.prisma.vendorInvoice.findFirst({
      where: { companyId, supplierId: dto.supplierId, vendorRef: dto.vendorRef },
    });
    if (dup) {
      throw new ConflictException({
        code: 'VINV_DUPLICATE',
        messageAr: 'فاتورة المورّد مسجّلة مسبقاً بنفس الرقم',
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

    if (dto.purchaseOrderId) {
      const po = await this.prisma.purchaseOrder.findFirst({
        where: { id: dto.purchaseOrderId, companyId },
      });
      if (!po) {
        throw new NotFoundException({
          code: 'PO_NOT_FOUND',
          messageAr: 'أمر الشراء غير موجود',
        });
      }
    }

    const number = await this.sequence.nextNumber({
      companyId,
      sequenceCode: 'VINV',
    } as any);

    const totals = this.computeTotals(
      dto.lines,
      (dto.discountIqd as any) ?? 0,
      (dto.taxIqd as any) ?? 0,
      (dto.shippingIqd as any) ?? 0,
    );

    const invoice = await this.prisma.vendorInvoice.create({
      data: {
        companyId,
        branchId:        dto.branchId ?? (session as any).branchId ?? '',
        number,
        vendorRef:       dto.vendorRef,
        supplierId:      dto.supplierId,
        purchaseOrderId: dto.purchaseOrderId,
        createdBy:       session.userId,
        updatedBy:       session.userId,
        invoiceDate: dto.invoiceDate,
        dueDate:
          dto.dueDate ??
          new Date(
            new Date(dto.invoiceDate).getTime() +
              (supplier.paymentTermsDays ?? 0) * 86400000,
          ),
        status: 'draft' as any,
        subtotalIqd: totals.subtotalIqd,
        discountIqd: totals.discountIqd,
        taxIqd: totals.taxIqd,
        shippingIqd: totals.shippingIqd,
        totalIqd: totals.totalIqd,
        paidIqd: new Prisma.Decimal(0),
        balanceIqd: totals.totalIqd,
        currency: dto.currency || 'IQD',
        exchangeRate: new Prisma.Decimal(dto.exchangeRate ?? 1),
        attachmentUrl: dto.attachmentUrl,
        lines: {
          create: totals.lines.map((l) => ({
            variantId: l.variantId,
            description: l.description,
            qty: l.qty as any,
            unitCostIqd: l.unitCostIqd as any,
            lineTotalIqd: l.lineTotalIqd as any,
            accountId: l.accountId,
          })),
        },
      },
      include: { lines: true },
    });

    await this.audit.log({
      companyId,
      userId: session.userId,
      userEmail: session.userId,
      action: 'purchase.vinvoice.create',
      entityType: 'VendorInvoice',
      entityId: invoice.id,
      after: invoice,
    } as any);

    return invoice;
  }

  async threeWayMatch(invoiceId: string, companyId: string, session: UserSession) {
    const invoice = await this.findOne(invoiceId, companyId);
    const discrepancies: Array<{
      type: string;
      variantId?: string;
      details: any;
    }> = [];

    const priceTol = await this.policy
      .getNumber(companyId, 'price_match_tolerance', 0.02)
      .catch(() => 0.02);

    if (!invoice.purchaseOrderId) {
      // no PO to match against — just flag
      const result = {
        matched: false,
        discrepancies: [
          { type: 'no_po_linked', details: 'Invoice has no linked PO' },
        ],
      };
      await this.prisma.vendorInvoice.update({
        where: { id: invoiceId },
        data: {
          matchStatus: 'pending_review',
          matchDiscrepancy: result as any,
        },
      });
      return result;
    }

    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id: invoice.purchaseOrderId, companyId },
      include: { lines: true },
    });
    if (!po) {
      throw new NotFoundException({
        code: 'PO_NOT_FOUND',
        messageAr: 'أمر الشراء غير موجود',
      });
    }

    const grns = await this.prisma.goodsReceiptNote.findMany({
      where: { purchaseOrderId: po.id, companyId },
      include: { lines: true },
    });

    // aggregate GRN qtyAccepted by variantId
    const grnQtyByVariant = new Map<string, Prisma.Decimal>();
    for (const g of grns) {
      for (const l of g.lines) {
        const prev = grnQtyByVariant.get(l.variantId) ?? new Prisma.Decimal(0);
        grnQtyByVariant.set(
          l.variantId,
          prev.add(new Prisma.Decimal(l.qtyAccepted as any)),
        );
      }
    }

    for (const invLine of invoice.lines) {
      if (!invLine.variantId) continue;
      const poLine = po.lines.find((pl) => pl.variantId === invLine.variantId);
      if (!poLine) {
        discrepancies.push({
          type: 'po_missing',
          variantId: invLine.variantId,
          details: { description: invLine.description },
        });
        continue;
      }

      // price check
      const poPrice = new Prisma.Decimal(poLine.unitCostIqd as any);
      const invPrice = new Prisma.Decimal(invLine.unitCostIqd as any);
      if (poPrice.gt(0)) {
        const diff = invPrice.sub(poPrice).abs().div(poPrice).toNumber();
        if (diff > priceTol) {
          discrepancies.push({
            type: 'price_mismatch',
            variantId: invLine.variantId,
            details: {
              poPrice: poPrice.toString(),
              invoicePrice: invPrice.toString(),
              diffPct: (diff * 100).toFixed(2),
              tolerancePct: (priceTol * 100).toFixed(2),
            },
          });
        }
      }

      // qty check
      const grnQty = grnQtyByVariant.get(invLine.variantId) ?? new Prisma.Decimal(0);
      const invQty = new Prisma.Decimal(invLine.qty as any);
      if (!invQty.equals(grnQty)) {
        discrepancies.push({
          type: 'qty_mismatch',
          variantId: invLine.variantId,
          details: {
            invoiceQty: invQty.toString(),
            grnAcceptedQty: grnQty.toString(),
          },
        });
      }
    }

    // grn_missing: PO lines that have no invoice line and no GRN
    for (const pl of po.lines) {
      const onInvoice = invoice.lines.some((il) => il.variantId === pl.variantId);
      const onGrn = (grnQtyByVariant.get(pl.variantId) ?? new Prisma.Decimal(0)).gt(0);
      if (onInvoice && !onGrn) {
        discrepancies.push({
          type: 'grn_missing',
          variantId: pl.variantId,
          details: { ordered: pl.qtyOrdered },
        });
      }
    }

    const matched = discrepancies.length === 0;

    const updated = await this.prisma.vendorInvoice.update({
      where: { id: invoiceId },
      data: {
        matchStatus: matched ? 'ok' : 'pending_review',
        matchDiscrepancy: matched ? (Prisma.JsonNull as any) : ({ discrepancies } as any),
        status: matched ? ('matched' as any) : ('on_hold' as any),
      },
    });

    await this.audit.log({
      companyId,
      userId: session.userId,
      userEmail: session.userId,
      action: 'purchase.vinvoice.three_way_match',
      entityType: 'VendorInvoice',
      entityId: invoiceId,
      after: { matched, discrepancies },
    } as any);

    return { matched, discrepancies, invoice: updated };
  }

  async post(
    invoiceId: string,
    companyId: string,
    session: UserSession,
    options: { override?: boolean } = {},
  ) {
    const invoice = await this.findOne(invoiceId, companyId);

    if ((invoice.status as any) === 'posted') {
      throw new BadRequestException({
        code: 'VINV_ALREADY_POSTED',
        messageAr: 'الفاتورة مُرحّلة مسبقاً',
      });
    }

    if ((invoice.status as any) === 'on_hold' && !options.override) {
      throw new BadRequestException({
        code: 'VINV_ON_HOLD',
        messageAr: 'الفاتورة معلّقة — مطابقة ثلاثية غير ناجحة',
      });
    }

    if (!['matched', 'draft', 'on_hold'].includes(invoice.status as any)) {
      throw new BadRequestException({
        code: 'VINV_INVALID_STATE',
        messageAr: 'حالة الفاتورة غير صالحة للترحيل',
      });
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // build JE lines
      const jeLines: Array<{
        accountCode: string;
        debit?: number;
        credit?: number;
        description?: string;
      }> = [];

      for (const l of invoice.lines) {
        const amount = new Prisma.Decimal(l.lineTotalIqd as any).toNumber();
        if (amount === 0) continue;
        let accountCode = '6100'; // generic purchases/expense
        if (l.accountId) {
          const acc = await tx.chartOfAccount.findUnique({ where: { id: l.accountId } });
          if (acc) accountCode = acc.code;
        } else if (l.variantId) {
          accountCode = '1300'; // inventory
        }
        jeLines.push({
          accountCode,
          debit: amount,
          description: l.description,
        });
      }

      if (new Prisma.Decimal(invoice.taxIqd as any).gt(0)) {
        jeLines.push({
          accountCode: '341',
          debit: new Prisma.Decimal(invoice.taxIqd as any).toNumber(),
          description: 'ضريبة مدخلات',
        });
      }
      if (new Prisma.Decimal(invoice.shippingIqd as any).gt(0)) {
        jeLines.push({
          accountCode: '643',
          debit: new Prisma.Decimal(invoice.shippingIqd as any).toNumber(),
          description: 'شحن',
        });
      }
      if (new Prisma.Decimal(invoice.discountIqd as any).gt(0)) {
        jeLines.push({
          accountCode: '593',
          credit: new Prisma.Decimal(invoice.discountIqd as any).toNumber(),
          description: 'خصم مكتسب',
        });
      }

      // supplier AP credit
      jeLines.push({
        accountCode: '321',
        credit: new Prisma.Decimal(invoice.totalIqd as any).toNumber(),
        description: `ذمم ${invoice.supplier?.nameAr ?? ''}`,
      });

      const je = await this.posting.postJournalEntry(
        {
          companyId,
          entryDate: invoice.invoiceDate,
          refType: 'VendorInvoice',
          refId: invoice.id,
          description: `فاتورة مورّد ${invoice.number}`,
          lines: jeLines,
        } as any,
        session,
        tx as any,
      );

      // update invoice
      const updated = await tx.vendorInvoice.update({
        where: { id: invoiceId },
        data: {
          status: 'posted' as any,
          postedAt: new Date(),
          postedBy: session.userId,
          journalEntryId: je.id,
        },
      });

      // update supplier balance
      await tx.supplier.update({
        where: { id: invoice.supplierId },
        data: {
          balanceIqd: {
            increment: new Prisma.Decimal(invoice.totalIqd as any) as any,
          },
        },
      });

      // update PO line qtyInvoiced
      if (invoice.purchaseOrderId) {
        for (const il of invoice.lines) {
          if (!il.variantId) continue;
          const poLine = await tx.purchaseOrderLine.findFirst({
            where: {
              purchaseOrderId: invoice.purchaseOrderId,
              variantId: il.variantId,
            },
          });
          if (poLine) {
            await tx.purchaseOrderLine.update({
              where: { id: poLine.id },
              data: {
                qtyInvoiced: {
                  increment: new Prisma.Decimal(il.qty as any) as any,
                },
              },
            });
          }
        }
      }

      return updated;
    });

    await this.audit.log({
      companyId,
      userId: session.userId,
      userEmail: session.userId,
      action: 'purchase.vinvoice.post',
      entityType: 'VendorInvoice',
      entityId: invoiceId,
      before: invoice,
      after: result,
    } as any);

    return result;
  }

  async recordPayment(
    invoiceId: string,
    companyId: string,
    dto: RecordPaymentDto,
    session: UserSession,
  ) {
    const invoice = await this.findOne(invoiceId, companyId);
    if (!['posted', 'partially_paid'].includes(invoice.status as any)) {
      throw new BadRequestException({
        code: 'VINV_NOT_PAYABLE',
        messageAr: 'الفاتورة غير قابلة للدفع',
      });
    }
    const amount = new Prisma.Decimal(dto.amountIqd);
    const balance = new Prisma.Decimal(invoice.balanceIqd as any);
    if (amount.lte(0)) {
      throw new BadRequestException({
        code: 'PAYMENT_INVALID_AMOUNT',
        messageAr: 'قيمة الدفعة غير صحيحة',
      });
    }
    if (amount.gt(balance)) {
      throw new BadRequestException({
        code: 'PAYMENT_EXCEEDS_BALANCE',
        messageAr: 'قيمة الدفعة تتجاوز الرصيد المستحق',
      });
    }

    const paymentDate = dto.paymentDate ?? new Date();

    const result = await this.prisma.$transaction(async (tx) => {
      const cashAccount = await tx.chartOfAccount.findUnique({
        where: { id: dto.cashAccountId },
      });
      if (!cashAccount) {
        throw new NotFoundException({
          code: 'ACCOUNT_NOT_FOUND',
          messageAr: 'الحساب غير موجود',
        });
      }

      const je = await this.posting.postJournalEntry(
        {
          companyId,
          entryDate: paymentDate,
          refType: 'VendorInvoicePayment',
          refId: invoice.id,
          description: `دفعة لفاتورة ${invoice.number}`,
          lines: [
            {
              accountCode: '321',
              debit: amount.toNumber(),
              description: 'سداد ذمم مورّد',
            },
            {
              accountCode: cashAccount.code,
              credit: amount.toNumber(),
              description: dto.reference || dto.method,
            },
          ],
        } as any,
        session,
        tx as any,
      );

      const payment = await tx.vendorInvoicePayment.create({
        data: {
          invoiceId:      invoice.id,
          paymentDate,
          amountIqd:      amount,
          method:         dto.method as any,
          reference:      dto.reference,
          cashAccountId:  dto.cashAccountId,
          journalEntryId: je.id,
          createdBy:      session.userId,
        },
      });

      const newPaid = new Prisma.Decimal(invoice.paidIqd as any).add(amount);
      const newBalance = new Prisma.Decimal(invoice.totalIqd as any).sub(newPaid);
      const newStatus = newBalance.lte(0) ? 'paid' : 'partially_paid';

      const updated = await tx.vendorInvoice.update({
        where: { id: invoice.id },
        data: {
          paidIqd: newPaid,
          balanceIqd: newBalance,
          status: newStatus as any,
        },
      });

      await tx.supplier.update({
        where: { id: invoice.supplierId },
        data: { balanceIqd: { decrement: amount as any } },
      });

      return { invoice: updated, payment };
    });

    await this.audit.log({
      companyId,
      userId: session.userId,
      userEmail: session.userId,
      action: 'purchase.vinvoice.payment',
      entityType: 'VendorInvoice',
      entityId: invoiceId,
      after: result,
    } as any);

    return result;
  }

  async reverse(
    invoiceId: string,
    companyId: string,
    reason: string,
    session: UserSession,
  ) {
    const invoice = await this.findOne(invoiceId, companyId);
    if ((invoice.status as any) !== 'posted') {
      throw new BadRequestException({
        code: 'VINV_NOT_POSTED',
        messageAr: 'لا يمكن عكس فاتورة غير مرحّلة',
      });
    }
    if (new Prisma.Decimal(invoice.paidIqd as any).gt(0)) {
      throw new BadRequestException({
        code: 'VINV_HAS_PAYMENTS',
        messageAr: 'لا يمكن عكس فاتورة لها دفعات مسجلة',
      });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      // post reversing JE
      if (invoice.journalEntryId) {
        await this.posting.postJournalEntry(
          {
            companyId,
            entryDate: new Date(),
            refType: 'VendorInvoiceReversal',
            refId: invoice.id,
            description: `عكس فاتورة ${invoice.number}: ${reason}`,
            reverseOf: invoice.journalEntryId,
            lines: [],
          } as any,
          session,
          tx as any,
        );
      }

      await tx.supplier.update({
        where: { id: invoice.supplierId },
        data: {
          balanceIqd: {
            decrement: new Prisma.Decimal(invoice.totalIqd as any) as any,
          },
        },
      });

      // reverse PO qtyInvoiced
      if (invoice.purchaseOrderId) {
        for (const il of invoice.lines) {
          if (!il.variantId) continue;
          const poLine = await tx.purchaseOrderLine.findFirst({
            where: {
              purchaseOrderId: invoice.purchaseOrderId,
              variantId: il.variantId,
            },
          });
          if (poLine) {
            await tx.purchaseOrderLine.update({
              where: { id: poLine.id },
              data: {
                qtyInvoiced: {
                  decrement: new Prisma.Decimal(il.qty as any) as any,
                },
              },
            });
          }
        }
      }

      return tx.vendorInvoice.update({
        where: { id: invoiceId },
        data: { status: 'reversed' as any },
      });
    });

    await this.audit.log({
      companyId,
      userId: session.userId,
      userEmail: session.userId,
      action: 'purchase.vinvoice.reverse',
      entityType: 'VendorInvoice',
      entityId: invoiceId,
      before: invoice,
      after: updated,
    } as any);

    return updated;
  }

  async getOcrSuggestion(attachmentUrl: string) {
    // Stub — real OCR in Wave 6
    return {
      attachmentUrl,
      confidence: 0,
      supplierId: null,
      vendorRef: null,
      invoiceDate: null,
      dueDate: null,
      subtotalIqd: null,
      taxIqd: null,
      totalIqd: null,
      lines: [] as any[],
      note:
        'OCR placeholder — integrate Wave 6 OCR service to auto-extract invoice fields.',
    };
  }

  async findAll(companyId: string, query: FindVendorInvoicesQuery = {}) {
    const page = query.page && query.page > 0 ? Number(query.page) : 1;
    const limit = query.limit && query.limit > 0 ? Number(query.limit) : 25;
    const skip = (page - 1) * limit;

    const where: Prisma.VendorInvoiceWhereInput = { companyId };
    if (query.supplierId) where.supplierId = query.supplierId;
    if (query.status) (where as any).status = query.status;
    if (query.from || query.to) {
      where.invoiceDate = {};
      if (query.from) (where.invoiceDate as any).gte = new Date(query.from);
      if (query.to) (where.invoiceDate as any).lte = new Date(query.to);
    }
    const overdue =
      typeof query.overdue === 'string'
        ? query.overdue === 'true'
        : !!query.overdue;
    if (overdue) {
      where.balanceIqd = { gt: 0 } as any;
      where.dueDate = { lt: new Date() };
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.vendorInvoice.findMany({
        where,
        skip,
        take: limit,
        orderBy: { invoiceDate: 'desc' },
        include: {
          supplier: { select: { id: true, code: true, nameAr: true } },
        },
      }),
      this.prisma.vendorInvoice.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async findOne(id: string, companyId: string) {
    const inv = await this.prisma.vendorInvoice.findFirst({
      where: { id, companyId },
      include: {
        lines: true,
        supplier: true,
        payments: true,
        purchaseOrder: { include: { lines: true } },
      },
    });
    if (!inv) {
      throw new NotFoundException({
        code: 'VINV_NOT_FOUND',
        messageAr: 'فاتورة المورّد غير موجودة',
      });
    }
    return inv;
  }
}
