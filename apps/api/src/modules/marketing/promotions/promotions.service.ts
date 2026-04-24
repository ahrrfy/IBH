import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AuditService } from '../../../engines/audit/audit.service';
import { Prisma } from '@prisma/client';
import type { UserSession } from '@erp/shared-types';

type PromoType = 'percent' | 'amount' | 'bxgy' | 'bundle' | 'free_shipping';

@Injectable()
export class PromotionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(
    dto: {
      code?: string;
      nameAr: string;
      type: PromoType;
      value: number | string;
      minPurchaseIqd?: number | string;
      maxDiscountIqd?: number | string;
      applicableCategories?: any;
      applicableVariants?: any;
      startDate: string | Date;
      endDate: string | Date;
      maxUses?: number;
      maxUsesPerCustomer?: number;
    },
    session: UserSession,
  ) {
    if (dto.code) {
      const existing = await this.prisma.promotion.findFirst({
        where: { companyId: session.companyId, code: dto.code },
      });
      if (existing) {
        throw new ConflictException({ code: 'PROMO_CODE_EXISTS', messageAr: 'رمز العرض موجود' });
      }
    }
    const p = await this.prisma.promotion.create({
      data: {
        companyId: session.companyId,
        code: dto.code,
        nameAr: dto.nameAr,
        type: dto.type,
        value: new Prisma.Decimal(dto.value),
        minPurchaseIqd: new Prisma.Decimal(dto.minPurchaseIqd ?? 0),
        maxDiscountIqd: dto.maxDiscountIqd !== undefined ? new Prisma.Decimal(dto.maxDiscountIqd) : null,
        applicableCategories: (dto.applicableCategories ?? []) as any,
        applicableVariants: (dto.applicableVariants ?? []) as any,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        maxUses: dto.maxUses ?? 0,
        maxUsesPerCustomer: dto.maxUsesPerCustomer ?? 0,
        usedCount: 0,
        isActive: true,
      },
    });
    await this.audit.log({
      companyId: session.companyId,
      userId: session.userId,
      action: 'CREATE',
      entity: 'Promotion',
      entityId: p.id,
      after: p,
    });
    return p;
  }

  findAll(companyId: string, filters?: { isActive?: boolean; type?: PromoType }) {
    return this.prisma.promotion.findMany({
      where: {
        companyId,
        ...(filters?.isActive !== undefined ? { isActive: filters.isActive } : {}),
        ...(filters?.type ? { type: filters.type } : {}),
      },
      orderBy: { startDate: 'desc' },
    });
  }

  async findOne(id: string, companyId: string) {
    const p = await this.prisma.promotion.findFirst({ where: { id, companyId } });
    if (!p) throw new NotFoundException({ code: 'PROMO_NOT_FOUND', messageAr: 'العرض غير موجود' });
    return p;
  }

  async update(id: string, dto: any, session: UserSession) {
    const before = await this.findOne(id, session.companyId);
    const data: any = {};
    for (const k of ['nameAr', 'code', 'maxUses', 'maxUsesPerCustomer', 'isActive']) {
      if (dto[k] !== undefined) data[k] = dto[k];
    }
    if (dto.value !== undefined) data.value = new Prisma.Decimal(dto.value);
    if (dto.minPurchaseIqd !== undefined) data.minPurchaseIqd = new Prisma.Decimal(dto.minPurchaseIqd);
    if (dto.maxDiscountIqd !== undefined) {
      data.maxDiscountIqd = dto.maxDiscountIqd === null ? null : new Prisma.Decimal(dto.maxDiscountIqd);
    }
    if (dto.applicableCategories !== undefined) data.applicableCategories = dto.applicableCategories;
    if (dto.applicableVariants !== undefined) data.applicableVariants = dto.applicableVariants;
    if (dto.startDate !== undefined) data.startDate = new Date(dto.startDate);
    if (dto.endDate !== undefined) data.endDate = new Date(dto.endDate);
    const after = await this.prisma.promotion.update({ where: { id }, data });
    await this.audit.log({
      companyId: session.companyId,
      userId: session.userId,
      action: 'UPDATE',
      entity: 'Promotion',
      entityId: id,
      before,
      after,
    });
    return after;
  }

  async remove(id: string, session: UserSession) {
    const before = await this.findOne(id, session.companyId);
    if (before.usedCount > 0) {
      const after = await this.prisma.promotion.update({ where: { id }, data: { isActive: false } });
      await this.audit.log({
        companyId: session.companyId,
        userId: session.userId,
        action: 'DEACTIVATE',
        entity: 'Promotion',
        entityId: id,
        before,
        after,
      });
      return after;
    }
    await this.prisma.promotion.delete({ where: { id } });
    await this.audit.log({
      companyId: session.companyId,
      userId: session.userId,
      action: 'DELETE',
      entity: 'Promotion',
      entityId: id,
      before,
    });
    return { ok: true };
  }

  async validate(params: {
    companyId: string;
    code?: string;
    promotionId?: string;
    customerId?: string;
    cartTotal: number | string;
    cartItems?: { variantId?: string; categoryId?: string; qty: number; unitPrice: number | string }[];
  }) {
    const where: any = { companyId: params.companyId, isActive: true };
    if (params.code) where.code = params.code;
    else if (params.promotionId) where.id = params.promotionId;
    else return { applicable: false, reason: 'NO_CODE', messageAr: 'لم يتم إدخال رمز' };

    const promo = await this.prisma.promotion.findFirst({ where });
    if (!promo) return { applicable: false, reason: 'NOT_FOUND', messageAr: 'العرض غير موجود' };
    const now = new Date();
    if (now < new Date(promo.startDate)) {
      return { applicable: false, reason: 'NOT_STARTED', messageAr: 'العرض لم يبدأ بعد' };
    }
    if (now > new Date(promo.endDate)) {
      return { applicable: false, reason: 'EXPIRED', messageAr: 'العرض منتهي' };
    }
    const cartTotal = new Prisma.Decimal(params.cartTotal);
    if (cartTotal.lt(new Prisma.Decimal(promo.minPurchaseIqd))) {
      return {
        applicable: false,
        reason: 'MIN_PURCHASE',
        messageAr: `الحد الأدنى للشراء ${promo.minPurchaseIqd}`,
      };
    }
    if (promo.maxUses > 0 && promo.usedCount >= promo.maxUses) {
      return { applicable: false, reason: 'EXHAUSTED', messageAr: 'تم استنفاد العرض' };
    }
    if (promo.maxUsesPerCustomer > 0 && params.customerId) {
      const uses = await this.prisma.audit.count({
        where: {
          companyId: params.companyId,
          entity: 'Promotion',
          entityId: promo.id,
          action: 'USE',
          metadata: { path: ['customerId'], equals: params.customerId } as any,
        },
      }).catch(() => 0);
      if (uses >= promo.maxUsesPerCustomer) {
        return { applicable: false, reason: 'CUSTOMER_LIMIT', messageAr: 'تم استخدام العرض بالحد الأقصى لهذا العميل' };
      }
    }
    const discount = this.computeDiscount(promo, cartTotal, params.cartItems);
    return { applicable: true, promotion: promo, discountIqd: discount.toString() };
  }

  private computeDiscount(
    promo: any,
    cartTotal: Prisma.Decimal,
    items?: { qty: number; unitPrice: number | string }[],
  ): Prisma.Decimal {
    let discount = new Prisma.Decimal(0);
    const value = new Prisma.Decimal(promo.value);
    switch (promo.type) {
      case 'percent':
        discount = cartTotal.mul(value).div(100);
        break;
      case 'amount':
        discount = value;
        break;
      case 'free_shipping':
        discount = value;
        break;
      case 'bxgy':
      case 'bundle':
        if (items && items.length) {
          const totalQty = items.reduce((s, i) => s + i.qty, 0);
          const cheapest = items.reduce(
            (m, i) => (new Prisma.Decimal(i.unitPrice).lt(m) ? new Prisma.Decimal(i.unitPrice) : m),
            new Prisma.Decimal(Number.MAX_SAFE_INTEGER),
          );
          const freeItems = Math.floor(totalQty / (Number(value) + 1));
          discount = cheapest.mul(freeItems);
        }
        break;
    }
    if (promo.maxDiscountIqd && discount.gt(new Prisma.Decimal(promo.maxDiscountIqd))) {
      discount = new Prisma.Decimal(promo.maxDiscountIqd);
    }
    if (discount.gt(cartTotal)) discount = cartTotal;
    return discount;
  }

  async applyToOrder(params: {
    promotionId: string;
    companyId: string;
    orderTotal: number | string;
    orderItems?: { variantId?: string; categoryId?: string; qty: number; unitPrice: number | string }[];
  }) {
    const promo = await this.findOne(params.promotionId, params.companyId);
    const total = new Prisma.Decimal(params.orderTotal);
    const discount = this.computeDiscount(promo, total, params.orderItems);
    return {
      promotionId: promo.id,
      originalTotal: total.toString(),
      discountIqd: discount.toString(),
      finalTotal: total.sub(discount).toString(),
    };
  }

  async recordUse(
    params: { promotionId: string; customerId?: string; orderId?: string; discountApplied: number | string },
    session: UserSession,
  ) {
    const promo = await this.findOne(params.promotionId, session.companyId);
    const updated = await this.prisma.promotion.update({
      where: { id: promo.id },
      data: { usedCount: promo.usedCount + 1 },
    });
    await this.audit.log({
      companyId: session.companyId,
      userId: session.userId,
      action: 'USE',
      entity: 'Promotion',
      entityId: promo.id,
      metadata: {
        customerId: params.customerId,
        orderId: params.orderId,
        discountApplied: new Prisma.Decimal(params.discountApplied).toString(),
      },
    });
    return updated;
  }
}
