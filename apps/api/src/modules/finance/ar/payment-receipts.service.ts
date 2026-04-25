import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AuditService } from '../../../engines/audit/audit.service';
import { SequenceService } from '../../../engines/sequence/sequence.service';
import { PostingService } from '../../../engines/posting/posting.service';
import { Prisma } from '@prisma/client';
import type { UserSession } from '@erp/shared-types';

export interface CreatePaymentReceiptDto {
  customerId: string;
  amountIqd: string | number;
  method: 'cash' | 'bank_transfer' | 'cheque' | 'card' | 'other';
  cashAccountId: string; // ChartOfAccount id of the receiving cash/bank account
  reference?: string;
  appliedInvoices: Array<{ invoiceId: string; amount: string | number }>;
  notes?: string;
  receiptDate?: string | Date;
}

@Injectable()
export class PaymentReceiptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sequence: SequenceService,
    private readonly posting: PostingService,
  ) {}

  async create(dto: CreatePaymentReceiptDto, session: UserSession) {
    if (!session.branchId) {
      throw new BadRequestException({
        code: 'BRANCH_REQUIRED',
        messageAr: 'الفرع مطلوب لإنشاء إيصال قبض',
      });
    }
    const branchId = session.branchId;

    const amount = new Prisma.Decimal(dto.amountIqd);
    if (amount.lte(0)) {
      throw new BadRequestException({
        code: 'INVALID_AMOUNT',
        messageAr: 'المبلغ غير صالح',
      });
    }
    const appliedTotal = dto.appliedInvoices.reduce(
      (s, a) => s.plus(new Prisma.Decimal(a.amount)),
      new Prisma.Decimal(0),
    );
    if (appliedTotal.gt(amount)) {
      throw new BadRequestException({
        code: 'APPLIED_EXCEEDS_AMOUNT',
        messageAr: 'المبلغ المطبق يتجاوز المبلغ المستلم',
      });
    }

    const customer = await this.prisma.customer.findFirst({
      where: { id: dto.customerId, companyId: session.companyId },
    });
    if (!customer) {
      throw new NotFoundException({
        code: 'CUSTOMER_NOT_FOUND',
        messageAr: 'العميل غير موجود',
      });
    }

    const cashCoA = await this.prisma.chartOfAccount.findFirst({
      where: { id: dto.cashAccountId, companyId: session.companyId },
    });
    if (!cashCoA) {
      throw new BadRequestException({
        code: 'CASH_ACCOUNT_NOT_FOUND',
        messageAr: 'حساب النقد غير موجود',
      });
    }

    // AR control account placeholder. TODO: map to Iraqi CoA code (e.g. '221').
    const arCode = '221';

    const unapplied = amount.minus(appliedTotal);
    const amountNum = amount.toNumber();

    const result = await this.prisma.$transaction(async (tx) => {
      const number = await this.sequence.next(session.companyId, 'PR', branchId);

      const je = await this.posting.postJournalEntry(
        {
          companyId: session.companyId,
          branchId,
          entryDate: dto.receiptDate ? new Date(dto.receiptDate) : new Date(),
          refType: 'PaymentReceipt',
          refId: number,
          description: `Payment receipt ${number} from ${customer.nameAr ?? customer.nameEn ?? customer.id}`,
          lines: [
            { accountCode: cashCoA.code, debit: amountNum, description: `Receipt ${number}` },
            { accountCode: arCode, credit: amountNum, description: `Receipt ${number}` },
          ],
        },
        { userId: session.userId },
        tx,
      );

      const receipt = await tx.paymentReceipt.create({
        data: {
          companyId: session.companyId,
          branchId,
          number,
          customerId: dto.customerId,
          receiptDate: dto.receiptDate ? new Date(dto.receiptDate) : new Date(),
          amountIqd: amount,
          method: dto.method as any,
          reference: dto.reference,
          cashAccountId: dto.cashAccountId,
          appliedInvoices: dto.appliedInvoices as unknown as Prisma.JsonArray,
          unappliedAmount: unapplied,
          journalEntryId: je.id,
          createdBy: session.userId,
        },
      });

      for (const a of dto.appliedInvoices) {
        const amt = new Prisma.Decimal(a.amount);
        const inv = await tx.salesInvoice.findFirst({
          where: { id: a.invoiceId, companyId: session.companyId },
        });
        if (!inv) {
          throw new BadRequestException({
            code: 'INVOICE_NOT_FOUND',
            messageAr: `الفاتورة ${a.invoiceId} غير موجودة`,
          });
        }
        await tx.salesInvoice.update({
          where: { id: inv.id },
          data: {
            paidIqd: inv.paidIqd.plus(amt),
            balanceIqd: inv.balanceIqd.minus(amt),
          },
        });
      }

      await tx.customer.update({
        where: { id: customer.id },
        data: {
          creditBalanceIqd: customer.creditBalanceIqd.minus(amount),
        },
      });

      return receipt;
    });

    await this.audit.log({
      companyId: session.companyId,
      userId: session.userId,
      entity: 'PaymentReceipt',
      entityId: result.id,
      action: 'create',
      after: result,
    });

    return result;
  }

  async applyToInvoice(
    receiptId: string,
    body: { invoiceId: string; amount: string | number },
    session: UserSession,
  ) {
    const amt = new Prisma.Decimal(body.amount);
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.paymentReceipt.findFirst({
        where: { id: receiptId, companyId: session.companyId },
      });
      if (!r) {
        throw new NotFoundException({
          code: 'RECEIPT_NOT_FOUND',
          messageAr: 'الإيصال غير موجود',
        });
      }
      if (amt.gt(r.unappliedAmount)) {
        throw new BadRequestException({
          code: 'EXCEEDS_UNAPPLIED',
          messageAr: 'المبلغ يتجاوز الرصيد غير المطبق',
        });
      }
      const inv = await tx.salesInvoice.findFirst({
        where: { id: body.invoiceId, companyId: session.companyId },
      });
      if (!inv) {
        throw new NotFoundException({
          code: 'INVOICE_NOT_FOUND',
          messageAr: 'الفاتورة غير موجودة',
        });
      }
      await tx.salesInvoice.update({
        where: { id: inv.id },
        data: {
          paidIqd: inv.paidIqd.plus(amt),
          balanceIqd: inv.balanceIqd.minus(amt),
        },
      });
      const applied = (r.appliedInvoices as unknown as Array<{ invoiceId: string; amount: string }>) ?? [];
      applied.push({ invoiceId: body.invoiceId, amount: amt.toString() });
      return tx.paymentReceipt.update({
        where: { id: receiptId },
        data: {
          appliedInvoices: applied as unknown as Prisma.JsonArray,
          unappliedAmount: r.unappliedAmount.minus(amt),
        },
      });
    });
  }

  /**
   * Refunds overpayment by posting a reverse JE: Dr AR / Cr Cash.
   */
  async refundOverpayment(
    receiptId: string,
    amount: string | number,
    session: UserSession,
  ) {
    const amt = new Prisma.Decimal(amount);
    const r = await this.prisma.paymentReceipt.findFirst({
      where: { id: receiptId, companyId: session.companyId },
    });
    if (!r) {
      throw new NotFoundException({
        code: 'RECEIPT_NOT_FOUND',
        messageAr: 'الإيصال غير موجود',
      });
    }
    if (amt.gt(r.unappliedAmount)) {
      throw new BadRequestException({
        code: 'EXCEEDS_UNAPPLIED',
        messageAr: 'المبلغ يتجاوز الرصيد غير المطبق',
      });
    }
    const cashCoA = await this.prisma.chartOfAccount.findFirst({
      where: { id: r.cashAccountId, companyId: session.companyId },
    });
    if (!cashCoA) {
      throw new BadRequestException({
        code: 'CASH_ACCOUNT_NOT_FOUND',
        messageAr: 'حساب النقد غير موجود',
      });
    }
    const amtNum = amt.toNumber();
    await this.posting.postJournalEntry(
      {
        companyId: session.companyId,
        branchId: r.branchId,
        entryDate: new Date(),
        refType: 'PaymentReceiptRefund',
        refId: r.id,
        description: `Refund overpayment for ${r.number}`,
        lines: [
          { accountCode: '221', debit: amtNum },
          { accountCode: cashCoA.code, credit: amtNum },
        ],
      },
      { userId: session.userId },
    );
    return this.prisma.paymentReceipt.update({
      where: { id: receiptId },
      data: { unappliedAmount: r.unappliedAmount.minus(amt) },
    });
  }

  async findAll(companyId: string, customerId?: string) {
    return this.prisma.paymentReceipt.findMany({
      where: { companyId, ...(customerId ? { customerId } : {}) },
      orderBy: { receiptDate: 'desc' },
    });
  }

  async findOne(id: string, companyId: string) {
    const r = await this.prisma.paymentReceipt.findFirst({
      where: { id, companyId },
    });
    if (!r) {
      throw new NotFoundException({
        code: 'RECEIPT_NOT_FOUND',
        messageAr: 'الإيصال غير موجود',
      });
    }
    const [customer, cashAccount] = await Promise.all([
      this.prisma.customer.findUnique({ where: { id: r.customerId } }),
      this.prisma.chartOfAccount.findUnique({ where: { id: r.cashAccountId } }),
    ]);
    return { ...r, customer, cashAccount };
  }

  async printReceipt(id: string, companyId: string) {
    const r = await this.findOne(id, companyId);
    return {
      number: r.number,
      date: r.receiptDate,
      customerId: r.customerId,
      amountIqd: r.amountIqd,
      method: r.method,
      reference: r.reference,
      applied: r.appliedInvoices,
      unapplied: r.unappliedAmount,
    };
  }
}
