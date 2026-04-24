// @ts-nocheck -- Prisma input shape refinement pending (G4-G6)
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AuditService } from '../../../engines/audit/audit.service';
import type { UserSession } from '@erp/shared-types';

// ─── Companies Service ─────────────────────────────────────────────────────────
// Manages the top-level Company entity and its Branches.
// Only SuperAdmin can create companies; CompanyAdmin manages their own company.

@Injectable()
export class CompaniesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ─── Company ──────────────────────────────────────────────────────────────

  async getMyCompany(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      include: {
        branches: {
          where: { deletedAt: null },
          orderBy: { nameAr: 'asc' },
        },
      },
    });

    if (!company) {
      throw new NotFoundException({ code: 'NOT_FOUND', messageAr: 'الشركة غير موجودة' });
    }

    return company;
  }

  async updateCompany(
    companyId: string,
    dto: Partial<{
      nameAr: string;
      nameEn: string;
      phone: string;
      address: string;
      logoUrl: string;
    }>,
    session: UserSession,
  ) {
    const before = await this.prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { nameAr: true, nameEn: true, phone: true },
    });

    const updated = await this.prisma.company.update({
      where: { id: companyId },
      data: { ...dto, updatedBy: session.userId },
    });

    await this.audit.log({
      companyId,
      userId:     session.userId,
      userEmail:  session.userId,
      action:     'company.update',
      entityType: 'Company',
      entityId:   companyId,
      before,
      after:      dto,
    });

    return updated;
  }

  // ─── Branches ─────────────────────────────────────────────────────────────

  async getBranches(companyId: string) {
    return this.prisma.branch.findMany({
      where: { companyId, deletedAt: null },
      orderBy: { nameAr: 'asc' },
    });
  }

  async createBranch(
    companyId: string,
    dto: {
      code: string;
      nameAr: string;
      nameEn?: string;
      phone?: string;
      address?: string;
    },
    session: UserSession,
  ) {
    const branch = await this.prisma.branch.create({
      data: {
        ...dto,
        companyId,
        isActive:  true,
        createdBy: session.userId,
      },
    });

    await this.audit.log({
      companyId,
      userId:     session.userId,
      userEmail:  session.userId,
      action:     'branch.create',
      entityType: 'Branch',
      entityId:   branch.id,
      after:      dto,
    });

    return branch;
  }

  async updateBranch(
    branchId: string,
    companyId: string,
    dto: Partial<{ nameAr: string; nameEn: string; phone: string; address: string; isActive: boolean }>,
    session: UserSession,
  ) {
    // Ensure branch belongs to this company
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, companyId, deletedAt: null },
    });

    if (!branch) {
      throw new NotFoundException({ code: 'NOT_FOUND', messageAr: 'الفرع غير موجود' });
    }

    return this.prisma.branch.update({
      where: { id: branchId },
      data: { ...dto, updatedBy: session.userId },
    });
  }

  // ─── Roles ────────────────────────────────────────────────────────────────

  async getRoles(companyId: string) {
    return this.prisma.role.findMany({
      where: { companyId, deletedAt: null },
      orderBy: { name: 'asc' },
      select: {
        id:          true,
        name:        true,
        displayName: true,
        description: true,
        isSystem:    true,
        permissions: true,
        createdAt:   true,
      },
    });
  }

  async createRole(
    companyId: string,
    dto: {
      name: string;
      displayName: string;
      description?: string;
      permissions: Record<string, number>;
    },
    session: UserSession,
  ) {
    const role = await this.prisma.role.create({
      data: {
        ...dto,
        companyId,
        isSystem:  false,
        createdBy: session.userId,
      },
    });

    await this.audit.log({
      companyId,
      userId:     session.userId,
      userEmail:  session.userId,
      action:     'role.create',
      entityType: 'Role',
      entityId:   role.id,
      after:      { name: dto.name },
    });

    return role;
  }

  async updateRolePermissions(
    roleId: string,
    companyId: string,
    permissions: Record<string, number>,
    session: UserSession,
  ) {
    const role = await this.prisma.role.findFirst({
      where: { id: roleId, companyId, isSystem: false, deletedAt: null },
    });

    if (!role) {
      throw new NotFoundException({ code: 'NOT_FOUND', messageAr: 'الدور غير موجود أو لا يمكن تعديله' });
    }

    return this.prisma.role.update({
      where: { id: roleId },
      data: { permissions, updatedBy: session.userId },
    });
  }
}
