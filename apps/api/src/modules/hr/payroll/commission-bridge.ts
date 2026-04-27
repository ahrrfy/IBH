import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { CommissionsService } from '../../sales/commissions/commissions.service';

/**
 * PayrollCommissionBridge (T43).
 *
 * READ-ONLY bridge between HR Payroll and Sales Commissions.
 * Per T43 constraints this file MUST NOT modify payroll.service.ts. It
 * exposes two helpers that an existing payroll workflow can opt into via
 * dependency injection (e.g. a future `PayrollService` enhancement) WITHOUT
 * any imperative coupling here.
 *
 * Responsibilities:
 *  1. `getEmployeeCommission(payrollRunId, employeeId)` — sum of accrued,
 *     unpaid commissions up to the payroll run's period end.
 *  2. `markCommissionsPaid(payrollRunId, employeeId)` — flips matching
 *     CommissionEntry rows to status='paid' so they aren't double-counted in
 *     the next run.
 *
 * Both methods are idempotent and safe to call multiple times.
 *
 * The bridge does NOT touch PayrollLine.commissionIqd directly — payroll
 * already has a column for that and is the system of record for payroll
 * compensation. The bridge merely provides the value the payroll engine
 * should write into that column.
 */
@Injectable()
export class PayrollCommissionBridge {
  private readonly logger = new Logger(PayrollCommissionBridge.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly commissions: CommissionsService,
  ) {}

  /**
   * Compute end-of-period date for a payroll run. Inclusive last day of the
   * (year, month) the run is for.
   */
  private periodEnd(year: number, month: number): Date {
    // first day of the next month, minus 1 ms = last instant of `month`.
    const next = new Date(year, month, 1);
    return new Date(next.getTime() - 1);
  }

  async getEmployeeCommission(
    payrollRunId: string,
    employeeId: string,
  ): Promise<{ amountIqd: Prisma.Decimal; entryCount: number }> {
    const run = await this.prisma.payrollRun.findUnique({
      where: { id: payrollRunId },
      select: { companyId: true, periodYear: true, periodMonth: true },
    });
    if (!run) {
      this.logger.warn(`payroll run ${payrollRunId} not found`);
      return { amountIqd: new Prisma.Decimal(0), entryCount: 0 };
    }

    const upTo = this.periodEnd(run.periodYear, run.periodMonth);
    const amountIqd = await this.commissions.getUnpaidByEmployee(
      run.companyId,
      employeeId,
      upTo,
    );
    const entryCount = await this.prisma.commissionEntry.count({
      where: {
        companyId: run.companyId,
        employeeId,
        status: 'accrued',
        createdAt: { lte: upTo },
      },
    });

    return { amountIqd, entryCount };
  }

  async markCommissionsPaid(
    payrollRunId: string,
    employeeId: string,
  ): Promise<{ updatedCount: number }> {
    const run = await this.prisma.payrollRun.findUnique({
      where: { id: payrollRunId },
      select: { companyId: true, periodYear: true, periodMonth: true },
    });
    if (!run) return { updatedCount: 0 };

    const upTo = this.periodEnd(run.periodYear, run.periodMonth);
    const result = await this.commissions.markPaid(
      run.companyId,
      employeeId,
      upTo,
      payrollRunId,
    );
    return { updatedCount: result.count };
  }
}
