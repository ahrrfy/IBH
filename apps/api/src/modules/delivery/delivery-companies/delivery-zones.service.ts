import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AuditService } from '../../../engines/audit/audit.service';
import type { UserSession } from '@erp/shared-types';

type CreateZoneDto = {
  code: string;
  nameAr: string;
  nameEn?: string;
  parentId?: string;
  level?: number;
  city?: string;
  notes?: string;
};

type UpdateZoneDto = Partial<CreateZoneDto> & { isActive?: boolean };

type CreateRateDto = {
  deliveryCompanyId: string;
  deliveryZoneId: string;
  baseFeeIqd: number | string;
  perKgIqd?: number | string;
  minFeeIqd?: number | string;
  maxFeeIqd?: number | string;
  estimatedHours?: number;
  validFrom?: string | Date;
  validUntil?: string | Date;
};

type UpdateRateDto = Partial<Omit<CreateRateDto, 'deliveryCompanyId' | 'deliveryZoneId'>> & {
  isActive?: boolean;
};

@Injectable()
export class DeliveryZonesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private toDecimal(v: number | string | null | undefined): Prisma.Decimal | undefined {
    if (v === undefined || v === null || v === '') return undefined;
    return new Prisma.Decimal(v as any);
  }

  // ─── Zones CRUD ───────────────────────────────────────────────

  async createZone(companyId: string, dto: CreateZoneDto, session: UserSession) {
    if (!dto.code || !dto.nameAr) {
      throw new BadRequestException({
        code: 'DLVZN_MISSING_FIELDS',
        messageAr: 'الكود والاسم العربي مطلوبان',
      });
    }
    const code = dto.code.trim().toUpperCase();

    const existing = await this.prisma.deliveryZone.findUnique({
      where: { companyId_code: { companyId, code } },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException({
        code: 'DLVZN_CODE_EXISTS',
        messageAr: `الكود ${code} مستخدم مسبقاً`,
      });
    }

    if (dto.parentId) {
      const parent = await this.prisma.deliveryZone.findFirst({
        where: { id: dto.parentId, companyId },
        select: { id: true, level: true },
      });
      if (!parent) {
        throw new BadRequestException({
          code: 'DLVZN_PARENT_NOT_FOUND',
          messageAr: 'المنطقة الأم غير موجودة',
        });
      }
      // Auto-compute level if not provided
      if (dto.level === undefined) dto.level = parent.level + 1;
    }

    const created = await this.prisma.deliveryZone.create({
      data: {
        companyId,
        code,
        nameAr:    dto.nameAr,
        nameEn:    dto.nameEn ?? null,
        parentId:  dto.parentId ?? null,
        level:     dto.level ?? 0,
        city:      dto.city ?? null,
        notes:     dto.notes ?? null,
        createdBy: session.userId,
        updatedBy: session.userId,
      },
    });

    await this.audit.log({
      companyId,
      userId:     session.userId,
      action:     'delivery_zone.create',
      entityType: 'DeliveryZone',
      entityId:   created.id,
      metadata:   { code, level: created.level },
    });

    return created;
  }

  async listZones(companyId: string, opts: { parentId?: string | null; isActive?: boolean } = {}) {
    const where: Prisma.DeliveryZoneWhereInput = { companyId };
    if (opts.parentId !== undefined) where.parentId = opts.parentId;
    if (typeof opts.isActive === 'boolean') where.isActive = opts.isActive;

    return this.prisma.deliveryZone.findMany({
      where,
      orderBy: [{ level: 'asc' }, { code: 'asc' }],
    });
  }

  async findZone(id: string, companyId: string) {
    const zone = await this.prisma.deliveryZone.findFirst({
      where: { id, companyId },
      include: {
        parent:   { select: { id: true, code: true, nameAr: true } },
        children: { select: { id: true, code: true, nameAr: true, isActive: true } },
        rates: {
          where: { isActive: true },
          include: { deliveryCompany: { select: { id: true, code: true, nameAr: true, isActive: true } } },
          orderBy: { baseFeeIqd: 'asc' },
        },
      },
    });
    if (!zone) {
      throw new NotFoundException({
        code: 'DLVZN_NOT_FOUND',
        messageAr: 'المنطقة غير موجودة',
      });
    }
    return zone;
  }

  async updateZone(id: string, companyId: string, dto: UpdateZoneDto, session: UserSession) {
    await this.findZone(id, companyId);

    const data: Prisma.DeliveryZoneUpdateInput = { updatedBy: session.userId };
    if (dto.nameAr !== undefined)   data.nameAr = dto.nameAr;
    if (dto.nameEn !== undefined)   data.nameEn = dto.nameEn;
    if (dto.level !== undefined)    data.level = dto.level;
    if (dto.city !== undefined)     data.city = dto.city;
    if (dto.notes !== undefined)    data.notes = dto.notes;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    const updated = await this.prisma.deliveryZone.update({
      where: { id },
      data,
    });

    await this.audit.log({
      companyId,
      userId:     session.userId,
      action:     'delivery_zone.update',
      entityType: 'DeliveryZone',
      entityId:   id,
      metadata:   { fields: Object.keys(dto) },
    });

    return updated;
  }

  async deleteZone(id: string, companyId: string, session: UserSession) {
    await this.findZone(id, companyId);

    const usedCount = await this.prisma.deliveryOrder.count({
      where: { companyId, deliveryZoneId: id },
    });
    if (usedCount > 0) {
      throw new BadRequestException({
        code: 'DLVZN_HAS_DELIVERIES',
        messageAr: `لا يمكن حذف المنطقة، مرتبطة بـ ${usedCount} توصيلة. عطّلها بدلاً من ذلك.`,
      });
    }

    await this.prisma.deliveryZone.delete({ where: { id } });
    await this.audit.log({
      companyId,
      userId:     session.userId,
      action:     'delivery_zone.delete',
      entityType: 'DeliveryZone',
      entityId:   id,
    });

    return { deleted: true };
  }

  // ─── Rates CRUD (per company × zone) ──────────────────────────

  async upsertRate(companyId: string, dto: CreateRateDto, session: UserSession) {
    if (!dto.deliveryCompanyId || !dto.deliveryZoneId) {
      throw new BadRequestException({
        code: 'DLVRT_MISSING_FIELDS',
        messageAr: 'يجب تحديد الشركة والمنطقة',
      });
    }
    const baseFee = this.toDecimal(dto.baseFeeIqd);
    if (!baseFee || baseFee.lt(0)) {
      throw new BadRequestException({
        code: 'DLVRT_INVALID_FEE',
        messageAr: 'الرسوم الأساسية مطلوبة وغير سالبة',
      });
    }

    // Verify both belong to this tenant
    const [company, zone] = await Promise.all([
      this.prisma.deliveryCompany.findFirst({
        where: { id: dto.deliveryCompanyId, companyId },
        select: { id: true },
      }),
      this.prisma.deliveryZone.findFirst({
        where: { id: dto.deliveryZoneId, companyId },
        select: { id: true },
      }),
    ]);
    if (!company) throw new NotFoundException({ code: 'DLVCO_NOT_FOUND', messageAr: 'شركة التوصيل غير موجودة' });
    if (!zone)    throw new NotFoundException({ code: 'DLVZN_NOT_FOUND', messageAr: 'المنطقة غير موجودة' });

    const minFee = this.toDecimal(dto.minFeeIqd);
    const maxFee = this.toDecimal(dto.maxFeeIqd);
    if (minFee && maxFee && minFee.gt(maxFee)) {
      throw new BadRequestException({
        code: 'DLVRT_MIN_GT_MAX',
        messageAr: 'الحد الأدنى أكبر من الحد الأقصى',
      });
    }

    const result = await this.prisma.deliveryCompanyRate.upsert({
      where: {
        deliveryCompanyId_deliveryZoneId: {
          deliveryCompanyId: dto.deliveryCompanyId,
          deliveryZoneId:    dto.deliveryZoneId,
        },
      },
      create: {
        deliveryCompanyId: dto.deliveryCompanyId,
        deliveryZoneId:    dto.deliveryZoneId,
        baseFeeIqd:        baseFee,
        perKgIqd:          this.toDecimal(dto.perKgIqd) ?? new Prisma.Decimal(0),
        minFeeIqd:         minFee ?? null,
        maxFeeIqd:         maxFee ?? null,
        estimatedHours:    dto.estimatedHours ?? 24,
        validFrom:         dto.validFrom ? new Date(dto.validFrom) : new Date(),
        validUntil:        dto.validUntil ? new Date(dto.validUntil) : null,
        createdBy:         session.userId,
        updatedBy:         session.userId,
      },
      update: {
        baseFeeIqd:        baseFee,
        perKgIqd:          this.toDecimal(dto.perKgIqd) ?? new Prisma.Decimal(0),
        minFeeIqd:         minFee ?? null,
        maxFeeIqd:         maxFee ?? null,
        estimatedHours:    dto.estimatedHours ?? 24,
        validFrom:         dto.validFrom ? new Date(dto.validFrom) : undefined,
        validUntil:        dto.validUntil ? new Date(dto.validUntil) : null,
        isActive:          true,
        updatedBy:         session.userId,
      },
    });

    await this.audit.log({
      companyId,
      userId:     session.userId,
      action:     'delivery_rate.upsert',
      entityType: 'DeliveryCompanyRate',
      entityId:   result.id,
      metadata:   { companyId: dto.deliveryCompanyId, zoneId: dto.deliveryZoneId },
    });

    return result;
  }

  async listRates(
    companyId: string,
    filters: { deliveryCompanyId?: string; deliveryZoneId?: string; isActive?: boolean } = {},
  ) {
    const where: Prisma.DeliveryCompanyRateWhereInput = {
      deliveryCompany: { companyId },
    };
    if (filters.deliveryCompanyId)        where.deliveryCompanyId = filters.deliveryCompanyId;
    if (filters.deliveryZoneId)           where.deliveryZoneId = filters.deliveryZoneId;
    if (typeof filters.isActive === 'boolean') where.isActive = filters.isActive;

    return this.prisma.deliveryCompanyRate.findMany({
      where,
      include: {
        deliveryCompany: { select: { id: true, code: true, nameAr: true } },
        deliveryZone:    { select: { id: true, code: true, nameAr: true, city: true } },
      },
      orderBy: [{ deliveryZoneId: 'asc' }, { baseFeeIqd: 'asc' }],
    });
  }

  async updateRate(id: string, companyId: string, dto: UpdateRateDto, session: UserSession) {
    const existing = await this.prisma.deliveryCompanyRate.findFirst({
      where: { id, deliveryCompany: { companyId } },
    });
    if (!existing) {
      throw new NotFoundException({
        code: 'DLVRT_NOT_FOUND',
        messageAr: 'تسعيرة غير موجودة',
      });
    }

    const data: Prisma.DeliveryCompanyRateUpdateInput = { updatedBy: session.userId };
    if (dto.baseFeeIqd !== undefined)     data.baseFeeIqd = this.toDecimal(dto.baseFeeIqd);
    if (dto.perKgIqd !== undefined)       data.perKgIqd = this.toDecimal(dto.perKgIqd);
    if (dto.minFeeIqd !== undefined)      data.minFeeIqd = this.toDecimal(dto.minFeeIqd) ?? null;
    if (dto.maxFeeIqd !== undefined)      data.maxFeeIqd = this.toDecimal(dto.maxFeeIqd) ?? null;
    if (dto.estimatedHours !== undefined) data.estimatedHours = dto.estimatedHours;
    if (dto.isActive !== undefined)       data.isActive = dto.isActive;
    if (dto.validFrom !== undefined)      data.validFrom = new Date(dto.validFrom);
    if (dto.validUntil !== undefined)     data.validUntil = dto.validUntil ? new Date(dto.validUntil) : null;

    const updated = await this.prisma.deliveryCompanyRate.update({ where: { id }, data });
    await this.audit.log({
      companyId,
      userId:     session.userId,
      action:     'delivery_rate.update',
      entityType: 'DeliveryCompanyRate',
      entityId:   id,
      metadata:   { fields: Object.keys(dto) },
    });
    return updated;
  }

  async deleteRate(id: string, companyId: string, session: UserSession) {
    const existing = await this.prisma.deliveryCompanyRate.findFirst({
      where: { id, deliveryCompany: { companyId } },
    });
    if (!existing) {
      throw new NotFoundException({
        code: 'DLVRT_NOT_FOUND',
        messageAr: 'تسعيرة غير موجودة',
      });
    }
    await this.prisma.deliveryCompanyRate.delete({ where: { id } });
    await this.audit.log({
      companyId,
      userId:     session.userId,
      action:     'delivery_rate.delete',
      entityType: 'DeliveryCompanyRate',
      entityId:   id,
    });
    return { deleted: true };
  }
}
