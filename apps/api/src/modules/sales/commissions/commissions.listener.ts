import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { CommissionsService } from './commissions.service';

/**
 * CommissionsListener (T43).
 *
 * Subscribes to the existing event bus:
 *   - 'invoice.posted'        → accrue commission for the sales rep.
 *   - 'sales.return.posted'   → clawback for the same rep on the original invoice.
 *
 * The sales-rep is resolved from the invoice's `createdBy`/`postedBy` user via
 * the Employee.userId link. If no employee is linked or no plan is assigned,
 * the event is silently ignored — commissions are opt-in per company.
 */
@Injectable()
export class CommissionsListener {
  private readonly logger = new Logger(CommissionsListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly commissions: CommissionsService,
  ) {}

  @OnEvent('invoice.posted', { async: true, promisify: true })
  async onInvoicePosted(payload: {
    companyId: string;
    branchId?: string;
    invoiceId: string;
    userId: string;
  }) {
    try {
      await this.handleInvoice(payload, 'accrual');
    } catch (err) {
      this.logger.error(
        `accrual failed for invoice ${payload?.invoiceId}: ${(err as Error).message}`,
      );
    }
  }

  @OnEvent('sales.return.posted', { async: true, promisify: true })
  async onReturnPosted(payload: {
    companyId: string;
    branchId?: string;
    returnId: string;
    originalInvoiceId: string;
    userId: string;
  }) {
    try {
      await this.handleReturn(payload);
    } catch (err) {
      this.logger.error(
        `clawback failed for return ${payload?.returnId}: ${(err as Error).message}`,
      );
    }
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private async resolveEmployee(companyId: string, userId: string | undefined) {
    if (!userId) return null;
    return this.prisma.employee.findFirst({
      where: { companyId, userId, status: 'active' as any, deletedAt: null },
      select: { id: true },
    });
  }

  private async handleInvoice(
    payload: { companyId: string; branchId?: string; invoiceId: string; userId: string },
    kind: 'accrual',
  ) {
    const inv = await this.prisma.salesInvoice.findFirst({
      where: { id: payload.invoiceId, companyId: payload.companyId },
      include: { lines: true },
    });
    if (!inv) return;
    const employee = await this.resolveEmployee(payload.companyId, inv.postedBy ?? inv.createdBy);
    if (!employee) return; // no linked sales rep → nothing to accrue

    const assignments = await this.commissions.findActivePlansForEmployee(
      payload.companyId,
      employee.id,
      inv.invoiceDate,
    );
    if (assignments.length === 0) return;

    const totalCogs = inv.lines.reduce(
      (a, l) => a.plus(l.cogsIqd ?? new Prisma.Decimal(0)),
      new Prisma.Decimal(0),
    );

    for (const a of assignments) {
      const plan = a.plan;
      const baseAmount =
        plan.basis === 'margin'
          ? inv.totalIqd.minus(totalCogs)
          : inv.totalIqd;
      if (baseAmount.lte(0)) continue;

      const pct = this.commissions.computeRate(plan, baseAmount);
      const amount = baseAmount.mul(pct).div(100);
      if (amount.lte(0)) continue;

      await this.commissions.recordEntry(
        {
          companyId: payload.companyId,
          branchId: payload.branchId ?? inv.branchId ?? null,
          planId: plan.id,
          employeeId: employee.id,
          promoterName: null,
          kind,
          refType: 'SalesInvoice',
          refId: inv.id,
          baseAmountIqd: baseAmount,
          pctApplied: pct,
          amountIqd: amount,
          notes: `${plan.code} on invoice ${inv.number}`,
          createdBy: payload.userId,
        },
        payload.userId,
      );
    }
  }

  private async handleReturn(payload: {
    companyId: string;
    branchId?: string;
    returnId: string;
    originalInvoiceId: string;
    userId: string;
  }) {
    // Mirror the original invoice's accruals as negative entries (clawback).
    const originalEntries = await this.prisma.commissionEntry.findMany({
      where: {
        companyId: payload.companyId,
        refType: 'SalesInvoice',
        refId: payload.originalInvoiceId,
        kind: 'accrual',
      },
    });
    if (originalEntries.length === 0) return;

    const ret = await this.prisma.salesReturn.findFirst({
      where: { id: payload.returnId, companyId: payload.companyId },
      include: { originalInvoice: true },
    });
    if (!ret) return;

    const ratio = ret.totalIqd.div(
      ret.originalInvoice.totalIqd.isZero() ? new Prisma.Decimal(1) : ret.originalInvoice.totalIqd,
    );

    for (const e of originalEntries) {
      // Clawback proportional to returned value.
      const claw = e.amountIqd.mul(ratio).neg();
      if (claw.isZero()) continue;
      await this.commissions.recordEntry(
        {
          companyId: payload.companyId,
          branchId: payload.branchId ?? e.branchId,
          planId: e.planId,
          employeeId: e.employeeId,
          promoterName: e.promoterName,
          kind: 'clawback',
          refType: 'SalesReturn',
          refId: payload.returnId,
          baseAmountIqd: ret.totalIqd.neg(),
          pctApplied: e.pctApplied,
          amountIqd: claw,
          notes: `Clawback for return ${ret.number}`,
          createdBy: payload.userId,
        },
        payload.userId,
      );
    }
  }
}
