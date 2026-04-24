import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AuditService } from '../../../engines/audit/audit.service';
import { Prisma } from '@prisma/client';
import type { UserSession } from '@erp/shared-types';

@Injectable()
export class PayGradesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(
    dto: {
      code: string;
      nameAr: string;
      minSalaryIqd: number | string;
      midSalaryIqd: number | string;
      maxSalaryIqd: number | string;
      annualIncreasePct: number | string;
    },
    session: UserSession,
  ) {
    const existing = await this.prisma.payGrade.findFirst({
      where: { companyId: session.companyId, code: dto.code },
    });
    if (existing) {
      throw new ConflictException({ code: 'PAYGRADE_EXISTS', messageAr: 'درجة راتب موجودة' });
    }
    const grade = await this.prisma.payGrade.create({
      data: {
        companyId: session.companyId,
        code: dto.code,
        nameAr: dto.nameAr,
        minSalaryIqd: new Prisma.Decimal(dto.minSalaryIqd),
        midSalaryIqd: new Prisma.Decimal(dto.midSalaryIqd),
        maxSalaryIqd: new Prisma.Decimal(dto.maxSalaryIqd),
        annualIncreasePct: new Prisma.Decimal(dto.annualIncreasePct),
        isActive: true,
      },
    });
    await this.audit.log({
      companyId: session.companyId,
      userId: session.userId,
      action: 'CREATE',
      entity: 'PayGrade',
      entityId: grade.id,
      after: grade,
    });
    return grade;
  }

  findAll(companyId: string) {
    return this.prisma.payGrade.findMany({
      where: { companyId },
      orderBy: { code: 'asc' },
    });
  }

  async findOne(id: string, companyId: string) {
    const grade = await this.prisma.payGrade.findFirst({ where: { id, companyId } });
    if (!grade) {
      throw new NotFoundException({ code: 'PAYGRADE_NOT_FOUND', messageAr: 'درجة الراتب غير موجودة' });
    }
    return grade;
  }

  async update(id: string, dto: any, session: UserSession) {
    const before = await this.findOne(id, session.companyId);
    const data: any = {};
    if (dto.nameAr !== undefined) data.nameAr = dto.nameAr;
    if (dto.minSalaryIqd !== undefined) data.minSalaryIqd = new Prisma.Decimal(dto.minSalaryIqd);
    if (dto.midSalaryIqd !== undefined) data.midSalaryIqd = new Prisma.Decimal(dto.midSalaryIqd);
    if (dto.maxSalaryIqd !== undefined) data.maxSalaryIqd = new Prisma.Decimal(dto.maxSalaryIqd);
    if (dto.annualIncreasePct !== undefined) data.annualIncreasePct = new Prisma.Decimal(dto.annualIncreasePct);
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    const after = await this.prisma.payGrade.update({ where: { id }, data });
    await this.audit.log({
      companyId: session.companyId,
      userId: session.userId,
      action: 'UPDATE',
      entity: 'PayGrade',
      entityId: id,
      before,
      after,
    });
    return after;
  }

  async remove(id: string, session: UserSession) {
    const before = await this.findOne(id, session.companyId);
    const usage = await this.prisma.employee.count({ where: { payGradeId: id } });
    if (usage > 0) {
      const after = await this.prisma.payGrade.update({ where: { id }, data: { isActive: false } });
      await this.audit.log({
        companyId: session.companyId,
        userId: session.userId,
        action: 'DEACTIVATE',
        entity: 'PayGrade',
        entityId: id,
        before,
        after,
      });
      return after;
    }
    await this.prisma.payGrade.delete({ where: { id } });
    await this.audit.log({
      companyId: session.companyId,
      userId: session.userId,
      action: 'DELETE',
      entity: 'PayGrade',
      entityId: id,
      before,
    });
    return { ok: true };
  }

  async computeAnnualIncrease(employeeId: string, companyId: string) {
    const emp = await this.prisma.employee.findFirst({ where: { id: employeeId, companyId } });
    if (!emp) {
      throw new NotFoundException({ code: 'EMP_NOT_FOUND', messageAr: 'الموظف غير موجود' });
    }
    if (!emp.payGradeId) {
      throw new NotFoundException({ code: 'NO_PAY_GRADE', messageAr: 'الموظف ليس له درجة راتب' });
    }
    const grade = await this.findOne(emp.payGradeId, companyId);
    const current = new Prisma.Decimal(emp.baseSalaryIqd);
    const pct = new Prisma.Decimal(grade.annualIncreasePct);
    const increase = current.mul(pct).div(100);
    let suggested = current.add(increase);
    const max = new Prisma.Decimal(grade.maxSalaryIqd);
    if (suggested.gt(max)) suggested = max;
    return {
      current: current.toString(),
      increaseAmount: increase.toString(),
      increasePct: pct.toString(),
      suggested: suggested.toString(),
      cappedAtMax: suggested.eq(max),
    };
  }
}
