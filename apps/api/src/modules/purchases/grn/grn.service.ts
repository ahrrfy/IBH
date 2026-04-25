import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AuditService } from '../../../engines/audit/audit.service';
import { SequenceService } from '../../../engines/sequence/sequence.service';
import { PostingService } from '../../../engines/posting/posting.service';
import { PolicyService } from '../../../engines/policy/policy.service';
import { InventoryService } from '../../inventory/inventory.service';
import { Prisma } from '@prisma/client';
import type { UserSession } from '@erp/shared-types';

export interface GRNLineInput {
  poLineId: string;
  variantId: string;
  qtyReceived: number | string;
  qtyAccepted: number | string;
  qtyRejected: number | string;
  rejectionReason?: string;
  unitCostIqd: number | string;
  batchNumber?: string;
  expiryDate?: Date;
}

export interface CreateGRNDto {
  purchaseOrderId: string;
  warehouseId?: string;
  branchId?: string;
  receiptDate?: Date;
  deliveryNoteRef?: string;
  lines: GRNLineInput[];
  notes?: string;
}

export interface FindGRNsQuery {
  page?: number;
  limit?: number;
  purchaseOrderId?: string;
  supplierId?: string;
  warehouseId?: string;
  status?: string;
  from?: string;
  to?: string;
}

