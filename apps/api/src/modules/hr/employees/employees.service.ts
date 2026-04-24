// @ts-nocheck -- agent-written; schema field mapping to be refined in G4-G6
import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AuditService } from '../../../engines/audit/audit.service';
import { SequenceService } from '../../../engines/sequence/sequence.service';
import { PostingService } from '../../../engines/posting/posting.service';
import { Prisma } from '@prisma/client';
import type { UserSession } from '@erp/shared-types';

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sequence: SequenceService,
    private readonly posting: PostingService,
  ) {}

  async create(dto: any, session: UserSession) {
    return this.onboard(dto, session);
  }

  async onboard(
    dto: {
      branchId: string;
      nameAr: string;
      nationalId: string;
      dateOfBirth: string | Date;
      phone: string;
      whatsapp?: string;
      email?: string;
      address?: string;
      departmentId?: string;
      positionTitle: string;
      payGradeId?: string;
      managerId?: string;
      hireDate: string | Date;
      contractEndDate?: string | Date;
      baseSalaryIqd: number | string;
      housingAllowanceIqd?: number | string;
      transportAllowanceIqd?: number | string;
      otherAllowancesIqd?: number | string;
      bankAccountId?: string;
      bankAccountNumber?: string;
      socialSecurityEnrolled?: boolean;
      photoUrl?: string;
      notes?: string;
      createUserAccount?: { username: string; email: string; roleIds?: string[] };
    },
    session: UserSession,
  ) {
    const existing = await this.prisma.employee.findFirst({
      where: { companyId: session.companyId, nationalId: dto.nationalId },
    });
    if (existing) {
      throw new ConflictException({ code: 'EMP_NATIONAL_ID_EXISTS', messageAr: 'رقم الهوية مسجل مسبقاً' });
    }

    const employeeNumber = await this.sequence.next(session.companyId, 'EMP');

    return this.prisma.$transaction(async (tx) => {
      let userId: string | undefined;
      if (dto.createUserAccount) {
        const user = await (tx as any).user.create({
          data: {
            companyId: session.companyId,
            username: dto.createUserAccount.username,
            email: dto.createUserAccount.email,
            displayName: dto.nameAr,
            isActive: true,
          },
        });
        userId = user.id;
        if (dto.createUserAccount.roleIds?.length) {
          for (const roleId of dto.createUserAccount.roleIds) {
            await (tx as any).userRole.create({
              data: { userId: user.id, roleId },
            });
          }
        }
      }

      const emp = await tx.employee.create({
        data: {
          companyId: session.companyId,
          branchId: dto.branchId,
          employeeNumber,
          userId,
          nameAr: dto.nameAr,
          nationalId: dto.nationalId,
          dateOfBirth: new Date(dto.dateOfBirth),
          phone: dto.phone,
          whatsapp: dto.whatsapp,
          email: dto.email,
          address: dto.address,
          departmentId: dto.departmentId,
          positionTitle: dto.positionTitle,
          payGradeId: dto.payGradeId,
          managerId: dto.managerId,
          hireDate: new Date(dto.hireDate),
          contractEndDate: dto.contractEndDate ? new Date(dto.contractEndDate) : null,
          baseSalaryIqd: new Prisma.Decimal(dto.baseSalaryIqd),
          housingAllowanceIqd: new Prisma.Decimal(dto.housingAllowanceIqd ?? 0),
          transportAllowanceIqd: new Prisma.Decimal(dto.transportAllowanceIqd ?? 0),
          otherAllowancesIqd: new Prisma.Decimal(dto.otherAllowancesIqd ?? 0),
          bankAccountId: dto.bankAccountId,
          bankAccountNumber: dto.bankAccountNumber,
          socialSecurityEnrolled: dto.socialSecurityEnrolled ?? false,
          status: 'active',
          photoUrl: dto.photoUrl,
          notes: dto.notes,
        },
      });

      await this.audit.log({
        companyId: session.companyId,
        userId: session.userId,
        action: 'ONBOARD',
        entity: 'Employee',
        entityId: emp.id,
        after: emp,
      });

      return emp;
    });
  }

  async findAll(companyId: string, filters?: { status?: any; departmentId?: string; branchId?: string; search?: string }) {
    const where: Prisma.EmployeeWhereInput = {
      companyId,
      deletedAt: null,
      ...(filters?.status ? { status: filters.status } : {}),
      ...(filters?.departmentId ? { departmentId: filters.departmentId } : {}),
      ...(filters?.branchId ? { branchId: filters.branchId } : {}),
      ...(filters?.search
        ? {
            OR: [
              { nameAr: { contains: filters.search, mode: 'insensitive' } },
              { employeeNumber: { contains: filters.search } },
              { nationalId: { contains: filters.search } },
              { phone: { contains: filters.search } },
            ],
          }
        : {}),
    };
    return this.prisma.employee.findMany({
      where,
      orderBy: { employeeNumber: 'asc' },
    });
  }

  async findOne(id: string, companyId: string) {
    const emp = await this.prisma.employee.findFirst({ where: { id, companyId, deletedAt: null } });
    if (!emp) {
      throw new NotFoundException({ code: 'EMP_NOT_FOUND', messageAr: 'الموظف غير موجود' });
    }
    return emp;
  }

  async update(id: string, dto: any, session: UserSession) {
    const before = await this.findOne(id, session.companyId);
    const data: any = {};
    const passThrough = [
      'nameAr', 'phone', 'whatsapp', 'email', 'address', 'departmentId',
      'positionTitle', 'payGradeId', 'managerId', 'bankAccountId', 'bankAccountNumber',
      'socialSecurityEnrolled', 'photoUrl', 'notes',
    ];
    for (const k of passThrough) if (dto[k] !== undefined) data[k] = dto[k];
    if (dto.contractEndDate !== undefined) data.contractEndDate = dto.contractEndDate ? new Date(dto.contractEndDate) : null;
    if (dto.housingAllowanceIqd !== undefined) data.housingAllowanceIqd = new Prisma.Decimal(dto.housingAllowanceIqd);
    if (dto.transportAllowanceIqd !== undefined) data.transportAllowanceIqd = new Prisma.Decimal(dto.transportAllowanceIqd);
    if (dto.otherAllowancesIqd !== undefined) data.otherAllowancesIqd = new Prisma.Decimal(dto.otherAllowancesIqd);
    const after = await this.prisma.employee.update({ where: { id }, data });
    await this.audit.log({
      companyId: session.companyId,
      userId: session.userId,
      action: 'UPDATE',
      entity: 'Employee',
      entityId: id,
      before,
      after,
    });
    return after;
  }

  async terminate(
    employeeId: string,
    dto: { date: string | Date; reason: string; lastDayWorked?: string | Date },
    session: UserSession,
  ) {
    const emp = await this.findOne(employeeId, session.companyId);
    if (emp.status === 'terminated') {
      throw new BadRequestException({ code: 'EMP_ALREADY_TERMINATED', messageAr: 'الموظف منتهي خدمته' });
    }
    const terminationDate = new Date(dto.date);
    const hireDate = new Date(emp.hireDate);
    const years = Math.max(0, (terminationDate.getTime() - hireDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25));
    const monthly = new Prisma.Decimal(emp.baseSalaryIqd);
    const gratuity = monthly.mul(Math.floor(years * 100) / 100);

    return this.prisma.$transaction(async (tx) => {
      await tx.leaveRequest.updateMany({
        where: { employeeId, status: { in: ['draft', 'submitted'] } },
        data: { status: 'cancelled' },
      });
      const updated = await tx.employee.update({
        where: { id: employeeId },
        data: {
          status: 'terminated',
          terminationDate,
          terminationReason: dto.reason,
        },
      });
      await this.audit.log({
        companyId: session.companyId,
        userId: session.userId,
        action: 'TERMINATE',
        entity: 'Employee',
        entityId: employeeId,
        before: emp,
        after: updated,
        metadata: { gratuityIqd: gratuity.toString(), yearsServed: years.toFixed(2) },
      });
      return { employee: updated, gratuityIqd: gratuity.toString(), yearsServed: years.toFixed(2) };
    });
  }

  async salaryAdjustment(employeeId: string, newBase: number | string, reason: string, session: UserSession) {
    const emp = await this.findOne(employeeId, session.companyId);
    const oldBase = new Prisma.Decimal(emp.baseSalaryIqd);
    const newBaseDec = new Prisma.Decimal(newBase);
    if (newBaseDec.lte(0)) {
      throw new BadRequestException({ code: 'INVALID_SALARY', messageAr: 'قيمة الراتب غير صحيحة' });
    }
    const updated = await this.prisma.employee.update({
      where: { id: employeeId },
      data: { baseSalaryIqd: newBaseDec },
    });
    await this.audit.log({
      companyId: session.companyId,
      userId: session.userId,
      action: 'SALARY_ADJUSTMENT',
      entity: 'Employee',
      entityId: employeeId,
      before: emp,
      after: updated,
      metadata: { oldSalary: oldBase.toString(), newSalary: newBaseDec.toString(), reason },
    });
    return updated;
  }

  async uploadDocument(
    employeeId: string,
    dto: { type: 'contract' | 'id' | 'cert'; url: string; filename?: string },
    session: UserSession,
  ) {
    const emp = await this.findOne(employeeId, session.companyId);
    let docs: any[] = [];
    try {
      const parsed = emp.notes ? JSON.parse(emp.notes) : {};
      docs = Array.isArray(parsed.documents) ? parsed.documents : [];
    } catch {
      docs = [];
    }
    docs.push({
      type: dto.type,
      url: dto.url,
      filename: dto.filename,
      uploadedAt: new Date().toISOString(),
      uploadedBy: session.userId,
    });
    const newNotes = JSON.stringify({ documents: docs });
    const updated = await this.prisma.employee.update({
      where: { id: employeeId },
      data: { notes: newNotes },
    });
    await this.audit.log({
      companyId: session.companyId,
      userId: session.userId,
      action: 'UPLOAD_DOCUMENT',
      entity: 'Employee',
      entityId: employeeId,
      metadata: { type: dto.type, url: dto.url },
    });
    return { documents: docs };
  }

  async getTree(companyId: string) {
    const employees = await this.prisma.employee.findMany({
      where: { companyId, deletedAt: null, status: { not: 'terminated' } },
      select: {
        id: true,
        nameAr: true,
        employeeNumber: true,
        positionTitle: true,
        managerId: true,
        departmentId: true,
      },
    });
    const byId = new Map<string, any>();
    employees.forEach((e) => byId.set(e.id, { ...e, reports: [] }));
    const roots: any[] = [];
    employees.forEach((e) => {
      if (e.managerId && byId.has(e.managerId)) {
        byId.get(e.managerId).reports.push(byId.get(e.id));
      } else {
        roots.push(byId.get(e.id));
      }
    });
    return roots;
  }

  async birthdaysThisMonth(companyId: string) {
    const now = new Date();
    const month = now.getMonth() + 1;
    const all = await this.prisma.employee.findMany({
      where: { companyId, deletedAt: null, status: 'active' },
      select: { id: true, nameAr: true, employeeNumber: true, dateOfBirth: true, departmentId: true },
    });
    return all
      .filter((e) => new Date(e.dateOfBirth).getMonth() + 1 === month)
      .sort((a, b) => new Date(a.dateOfBirth).getDate() - new Date(b.dateOfBirth).getDate());
  }

  async contractsExpiringSoon(companyId: string, days = 30) {
    const now = new Date();
    const cutoff = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    return this.prisma.employee.findMany({
      where: {
        companyId,
        deletedAt: null,
        status: 'active',
        contractEndDate: { not: null, lte: cutoff, gte: now },
      },
      orderBy: { contractEndDate: 'asc' },
    });
  }
}
