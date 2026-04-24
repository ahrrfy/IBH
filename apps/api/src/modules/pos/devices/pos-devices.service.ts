import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AuditService } from '../../../engines/audit/audit.service';
import { Prisma } from '@prisma/client';
import type { UserSession } from '@erp/shared-types';

export interface CreatePOSDeviceDto {
  branchId: string;
  code: string;
  nameAr: string;
  cashAccountId: string;
  cardAccountId?: string | null;
  warehouseId: string;
  printerName?: string | null;
  hardwareFingerprint?: string | null;
}

export interface UpdatePOSDeviceDto {
  nameAr?: string;
  cashAccountId?: string;
  cardAccountId?: string | null;
  warehouseId?: string;
  printerName?: string | null;
  hardwareFingerprint?: string | null;
  isActive?: boolean;
}

@Injectable()
export class POSDevicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(session: UserSession, branchId?: string) {
    return this.prisma.pOSDevice.findMany({
      where: {
        companyId: session.companyId,
        ...(branchId ? { branchId } : {}),
      },
      orderBy: { code: 'asc' },
    });
  }

  async findOne(id: string, session: UserSession) {
    const device = await this.prisma.pOSDevice.findFirst({
      where: { id, companyId: session.companyId },
    });
    if (!device) {
      throw new NotFoundException('جهاز نقطة البيع غير موجود');
    }
    return device;
  }

  async create(dto: CreatePOSDeviceDto, session: UserSession) {
    const existing = await this.prisma.pOSDevice.findFirst({
      where: { companyId: session.companyId, code: dto.code },
    });
    if (existing) {
      throw new ConflictException('رمز الجهاز مستخدم مسبقاً');
    }
    const device = await this.prisma.pOSDevice.create({
      data: {
        companyId:           session.companyId,
        branchId:            dto.branchId,
        code:                dto.code,
        nameAr:              dto.nameAr,
        cashAccountId:       dto.cashAccountId,
        cardAccountId:       dto.cardAccountId ?? null,
        warehouseId:         dto.warehouseId,
        printerName:         dto.printerName ?? null,
        hardwareFingerprint: dto.hardwareFingerprint ?? null,
        isActive:            true,
        createdBy:           session.userId,
      },
    });
    await this.audit.log({
      companyId: session.companyId,
      userId: session.userId,
      action: 'create',
      entityType: 'POSDevice',
      entityId: device.id,
      after: device,
    });
    return device;
  }

  async update(id: string, dto: UpdatePOSDeviceDto, session: UserSession) {
    const before = await this.findOne(id, session);
    const device = await this.prisma.pOSDevice.update({
      where: { id },
      data: { ...dto },
    });
    await this.audit.log({
      companyId: session.companyId,
      userId: session.userId,
      action: 'update',
      entityType: 'POSDevice',
      entityId: device.id,
      before,
      after: device,
    });
    return device;
  }

  async deactivate(id: string, session: UserSession) {
    const openShift = await this.prisma.shift.findFirst({
      where: { posDeviceId: id, status: 'open' },
    });
    if (openShift) {
      throw new BadRequestException('لا يمكن تعطيل جهاز به وردية مفتوحة');
    }
    return this.update(id, { isActive: false }, session);
  }

  async heartbeat(deviceId: string, fingerprint: string, session: UserSession) {
    const device = await this.findOne(deviceId, session);
    if (device.hardwareFingerprint && device.hardwareFingerprint !== fingerprint) {
      throw new BadRequestException('بصمة الجهاز غير مطابقة');
    }
    const updateData: Prisma.POSDeviceUpdateInput = { lastSyncAt: new Date() };
    if (!device.hardwareFingerprint) {
      updateData.hardwareFingerprint = fingerprint;
    }
    return this.prisma.pOSDevice.update({
      where: { id: deviceId },
      data: updateData,
    });
  }
}
