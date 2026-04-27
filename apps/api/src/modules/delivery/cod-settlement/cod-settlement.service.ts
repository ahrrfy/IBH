import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma, CodSettlementStatus, DeliveryStatus } from '@prisma/client';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AuditService } from '../../../engines/audit/audit.service';
import { SequenceService } from '../../../engines/sequence/sequence.service';
import { PostingService } from '../../../engines/posting/posting.service';
import type { UserSession } from '@erp/shared-types';

/**
 * CodSettlementService — periodic batch reconciliation with external delivery
 * companies. Flow:
 *
 *   1. propose(deliveryCompanyId, periodStart, periodEnd)
 *      → scans delivered + COD-collected + unsettled deliveries
 *      → computes totals (collected, commission, shipping cost, net due)
 *      → creates CodSettlement(status=proposed) + links deliveries
 *      → does NOT post a JE yet (accounting reviews first)
 *
 *   2. approve(settlementId, { receivableAccountCode, commissionAccountCode,
 *                              shippingAccountCode, bankAccountCode })
 *      → posts a balanced JE
 *      → settlement.status = posted, postedJeId = je.id
 *
 *   3. markPaid(settlementId, { paymentRef })
 *      → settlement.status = paid, paidAt = now
 *
 * Idempotency:
 *   - (deliveryCompanyId, periodStart, periodEnd) is unique → re-proposing
 *     the same window throws ConflictException unless the prior settlement
 *     is cancelled.
 *   - delivery_orders.codSettlementId guards against double-settlement of
 *     the same delivery (a delivery can belong to AT MOST one settlement).
 */
