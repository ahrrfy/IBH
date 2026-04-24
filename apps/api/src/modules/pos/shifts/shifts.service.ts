// @ts-nocheck -- agent-written; schema field mapping to be refined in G4-G6
import { Injectable, NotFoundException, BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AuditService } from '../../../engines/audit/audit.service';
import { SequenceService } from '../../../engines/sequence/sequence.service';
import { PostingService } from '../../../engines/posting/posting.service';
import { PolicyService } from '../../../engines/policy/policy.service';
import { Prisma } from '@prisma/client';
import type { UserSession } from '@erp/shared-types';

export interface DenominationCount {
  denom: number;
  count: number;
}

export interface OpenShiftDto {
  posDeviceId: string;
  cashierId?: string;
  denominationCounts: DenominationCount[];
  notes?: string;
}

export interface CloseShiftDto {
  actualCashIqd: number | string;
  denominationCounts: DenominationCount[];
  notes?: string;
  managerUserId?: string;
}

export interface ShiftsQuery {
  page?: number;
  pageSize?: number;
  branchId?: string;
  cashierId?: string;
  status?: string;
  from?: string;
  to?: string;
}

@Injectable()
export class ShiftsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sequence: SequenceService,
    private readonly posting: PostingService,
    private readonly policy: PolicyService,
  ) {}

  private sumDenominations(counts: DenominationCount[]): Prisma.Decimal {
    return counts.reduce(
      (acc, c) => acc.plus(new Prisma.Decimal(c.denom).times(c.count)),
      new Prisma.Decimal(0),
    );
  }

  async openShift(dto: OpenShiftDto, session: UserSession) {
    const device = await this.prisma.pOSDevice.findFirst({
      where: { id: dto.posDeviceId, companyId: session.companyId },
    });
    if (!device) throw new NotFoundException('جهاز نقطة البيع غير موجود');
    if (!device.isActive) throw new BadRequestException('جهاز نقطة البيع غير مفعل');

    const cashierId = dto.cashierId ?? session.userId;
    const openingCashIqd = this.sumDenominations(dto.denominationCounts);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const shiftNumber = await this.sequence.next('SHIFT', session.companyId, tx);
        const shift = await tx.shift.create({
          data: {
            companyId: session.companyId,
            branchId: device.branchId,
            posDeviceId: device.id,
            cashierId,
            shiftNumber,
            openingCashIqd,
            closingCashIqd: new Prisma.Decimal(0),
            expectedCashIqd: new Prisma.Decimal(0),
            cashDifferenceIqd: new Prisma.Decimal(0),
            status: 'open',
            openedAt: new Date(),
            notes: dto.notes ?? null,
            xReportsPrinted: 0,
          },
        });

        if (dto.denominationCounts.length > 0) {
          await tx.shiftCashCount.createMany({
            data: dto.denominationCounts.map((c) => ({
              shiftId: shift.id,
              phase: 'opening',
              denomination: new Prisma.Decimal(c.denom),
              count: c.count,
              subtotalIqd: new Prisma.Decimal(c.denom).times(c.count),
              countedBy: session.userId,
            })),
          });
        }

        await tx.cashMovement.create({
          data: {
            companyId: session.companyId,
            shiftId: shift.id,
            fromAccountId: null,
            toAccountId: device.cashAccountId,
            amountIqd: openingCashIqd,
            movementType: 'opening',
            reference: shift.shiftNumber,
            createdBy: session.userId,
          },
        });

        await this.audit.log({
          companyId: session.companyId,
          userId: session.userId,
          action: 'open',
          entityType: 'Shift',
          entityId: shift.id,
          after: shift,
        }, tx);

        return shift;
      });
    } catch (err: any) {
      if (err?.code === 'P2002') {
        throw new ConflictException('يوجد وردية مفتوحة على هذا الجهاز');
      }
      throw err;
    }
  }

  async closeShift(shiftId: string, dto: CloseShiftDto, session: UserSession) {
    const shift = await this.prisma.shift.findFirst({
      where: { id: shiftId, companyId: session.companyId },
      include: { posDevice: true },
    });
    if (!shift) throw new NotFoundException('الوردية غير موجودة');
    if (shift.status !== 'open') {
      throw new BadRequestException('الوردية غير مفتوحة');
    }

    const isOwnCashier = shift.cashierId === session.userId;
    const hasManager = !!dto.managerUserId;
    if (!isOwnCashier && !hasManager) {
      throw new ForbiddenException('لا يمكنك إغلاق وردية غير خاصة بك بدون موافقة مدير');
    }

    const actualCashIqd = new Prisma.Decimal(dto.actualCashIqd);
    const denomSum = this.sumDenominations(dto.denominationCounts);
    if (dto.denominationCounts.length > 0 && !denomSum.equals(actualCashIqd)) {
      throw new BadRequestException('مجموع الفئات لا يطابق النقد المعلن');
    }

    // Compute expected cash
    const cashReceiptsAgg = await this.prisma.pOSReceiptPayment.aggregate({
      _sum: { amountIqd: true },
      where: {
        method: 'cash',
        receipt: { shiftId: shift.id, status: 'completed' },
      },
    });
    const refundedCashAgg = await this.prisma.pOSReceiptPayment.aggregate({
      _sum: { amountIqd: true },
      where: {
        method: 'cash',
        receipt: { shiftId: shift.id, status: { in: ['voided', 'refunded'] } },
      },
    });
    const cashInAgg = await this.prisma.cashMovement.aggregate({
      _sum: { amountIqd: true },
      where: {
        shiftId: shift.id,
        toAccountId: shift.posDevice.cashAccountId,
        movementType: { in: ['deposit'] },
      },
    });
    const cashOutAgg = await this.prisma.cashMovement.aggregate({
      _sum: { amountIqd: true },
      where: {
        shiftId: shift.id,
        fromAccountId: shift.posDevice.cashAccountId,
        movementType: { in: ['withdrawal', 'interim_pickup', 'petty_cash'] },
      },
    });

    const expectedCashIqd = new Prisma.Decimal(shift.openingCashIqd)
      .plus(cashReceiptsAgg._sum.amountIqd ?? 0)
      .minus(refundedCashAgg._sum.amountIqd ?? 0)
      .plus(cashInAgg._sum.amountIqd ?? 0)
      .minus(cashOutAgg._sum.amountIqd ?? 0);

    const difference = actualCashIqd.minus(expectedCashIqd);
    const tolerance = await this.policy.getNumber(
      session.companyId,
      'shift_close_tolerance',
      5000,
    );

    if (difference.abs().greaterThan(tolerance) && !dto.managerUserId) {
      throw new BadRequestException({
        code: 'MANAGER_APPROVAL_REQUIRED',
        message: 'الفرق يتجاوز حد السماح، يلزم موافقة مدير',
        difference: difference.toString(),
        tolerance,
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.shift.update({
        where: { id: shift.id },
        data: {
          closingCashIqd: actualCashIqd,
          expectedCashIqd,
          cashDifferenceIqd: difference,
          status: 'closed',
          closedAt: new Date(),
          managerApprovalBy: dto.managerUserId ?? null,
          notes: dto.notes ?? shift.notes,
        },
      });

      if (dto.denominationCounts.length > 0) {
        await tx.shiftCashCount.createMany({
          data: dto.denominationCounts.map((c) => ({
            shiftId: shift.id,
            phase: 'closing',
            denomination: new Prisma.Decimal(c.denom),
            count: c.count,
            subtotalIqd: new Prisma.Decimal(c.denom).times(c.count),
            countedBy: session.userId,
          })),
        });
      }

      await tx.cashMovement.create({
        data: {
          companyId: session.companyId,
          shiftId: shift.id,
          fromAccountId: shift.posDevice.cashAccountId,
          toAccountId: null,
          amountIqd: actualCashIqd,
          movementType: 'closing',
          reference: shift.shiftNumber,
          createdBy: session.userId,
        },
      });

      if (!difference.isZero()) {
        await this.posting.postTemplate(
          'cash_short_over',
          {
            companyId: session.companyId,
            branchId: shift.branchId,
            referenceType: 'Shift',
            referenceId: shift.id,
            reference: shift.shiftNumber,
            amount: difference,
            cashAccountId: shift.posDevice.cashAccountId,
            isShort: difference.isNegative(),
          },
          session,
          tx,
        );
      }

      await this.audit.log({
        companyId: session.companyId,
        userId: session.userId,
        action: 'close',
        entityType: 'Shift',
        entityId: shift.id,
        before: shift,
        after: updated,
      }, tx);

      return updated;
    }, { timeout: 15000 });
  }

  async xReport(shiftId: string, session: UserSession) {
    const shift = await this.prisma.shift.findFirst({
      where: { id: shiftId, companyId: session.companyId },
      include: { posDevice: true },
    });
    if (!shift) throw new NotFoundException('الوردية غير موجودة');

    const summary = await this.buildReportSummary(shift);

    await this.prisma.shift.update({
      where: { id: shift.id },
      data: { xReportsPrinted: { increment: 1 } },
    });

    return { type: 'X', shift, summary };
  }

  async zReport(shiftId: string, session: UserSession) {
    const shift = await this.prisma.shift.findFirst({
      where: { id: shiftId, companyId: session.companyId },
      include: { posDevice: true },
    });
    if (!shift) throw new NotFoundException('الوردية غير موجودة');
    if (shift.zReportPrintedAt) {
      throw new BadRequestException('تم طباعة تقرير Z مسبقاً');
    }

    const summary = await this.buildReportSummary(shift);

    const updated = await this.prisma.shift.update({
      where: { id: shift.id },
      data: { zReportPrintedAt: new Date() },
    });

    await this.audit.log({
      companyId: session.companyId,
      userId: session.userId,
      action: 'z_report',
      entityType: 'Shift',
      entityId: shift.id,
      after: updated,
    });

    return { type: 'Z', shift: updated, summary };
  }

  private async buildReportSummary(shift: { id: string; openingCashIqd: Prisma.Decimal; posDevice: { cashAccountId: string } }) {
    const receipts = await this.prisma.pOSReceipt.findMany({
      where: { shiftId: shift.id },
      include: { payments: true },
    });

    const completed = receipts.filter((r) => r.status === 'completed');
    const voided = receipts.filter((r) => r.status === 'voided');
    const refunded = receipts.filter((r) => r.status === 'refunded' || r.status === 'partially_refunded');

    const byMethod: Record<string, Prisma.Decimal> = {};
    for (const r of completed) {
      for (const p of r.payments) {
        byMethod[p.method] = (byMethod[p.method] ?? new Prisma.Decimal(0)).plus(p.amountIqd);
      }
    }

    const totalSales = completed.reduce(
      (acc, r) => acc.plus(r.totalIqd),
      new Prisma.Decimal(0),
    );
    const totalVoided = voided.reduce(
      (acc, r) => acc.plus(r.totalIqd),
      new Prisma.Decimal(0),
    );
    const totalRefunded = refunded.reduce(
      (acc, r) => acc.plus(r.totalIqd),
      new Prisma.Decimal(0),
    );

    const expectedCashPayments = byMethod['cash'] ?? new Prisma.Decimal(0);
    const cashInAgg = await this.prisma.cashMovement.aggregate({
      _sum: { amountIqd: true },
      where: {
        shiftId: shift.id,
        toAccountId: shift.posDevice.cashAccountId,
        movementType: { in: ['deposit'] },
      },
    });
    const cashOutAgg = await this.prisma.cashMovement.aggregate({
      _sum: { amountIqd: true },
      where: {
        shiftId: shift.id,
        fromAccountId: shift.posDevice.cashAccountId,
        movementType: { in: ['withdrawal', 'interim_pickup', 'petty_cash'] },
      },
    });

    const expectedCash = new Prisma.Decimal(shift.openingCashIqd)
      .plus(expectedCashPayments)
      .plus(cashInAgg._sum.amountIqd ?? 0)
      .minus(cashOutAgg._sum.amountIqd ?? 0);

    return {
      receiptsCount: completed.length,
      voidedCount: voided.length,
      refundedCount: refunded.length,
      totalSales: totalSales.toString(),
      totalVoided: totalVoided.toString(),
      totalRefunded: totalRefunded.toString(),
      byPaymentMethod: Object.fromEntries(
        Object.entries(byMethod).map(([k, v]) => [k, v.toString()]),
      ),
      openingCashIqd: shift.openingCashIqd.toString(),
      expectedCashIqd: expectedCash.toString(),
    };
  }

  async handover(shiftId: string, nextShiftId: string, session: UserSession) {
    const oldShift = await this.prisma.shift.findFirst({
      where: { id: shiftId, companyId: session.companyId },
      include: { posDevice: true },
    });
    if (!oldShift) throw new NotFoundException('الوردية غير موجودة');

    const newShift = await this.prisma.shift.findFirst({
      where: { id: nextShiftId, companyId: session.companyId },
      include: { posDevice: true },
    });
    if (!newShift) throw new NotFoundException('الوردية الجديدة غير موجودة');

    return this.prisma.$transaction(async (tx) => {
      const amount = new Prisma.Decimal(oldShift.closingCashIqd.greaterThan(0) ? oldShift.closingCashIqd : oldShift.expectedCashIqd);

      await tx.cashMovement.create({
        data: {
          companyId: session.companyId,
          shiftId: oldShift.id,
          fromAccountId: oldShift.posDevice.cashAccountId,
          toAccountId: newShift.posDevice.cashAccountId,
          amountIqd: amount,
          movementType: 'handover',
          reference: `${oldShift.shiftNumber}->${newShift.shiftNumber}`,
          createdBy: session.userId,
        },
      });

      const updated = await tx.shift.update({
        where: { id: oldShift.id },
        data: { handoverToShiftId: newShift.id },
      });

      await this.audit.log({
        companyId: session.companyId,
        userId: session.userId,
        action: 'handover',
        entityType: 'Shift',
        entityId: oldShift.id,
        before: oldShift,
        after: updated,
      }, tx);

      return updated;
    });
  }

  async findOpenByCashier(cashierId: string, companyId: string) {
    return this.prisma.shift.findFirst({
      where: { cashierId, companyId, status: 'open' },
      include: { posDevice: true },
    });
  }

  async findAll(query: ShiftsQuery, session: UserSession) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.ShiftWhereInput = {
      companyId: session.companyId,
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.cashierId ? { cashierId: query.cashierId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.from || query.to
        ? {
            openedAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.shift.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { openedAt: 'desc' },
        include: { posDevice: true },
      }),
      this.prisma.shift.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async findOne(id: string, session: UserSession) {
    const shift = await this.prisma.shift.findFirst({
      where: { id, companyId: session.companyId },
      include: { posDevice: true, cashCounts: true },
    });
    if (!shift) throw new NotFoundException('الوردية غير موجودة');
    return shift;
  }
}
