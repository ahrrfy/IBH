import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { UserSession } from '@erp/shared-types';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AuditService } from '../../../engines/audit/audit.service';
import { SequenceService } from '../../../engines/sequence/sequence.service';

interface ListOpts {
  page?: number;
  limit?: number;
  search?: string;
  type?: string;
  isActive?: boolean;
}

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sequence: SequenceService,
  ) {}

  async findAll(companyId: string, opts: ListOpts = {}) {
    const page = opts.page ?? 1;
    const limit = opts.limit ?? 50;
    const where: Prisma.CustomerWhereInput = {
      companyId,
      deletedAt: null,
    };
    if (opts.type) where.type = opts.type as any;
    if (opts.isActive !== undefined) where.isActive = opts.isActive;
    if (opts.search) {
      where.OR = [
        { code: { contains: opts.search, mode: 'insensitive' } },
        { nameAr: { contains: opts.search, mode: 'insensitive' } },
        { phone: { contains: opts.search } },
        { whatsapp: { contains: opts.search } },
        { email: { contains: opts.search, mode: 'insensitive' } },
      ];
    }
    const [items, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.customer.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  async findOne(id: string, companyId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, companyId, deletedAt: null },
    });
    if (!customer) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        messageAr: 'العميل غير موجود',
      });
    }
    return customer;
  }

  async findByPhone(phone: string, companyId: string) {
    return this.prisma.customer.findFirst({
      where: {
        companyId,
        deletedAt: null,
        OR: [{ phone }, { whatsapp: phone }],
      },
    });
  }

  async create(companyId: string, dto: any, session: UserSession) {
    let code = dto.code;
    if (!code) {
      code = await this.sequence.next(companyId, 'customer');
    } else {
      const exists = await this.prisma.customer.findFirst({
        where: { companyId, code, deletedAt: null },
      });
      if (exists) {
        throw new ConflictException({
          code: 'CONFLICT',
          messageAr: 'رمز العميل مستخدم من قبل',
        });
      }
    }
    if (dto.phone) {
      const dup = await this.prisma.customer.findFirst({
        where: { companyId, phone: dto.phone, deletedAt: null },
      });
      if (dup) {
        throw new ConflictException({
          code: 'CONFLICT',
          messageAr: 'رقم الهاتف مستخدم من قبل',
        });
      }
    }
    if (dto.email) {
      const dup = await this.prisma.customer.findFirst({
        where: { companyId, email: dto.email, deletedAt: null },
      });
      if (dup) {
        throw new ConflictException({
          code: 'CONFLICT',
          messageAr: 'البريد الإلكتروني مستخدم من قبل',
        });
      }
    }

    const customer = await this.prisma.customer.create({
      data: {
        companyId,
        code,
        type:               dto.type ?? 'regular',
        nameAr:             dto.nameAr,
        phone:              dto.phone,
        whatsapp:           dto.whatsapp,
        email:              dto.email,
        address:            dto.address,
        creditLimitIqd:     new Prisma.Decimal(dto.creditLimitIqd ?? 0),
        creditBalanceIqd:   new Prisma.Decimal(0),
        loyaltyPoints:      0,
        loyaltyTier:        dto.loyaltyTier ?? 'bronze',
        defaultDiscountPct: new Prisma.Decimal(dto.defaultDiscountPct ?? 0),
        isActive:           dto.isActive ?? true,
        createdBy:          session.userId,
        updatedBy:          session.userId,
      },
    });

    await this.audit.log({
      companyId,
      userId: session.userId,
      userEmail: session.userId,
      action: 'customer.create',
      entityType: 'Customer',
      entityId: customer.id,
      after: customer,
    });

    return customer;
  }

  async update(id: string, companyId: string, dto: any, session: UserSession) {
    const before = await this.findOne(id, companyId);
    const data: Prisma.CustomerUpdateInput = {};
    if (dto.nameAr !== undefined) data.nameAr = dto.nameAr;
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.whatsapp !== undefined) data.whatsapp = dto.whatsapp;
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.address !== undefined) data.address = dto.address;
    if (dto.creditLimitIqd !== undefined)
      data.creditLimitIqd = new Prisma.Decimal(dto.creditLimitIqd);
    if (dto.defaultDiscountPct !== undefined)
      data.defaultDiscountPct = new Prisma.Decimal(dto.defaultDiscountPct);
    if (dto.loyaltyTier !== undefined) data.loyaltyTier = dto.loyaltyTier;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    const customer = await this.prisma.customer.update({
      where: { id },
      data,
    });

    await this.audit.log({
      companyId,
      userId: session.userId,
      userEmail: session.userId,
      action: 'customer.update',
      entityType: 'Customer',
      entityId: id,
      before,
      after: customer,
    });

    return customer;
  }

  async softDelete(id: string, companyId: string, session: UserSession) {
    const customer = await this.findOne(id, companyId);
    if (customer.creditBalanceIqd.gt(0)) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        messageAr: 'لا يمكن حذف العميل: يوجد رصيد مستحق',
      });
    }
    const activeOrders = await this.prisma.salesOrder.count({
      where: {
        companyId,
        customerId: id,
        status: { in: ['draft', 'confirmed', 'partially_delivered'] as any },
      },
    });
    if (activeOrders > 0) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        messageAr: 'لا يمكن حذف العميل: يوجد طلبات نشطة',
      });
    }

    const deleted = await this.prisma.customer.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });

    await this.audit.log({
      companyId,
      userId: session.userId,
      userEmail: session.userId,
      action: 'customer.delete',
      entityType: 'Customer',
      entityId: id,
      before: customer,
      after: deleted,
    });

    return { success: true };
  }

  async adjustLoyaltyPoints(
    customerId: string,
    companyId: string,
    delta: number,
    reason: string,
    session: UserSession,
  ) {
    const customer = await this.findOne(customerId, companyId);
    const newPoints = customer.loyaltyPoints + delta;
    if (newPoints < 0) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        messageAr: 'نقاط الولاء غير كافية',
      });
    }
    const updated = await this.prisma.customer.update({
      where: { id: customerId },
      data: { loyaltyPoints: newPoints },
    });

    await this.audit.log({
      companyId,
      userId: session.userId,
      userEmail: session.userId,
      action: 'customer.loyalty_adjust',
      entityType: 'Customer',
      entityId: customerId,
      before: { loyaltyPoints: customer.loyaltyPoints },
      after: { loyaltyPoints: updated.loyaltyPoints, delta, reason },
    });

    return updated;
  }

  async getAgingReport(companyId: string) {
    const today = new Date();
    const invoices = await this.prisma.salesInvoice.findMany({
      where: {
        companyId,
        status: { in: ['posted', 'partially_paid'] },
        balanceIqd: { gt: 0 },
      },
      select: {
        id:          true,
        customerId:  true,
        number:      true,
        invoiceDate: true,
        dueDate:     true,
        balanceIqd:  true,
        customer:    { select: { id: true, code: true, nameAr: true } },
      },
    });

    const buckets: Record<
      string,
      { current: Prisma.Decimal; d1_30: Prisma.Decimal; d31_60: Prisma.Decimal; d61_90: Prisma.Decimal; d90plus: Prisma.Decimal; total: Prisma.Decimal; customer: any }
    > = {};

    for (const inv of invoices) {
      const key = inv.customerId;
      if (!buckets[key]) {
        buckets[key] = {
          current: new Prisma.Decimal(0),
          d1_30: new Prisma.Decimal(0),
          d31_60: new Prisma.Decimal(0),
          d61_90: new Prisma.Decimal(0),
          d90plus: new Prisma.Decimal(0),
          total: new Prisma.Decimal(0),
          customer: inv.customer,
        };
      }
      const b = buckets[key];
      const due = inv.dueDate ?? inv.invoiceDate;
      const daysOverdue = Math.floor((today.getTime() - due.getTime()) / 86400000);
      const bal = inv.balanceIqd;
      if (daysOverdue <= 0) b.current = b.current.plus(bal);
      else if (daysOverdue <= 30) b.d1_30 = b.d1_30.plus(bal);
      else if (daysOverdue <= 60) b.d31_60 = b.d31_60.plus(bal);
      else if (daysOverdue <= 90) b.d61_90 = b.d61_90.plus(bal);
      else b.d90plus = b.d90plus.plus(bal);
      b.total = b.total.plus(bal);
    }

    return Object.entries(buckets).map(([customerId, v]) => ({
      customerId,
      customer: v.customer,
      current: v.current.toString(),
      d1_30: v.d1_30.toString(),
      d31_60: v.d31_60.toString(),
      d61_90: v.d61_90.toString(),
      d90plus: v.d90plus.toString(),
      total: v.total.toString(),
    }));
  }
}
