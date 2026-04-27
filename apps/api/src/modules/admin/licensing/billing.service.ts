/**
 * BillingService — T70 Multi-tenant Billing Dashboard backend.
 *
 * No real payment gateway is integrated. This service provides the
 * billing-record layer: surfaces subscription periods (and T68
 * prorated_charge events) as LicenseInvoices that a super-admin can
 * mark paid (manual recording), mark failed, retry, or void.
 *
 * Authorization: every method is gated by RequirePermission('License','admin')
 * at the controller level (super-admin via RbacGuard's role short-circuit).
 *
 * Idempotency:
 *   - generatePeriodInvoices: unique (subscriptionId, periodStart, periodEnd)
 *     guarantees re-running the sweeper never creates duplicates.
 *   - markPaid: unique (invoiceId, reference) on license_payments — the same
 *     reference string never records two payments.
 */
import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AuditService } from '../../../engines/audit/audit.service';
import type { UserSession } from '@erp/shared-types';

export type InvoiceStatus = 'open' | 'paid' | 'failed' | 'voided';
export type PaymentMethod = 'manual' | 'wire' | 'pending';

export interface ListInvoicesParams {
  companyId?: string;
  status?: InvoiceStatus;
  dateFrom?: string | Date;
  dateTo?: string | Date;
  page?: number;
  limit?: number;
}

