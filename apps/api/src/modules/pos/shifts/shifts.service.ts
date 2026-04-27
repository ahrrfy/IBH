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

/** IQD denominations supported by the blind cash count. */
export const IQD_DENOMINATIONS = [250, 500, 1000, 5000, 10000, 25000, 50000] as const;

/**
 * Pure variance calculator — kept side-effect free so it can be
 * unit-tested in isolation (no Prisma, no DB).
 *
 * variance = countedCash − expectedCash
 *   positive  → cash over (drawer has more than system says)
 *   negative  → cash short (drawer is missing money)
 *   zero      → exact match
 *
 * @param input.openingCashIqd  cash in drawer at shift open
 * @param input.cashReceipts    sum of completed cash receipts on this shift
 * @param input.cashRefunds     sum of voided/refunded cash receipts on this shift
 * @param input.cashInMovements deposits/transfers into the drawer mid-shift
 * @param input.cashOutMovements withdrawals/pickups/petty cash out
 * @param input.countedDenominations cashier's blind denomination tally
 * @param input.toleranceIqd    company policy threshold above which the
 *                              variance must be approved by a manager
 */
export function computeBlindVariance(input: {
  openingCashIqd: Prisma.Decimal | number | string;
  cashReceipts: Prisma.Decimal | number | string;
  cashRefunds: Prisma.Decimal | number | string;
  cashInMovements: Prisma.Decimal | number | string;
  cashOutMovements: Prisma.Decimal | number | string;
  countedDenominations: DenominationCount[];
  toleranceIqd: number;
}): {
  countedCashIqd: string;
  expectedCashIqd: string;
  varianceIqd: string;
  isShort: boolean;
  isOver: boolean;
  isExact: boolean;
  exceedsTolerance: boolean;
  requiresManagerApproval: boolean;
} {
  const counted = input.countedDenominations.reduce(
    (acc, c) => acc.plus(new Prisma.Decimal(c.denom).times(c.count)),
    new Prisma.Decimal(0),
  );
  const expected = new Prisma.Decimal(input.openingCashIqd)
    .plus(input.cashReceipts)
    .minus(input.cashRefunds)
    .plus(input.cashInMovements)
    .minus(input.cashOutMovements);
  const variance = counted.minus(expected);
  const exceedsTolerance = variance.abs().greaterThan(input.toleranceIqd);
  return {
    countedCashIqd: counted.toString(),
    expectedCashIqd: expected.toString(),
    varianceIqd: variance.toString(),
    isShort: variance.isNegative(),
    isOver: variance.isPositive() && !variance.isZero(),
    isExact: variance.isZero(),
    exceedsTolerance,
    requiresManagerApproval: exceedsTolerance,
  };
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
        const shiftNumber = await this.sequence.next(session.companyId, 'SHIFT');
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
              denomination: c.denom,
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

  /**
   * Blind-count preview: cashier types denominations *without* seeing the
   * system-expected total. Backend computes expected from receipts +
   * cash-movements and returns the variance. The frontend uses
   * `requiresManagerApproval` to decide whether to gate the close behind a
   * manager passcode/approval. This method is read-only — no DB writes.
   *
   * Business rule: keep the cashier blind from the expected figure on the
   * UI side; backend always computes truth here and on `closeShift`.
   */
  async previewBlindClose(
    shiftId: string,
    denominationCounts: DenominationCount[],
    session: UserSession,
  ) {
    const shift = await this.prisma.shift.findFirst({
      where: { id: shiftId, companyId: session.companyId },
      include: { device: true },
    });
    if (!shift) throw new NotFoundException('الوردية غير موجودة');
    if (shift.status !== 'open') {
      throw new BadRequestException('الوردية غير مفتوحة');
    }

    // Reject denominations not in the official IQD list — defends against
    // tampered clients sending arbitrary denomination values.
    for (const c of denominationCounts) {
      if (!IQD_DENOMINATIONS.includes(c.denom as (typeof IQD_DENOMINATIONS)[number])) {
        throw new BadRequestException(`فئة غير صالحة: ${c.denom}`);
      }
      if (!Number.isInteger(c.count) || c.count < 0) {
        throw new BadRequestException('عدد الأوراق يجب أن يكون عدداً صحيحاً غير سالب');
      }
    }

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
        toAccountId: shift.device.cashAccountId,
        movementType: { in: ['deposit'] },
      },
    });
    const cashOutAgg = await this.prisma.cashMovement.aggregate({
      _sum: { amountIqd: true },
      where: {
        shiftId: shift.id,
        fromAccountId: shift.device.cashAccountId,
        movementType: { in: ['withdrawal', 'interim_pickup', 'petty_cash'] },
      },
    });

    const toleranceIqd = await this.policy.getNumber(
      session.companyId,
      'shift_close_tolerance',
      5000,
    );

    const result = computeBlindVariance({
      openingCashIqd: shift.openingCashIqd,
      cashReceipts: cashReceiptsAgg._sum.amountIqd ?? 0,
      cashRefunds: refundedCashAgg._sum.amountIqd ?? 0,
      cashInMovements: cashInAgg._sum.amountIqd ?? 0,
      cashOutMovements: cashOutAgg._sum.amountIqd ?? 0,
      countedDenominations: denominationCounts,
      toleranceIqd,
    });

    return {
      shiftId: shift.id,
      shiftNumber: shift.shiftNumber,
      toleranceIqd,
      ...result,
    };
  }

  async closeShift(shiftId: string, dto: CloseShiftDto, session: UserSession) {
    const shift = await this.prisma.shift.findFirst({
      where: { id: shiftId, companyId: session.companyId },
      include: { device: true },
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
        toAccountId: shift.device.cashAccountId,
        movementType: { in: ['deposit'] },
      },
    });
    const cashOutAgg = await this.prisma.cashMovement.aggregate({
      _sum: { amountIqd: true },
      where: {
        shiftId: shift.id,
        fromAccountId: shift.device.cashAccountId,
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
            denomination: c.denom,
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
          fromAccountId: shift.device.cashAccountId,
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
            cashAccountId: shift.device.cashAccountId,
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
      include: { device: true },
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
      include: { device: true },
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

  private async buildReportSummary(shift: { id: string; openingCashIqd: Prisma.Decimal; device: { cashAccountId: string } }) {
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
        toAccountId: shift.device.cashAccountId,
        movementType: { in: ['deposit'] },
      },
    });
    const cashOutAgg = await this.prisma.cashMovement.aggregate({
      _sum: { amountIqd: true },
      where: {
        shiftId: shift.id,
        fromAccountId: shift.device.cashAccountId,
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
      include: { device: true },
    });
    if (!oldShift) throw new NotFoundException('الوردية غير موجودة');

    const newShift = await this.prisma.shift.findFirst({
      where: { id: nextShiftId, companyId: session.companyId },
      include: { device: true },
    });
    if (!newShift) throw new NotFoundException('الوردية الجديدة غير موجودة');

    return this.prisma.$transaction(async (tx) => {
      const amount = new Prisma.Decimal(oldShift.closingCashIqd.greaterThan(0) ? oldShift.closingCashIqd : oldShift.expectedCashIqd);

      await tx.cashMovement.create({
        data: {
          companyId: session.companyId,
          shiftId: oldShift.id,
          fromAccountId: oldShift.device.cashAccountId,
          toAccountId: newShift.device.cashAccountId,
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
      include: { device: true },
    });
  }

  async findAll(query: ShiftsQuery, session: UserSession) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.ShiftWhereInput = {
      companyId: session.companyId,
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.cashierId ? { cashierId: query.cashierId } : {}),
      ...(query.status ? { status: query.status as any } : {}),
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
        include: { device: true },
      }),
      this.prisma.shift.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async findOne(id: string, session: UserSession) {
    const shift = await this.prisma.shift.findFirst({
      where: { id, companyId: session.companyId },
      include: { device: true, cashCounts: true },
    });
    if (!shift) throw new NotFoundException('الوردية غير موجودة');
    return shift;
  }
}
