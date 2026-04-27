import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AuditService } from '../../../engines/audit/audit.service';
import type { UserSession } from '@erp/shared-types';
import { Prisma } from '@prisma/client';

// ─── Companies Service ─────────────────────────────────────────────────────────
// Manages the top-level Company entity and its Branches.
// Only SuperAdmin can create companies; CompanyAdmin manages their own company.
// Roles are a pure domain model — they have no soft-delete or audit trail columns
// of their own (audit is captured via the AuditService).

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
    // Prevent duplicate code within company
    const existing = await this.prisma.branch.findFirst({
      where: { companyId, code: dto.code, deletedAt: null },
    });
    if (existing) {
      throw new NotFoundException({
        code: 'CONFLICT',
        messageAr: `رمز الفرع "${dto.code}" مستخدم مسبقاً`,
      });
    }

    const branch = await this.prisma.branch.create({
      data: {
        companyId,
        code:       dto.code,
        nameAr:     dto.nameAr,
        nameEn:     dto.nameEn,
        phone:      dto.phone,
        address:    dto.address,
        isActive:   true,
        createdBy:  session.userId,
        updatedBy:  session.userId,
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

    const updated = await this.prisma.branch.update({
      where: { id: branchId },
      data: { ...dto, updatedBy: session.userId },
    });

    await this.audit.log({
      companyId,
      userId:     session.userId,
      userEmail:  session.userId,
      action:     'branch.update',
      entityType: 'Branch',
      entityId:   branchId,
      before:     branch,
      after:      dto,
    });

    return updated;
  }

  // ─── Roles ────────────────────────────────────────────────────────────────

  async getRoles(companyId: string) {
    return this.prisma.role.findMany({
      where: {
        OR: [{ companyId }, { companyId: null }],          // company roles + global system roles
      },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
      select: {
        id:             true,
        name:           true,
        displayNameAr:  true,
        displayNameEn:  true,
        isSystem:       true,
        permissions:    true,
        createdAt:      true,
        // T47 — expose hierarchy + temporal + SoD so the UI can render them.
        parentRoleId:   true,
        validFrom:      true,
        validUntil:     true,
        sodRules: {
          select: {
            id:                 true,
            conflictingActions: true,
            description:        true,
          },
        },
      },
    });
  }

  async createRole(
    companyId: string,
    dto: {
      name: string;
      displayNameAr: string;
      displayNameEn?: string;
      permissions: Prisma.InputJsonValue;
    },
    session: UserSession,
  ) {
    // Prevent collision with an existing role name in this company or globally
    const existing = await this.prisma.role.findFirst({
      where: { companyId, name: dto.name },
    });
    if (existing) {
      throw new NotFoundException({
        code: 'CONFLICT',
        messageAr: `اسم الدور "${dto.name}" مستخدم مسبقاً`,
      });
    }

    const role = await this.prisma.role.create({
      data: {
        companyId,
        name:           dto.name,
        displayNameAr:  dto.displayNameAr,
        displayNameEn:  dto.displayNameEn,
        isSystem:       false,
        permissions:    dto.permissions,
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
    permissions: Prisma.InputJsonValue,
    session: UserSession,
    extras?: {
      parentRoleId?: string | null;
      validFrom?: string | null;
      validUntil?: string | null;
      sodRules?: Array<{ conflictingActions: string[]; description?: string }>;
    },
  ) {
    // Only non-system, company-owned roles can be modified
    const role = await this.prisma.role.findFirst({
      where: { id: roleId, companyId, isSystem: false },
    });

    if (!role) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        messageAr: 'الدور غير موجود أو لا يمكن تعديله',
      });
    }

    // ── T47 — validate hierarchy + temporal extras ────────────────────────
    if (extras?.parentRoleId !== undefined && extras.parentRoleId !== null) {
      if (extras.parentRoleId === roleId) {
        throw new NotFoundException({
          code: 'INVALID_PARENT',
          messageAr: 'لا يمكن أن يكون الدور أباً لنفسه',
        });
      }
      const parent = await this.prisma.role.findFirst({
        where: {
          id: extras.parentRoleId,
          OR: [{ companyId }, { companyId: null }],
        },
      });
      if (!parent) {
        throw new NotFoundException({
          code: 'PARENT_NOT_FOUND',
          messageAr: 'الدور الأب غير موجود',
        });
      }
      // Reject obvious cycles up the proposed parent chain (depth ≤ 10).
      let cursor: string | null = parent.parentRoleId ?? null;
      let depth = 0;
      while (cursor && depth < 10) {
        if (cursor === roleId) {
          throw new NotFoundException({
            code: 'HIERARCHY_CYCLE',
            messageAr: 'ربط هذا الدور كأب يخلق دورة في تسلسل الأدوار',
          });
        }
        const next: { parentRoleId: string | null } | null =
          await this.prisma.role.findUnique({
            where: { id: cursor },
            select: { parentRoleId: true },
          });
        cursor = next?.parentRoleId ?? null;
        depth += 1;
      }
    }

    const validFrom = extras?.validFrom ? new Date(extras.validFrom) : extras?.validFrom === null ? null : undefined;
    const validUntil = extras?.validUntil ? new Date(extras.validUntil) : extras?.validUntil === null ? null : undefined;
    if (validFrom instanceof Date && Number.isNaN(validFrom.getTime())) {
      throw new NotFoundException({ code: 'INVALID_DATE', messageAr: 'تاريخ بدء غير صحيح' });
    }
    if (validUntil instanceof Date && Number.isNaN(validUntil.getTime())) {
      throw new NotFoundException({ code: 'INVALID_DATE', messageAr: 'تاريخ انتهاء غير صحيح' });
    }
    if (validFrom instanceof Date && validUntil instanceof Date && validFrom > validUntil) {
      throw new NotFoundException({
        code: 'INVALID_DATE_RANGE',
        messageAr: 'تاريخ البدء بعد تاريخ الانتهاء',
      });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.role.update({
        where: { id: roleId },
        data: {
          permissions,
          ...(extras?.parentRoleId !== undefined ? { parentRoleId: extras.parentRoleId } : {}),
          ...(validFrom !== undefined ? { validFrom } : {}),
          ...(validUntil !== undefined ? { validUntil } : {}),
        },
      });

      // Replace-all semantics for SoD rules — simplest correct behaviour for
      // a settings page. Future: per-rule add/remove if usage demands it.
      if (extras?.sodRules) {
        await tx.roleSeparationOfDuties.deleteMany({ where: { roleId } });
        for (const rule of extras.sodRules) {
          const actions = (rule.conflictingActions ?? [])
            .map((a) => String(a).trim())
            .filter((a) => a.length > 0);
          if (actions.length < 2) continue;
          await tx.roleSeparationOfDuties.create({
            data: {
              roleId,
              conflictingActions: actions,
              description: rule.description ?? null,
            },
          });
        }
      }

      return u;
    });

    await this.audit.log({
      companyId,
      userId:     session.userId,
      userEmail:  session.userId,
      action:     'role.update_permissions',
      entityType: 'Role',
      entityId:   roleId,
      before:     { permissions: role.permissions },
      after:      {
        permissions,
        parentRoleId: extras?.parentRoleId,
        validFrom:    extras?.validFrom,
        validUntil:   extras?.validUntil,
        sodRulesCount: extras?.sodRules?.length ?? 0,
      },
    });

    return updated;
  }
}
