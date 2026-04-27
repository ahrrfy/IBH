import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma, DeliveryCompanyType } from '@prisma/client';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AuditService } from '../../../engines/audit/audit.service';
import type { UserSession } from '@erp/shared-types';

type CreateCompanyDto = {
  code: string;
  nameAr: string;
  nameEn?: string;
  type?: DeliveryCompanyType;
  contactPerson?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  address?: string;
  commissionPct?: number | string;
  flatFeePerOrderIqd?: number | string;
  supportsCod?: boolean;
  codHoldingDays?: number;
  minOrderValueIqd?: number | string;
  maxOrderValueIqd?: number | string;
  notes?: string;
};

type UpdateCompanyDto = Partial<CreateCompanyDto> & { isActive?: boolean };

type ListFilters = {
  page?: number;
  limit?: number;
  type?: DeliveryCompanyType;
  isActive?: boolean;
  search?: string;
};

@Injectable()
export class DeliveryCompaniesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private toDecimal(v: number | string | null | undefined): Prisma.Decimal | undefined {
    if (v === undefined || v === null || v === '') return undefined;
    return new Prisma.Decimal(v as any);
  }

  private validatePct(pct: number | string | undefined, label: string) {
    if (pct === undefined) return;
    const n = Number(pct);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      throw new BadRequestException({
        code: 'DLVCO_INVALID_PCT',
        messageAr: `${label} يجب أن تكون بين 0 و 100`,
      });
    }
  }

  async create(companyId: string, dto: CreateCompanyDto, session: UserSession) {
    if (!dto.code || !dto.nameAr) {
      throw new BadRequestException({
        code: 'DLVCO_MISSING_FIELDS',
        messageAr: 'الكود والاسم العربي مطلوبان',
      });
    }
    this.validatePct(dto.commissionPct, 'نسبة العمولة');

    const codeUpper = dto.code.trim().toUpperCase();

    const existing = await this.prisma.deliveryCompany.findUnique({
      where: { companyId_code: { companyId, code: codeUpper } },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException({
        code: 'DLVCO_CODE_EXISTS',
        messageAr: `الكود ${codeUpper} مستخدم مسبقاً`,
      });
    }

    const created = await this.prisma.deliveryCompany.create({
      data: {
        companyId,
        code:                codeUpper,
        nameAr:              dto.nameAr,
        nameEn:              dto.nameEn ?? null,
        type:                dto.type ?? DeliveryCompanyType.external,
        contactPerson:       dto.contactPerson ?? null,
        phone:               dto.phone ?? null,
        whatsapp:            dto.whatsapp ?? null,
        email:               dto.email ?? null,
        address:             dto.address ?? null,
        commissionPct:       this.toDecimal(dto.commissionPct) ?? new Prisma.Decimal(0),
        flatFeePerOrderIqd:  this.toDecimal(dto.flatFeePerOrderIqd) ?? new Prisma.Decimal(0),
        supportsCod:         dto.supportsCod ?? true,
        codHoldingDays:      dto.codHoldingDays ?? 7,
        minOrderValueIqd:    this.toDecimal(dto.minOrderValueIqd) ?? null,
        maxOrderValueIqd:    this.toDecimal(dto.maxOrderValueIqd) ?? null,
        notes:               dto.notes ?? null,
        createdBy:           session.userId,
        updatedBy:           session.userId,
      },
    });

    await this.audit.log({
      companyId,
      userId:     session.userId,
      action:     'delivery_company.create',
      entityType: 'DeliveryCompany',
      entityId:   created.id,
      metadata:   { code: codeUpper, type: created.type },
    });

    return created;
  }

  async findAll(companyId: string, filters: ListFilters = {}) {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(200, Math.max(1, filters.limit ?? 50));
    const skip = (page - 1) * limit;

    const where: Prisma.DeliveryCompanyWhereInput = { companyId, deletedAt: null };
    if (filters.type) where.type = filters.type;
    if (typeof filters.isActive === 'boolean') where.isActive = filters.isActive;
    if (filters.search) {
      where.OR = [
        { code:   { contains: filters.search, mode: 'insensitive' } },
        { nameAr: { contains: filters.search } },
        { nameEn: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const [rows, total] = await Promise.all([
      this.prisma.deliveryCompany.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ isActive: 'desc' }, { successRatePct: 'desc' }, { code: 'asc' }],
      }),
      this.prisma.deliveryCompany.count({ where }),
    ]);

    return { rows, total, page, limit };
  }

  async findOne(id: string, companyId: string) {
    const company = await this.prisma.deliveryCompany.findFirst({
      where: { id, companyId, deletedAt: null },
      include: {
        rates: {
          where: { isActive: true },
          include: { deliveryZone: { select: { id: true, code: true, nameAr: true, city: true } } },
          orderBy: { baseFeeIqd: 'asc' },
        },
      },
    });
    if (!company) {
      throw new NotFoundException({
        code: 'DLVCO_NOT_FOUND',
        messageAr: 'شركة التوصيل غير موجودة',
      });
    }
    return company;
  }

  async update(id: string, companyId: string, dto: UpdateCompanyDto, session: UserSession) {
    await this.findOne(id, companyId);
    this.validatePct(dto.commissionPct, 'نسبة العمولة');

    const data: Prisma.DeliveryCompanyUpdateInput = { updatedBy: session.userId };
    if (dto.nameAr !== undefined)             data.nameAr = dto.nameAr;
    if (dto.nameEn !== undefined)             data.nameEn = dto.nameEn;
    if (dto.contactPerson !== undefined)      data.contactPerson = dto.contactPerson;
    if (dto.phone !== undefined)              data.phone = dto.phone;
    if (dto.whatsapp !== undefined)           data.whatsapp = dto.whatsapp;
    if (dto.email !== undefined)              data.email = dto.email;
    if (dto.address !== undefined)            data.address = dto.address;
    if (dto.commissionPct !== undefined)      data.commissionPct = this.toDecimal(dto.commissionPct);
    if (dto.flatFeePerOrderIqd !== undefined) data.flatFeePerOrderIqd = this.toDecimal(dto.flatFeePerOrderIqd);
    if (dto.supportsCod !== undefined)        data.supportsCod = dto.supportsCod;
    if (dto.codHoldingDays !== undefined)     data.codHoldingDays = dto.codHoldingDays;
    if (dto.minOrderValueIqd !== undefined)   data.minOrderValueIqd = this.toDecimal(dto.minOrderValueIqd);
    if (dto.maxOrderValueIqd !== undefined)   data.maxOrderValueIqd = this.toDecimal(dto.maxOrderValueIqd);
    if (dto.notes !== undefined)              data.notes = dto.notes;
    if (dto.isActive !== undefined) {
      data.isActive = dto.isActive;
      // Manual reactivation clears auto-suspend
      if (dto.isActive === true) {
        data.autoSuspendedAt = null;
        data.autoSuspendReason = null;
      }
    }

    const updated = await this.prisma.deliveryCompany.update({
      where: { id },
      data,
    });

    await this.audit.log({
      companyId,
      userId:     session.userId,
      action:     'delivery_company.update',
      entityType: 'DeliveryCompany',
      entityId:   id,
      metadata:   { fields: Object.keys(dto) },
    });

    return updated;
  }

  async deactivate(id: string, companyId: string, session: UserSession) {
    const company = await this.findOne(id, companyId);

    // Cannot deactivate if there are open deliveries
    const openCount = await this.prisma.deliveryOrder.count({
      where: {
        companyId,
        deliveryCompanyId: id,
        status: { in: ['pending_dispatch', 'assigned', 'in_transit'] },
      },
    });
    if (openCount > 0) {
      throw new BadRequestException({
        code: 'DLVCO_HAS_OPEN_DELIVERIES',
        messageAr: `لا يمكن إيقاف الشركة، يوجد ${openCount} توصيلات مفتوحة`,
      });
    }

    const updated = await this.prisma.deliveryCompany.update({
      where: { id },
      data: { isActive: false, updatedBy: session.userId },
    });

    await this.audit.log({
      companyId,
      userId:     session.userId,
      action:     'delivery_company.deactivate',
      entityType: 'DeliveryCompany',
      entityId:   id,
      metadata:   { previousState: company.isActive },
    });

    return updated;
  }

  async softDelete(id: string, companyId: string, session: UserSession) {
    const company = await this.findOne(id, companyId);

    // Cannot delete if there are any deliveries (preserve history)
    const anyCount = await this.prisma.deliveryOrder.count({
      where: { companyId, deliveryCompanyId: id },
    });
    if (anyCount > 0) {
      throw new BadRequestException({
        code: 'DLVCO_HAS_DELIVERIES',
        messageAr: `لا يمكن حذف الشركة، مرتبطة بـ ${anyCount} توصيلة سابقة. عطّلها بدلاً من ذلك.`,
      });
    }

    const deleted = await this.prisma.deliveryCompany.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedBy: session.userId,
        isActive: false,
        updatedBy: session.userId,
      },
    });

    await this.audit.log({
      companyId,
      userId:     session.userId,
      action:     'delivery_company.delete',
      entityType: 'DeliveryCompany',
      entityId:   id,
      metadata:   { code: company.code },
    });

    return deleted;
  }

  /**
   * Returns the live scorecard view (recomputed on demand) for a single company.
   * Used by both the UI detail page and the autopilot scorecard cron.
   */
  async scorecard(id: string, companyId: string) {
    const company = await this.findOne(id, companyId);

    const counts = await this.prisma.deliveryOrder.groupBy({
      by: ['status'],
      where: { companyId, deliveryCompanyId: id },
      _count: { _all: true },
    });

    const summary = {
      pending_dispatch: 0,
      assigned:         0,
      in_transit:       0,
      delivered:        0,
      failed:           0,
      returned:         0,
      cancelled:        0,
    } as Record<string, number>;
    for (const c of counts) summary[c.status] = c._count._all;

    return {
      company: {
        id:                 company.id,
        code:               company.code,
        nameAr:             company.nameAr,
        type:               company.type,
        isActive:           company.isActive,
        autoSuspendedAt:    company.autoSuspendedAt,
        autoSuspendReason:  company.autoSuspendReason,
      },
      cached: {
        totalDispatched:  company.totalDispatched,
        totalDelivered:   company.totalDelivered,
        totalFailed:      company.totalFailed,
        totalReturned:    company.totalReturned,
        successRatePct:   company.successRatePct.toString(),
        avgDeliveryHours: company.avgDeliveryHours.toString(),
        lastScoredAt:     company.lastScoredAt,
      },
      live: summary,
    };
  }
}
