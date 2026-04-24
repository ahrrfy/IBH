import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AuditService } from '../../../engines/audit/audit.service';
import { Prisma } from '@prisma/client';
import type { UserSession } from '@erp/shared-types';

@Injectable()
export class DepartmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(
    dto: {
      code: string;
      nameAr: string;
      parentId?: string;
      managerId?: string;
      costCenterId?: string;
    },
    session: UserSession,
  ) {
    const existing = await this.prisma.department.findFirst({
      where: { companyId: session.companyId, code: dto.code },
    });
    if (existing) {
      throw new ConflictException({ code: 'DEPT_CODE_EXISTS', messageAr: 'رمز القسم موجود مسبقاً' });
    }
    const dept = await this.prisma.department.create({
      data: {
        companyId: session.companyId,
        code: dto.code,
        nameAr: dto.nameAr,
        parentId: dto.parentId,
        managerId: dto.managerId,
        costCenterId: dto.costCenterId,
        isActive: true,
      },
    });
    await this.audit.log({
      companyId: session.companyId,
      userId: session.userId,
      action: 'CREATE',
      entity: 'Department',
      entityId: dept.id,
      after: dept,
    });
    return dept;
  }

  async findAll(companyId: string, filters?: { isActive?: boolean }) {
    return this.prisma.department.findMany({
      where: { companyId, ...(filters?.isActive !== undefined ? { isActive: filters.isActive } : {}) },
      orderBy: { code: 'asc' },
    });
  }

  async findOne(id: string, companyId: string) {
    const dept = await this.prisma.department.findFirst({ where: { id, companyId } });
    if (!dept) {
      throw new NotFoundException({ code: 'DEPT_NOT_FOUND', messageAr: 'القسم غير موجود' });
    }
    return dept;
  }

  async update(id: string, dto: Partial<{ nameAr: string; parentId: string; managerId: string; costCenterId: string; isActive: boolean }>, session: UserSession) {
    const before = await this.findOne(id, session.companyId);
    if (dto.parentId && dto.parentId === id) {
      throw new BadRequestException({ code: 'DEPT_SELF_PARENT', messageAr: 'لا يمكن أن يكون القسم أبا لنفسه' });
    }
    const after = await this.prisma.department.update({ where: { id }, data: dto });
    await this.audit.log({
      companyId: session.companyId,
      userId: session.userId,
      action: 'UPDATE',
      entity: 'Department',
      entityId: id,
      before,
      after,
    });
    return after;
  }

  async remove(id: string, session: UserSession) {
    const before = await this.findOne(id, session.companyId);
    const children = await this.prisma.department.count({ where: { parentId: id } });
    if (children > 0) {
      throw new BadRequestException({ code: 'DEPT_HAS_CHILDREN', messageAr: 'القسم يحتوي على أقسام فرعية' });
    }
    const emps = await this.prisma.employee.count({ where: { departmentId: id } });
    if (emps > 0) {
      throw new BadRequestException({ code: 'DEPT_HAS_EMPLOYEES', messageAr: 'القسم يحتوي على موظفين' });
    }
    const res = await this.prisma.department.update({ where: { id }, data: { isActive: false } });
    await this.audit.log({
      companyId: session.companyId,
      userId: session.userId,
      action: 'DELETE',
      entity: 'Department',
      entityId: id,
      before,
      after: res,
    });
    return res;
  }

  async getTree(companyId: string) {
    const all = await this.prisma.department.findMany({ where: { companyId, isActive: true } });
    const byId = new Map<string, any>();
    all.forEach((d) => byId.set(d.id, { ...d, children: [] }));
    const roots: any[] = [];
    all.forEach((d) => {
      if (d.parentId && byId.has(d.parentId)) {
        byId.get(d.parentId).children.push(byId.get(d.id));
      } else {
        roots.push(byId.get(d.id));
      }
    });
    return roots;
  }
}
