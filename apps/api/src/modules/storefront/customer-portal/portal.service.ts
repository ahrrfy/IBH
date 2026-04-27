import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { assertStorefrontConfig, readStorefrontConfig } from '../storefront.config';

interface ProfileUpdate {
  nameAr?: string;
  email?: string;
  address?: string;
  city?: string;
}

@Injectable()
export class PortalService {
  private readonly cfg = readStorefrontConfig();

  constructor(private readonly prisma: PrismaService) {}

  /** Profile + loyalty summary for the authenticated customer. */
  async getMe(customerId: string) {
    assertStorefrontConfig(this.cfg);
    const c = await this.prisma.customer.findFirst({
      where: { id: customerId, companyId: this.cfg.companyId, deletedAt: null },
      select: {
        id: true,
        nameAr: true,
        nameEn: true,
        phone: true,
        whatsapp: true,
        email: true,
        address: true,
        city: true,
        loyaltyPoints: true,
        loyaltyTier: true,
        createdAt: true,
      },
    });
    if (!c) throw new NotFoundException({ code: 'NOT_FOUND', messageAr: 'العميل غير موجود' });
    return c;
  }

  /** Update editable profile fields. Phone changes require a fresh OTP and are not allowed here. */
  async updateMe(customerId: string, dto: ProfileUpdate) {
    assertStorefrontConfig(this.cfg);
    const data: ProfileUpdate & { updatedBy: string } = { updatedBy: '00000000000000000000000000' };
    if (typeof dto.nameAr === 'string') {
      const trimmed = dto.nameAr.trim();
      if (trimmed.length < 2) {
        throw new BadRequestException({ code: 'VALIDATION_ERROR', messageAr: 'الاسم قصير جداً' });
      }
      data.nameAr = trimmed.slice(0, 200);
    }
    if (typeof dto.email === 'string') {
      const e = dto.email.trim();
      if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
        throw new BadRequestException({ code: 'VALIDATION_ERROR', messageAr: 'البريد الإلكتروني غير صالح' });
      }
      data.email = e || undefined;
    }
    if (typeof dto.address === 'string') data.address = dto.address.trim().slice(0, 1000) || undefined;
    if (typeof dto.city === 'string') data.city = dto.city.trim().slice(0, 100) || undefined;

    // Ensure ownership: scoped update by id + companyId.
    const existing = await this.prisma.customer.findFirst({
      where: { id: customerId, companyId: this.cfg.companyId, deletedAt: null },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException({ code: 'NOT_FOUND', messageAr: 'العميل غير موجود' });

    return this.prisma.customer.update({
      where: { id: customerId },
      data,
      select: {
        id: true,
        nameAr: true,
        email: true,
        address: true,
        city: true,
        phone: true,
        loyaltyPoints: true,
      },
    });
  }

  /** Paginated order list for the authenticated customer. */
  async listOrders(customerId: string, page = 1, pageSize = 20) {
    assertStorefrontConfig(this.cfg);
    const p = Math.max(1, page);
    const ps = Math.min(50, Math.max(1, pageSize));

    const [items, total] = await Promise.all([
      this.prisma.salesOrder.findMany({
        where: { companyId: this.cfg.companyId, customerId },
        orderBy: { orderDate: 'desc' },
        skip: (p - 1) * ps,
        take: ps,
        select: {
          id: true,
          number: true,
          status: true,
          orderDate: true,
          totalIqd: true,
          paymentStatus: true,
          paymentMethod: true,
          trackingId: true,
        },
      }),
      this.prisma.salesOrder.count({ where: { companyId: this.cfg.companyId, customerId } }),
    ]);

    return {
      items: items.map((o) => ({
        id: o.id,
        number: o.number,
        status: o.status,
        createdAt: o.orderDate.toISOString(),
        total: Number(o.totalIqd),
        paymentStatus: o.paymentStatus,
        paymentMethod: o.paymentMethod,
        trackingId: o.trackingId,
      })),
      total,
      page: p,
      pageSize: ps,
      pages: Math.max(1, Math.ceil(total / ps)),
    };
  }

  /** Detail view for a single owned order — verifies ownership before returning. */
  async getOrder(customerId: string, orderId: string) {
    assertStorefrontConfig(this.cfg);
    const o = await this.prisma.salesOrder.findFirst({
      where: { id: orderId, customerId, companyId: this.cfg.companyId },
      include: {
        lines: {
          select: {
            id: true,
            variantId: true,
            qty: true,
            unitPriceIqd: true,
            lineTotalIqd: true,
          },
        },
        deliveries: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            status: true,
            deliveryCity: true,
            plannedDate: true,
            dispatchedAt: true,
            deliveredAt: true,
            externalWaybillNo: true,
          },
        },
      },
    });
    if (!o) throw new NotFoundException({ code: 'NOT_FOUND', messageAr: 'الطلب غير موجود' });