@Injectable()
export class GRNService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sequence: SequenceService,
    private readonly posting: PostingService,
    private readonly policy: PolicyService,
    private readonly inventory: InventoryService,
  ) {}

  async create(companyId: string, dto: CreateGRNDto, session: UserSession) {
    if (!dto.lines || dto.lines.length === 0) {
      throw new BadRequestException({
        code: 'GRN_LINES_REQUIRED',
        messageAr: 'يجب إضافة بنود للإيصال',
      });
    }

    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id: dto.purchaseOrderId, companyId },
      include: { lines: true },
    });
    if (!po) {
      throw new NotFoundException({
        code: 'PO_NOT_FOUND',
        messageAr: 'أمر الشراء غير موجود',
      });
    }
    if (!['approved', 'partially_received'].includes(po.status as any)) {
      throw new BadRequestException({
        code: 'PO_NOT_RECEIVABLE',
        messageAr: 'أمر الشراء غير جاهز للاستلام',
      });
    }

    const allowOverReceive = await this.policy
      .getBool(companyId, 'allow_over_receive', false)
      .catch(() => false);

    // validate lines
    for (const line of dto.lines) {
      const poLine = po.lines.find((l) => l.id === line.poLineId);
      if (!poLine) {
        throw new BadRequestException({
          code: 'PO_LINE_NOT_FOUND',
          messageAr: 'بند أمر الشراء غير موجود',
        });
      }
      const qRec = new Prisma.Decimal(line.qtyReceived);
      const qAcc = new Prisma.Decimal(line.qtyAccepted);
      const qRej = new Prisma.Decimal(line.qtyRejected);
      if (!qRec.equals(qAcc.add(qRej))) {
        throw new BadRequestException({
          code: 'GRN_QTY_MISMATCH',
          messageAr: 'الكمية المستلمة يجب أن تساوي المقبولة + المرفوضة',
        });
      }
      const alreadyReceived = new Prisma.Decimal(poLine.qtyReceived as any);
      const ordered = new Prisma.Decimal(poLine.qtyOrdered as any);
      if (!allowOverReceive && alreadyReceived.add(qRec).gt(ordered)) {
        throw new BadRequestException({
          code: 'GRN_OVER_RECEIVE',
          messageAr: 'الكمية تتجاوز المطلوبة في أمر الشراء',
        });
      }
    }

    const number = await this.sequence.nextNumber({
      companyId,
      sequenceCode: 'GRN',
    } as any);

    const warehouseId = dto.warehouseId ?? po.warehouseId;
    const receiptDate = dto.receiptDate ?? new Date();

    // compute totals and status
    let totalValue = new Prisma.Decimal(0);
    let hasRejected = false;
    for (const l of dto.lines) {
      const qAcc = new Prisma.Decimal(l.qtyAccepted);
      const unit = new Prisma.Decimal(l.unitCostIqd);
      totalValue = totalValue.add(qAcc.mul(unit));
      if (new Prisma.Decimal(l.qtyRejected).gt(0)) hasRejected = true;
    }
    const initialStatus = hasRejected ? 'quality_check' : 'accepted';

    // try to find quality_hold / damaged warehouse for rejected stock
    const rejectWarehouse = await this.prisma.warehouse.findFirst({
      where: {
        companyId,
        OR: [{ code: 'QHOLD' }, { code: 'DAMAGED' }, { code: 'QC' }],
      },
    });

    const result = await this.prisma.$transaction(async (tx) => {
      const grn = await tx.goodsReceiptNote.create({
        data: {
          companyId,
          branchId:        dto.branchId ?? (session as any).branchId ?? po.branchId,
          number,
          purchaseOrderId: po.id,
          supplierId:      po.supplierId,
          warehouseId,
          receiptDate,
          status:          initialStatus as any,
          deliveryNoteRef: dto.deliveryNoteRef,
          totalValueIqd:   totalValue,
          notes:           dto.notes,
          createdBy:       session.userId,
          lines: {
            create: dto.lines.map((l) => {
              const qRec = new Prisma.Decimal(l.qtyReceived);
              const qAcc = new Prisma.Decimal(l.qtyAccepted);
              const unit = new Prisma.Decimal(l.unitCostIqd);
              return {
                poLineId: l.poLineId,
                variantId: l.variantId,
                qtyReceived: qRec,
                qtyAccepted: qAcc,
                qtyRejected: new Prisma.Decimal(l.qtyRejected),
                rejectionReason: l.rejectionReason,
                unitCostIqd: unit,
                lineValueIqd: qAcc.mul(unit),
                batchNumber: l.batchNumber,
                expiryDate: l.expiryDate,
              };
            }),
          },
        },
        include: { lines: true },
      });

      // inventory movements
      for (const l of dto.lines) {
        const qAcc = new Prisma.Decimal(l.qtyAccepted);
        const qRej = new Prisma.Decimal(l.qtyRejected);

        if (qAcc.gt(0)) {
          await this.inventory.move(
            {
              companyId,
              direction:     'in',
              variantId:     l.variantId,
              warehouseId,
              qty:           qAcc.toNumber(),
              referenceType: 'GRN' as any,
              referenceId:   grn.id,
              unitCostIqd:   new Prisma.Decimal(l.unitCostIqd).toNumber(),
              performedBy:   session.userId,
            },
            tx,
          );
        }

        if (qRej.gt(0) && rejectWarehouse) {
          await this.inventory.move(
            {
              companyId,
              direction:     'in',
              variantId:     l.variantId,
              warehouseId:   rejectWarehouse.id,
              qty:           qRej.toNumber(),
              referenceType: 'GRN_REJECT' as any,
              referenceId:   grn.id,
              unitCostIqd:   new Prisma.Decimal(l.unitCostIqd).toNumber(),
              performedBy:   session.userId,
            },
            tx,
          );
        }
      }

      // update PO line received/rejected quantities
      for (const l of dto.lines) {
        await tx.purchaseOrderLine.update({
          where: { id: l.poLineId },
          data: {
            qtyReceived: { increment: new Prisma.Decimal(l.qtyReceived) as any },
            qtyRejected: { increment: new Prisma.Decimal(l.qtyRejected) as any },
          },
        });
      }

      // recompute PO status
      const refreshedLines = await tx.purchaseOrderLine.findMany({
        where: { purchaseOrderId: po.id },
      });
      let allReceived = true;
      let anyReceived = false;
      for (const rl of refreshedLines) {
        const rec = new Prisma.Decimal(rl.qtyReceived as any);
        const ord = new Prisma.Decimal(rl.qtyOrdered as any);
        if (rec.gt(0)) anyReceived = true;
        if (rec.lt(ord)) allReceived = false;
      }
      let newStatus: string = po.status as any;
      if (allReceived) newStatus = 'received';
      else if (anyReceived) newStatus = 'partially_received';

      await tx.purchaseOrder.update({
        where: { id: po.id },
        data: { status: newStatus as any },
      });

      // post journal entry: Dr Inventory / Cr GR-IR Clearing
      if (totalValue.gt(0)) {
        const je = await this.posting.postJournalEntry(
          {
            companyId,
            entryDate: receiptDate,
            refType: 'GRN',
            refId: grn.id,
            description: `إيصال استلام بضاعة ${number}`,
            lines: [
              {
                accountCode: '212',
                debit: totalValue.toNumber(),
                description: 'مخزون',
              },
              {
                accountCode: '331',
                credit: totalValue.toNumber(),
                description: 'GR/IR Clearing',
              },
            ],
          } as any,
          session,
          tx as any,
        );
        await tx.goodsReceiptNote.update({
          where: { id: grn.id },
          data: { journalEntryId: je.id },
        });
      }

      return grn;
    });

    await this.audit.log({
      companyId,
      userId: session.userId,
      userEmail: session.userId,
      action: 'purchase.grn.create',
      entityType: 'GoodsReceiptNote',
      entityId: result.id,
      after: result,
    } as any);

    return this.findOne(result.id, companyId);
  }

  async approveQuality(
    id: string,
    companyId: string,
    qualityNotes: string,
    session: UserSession,
  ) {
    const grn = await this.findOne(id, companyId);
    if ((grn.status as any) !== 'quality_check') {
      throw new BadRequestException({
        code: 'GRN_NOT_IN_QC',
        messageAr: 'الإيصال ليس في مرحلة فحص الجودة',
      });
    }
    const updated = await this.prisma.goodsReceiptNote.update({
      where: { id },
      data: {
        status: 'accepted' as any,
        qualityCheckedBy: session.userId,
        qualityCheckedAt: new Date(),
        qualityNotes,
      },
    });
    await this.audit.log({
      companyId,
      userId: session.userId,
      userEmail: session.userId,
      action: 'purchase.grn.approve_quality',
      entityType: 'GoodsReceiptNote',
      entityId: id,
      before: grn,
      after: updated,
    } as any);
    return updated;
  }

  async reject(
    id: string,
    companyId: string,
    rejectionReason: string,
    session: UserSession,
  ) {
    const grn = await this.findOne(id, companyId);
    if (['rejected', 'accepted'].includes(grn.status as any)) {
      throw new BadRequestException({
        code: 'GRN_CANNOT_REJECT',
        messageAr: 'لا يمكن رفض الإيصال في حالته الحالية',
      });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      // reverse inventory: move accepted qty out of warehouse
      for (const line of grn.lines) {
        const qAcc = new Prisma.Decimal(line.qtyAccepted as any);
        if (qAcc.gt(0)) {
          await this.inventory.move(
            {
              companyId,
              direction:     'out',
              variantId:     line.variantId,
              warehouseId:   grn.warehouseId,
              qty:           qAcc.toNumber(),
              referenceType: 'GRN_REVERSE' as any,
              referenceId:   grn.id,
              unitCostIqd:   new Prisma.Decimal(line.unitCostIqd as any).toNumber(),
              performedBy:   session.userId,
            },
            tx,
          );
        }
      }

      // reverse PO line qtyReceived
      for (const line of grn.lines) {
        await tx.purchaseOrderLine.update({
          where: { id: line.poLineId },
          data: {
            qtyReceived: {
              decrement: new Prisma.Decimal(line.qtyReceived as any) as any,
            },
            qtyRejected: {
              decrement: new Prisma.Decimal(line.qtyRejected as any) as any,
            },
          },
        });
      }

      return tx.goodsReceiptNote.update({
        where: { id },
        data: {
          status: 'rejected' as any,
          qualityNotes: rejectionReason,
          qualityCheckedBy: session.userId,
          qualityCheckedAt: new Date(),
        },
      });
    });

    await this.audit.log({
      companyId,
      userId: session.userId,
      userEmail: session.userId,
      action: 'purchase.grn.reject',
      entityType: 'GoodsReceiptNote',
      entityId: id,
      before: grn,
      after: updated,
    } as any);

    return updated;
  }

  async findAll(companyId: string, query: FindGRNsQuery = {}) {
    const page = query.page && query.page > 0 ? Number(query.page) : 1;
    const limit = query.limit && query.limit > 0 ? Number(query.limit) : 25;
    const skip = (page - 1) * limit;

    const where: Prisma.GoodsReceiptNoteWhereInput = { companyId };
    if (query.purchaseOrderId) where.purchaseOrderId = query.purchaseOrderId;
    if (query.supplierId) where.supplierId = query.supplierId;
    if (query.warehouseId) where.warehouseId = query.warehouseId;
    if (query.status) (where as any).status = query.status;
    if (query.from || query.to) {
      where.receiptDate = {};
      if (query.from) (where.receiptDate as any).gte = new Date(query.from);
      if (query.to) (where.receiptDate as any).lte = new Date(query.to);
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.goodsReceiptNote.findMany({
        where,
        skip,
        take: limit,
        orderBy: { receiptDate: 'desc' },
        include: {
          purchaseOrder: { select: { id: true, number: true, supplier: { select: { id: true, code: true, nameAr: true } } } },
        },
      }),
      this.prisma.goodsReceiptNote.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async findOne(id: string, companyId: string) {
    const grn = await this.prisma.goodsReceiptNote.findFirst({
      where: { id, companyId },
      include: {
        lines: true,
        purchaseOrder: { include: { lines: true, supplier: true } },
      },
    });
    if (!grn) {
      throw new NotFoundException({
        code: 'GRN_NOT_FOUND',
        messageAr: 'إيصال الاستلام غير موجود',
      });
    }
    return grn;
  }
}
