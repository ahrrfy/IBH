import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AuthService } from '../../../engines/auth/auth.service';
import { AuditService } from '../../../engines/audit/audit.service';
import type { UserSession } from '@erp/shared-types';
import type { CreateUserInput } from '@erp/validation-schemas';
import { Prisma, UserStatus } from '@prisma/client';

// ─── Users Service ─────────────────────────────────────────────────────────────
// Creates, updates, and queries system users.
// All passwords hashed via AuthService.hashPassword (Argon2id).
// Enforces company-scoping via companyId on every query.

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
  ) {}

  // ─── Create ───────────────────────────────────────────────────────────────

  async create(
    dto: CreateUserInput,
    companyId: string,
    session: UserSession,
  ) {
    // Check uniqueness within company
    const existing = await this.prisma.user.findFirst({
      where: { email: dto.email.toLowerCase(), companyId, deletedAt: null },
    });

    if (existing) {
      throw new ConflictException({
        code: 'CONFLICT',
        messageAr: 'البريد الإلكتروني مستخدم مسبقاً في هذه الشركة',
      });
    }

    // Validate roles exist (scoped to company OR global system roles)
    const roles = await this.prisma.role.findMany({
      where: {
        id: { in: dto.roles },
        OR: [{ companyId }, { companyId: null }],
      },
    });

    if (roles.length !== dto.roles.length) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        messageAr: 'أحد الأدوار المحددة غير موجود',
      });
    }

    const passwordHash = await this.auth.hashPassword(dto.password);

    const user = await this.prisma.user.create({
      data: {
        email:        dto.email.toLowerCase(),
        nameAr:       dto.nameAr,
        nameEn:       dto.nameEn,
        passwordHash,
        companyId,
        branchId:     dto.branchId ?? null,
        status:       UserStatus.active,
        createdBy:    session.userId,
        updatedBy:    session.userId,
        userRoles: {
          create: roles.map((r) => ({
            roleId:     r.id,
            assignedBy: session.userId,
          })),
        },
      },
      select: this.safeSelect(),
    });

    await this.audit.log({
      companyId,
      userId:     session.userId,
      userEmail:  session.userId,
      action:     'user.create',
      entityType: 'User',
      entityId:   user.id,
      after:      { email: user.email, nameAr: user.nameAr },
    });

    return user;
  }

  // ─── Read ─────────────────────────────────────────────────────────────────

  async findAll(companyId: string, params: {
    page?: number;
    limit?: number;
    search?: string;
    branchId?: string;
    isActive?: boolean;
  } = {}) {
    const { page = 1, limit = 20, search, branchId, isActive } = params;

    const where: Prisma.UserWhereInput = {
      companyId,
      deletedAt: null,
      ...(search ? {
        OR: [
          { email:  { contains: search, mode: Prisma.QueryMode.insensitive } },
          { nameAr: { contains: search } },
          { nameEn: { contains: search, mode: Prisma.QueryMode.insensitive } },
        ],
      } : {}),
      ...(branchId ? { branchId } : {}),
      ...(isActive !== undefined
        ? { status: isActive ? UserStatus.active : UserStatus.inactive }
        : {}),
    };

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: this.safeSelect(),
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      items: users,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string, companyId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, companyId, deletedAt: null },
      select: {
        ...this.safeSelect(),
        userRoles: {
          include: {
            role: {
              select: {
                id:            true,
                name:          true,
                displayNameAr: true,
                displayNameEn: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException({ code: 'NOT_FOUND', messageAr: 'المستخدم غير موجود' });
    }

    return user;
  }

  // ─── Update ───────────────────────────────────────────────────────────────

  async update(
    id: string,
    companyId: string,
    dto: Partial<{ nameAr: string; nameEn: string; branchId: string; status: UserStatus }>,
    session: UserSession,
  ) {
    const user = await this.prisma.user.findFirst({
      where: { id, companyId, deletedAt: null },
      select: { id: true, nameAr: true, nameEn: true, status: true },
    });

    if (!user) {
      throw new NotFoundException({ code: 'NOT_FOUND', messageAr: 'المستخدم غير موجود' });
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: { ...dto, updatedBy: session.userId },
      select: this.safeSelect(),
    });

    await this.audit.log({
      companyId,
      userId:     session.userId,
      userEmail:  session.userId,
      action:     'user.update',
      entityType: 'User',
      entityId:   id,
      before:     user,
      after:      dto,
    });

    return updated;
  }

  // ─── Soft Delete ──────────────────────────────────────────────────────────

  async softDelete(id: string, companyId: string, session: UserSession) {
    const user = await this.prisma.user.findFirst({
      where: { id, companyId, deletedAt: null },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException({ code: 'NOT_FOUND', messageAr: 'المستخدم غير موجود' });
    }

    // Prevent self-deletion
    if (id === session.userId) {
      throw new ConflictException({
        code: 'CONFLICT',
        messageAr: 'لا يمكن حذف حسابك الخاص',
      });
    }

    await this.prisma.user.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedBy: session.userId,
        status:    UserStatus.inactive,
        updatedBy: session.userId,
      },
    });

    await this.audit.log({
      companyId,
      userId:     session.userId,
      userEmail:  session.userId,
      action:     'user.delete',
      entityType: 'User',
      entityId:   id,
    });
  }

  // ─── Roles ────────────────────────────────────────────────────────────────
  // UserRole is a pure join table (no isActive) — assignment/revocation
  // is done by inserting/deleting rows atomically.

  async assignRoles(
    userId: string,
    companyId: string,
    roleIds: string[],
    session: UserSession,
  ) {
    await this.prisma.user.findFirstOrThrow({
      where: { id: userId, companyId, deletedAt: null },
    });

    // Validate roles exist (company-scoped OR global)
    const roles = await this.prisma.role.findMany({
      where: {
        id: { in: roleIds },
        OR: [{ companyId }, { companyId: null }],
      },
      select: { id: true },
    });
    if (roles.length !== roleIds.length) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        messageAr: 'أحد الأدوار المحددة غير موجود',
      });
    }

    await this.prisma.$transaction([
      // Remove all current role assignments
      this.prisma.userRole.deleteMany({ where: { userId } }),
      // Re-insert the new set
      this.prisma.userRole.createMany({
        data: roleIds.map((roleId) => ({
          userId,
          roleId,
          assignedBy: session.userId,
        })),
        skipDuplicates: true,
      }),
    ]);

    await this.audit.log({
      companyId,
      userId:     session.userId,
      userEmail:  session.userId,
      action:     'user.assign_roles',
      entityType: 'User',
      entityId:   userId,
      after:      { roleIds },
    });
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /** Never return passwordHash to API consumers */
  private safeSelect() {
    return {
      id:               true,
      email:            true,
      nameAr:           true,
      nameEn:           true,
      status:           true,
      companyId:        true,
      branchId:         true,
      avatarUrl:        true,
      locale:           true,
      requires2FA:      true,
      lastLoginAt:      true,
      lastLoginIp:      true,
      failedLoginCount: true,
      createdAt:        true,
      updatedAt:        true,
    } satisfies Prisma.UserSelect;
  }
}