    // Lookup variant labels for display (limit to 50 lines — UI cap).
    const variantIds = o.lines.map((l) => l.variantId);
    const variants = variantIds.length
      ? await this.prisma.productVariant.findMany({
          where: { id: { in: variantIds } },
          select: { id: true, sku: true, template: { select: { nameAr: true, generatedFullName: true } } },
        })
      : [];
    const labelById = new Map(
      variants.map((v) => [v.id, v.template?.generatedFullName || v.template?.nameAr || v.sku]),
    );

    return {
      id: o.id,
      number: o.number,
      status: o.status,
      createdAt: o.orderDate.toISOString(),
      total: Number(o.totalIqd),
      subtotal: Number(o.subtotalIqd),
      shipping: Number(o.shippingIqd),
      tax: Number(o.taxIqd),
      paymentMethod: o.paymentMethod,
      paymentStatus: o.paymentStatus,
      trackingId: o.trackingId,
      lines: o.lines.map((l) => ({
        id: l.id,
        variantId: l.variantId,
        nameAr: labelById.get(l.variantId) ?? l.variantId,
        qty: Number(l.qty),
        price: Number(l.unitPriceIqd),
        lineTotal: Number(l.lineTotalIqd),
      })),
      delivery: o.deliveries[0] ?? null,
    };
  }

  /**
   * Loyalty summary. The schema (M05) keeps a single running balance on
   * `Customer.loyaltyPoints`; there is no transaction history table, so the
   * "history" surface mirrors the sales orders that earned/used points.
   */
  async getLoyalty(customerId: string) {
    assertStorefrontConfig(this.cfg);
    const c = await this.prisma.customer.findFirst({
      where: { id: customerId, companyId: this.cfg.companyId, deletedAt: null },
      select: { loyaltyPoints: true, loyaltyTier: true },
    });
    if (!c) throw new NotFoundException({ code: 'NOT_FOUND', messageAr: 'العميل غير موجود' });

    // No LoyaltyTransaction history table exists in the schema (M05); the only
    // running record is `Customer.loyaltyPoints` plus per-POSReceipt earned/used
    // counters. Return the current balance + the last 50 POS receipts that
    // touched loyalty as a best-effort history surface.
    const history = await this.prisma.pOSReceipt.findMany({
      where: {
        companyId: this.cfg.companyId,
        customerId,
        OR: [{ loyaltyPointsEarned: { gt: 0 } }, { loyaltyPointsUsed: { gt: 0 } }],
      },
      orderBy: { receiptDate: 'desc' },
      take: 50,
      select: {
        id: true,
        number: true,
        receiptDate: true,
        loyaltyPointsEarned: true,
        loyaltyPointsUsed: true,
        totalIqd: true,
      },
    });

    return {
      points: c.loyaltyPoints,
      tier: c.loyaltyTier ?? null,
      history: history.map((h) => ({
        id: h.id,
        number: h.number,
        date: h.receiptDate.toISOString(),
        earned: h.loyaltyPointsEarned,
        used: h.loyaltyPointsUsed,
        total: Number(h.totalIqd),
      })),
    };
  }
}
