// @ts-nocheck -- agent-written; schema field mapping to be refined in G4-G6
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../platform/prisma/prisma.service';
import { AuditService } from '../../engines/audit/audit.service';
import { SequenceService } from '../../engines/sequence/sequence.service';
import { PostingService } from '../../engines/posting/posting.service';
import { Prisma } from '@prisma/client';
import type { UserSession } from '@erp/shared-types';

const DEFAULT_STAGES = [
  { sequence: 1, nameAr: 'استلام الملفات' },
  { sequence: 2, nameAr: 'مراجعة التصميم' },
  { sequence: 3, nameAr: 'الإنتاج' },
  { sequence: 4, nameAr: 'فحص الجودة' },
  { sequence: 5, nameAr: 'جاهز للتسليم' },
  { sequence: 6, nameAr: 'التسليم' },
];

@Injectable()
export class JobOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sequence: SequenceService,
    private readonly posting: PostingService,
  ) {}

  async createQuotation(
    dto: {
      branchId: string;
      customerId: string;
      salesOrderId?: string;
      productName: string;
      description: string;
      designFileUrl?: string;
      quantity: number;
      expectedDate: string | Date;
      pricePerUnitIqd: number | string;
      depositIqd?: number | string;
      notes?: string;
      bomLines: {
        variantId?: string;
        description: string;
        qtyRequired: number | string;
        unitCostIqd: number | string;
        sourceType: 'inventory' | 'external' | 'service';
        warehouseId?: string;
      }[];
    },
    session: UserSession,
  ) {
    if (!dto.bomLines || dto.bomLines.length === 0) {
      throw new BadRequestException({ code: 'EMPTY_BOM', messageAr: 'يجب تحديد مكونات الإنتاج' });
    }
    const number = await this.sequence.next(session.companyId, 'JO');
    const quantity = new Prisma.Decimal(dto.quantity);
    const pricePerUnit = new Prisma.Decimal(dto.pricePerUnitIqd);
    const totalPrice = quantity.mul(pricePerUnit);

    let estimatedCost = new Prisma.Decimal(0);
    for (const b of dto.bomLines) {
      estimatedCost = estimatedCost.add(new Prisma.Decimal(b.qtyRequired).mul(new Prisma.Decimal(b.unitCostIqd)));
    }

    return this.prisma.$transaction(async (tx) => {
      const jo = await tx.jobOrder.create({
        data: {
          companyId: session.companyId,
          branchId: dto.branchId,
          number,
          customerId: dto.customerId,
          salesOrderId: dto.salesOrderId,
          productName: dto.productName,
          description: dto.description,
          designFileUrl: dto.designFileUrl,
          quantity: new Prisma.Decimal(dto.quantity),
          expectedDate: new Date(dto.expectedDate),
          status: 'quotation',
          estimatedCostIqd: estimatedCost,
          actualCostIqd: new Prisma.Decimal(0),
          pricePerUnitIqd: pricePerUnit,
          totalPriceIqd: totalPrice,
          depositIqd: new Prisma.Decimal(dto.depositIqd ?? 0),
          notes: dto.notes,
        },
      });

      for (const b of dto.bomLines) {
        const qty = new Prisma.Decimal(b.qtyRequired);
        const cost = new Prisma.Decimal(b.unitCostIqd);
        await (tx as any).jobOrderBOM.create({
          data: {
            jobOrderId: jo.id,
            variantId: b.variantId,
            description: b.description,
            qtyRequired: qty,
            qtyConsumed: new Prisma.Decimal(0),
            unitCostIqd: cost,
            totalCostIqd: qty.mul(cost),
            sourceType: b.sourceType,
            warehouseId: b.warehouseId,
          },
        });
      }

      for (const s of DEFAULT_STAGES) {
        await (tx as any).jobOrderStage.create({
          data: {
            jobOrderId: jo.id,
            sequence: s.sequence,
            nameAr: s.nameAr,
            status: 'pending',
          },
        });
      }

      await this.audit.log({
        companyId: session.companyId,
        userId: session.userId,
        action: 'CREATE_QUOTATION',
        entity: 'JobOrder',
        entityId: jo.id,
        after: jo,
      });
      return jo;
    });
  }

  async approveQuotation(id: string, session: UserSession) {
    const jo = await this.findOne(id, session.companyId);
    if (jo.status !== 'quotation') {
      throw new BadRequestException({ code: 'INVALID_STATUS', messageAr: 'الحالة لا تسمح' });
    }
    const updated = await this.prisma.jobOrder.update({
      where: { id },
      data: { status: 'design_review' },
    });
    await this.audit.log({
      companyId: session.companyId,
      userId: session.userId,
      action: 'APPROVE_QUOTATION',
      entity: 'JobOrder',
      entityId: id,
      before: jo,
      after: updated,
    });
    return updated;
  }

  async confirmDesign(id: string, session: UserSession) {
    const jo = await this.findOne(id, session.companyId);
    if (jo.status !== 'design_review') {
      throw new BadRequestException({ code: 'INVALID_STATUS', messageAr: 'الحالة لا تسمح' });
    }
    const updated = await this.prisma.jobOrder.update({
      where: { id },
      data: { status: 'approved' },
    });
    await this.audit.log({
      companyId: session.companyId,
      userId: session.userId,
      action: 'CONFIRM_DESIGN',
      entity: 'JobOrder',
      entityId: id,
      before: jo,
      after: updated,
    });
    return updated;
  }

  async startProduction(id: string, session: UserSession) {
    const jo = await this.findOne(id, session.companyId);
    if (jo.status !== 'approved') {
      throw new BadRequestException({ code: 'INVALID_STATUS', messageAr: 'الحالة لا تسمح' });
    }
    return this.prisma.$transaction(async (tx) => {
      const boms = await (tx as any).jobOrderBOM.findMany({ where: { jobOrderId: id } });
      for (const b of boms) {
        if (b.sourceType !== 'inventory') {
          await (tx as any).jobOrderBOM.update({
            where: { id: b.id },
            data: { qtyConsumed: b.qtyRequired },
          });
        }
      }
      const productionStage = await (tx as any).jobOrderStage.findFirst({
        where: { jobOrderId: id, sequence: 3 },
      });
      if (productionStage) {
        await (tx as any).jobOrderStage.update({
          where: { id: productionStage.id },
          data: { status: 'in_progress', startedAt: new Date() },
        });
      }
      const updated = await tx.jobOrder.update({
        where: { id },
        data: { status: 'in_production' },
      });
      await this.audit.log({
        companyId: session.companyId,
        userId: session.userId,
        action: 'START_PRODUCTION',
        entity: 'JobOrder',
        entityId: id,
        before: jo,
        after: updated,
      });
      return updated;
    });
  }

  async completeStage(jobOrderId: string, stageId: string, notes: string | undefined, session: UserSession) {
    const jo = await this.findOne(jobOrderId, session.companyId);
    const stage = await (this.prisma as any).jobOrderStage.findFirst({
      where: { id: stageId, jobOrderId },
    });
    if (!stage) throw new NotFoundException({ code: 'STAGE_NOT_FOUND', messageAr: 'المرحلة غير موجودة' });
    if (stage.status === 'done') {
      throw new BadRequestException({ code: 'STAGE_DONE', messageAr: 'المرحلة مكتملة' });
    }
    return this.prisma.$transaction(async (tx) => {
      await (tx as any).jobOrderStage.update({
        where: { id: stageId },
        data: { status: 'done', completedAt: new Date(), notes: notes ?? stage.notes },
      });
      const next = await (tx as any).jobOrderStage.findFirst({
        where: { jobOrderId, sequence: stage.sequence + 1, status: 'pending' },
      });
      if (next) {
        await (tx as any).jobOrderStage.update({
          where: { id: next.id },
          data: { status: 'in_progress', startedAt: new Date() },
        });
      }
      await this.audit.log({
        companyId: session.companyId,
        userId: session.userId,
        action: 'COMPLETE_STAGE',
        entity: 'JobOrderStage',
        entityId: stageId,
        metadata: { jobOrderId, sequence: stage.sequence },
      });
      return this.findOne(jobOrderId, session.companyId);
    });
  }

  async markReady(id: string, session: UserSession) {
    const jo = await this.findOne(id, session.companyId);
    if (!['in_production', 'quality_check'].includes(jo.status as any)) {
      throw new BadRequestException({ code: 'INVALID_STATUS', messageAr: 'الحالة لا تسمح' });
    }
    const updated = await this.prisma.jobOrder.update({
      where: { id },
      data: { status: 'ready', completedAt: new Date() },
    });
    await this.audit.log({
      companyId: session.companyId,
      userId: session.userId,
      action: 'MARK_READY',
      entity: 'JobOrder',
      entityId: id,
      before: jo,
      after: updated,
    });
    return updated;
  }

  async deliver(id: string, session: UserSession) {
    const jo = await this.findOne(id, session.companyId);
    if (jo.status !== 'ready') {
      throw new BadRequestException({ code: 'NOT_READY', messageAr: 'الطلب ليس جاهزاً للتسليم' });
    }
    const updated = await this.prisma.jobOrder.update({
      where: { id },
      data: { status: 'delivered', deliveredAt: new Date() },
    });
    await this.audit.log({
      companyId: session.companyId,
      userId: session.userId,
      action: 'DELIVER',
      entity: 'JobOrder',
      entityId: id,
      before: jo,
      after: updated,
      metadata: { invoicePlaceholder: true, totalIqd: updated.totalPriceIqd.toString() },
    });
    return updated;
  }

  async cancel(id: string, reason: string, session: UserSession) {
    const jo = await this.findOne(id, session.companyId);
    if (['delivered', 'cancelled'].includes(jo.status as any)) {
      throw new BadRequestException({ code: 'INVALID_STATUS', messageAr: 'لا يمكن إلغاء هذه الحالة' });
    }
    const updated = await this.prisma.jobOrder.update({
      where: { id },
      data: { status: 'cancelled', cancelledAt: new Date(), cancellationReason: reason },
    });
    await this.audit.log({
      companyId: session.companyId,
      userId: session.userId,
      action: 'CANCEL',
      entity: 'JobOrder',
      entityId: id,
      before: jo,
      after: updated,
      metadata: { reason },
    });
    return updated;
  }

  async findAll(companyId: string, filters?: { status?: any; customerId?: string; branchId?: string }) {
    return this.prisma.jobOrder.findMany({
      where: {
        companyId,
        ...(filters?.status ? { status: filters.status } : {}),
        ...(filters?.customerId ? { customerId: filters.customerId } : {}),
        ...(filters?.branchId ? { branchId: filters.branchId } : {}),
      },
      orderBy: { expectedDate: 'asc' },
    });
  }

  async findOne(id: string, companyId: string) {
    const jo = await this.prisma.jobOrder.findFirst({ where: { id, companyId } });
    if (!jo) throw new NotFoundException({ code: 'JO_NOT_FOUND', messageAr: 'طلب الإنتاج غير موجود' });
    return jo;
  }

  async getBomLines(id: string, companyId: string) {
    await this.findOne(id, companyId);
    return (this.prisma as any).jobOrderBOM.findMany({ where: { jobOrderId: id } });
  }

  async getStages(id: string, companyId: string) {
    await this.findOne(id, companyId);
    return (this.prisma as any).jobOrderStage.findMany({
      where: { jobOrderId: id },
      orderBy: { sequence: 'asc' },
    });
  }
}
