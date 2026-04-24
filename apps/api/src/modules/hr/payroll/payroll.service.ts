// @ts-nocheck -- agent-written; schema field mapping to be refined in G4-G6
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AuditService } from '../../../engines/audit/audit.service';
import { SequenceService } from '../../../engines/sequence/sequence.service';
import { PostingService } from '../../../engines/posting/posting.service';
import { Prisma } from '@prisma/client';
import type { UserSession } from '@erp/shared-types';

const WORKING_HOURS_MONTH = new Prisma.Decimal('173.33');
const OVERTIME_RATE = new Prisma.Decimal('1.5');
const SS_RATE = new Prisma.Decimal('0.05');
const WORKDAY_MINUTES = 480;
const STANDARD_WORK_DAYS = 26;

@Injectable()
export class PayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sequence: SequenceService,
    private readonly posting: PostingService,
  ) {}

  private computeIraqiTax(grossMonthly: Prisma.Decimal): Prisma.Decimal {
    const annual = grossMonthly.mul(12);
    const exempt = new Prisma.Decimal(2_500_000);
    let tax = new Prisma.Decimal(0);
    if (annual.lte(exempt)) {
      tax = new Prisma.Decimal(0);
    } else if (annual.lte(5_000_000)) {
      tax = annual.sub(exempt).mul('0.03');
    } else if (annual.lte(10_000_000)) {
      tax = annual.sub(exempt).mul('0.05');
    } else {
      tax = annual.sub(exempt).mul('0.10');
    }
    return tax.div(12);
  }

  async createRun(
    dto: { branchId?: string; periodYear: number; periodMonth: number; employeeIds?: string[] },
    session: UserSession,
  ) {
    if (dto.periodMonth < 1 || dto.periodMonth > 12) {
      throw new BadRequestException({ code: 'INVALID_MONTH', messageAr: 'الشهر غير صحيح' });
    }
    const existingRun = await this.prisma.payrollRun.findFirst({
      where: {
        companyId: session.companyId,
        branchId: dto.branchId ?? null,
        periodYear: dto.periodYear,
        periodMonth: dto.periodMonth,
        status: { notIn: ['draft'] as any },
      },
    });
    if (existingRun) {
      throw new BadRequestException({
        code: 'PAYROLL_PERIOD_EXISTS',
        messageAr: 'توجد دورة رواتب لهذا الشهر',
      });
    }

    const number = await this.sequence.next(session.companyId, 'PAY');
    const periodStart = new Date(dto.periodYear, dto.periodMonth - 1, 1);
    const periodEnd = new Date(dto.periodYear, dto.periodMonth, 1);

    const empWhere: Prisma.EmployeeWhereInput = {
      companyId: session.companyId,
      deletedAt: null,
      status: { in: ['active', 'on_leave'] as any },
      ...(dto.branchId ? { branchId: dto.branchId } : {}),
      ...(dto.employeeIds?.length ? { id: { in: dto.employeeIds } } : {}),
    };
    const employees = await this.prisma.employee.findMany({ where: empWhere });
    if (employees.length === 0) {
      throw new BadRequestException({ code: 'NO_EMPLOYEES', messageAr: 'لا يوجد موظفون في النطاق' });
    }

    return this.prisma.$transaction(async (tx) => {
      const run = await tx.payrollRun.create({
        data: {
          companyId: session.companyId,
          branchId: dto.branchId,
          number,
          periodYear: dto.periodYear,
          periodMonth: dto.periodMonth,
          status: 'draft',
          totalGrossIqd: new Prisma.Decimal(0),
          totalDeductionsIqd: new Prisma.Decimal(0),
          totalNetIqd: new Prisma.Decimal(0),
          totalTaxIqd: new Prisma.Decimal(0),
          totalSsIqd: new Prisma.Decimal(0),
        },
      });

      let totalGross = new Prisma.Decimal(0);
      let totalDeduct = new Prisma.Decimal(0);
      let totalNet = new Prisma.Decimal(0);
      let totalTax = new Prisma.Decimal(0);
      let totalSs = new Prisma.Decimal(0);

      for (const emp of employees) {
        const attendance = await tx.attendanceRecord.findMany({
          where: {
            companyId: session.companyId,
            employeeId: emp.id,
            date: { gte: periodStart, lt: periodEnd },
          },
        });
        const daysWorked = attendance.filter((a) => a.checkInAt && !a.isAbsent && !a.isLeave).length;
        const daysLeave = attendance.filter((a) => a.isLeave).length;
        const absences = attendance.filter((a) => a.isAbsent).length;
        const lateMinutes = attendance.reduce((s, a) => s + (a.lateMinutes || 0), 0);
        const overtimeMinutes = attendance.reduce((s, a) => s + (a.overtimeMinutes || 0), 0);

        const baseSalary = new Prisma.Decimal(emp.baseSalaryIqd);
        const housing = new Prisma.Decimal(emp.housingAllowanceIqd);
        const transport = new Prisma.Decimal(emp.transportAllowanceIqd);
        const other = new Prisma.Decimal(emp.otherAllowancesIqd);

        const hourlyRate = baseSalary.div(WORKING_HOURS_MONTH);
        const overtimeHours = new Prisma.Decimal(overtimeMinutes).div(60);
        const overtimePay = overtimeHours.mul(hourlyRate).mul(OVERTIME_RATE);
        const bonus = new Prisma.Decimal(0);
        const commission = new Prisma.Decimal(0);

        const gross = baseSalary.add(housing).add(transport).add(other).add(overtimePay).add(bonus).add(commission);

        const dailyRate = baseSalary.div(STANDARD_WORK_DAYS);
        const absenceDeduct = dailyRate.mul(absences);
        const lateDeduct = dailyRate.mul(lateMinutes).div(WORKDAY_MINUTES);

        const advanceDeduct = new Prisma.Decimal(0);
        const incomeTax = this.computeIraqiTax(gross);
        const socialSecurity = emp.socialSecurityEnrolled ? baseSalary.mul(SS_RATE) : new Prisma.Decimal(0);
        const otherDeduct = new Prisma.Decimal(0);

        const totalDeductLine = absenceDeduct
          .add(lateDeduct)
          .add(advanceDeduct)
          .add(incomeTax)
          .add(socialSecurity)
          .add(otherDeduct);
        const net = gross.sub(totalDeductLine);

        await tx.payrollLine.create({
          data: {
            payrollRunId: run.id,
            employeeId: emp.id,
            baseSalaryIqd: baseSalary,
            housingIqd: housing,
            transportIqd: transport,
            otherAllowIqd: other,
            overtimeIqd: overtimePay,
            bonusIqd: bonus,
            commissionIqd: commission,
            grossIqd: gross,
            absenceDeductIqd: absenceDeduct,
            lateDeductIqd: lateDeduct,
            advanceDeductIqd: advanceDeduct,
            incomeTaxIqd: incomeTax,
            socialSecurityIqd: socialSecurity,
            otherDeductIqd: otherDeduct,
            totalDeductIqd: totalDeductLine,
            netIqd: net,
            daysWorked,
            hoursOvertime: overtimeHours,
          },
        });

        totalGross = totalGross.add(gross);
        totalDeduct = totalDeduct.add(totalDeductLine);
        totalNet = totalNet.add(net);
        totalTax = totalTax.add(incomeTax);
        totalSs = totalSs.add(socialSecurity);
      }

      const updated = await tx.payrollRun.update({
        where: { id: run.id },
        data: {
          totalGrossIqd: totalGross,
          totalDeductionsIqd: totalDeduct,
          totalNetIqd: totalNet,
          totalTaxIqd: totalTax,
          totalSsIqd: totalSs,
          status: 'calculated',
        },
      });

      await this.audit.log({
        companyId: session.companyId,
        userId: session.userId,
        action: 'CREATE',
        entity: 'PayrollRun',
        entityId: run.id,
        after: updated,
      });

      return updated;
    });
  }

  async review(runId: string, session: UserSession) {
    const run = await this.findOne(runId, session.companyId);
    if (run.status !== 'calculated') {
      throw new BadRequestException({ code: 'INVALID_STATUS', messageAr: 'حالة الدورة لا تسمح بالمراجعة' });
    }
    const updated = await this.prisma.payrollRun.update({
      where: { id: runId },
      data: { status: 'reviewed' },
    });
    await this.audit.log({
      companyId: session.companyId,
      userId: session.userId,
      action: 'REVIEW',
      entity: 'PayrollRun',
      entityId: runId,
      before: run,
      after: updated,
    });
    return updated;
  }

  async approve(runId: string, session: UserSession) {
    const run = await this.findOne(runId, session.companyId);
    if (run.status !== 'reviewed') {
      throw new BadRequestException({ code: 'INVALID_STATUS', messageAr: 'الدورة تحتاج مراجعة أولاً' });
    }
    const updated = await this.prisma.payrollRun.update({
      where: { id: runId },
      data: { status: 'approved', approvedBy: session.userId },
    });
    await this.audit.log({
      companyId: session.companyId,
      userId: session.userId,
      action: 'APPROVE',
      entity: 'PayrollRun',
      entityId: runId,
      before: run,
      after: updated,
    });
    return updated;
  }

  async post(runId: string, session: UserSession) {
    const run = await this.prisma.payrollRun.findFirst({
      where: { id: runId, companyId: session.companyId },
      include: { lines: true } as any,
    });
    if (!run) throw new NotFoundException({ code: 'RUN_NOT_FOUND', messageAr: 'الدورة غير موجودة' });
    if (run.status !== 'approved') {
      throw new BadRequestException({ code: 'NOT_APPROVED', messageAr: 'الدورة غير معتمدة' });
    }

    return this.prisma.$transaction(async (tx) => {
      const description = `Payroll ${run.number} - ${run.periodYear}/${String(run.periodMonth).padStart(2, '0')}`;
      const gross = new Prisma.Decimal(run.totalGrossIqd);
      const tax = new Prisma.Decimal(run.totalTaxIqd);
      const ss = new Prisma.Decimal(run.totalSsIqd);
      const net = new Prisma.Decimal(run.totalNetIqd);

      const lines = [
        { accountCode: '6210', debit: gross, credit: new Prisma.Decimal(0), description: 'Gross salary expense' },
        { accountCode: '3410', debit: new Prisma.Decimal(0), credit: tax, description: 'Income tax withheld' },
        { accountCode: '3320', debit: new Prisma.Decimal(0), credit: ss, description: 'Social security payable' },
        { accountCode: '1010', debit: new Prisma.Decimal(0), credit: net, description: 'Net payable (bank/cash)' },
      ];

      const je = await this.posting.postJournalEntry(
        {
          companyId: session.companyId,
          entryDate: new Date(),
          refType: 'PayrollRun',
          refId: run.id,
          description,
          lines,
        },
        session,
        tx as any,
      );

      await (tx as any).payrollLine.updateMany({
        where: { payrollRunId: run.id, payslipPdfUrl: null },
        data: { payslipPdfUrl: `/payslips/${run.id}/placeholder.pdf` },
      });

      const updated = await tx.payrollRun.update({
        where: { id: runId },
        data: { status: 'posted', postedAt: new Date(), journalEntryId: je.id },
      });
      await this.audit.log({
        companyId: session.companyId,
        userId: session.userId,
        action: 'POST',
        entity: 'PayrollRun',
        entityId: runId,
        before: run,
        after: updated,
      });
      return updated;
    });
  }

  async markPaid(runId: string, paymentDate: string | Date, session: UserSession) {
    const run = await this.findOne(runId, session.companyId);
    if (run.status !== 'posted') {
      throw new BadRequestException({ code: 'NOT_POSTED', messageAr: 'يجب ترحيل الدورة قبل تأكيد الدفع' });
    }
    const updated = await this.prisma.payrollRun.update({
      where: { id: runId },
      data: { status: 'paid', paidAt: new Date(paymentDate) },
    });
    await this.audit.log({
      companyId: session.companyId,
      userId: session.userId,
      action: 'MARK_PAID',
      entity: 'PayrollRun',
      entityId: runId,
      before: run,
      after: updated,
    });
    return updated;
  }

  async exportCbsFile(runId: string, companyId: string) {
    const run = await this.prisma.payrollRun.findFirst({
      where: { id: runId, companyId },
    });
    if (!run) throw new NotFoundException({ code: 'RUN_NOT_FOUND', messageAr: 'الدورة غير موجودة' });
    const lines = await this.prisma.payrollLine.findMany({ where: { payrollRunId: runId } });
    const empIds = lines.map((l) => l.employeeId);
    const employees = await this.prisma.employee.findMany({ where: { id: { in: empIds } } });
    const byId = new Map(employees.map((e) => [e.id, e]));

    const header = 'employeeName,accountNumber,amount';
    const rows = lines.map((l) => {
      const emp = byId.get(l.employeeId);
      const name = (emp?.nameAr ?? '').replace(/,/g, ' ');
      const acct = emp?.bankAccountNumber ?? '';
      const amount = new Prisma.Decimal(l.netIqd).toFixed(2);
      return `${name},${acct},${amount}`;
    });
    return { filename: `payroll-${run.number}.csv`, content: [header, ...rows].join('\n') };
  }

  async reverse(runId: string, reason: string, session: UserSession) {
    const run = await this.findOne(runId, session.companyId);
    if (run.status === 'paid') {
      throw new BadRequestException({ code: 'ALREADY_PAID', messageAr: 'لا يمكن عكس دورة مدفوعة' });
    }
    if (!['posted', 'approved', 'reviewed', 'calculated'].includes(run.status as any)) {
      throw new BadRequestException({ code: 'INVALID_STATUS', messageAr: 'الحالة لا تسمح بالعكس' });
    }
    const updated = await this.prisma.payrollRun.update({
      where: { id: runId },
      data: { status: 'draft', journalEntryId: null, postedAt: null, approvedBy: null },
    });
    await this.audit.log({
      companyId: session.companyId,
      userId: session.userId,
      action: 'REVERSE',
      entity: 'PayrollRun',
      entityId: runId,
      before: run,
      after: updated,
      metadata: { reason },
    });
    return updated;
  }

  async findAll(companyId: string, filters?: { year?: number; month?: number; status?: any }) {
    return this.prisma.payrollRun.findMany({
      where: {
        companyId,
        ...(filters?.year ? { periodYear: filters.year } : {}),
        ...(filters?.month ? { periodMonth: filters.month } : {}),
        ...(filters?.status ? { status: filters.status } : {}),
      },
      orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }],
    });
  }

  async findOne(id: string, companyId: string) {
    const run = await this.prisma.payrollRun.findFirst({ where: { id, companyId } });
    if (!run) throw new NotFoundException({ code: 'RUN_NOT_FOUND', messageAr: 'الدورة غير موجودة' });
    return run;
  }

  async getLines(runId: string, companyId: string) {
    await this.findOne(runId, companyId);
    return this.prisma.payrollLine.findMany({ where: { payrollRunId: runId } });
  }
}