export interface MarkPaidInput {
  method: PaymentMethod;
  reference?: string;
  notes?: string;
}

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Paginated list of invoices joined with company + plan summary.
   * Supports filters: companyId, status, dateFrom/dateTo (against periodEnd).
   */
  async listInvoices(params: ListInvoicesParams) {
    const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
    const page = Math.max(params.page ?? 1, 1);
    const skip = (page - 1) * limit;

    const where: any = {};
    if (params.companyId) where.companyId = params.companyId;
    if (params.status) where.status = params.status;
    if (params.dateFrom || params.dateTo) {
      where.periodEnd = {} as any;
      if (params.dateFrom) where.periodEnd.gte = new Date(params.dateFrom);
      if (params.dateTo) where.periodEnd.lte = new Date(params.dateTo);
    }

    const [total, rows] = await Promise.all([
      this.prisma.licenseInvoice.count({ where }),
      this.prisma.licenseInvoice.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          subscription: {
            include: { plan: { select: { code: true, name: true } } },
          },
        },
      }),
    ]);

    const companyIds = Array.from(new Set(rows.map((r) => r.companyId)));
    const companies = companyIds.length
      ? await this.prisma.company.findMany({
          where: { id: { in: companyIds } },
          select: { id: true, code: true, nameAr: true, nameEn: true },
        })
      : [];
    const companyById = new Map(companies.map((c) => [c.id, c]));

    const items = rows.map((r) => ({
      id: r.id,
      companyId: r.companyId,
      companyCode: companyById.get(r.companyId)?.code ?? null,
      companyNameAr: companyById.get(r.companyId)?.nameAr ?? null,
      companyNameEn: companyById.get(r.companyId)?.nameEn ?? null,
      subscriptionId: r.subscriptionId,
      planCode: r.subscription?.plan?.code ?? null,
      planName: r.subscription?.plan?.name ?? null,
      periodStart: r.periodStart,
      periodEnd: r.periodEnd,
      amountIqd: r.amountIqd.toString(),
      status: r.status,
      dueDate: r.dueDate,
      paidAt: r.paidAt,
      paymentMethod: r.paymentMethod,
      paymentReference: r.paymentReference,
      createdAt: r.createdAt,
    }));

    return { items, total, page, limit };
  }

  /** Single invoice with company + plan + payment history. */
  async getInvoice(id: string) {
    const inv = await this.prisma.licenseInvoice.findUnique({
      where: { id },
      include: {
        subscription: {
          include: { plan: { select: { id: true, code: true, name: true } } },
        },
        payments: { orderBy: { paidAt: 'desc' } },
      },
    });
    if (!inv) {
      throw new NotFoundException({
        code: 'INVOICE_NOT_FOUND',
        messageAr: 'الفاتورة غير موجودة',
      });
    }
    const company = await this.prisma.company.findUnique({
      where: { id: inv.companyId },
      select: { id: true, code: true, nameAr: true, nameEn: true, email: true, phone: true },
    });
    return { ...inv, company };
  }

  /**
   * Record a manual payment and flip the invoice to 'paid'.
   * Idempotent on (invoiceId, reference): a duplicate (id, reference) call
   * returns the existing payment without creating another one.
   */
  async markPaid(invoiceId: string, input: MarkPaidInput, actorUserId: string) {
    const inv = await this.prisma.licenseInvoice.findUnique({
      where: { id: invoiceId },
    });
    if (!inv) {
      throw new NotFoundException({
        code: 'INVOICE_NOT_FOUND',
        messageAr: 'الفاتورة غير موجودة',
      });
    }
    if (inv.status === 'voided') {
      throw new BadRequestException({
        code: 'INVOICE_VOIDED',
        messageAr: 'الفاتورة ملغاة — لا يمكن دفعها',
      });
    }
    if (input.method !== 'manual' && input.method !== 'wire' && input.method !== 'pending') {
      throw new BadRequestException({
        code: 'INVALID_METHOD',
        messageAr: 'طريقة دفع غير صالحة',
      });
    }

    // Idempotency: if a payment with the same reference already exists for
    // this invoice, return the invoice unchanged (do not double-record).
    if (input.reference) {
      const existing = await this.prisma.licensePayment.findFirst({
        where: { invoiceId, reference: input.reference },
      });
      if (existing) {
        return this.prisma.licenseInvoice.findUnique({ where: { id: invoiceId } });
      }
    }

    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.licensePayment.create({
        data: {
          invoiceId,
          amountIqd: inv.amountIqd,
          paidAt: now,
          method: input.method,
          reference: input.reference ?? null,
          recordedBy: actorUserId,
          notes: input.notes ?? null,
          status: 'recorded',
        },
      });
      return tx.licenseInvoice.update({
        where: { id: invoiceId },
        data: {
          status: 'paid',
          paidAt: now,
          paymentMethod: input.method,
          paymentReference: input.reference ?? inv.paymentReference,
          notes: input.notes ?? inv.notes,
        },
      });
    });

    await this.audit.log({
      companyId: inv.companyId,
      userId: actorUserId,
      action: 'INVOICE_MARKED_PAID',
      entityType: 'LicenseInvoice',
      entityId: invoiceId,
      metadata: {
        method: input.method,
        reference: input.reference ?? null,
        amountIqd: inv.amountIqd.toString(),
      },
    });

    return updated;
  }

  /** Mark an open or unpaid invoice as failed (e.g. wire bounced). */
  async markFailed(invoiceId: string, opts: { notes?: string }, actorUserId: string) {
    const inv = await this.prisma.licenseInvoice.findUnique({
      where: { id: invoiceId },
    });
    if (!inv) {
      throw new NotFoundException({
        code: 'INVOICE_NOT_FOUND',
        messageAr: 'الفاتورة غير موجودة',
      });
    }
    if (inv.status === 'paid' || inv.status === 'voided') {
      throw new BadRequestException({
        code: 'INVALID_STATUS_TRANSITION',
        messageAr: 'لا يمكن وضع علامة فشل على فاتورة مدفوعة أو ملغاة',
      });
    }

    const updated = await this.prisma.licenseInvoice.update({
      where: { id: invoiceId },
      data: { status: 'failed', notes: opts.notes ?? inv.notes },
    });

    await this.audit.log({
      companyId: inv.companyId,
      userId: actorUserId,
      action: 'INVOICE_MARKED_FAILED',
      entityType: 'LicenseInvoice',
      entityId: invoiceId,
      metadata: { notes: opts.notes ?? null },
    });

    return updated;
  }

  /**
   * Reopen a failed invoice (placeholder for "retry payment" — no real
   * gateway). Only allowed on status='failed'.
   */
  async retryFailedInvoice(invoiceId: string, actorUserId: string) {
    const inv = await this.prisma.licenseInvoice.findUnique({
      where: { id: invoiceId },
    });
    if (!inv) {
      throw new NotFoundException({
        code: 'INVOICE_NOT_FOUND',
        messageAr: 'الفاتورة غير موجودة',
      });
    }
    if (inv.status !== 'failed') {
      throw new BadRequestException({
        code: 'INVOICE_NOT_FAILED',
        messageAr: 'يمكن إعادة المحاولة فقط على الفواتير الفاشلة',
      });
    }
    const updated = await this.prisma.licenseInvoice.update({
      where: { id: invoiceId },
      data: { status: 'open' },
    });
    await this.audit.log({
      companyId: inv.companyId,
      userId: actorUserId,
      action: 'INVOICE_RETRY_REQUESTED',
      entityType: 'LicenseInvoice',
      entityId: invoiceId,
      metadata: {},
    });
    return updated;
  }

  /** Soft-void an invoice (only open or failed). */
  async voidInvoice(invoiceId: string, opts: { notes?: string }, actorUserId: string) {
    const inv = await this.prisma.licenseInvoice.findUnique({
      where: { id: invoiceId },
    });
    if (!inv) {
      throw new NotFoundException({
        code: 'INVOICE_NOT_FOUND',
        messageAr: 'الفاتورة غير موجودة',
      });
    }
    if (inv.status !== 'open' && inv.status !== 'failed') {
      throw new BadRequestException({
        code: 'INVALID_STATUS_TRANSITION',
        messageAr: 'يمكن إلغاء الفواتير المفتوحة أو الفاشلة فقط',
      });
    }
    const updated = await this.prisma.licenseInvoice.update({
      where: { id: invoiceId },
      data: { status: 'voided', notes: opts.notes ?? inv.notes },
    });
    await this.audit.log({
      companyId: inv.companyId,
      userId: actorUserId,
      action: 'INVOICE_VOIDED',
      entityType: 'LicenseInvoice',
      entityId: invoiceId,
      metadata: { notes: opts.notes ?? null },
    });
    return updated;
  }

  /**
   * Sweeper: for every active|grace subscription whose currentPeriodEndAt is
   * in the past relative to `asOf`, ensure a LicenseInvoice exists for that
   * period. Idempotent — safe to run repeatedly.
   *
   * Returns counts: { scanned, created, skipped }.
   */
  async generatePeriodInvoices(asOf?: Date): Promise<{
    scanned: number;
    created: number;
    skipped: number;
  }> {
    const now = asOf ?? new Date();

    const subs = await this.prisma.subscription.findMany({
      where: {
        status: { in: ['active', 'grace'] },
        currentPeriodEndAt: { not: null, lt: now },
      },
      include: { plan: { select: { monthlyPriceIqd: true } } },
    });

    let created = 0;
    let skipped = 0;

    for (const sub of subs) {
      if (!sub.currentPeriodStartAt || !sub.currentPeriodEndAt) {
        skipped++;
        continue;
      }
      // Idempotent insert: relies on unique (subscriptionId, periodStart, periodEnd).
      const existing = await this.prisma.licenseInvoice.findFirst({
        where: {
          subscriptionId: sub.id,
          periodStart: sub.currentPeriodStartAt,
          periodEnd: sub.currentPeriodEndAt,
        },
      });
      if (existing) {
        skipped++;
        continue;
      }
      const amount =
        sub.billingCycle === 'annual'
          ? Number(sub.priceIqd)
          : Number(sub.plan?.monthlyPriceIqd ?? sub.priceIqd);

      try {
        await this.prisma.licenseInvoice.create({
          data: {
            companyId: sub.companyId,
            subscriptionId: sub.id,
            periodStart: sub.currentPeriodStartAt,
            periodEnd: sub.currentPeriodEndAt,
            amountIqd: amount,
            status: 'open',
            dueDate: new Date(
              sub.currentPeriodEndAt.getTime() + 7 * 24 * 60 * 60 * 1000,
            ),
            paymentMethod: 'pending',
          },
        });
        created++;
      } catch {
        // Concurrent create raced us; treat as skipped.
        skipped++;
      }
    }

    return { scanned: subs.length, created, skipped };
  }
}