@Injectable()
export class CodSettlementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sequence: SequenceService,
    private readonly posting: PostingService,
  ) {}

  async propose(
    companyId: string,
    dto: {
      deliveryCompanyId: string;
      periodStart: string | Date;
      periodEnd: string | Date;
    },
    session: UserSession,
  ) {
    if (!dto.deliveryCompanyId || !dto.periodStart || !dto.periodEnd) {
      throw new BadRequestException({
        code: 'CODST_MISSING_FIELDS',
        messageAr: 'الشركة والفترة مطلوبتان',
      });
    }
    const periodStart = new Date(dto.periodStart);
    const periodEnd = new Date(dto.periodEnd);
    if (periodEnd <= periodStart) {
      throw new BadRequestException({
        code: 'CODST_INVALID_PERIOD',
        messageAr: 'تاريخ نهاية الفترة يجب أن يكون بعد البداية',
      });
    }

    const company = await this.prisma.deliveryCompany.findFirst({
      where: { id: dto.deliveryCompanyId, companyId, deletedAt: null },
      select: { id: true, code: true, nameAr: true, type: true, supportsCod: true },
    });
    if (!company) {
      throw new NotFoundException({
        code: 'DLVCO_NOT_FOUND',
        messageAr: 'شركة التوصيل غير موجودة',
      });
    }
    if (!company.supportsCod) {
      throw new BadRequestException({
        code: 'CODST_NO_COD_SUPPORT',
        messageAr: 'هذه الشركة لا تدعم التحصيل عند التسليم',
      });
    }

    // Idempotency: refuse if an open settlement exists for this exact window.
    const existing = await this.prisma.codSettlement.findUnique({
      where: {
        deliveryCompanyId_periodStart_periodEnd: {
          deliveryCompanyId: dto.deliveryCompanyId,
          periodStart,
          periodEnd,
        },
      },
      select: { id: true, number: true, status: true },
    });
    if (existing && existing.status !== CodSettlementStatus.cancelled) {
      throw new ConflictException({
        code: 'CODST_PERIOD_EXISTS',
        messageAr: `تسوية موجودة لهذه الفترة (${existing.number}، الحالة: ${existing.status})`,
      });
    }

    // Find all eligible deliveries in window
    const eligible = await this.prisma.deliveryOrder.findMany({
      where: {
        companyId,
        deliveryCompanyId: dto.deliveryCompanyId,
        status:            DeliveryStatus.delivered,
        codCollectedIqd:   { gt: 0 },
        codSettlementId:   null,
        deliveredAt:       { gte: periodStart, lte: periodEnd },
      },
      select: {
        id: true,
        codCollectedIqd: true,
        commissionIqd:   true,
        shippingCostIqd: true,
      },
    });

    if (eligible.length === 0) {
      throw new BadRequestException({
        code: 'CODST_NO_DELIVERIES',
        messageAr: 'لا توجد توصيلات مكتملة قابلة للتسوية في هذه الفترة',
      });
    }

    // Aggregate
    let totalCollected   = new Prisma.Decimal(0);
    let totalCommission  = new Prisma.Decimal(0);
    let totalShippingCost = new Prisma.Decimal(0);
    for (const d of eligible) {
      totalCollected    = totalCollected.plus(d.codCollectedIqd as any);
      totalCommission   = totalCommission.plus(d.commissionIqd as any);
      totalShippingCost = totalShippingCost.plus(d.shippingCostIqd as any);
    }
    const netDue = totalCollected.minus(totalCommission).minus(totalShippingCost);

    if (netDue.lt(0)) {
      throw new BadRequestException({
        code: 'CODST_NEGATIVE_NET',
        messageAr: 'صافي المستحق سالب — راجع العمولة وتكلفة الشحن',
      });
    }

    const number = await this.sequence.next(companyId, 'CODST');

    const result = await this.prisma.$transaction(async (tx) => {
      const settlement = await tx.codSettlement.create({
        data: {
          companyId,
          deliveryCompanyId:    dto.deliveryCompanyId,
          number,
          periodStart,
          periodEnd,
          totalCodCollectedIqd: totalCollected,
          totalCommissionIqd:   totalCommission,
          totalShippingCostIqd: totalShippingCost,
          netDueIqd:            netDue,
          deliveriesCount:      eligible.length,
          status:               CodSettlementStatus.proposed,
          createdBy:            session.userId,
        },
      });

      // Link the deliveries idempotently
      await tx.deliveryOrder.updateMany({
        where: { id: { in: eligible.map((d) => d.id) } },
        data:  { codSettlementId: settlement.id },
      });

      await this.audit.log({
        companyId,
        userId:     session.userId,
        action:     'cod_settlement.propose',
        entityType: 'CodSettlement',
        entityId:   settlement.id,
        metadata: {
          deliveryCompanyId: dto.deliveryCompanyId,
          deliveriesCount:   eligible.length,
          netDue:            netDue.toString(),
        },
      });

      return settlement;
    });

    return result;
  }

  async findAll(
    companyId: string,
    filters: {
      page?: number;
      limit?: number;
      deliveryCompanyId?: string;
      status?: CodSettlementStatus;
    } = {},
  ) {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(200, Math.max(1, filters.limit ?? 50));
    const skip = (page - 1) * limit;

    const where: Prisma.CodSettlementWhereInput = { companyId };
    if (filters.deliveryCompanyId) where.deliveryCompanyId = filters.deliveryCompanyId;
    if (filters.status)            where.status = filters.status;

    const [rows, total] = await Promise.all([
      this.prisma.codSettlement.findMany({
        where,
        skip,
        take: limit,
        include: {
          deliveryCompany: { select: { id: true, code: true, nameAr: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.codSettlement.count({ where }),
    ]);

    return { rows, total, page, limit };
  }

  async findOne(id: string, companyId: string) {
    const settlement = await this.prisma.codSettlement.findFirst({
      where: { id, companyId },
      include: {
        deliveryCompany: { select: { id: true, code: true, nameAr: true, type: true } },
        deliveries: {
          select: {
            id: true,
            number: true,
            customerId: true,
            deliveredAt: true,
            codCollectedIqd: true,
            commissionIqd: true,
            shippingCostIqd: true,
          },
          orderBy: { deliveredAt: 'asc' },
        },
      },
    });
    if (!settlement) {
      throw new NotFoundException({
        code: 'CODST_NOT_FOUND',
        messageAr: 'التسوية غير موجودة',
      });
    }
    return settlement;
  }

  async approve(
    id: string,
    companyId: string,
    dto: {
      bankAccountCode: string;
      commissionAccountCode: string;
      shippingAccountCode: string;
      receivableAccountCode: string;
    },
    session: UserSession,
  ) {
    const settlement = await this.findOne(id, companyId);

    if (settlement.status !== CodSettlementStatus.proposed) {
      throw new BadRequestException({
        code: 'CODST_INVALID_STATUS',
        messageAr: `لا يمكن الاعتماد، الحالة الحالية: ${settlement.status}`,
      });
    }
    if (
      !dto.bankAccountCode ||
      !dto.commissionAccountCode ||
      !dto.shippingAccountCode ||
      !dto.receivableAccountCode
    ) {
      throw new BadRequestException({
        code: 'CODST_ACCOUNTS_REQUIRED',
        messageAr: 'يجب تحديد الحسابات الأربعة (بنك، عمولة، شحن، ذمم)',
      });
    }

    const collected   = settlement.totalCodCollectedIqd as unknown as Prisma.Decimal;
    const commission  = settlement.totalCommissionIqd as unknown as Prisma.Decimal;
    const shipping    = settlement.totalShippingCostIqd as unknown as Prisma.Decimal;
    const net         = settlement.netDueIqd as unknown as Prisma.Decimal;

    const lines: Array<{ accountCode: string; debit?: number; credit?: number; description?: string }> = [
      { accountCode: dto.bankAccountCode,        debit:  Number(net),         description: `Net COD remittance ${settlement.number}` },
      { accountCode: dto.receivableAccountCode,  credit: Number(collected),   description: `Clear COD receivable ${settlement.number}` },
    ];
    if (commission.gt(0)) {
      lines.splice(1, 0, {
        accountCode: dto.commissionAccountCode,
        debit:       Number(commission),
        description: `Delivery commission ${settlement.number}`,
      });
    }
    if (shipping.gt(0)) {
      lines.splice(1, 0, {
        accountCode: dto.shippingAccountCode,
        debit:       Number(shipping),
        description: `Delivery shipping cost ${settlement.number}`,
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const je = await this.posting.postJournalEntry(
        {
          companyId,
          entryDate:   new Date(),
          refType:     'CodSettlement',
          refId:       settlement.id,
          description: `COD settlement ${settlement.number} (${settlement.deliveryCompany.code})`,
          lines,
        },
        session,
        tx,
      );

      const updated = await tx.codSettlement.update({
        where: { id },
        data: {
          status:     CodSettlementStatus.posted,
          postedJeId: je.id,
          approvedBy: session.userId,
          approvedAt: new Date(),
        },
      });

      await this.audit.log({
        companyId,
        userId:     session.userId,
        action:     'cod_settlement.approve',
        entityType: 'CodSettlement',
        entityId:   id,
        metadata:   { jeId: je.id, netDue: net.toString() },
      });

      return updated;
    });
  }

  async markPaid(
    id: string,
    companyId: string,
    dto: { paymentRef?: string },
    session: UserSession,
  ) {
    const settlement = await this.findOne(id, companyId);
    if (settlement.status !== CodSettlementStatus.posted) {
      throw new BadRequestException({
        code: 'CODST_NOT_POSTED',
        messageAr: 'يجب اعتماد التسوية وقيدها قبل تأكيد الاستلام',
      });
    }

    const updated = await this.prisma.codSettlement.update({
      where: { id },
      data: {
        status:     CodSettlementStatus.paid,
        paidAt:     new Date(),
        paymentRef: dto.paymentRef ?? null,
      },
    });

    await this.audit.log({
      companyId,
      userId:     session.userId,
      action:     'cod_settlement.paid',
      entityType: 'CodSettlement',
      entityId:   id,
      metadata:   { paymentRef: dto.paymentRef ?? null },
    });

    return updated;
  }

  async cancel(
    id: string,
    companyId: string,
    reason: string,
    session: UserSession,
  ) {
    const settlement = await this.findOne(id, companyId);
    if (settlement.status === CodSettlementStatus.posted || settlement.status === CodSettlementStatus.paid) {
      throw new BadRequestException({
        code: 'CODST_ALREADY_POSTED',
        messageAr: 'لا يمكن إلغاء تسوية مرحّلة. أنشئ قيداً عكسياً بدلاً من ذلك.',
      });
    }
    if (!reason || reason.trim().length === 0) {
      throw new BadRequestException({
        code: 'CODST_REASON_REQUIRED',
        messageAr: 'يجب إدخال سبب الإلغاء',
      });
    }

    return this.prisma.$transaction(async (tx) => {
      // Unlink deliveries so they can be re-settled
      await tx.deliveryOrder.updateMany({
        where: { codSettlementId: id },
        data:  { codSettlementId: null },
      });

      const updated = await tx.codSettlement.update({
        where: { id },
        data: {
          status: CodSettlementStatus.cancelled,
          notes:  `${settlement.notes ?? ''}\nCancelled: ${reason}`.trim(),
        },
      });

      await this.audit.log({
        companyId,
        userId:     session.userId,
        action:     'cod_settlement.cancel',
        entityType: 'CodSettlement',
        entityId:   id,
        metadata:   { reason },
      });

      return updated;
    });
  }

  /**
   * Recompute scorecard for one (or all) delivery companies of a tenant.
   * Refreshes denormalized counts + successRatePct + avgDeliveryHours, and
   * AUTO-SUSPENDS any company whose successRate falls below 80% over the
   * last 100 dispatches (T32 deliverable).
   *
   * Designed to be called by a nightly cron (out of scope for this PR) or
   * by the autopilot engine in T71.
   */
  async refreshScorecard(
    companyId: string,
    deliveryCompanyId?: string,
  ): Promise<{ updated: number; autoSuspended: string[] }> {
    const where: Prisma.DeliveryCompanyWhereInput = {
      companyId,
      deletedAt: null,
    };
    if (deliveryCompanyId) where.id = deliveryCompanyId;

    const companies = await this.prisma.deliveryCompany.findMany({
      where,
      select: { id: true, code: true, isActive: true, autoSuspendedAt: true },
    });

    const autoSuspended: string[] = [];
    let updated = 0;

    for (const co of companies) {
      const recent = await this.prisma.deliveryOrder.findMany({
        where: {
          companyId,
          deliveryCompanyId: co.id,
          status: { in: [DeliveryStatus.delivered, DeliveryStatus.failed, DeliveryStatus.returned, DeliveryStatus.cancelled] },
        },
        select: {
          status: true,
          dispatchedAt: true,
          deliveredAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });

      const totalDispatched = recent.length;
      const totalDelivered  = recent.filter((d) => d.status === DeliveryStatus.delivered).length;
      const totalFailed     = recent.filter((d) => d.status === DeliveryStatus.failed).length;
      const totalReturned   = recent.filter((d) => d.status === DeliveryStatus.returned).length;

      const successRatePct = totalDispatched > 0
        ? new Prisma.Decimal(totalDelivered).div(totalDispatched).mul(100).toDecimalPlaces(2)
        : new Prisma.Decimal(0);

      const deliveredWithTimes = recent.filter(
        (d) => d.status === DeliveryStatus.delivered && d.dispatchedAt && d.deliveredAt,
      );
      const avgDeliveryHours = deliveredWithTimes.length > 0
        ? new Prisma.Decimal(
            deliveredWithTimes.reduce((acc, d) => {
              const ms = d.deliveredAt!.getTime() - d.dispatchedAt!.getTime();
              return acc + ms / (1000 * 60 * 60);
            }, 0) / deliveredWithTimes.length,
          ).toDecimalPlaces(2)
        : new Prisma.Decimal(0);

      // Auto-suspend rule: < 80% success over a meaningful sample (>= 20 dispatches)
      const shouldSuspend =
        co.isActive &&
        !co.autoSuspendedAt &&
        totalDispatched >= 20 &&
        successRatePct.lt(80);

      const data: Prisma.DeliveryCompanyUpdateInput = {
        totalDispatched,
        totalDelivered,
        totalFailed,
        totalReturned,
        successRatePct,
        avgDeliveryHours,
        lastScoredAt: new Date(),
      };
      if (shouldSuspend) {
        data.isActive          = false;
        data.autoSuspendedAt   = new Date();
        data.autoSuspendReason = `Auto-suspended: success rate ${successRatePct}% over last ${totalDispatched} deliveries (threshold: 80%)`;
        autoSuspended.push(co.code);
      }

      await this.prisma.deliveryCompany.update({
        where: { id: co.id },
        data,
      });
      updated++;
    }

    return { updated, autoSuspended };
  }
}
