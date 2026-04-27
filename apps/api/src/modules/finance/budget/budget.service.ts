import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AuditService } from '../../../engines/audit/audit.service';
import type { UserSession } from '@erp/shared-types';

/**
 * T49 — Budget Module
 *
 * Stores per-(account, cost-center, month) budget figures for a fiscal year.
 * Budgets are read-only against accounting data: they NEVER post journal
 * entries. Compare actuals via {@link VarianceService}.
 *
 * Lifecycle: draft → active → closed.
 *   - draft : freely editable
 *   - active: read-only; only one active budget per (company, fiscalYear)
 *   - closed: read-only, archived
 */

export interface BudgetLineInput {
  accountCode: string;
  costCenterId?: string | null;
  period: number; // 1..12
  amount: number | string;
}

export interface CreateBudgetDto {
  name: string;
  fiscalYear: number;
  lines?: BudgetLineInput[];
}

export interface UpdateBudgetDto {
  name?: string;
  lines?: BudgetLineInput[]; // full replace when provided (draft only)
}

@Injectable()
export class BudgetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** List budgets for the current company. Optional filter by year/status. */
  async list(
    companyId: string,
    opts: { fiscalYear?: number; status?: string } = {},
  ) {
    return this.prisma.budget.findMany({
      where: {
        companyId,
        ...(opts.fiscalYear ? { fiscalYear: opts.fiscalYear } : {}),
        ...(opts.status ? { status: opts.status } : {}),
      },
      orderBy: [{ fiscalYear: 'desc' }, { createdAt: 'desc' }],
      include: {
        _count: { select: { lines: true } },
      },
    });
  }

  /** Get a single budget with its lines, or 404. */
  async get(id: string, companyId: string) {
    const budget = await this.prisma.budget.findFirst({
      where: { id, companyId },
      include: { lines: { orderBy: [{ accountCode: 'asc' }, { period: 'asc' }] } },
    });
    if (!budget) {
      throw new NotFoundException({
        code: 'BUDGET_NOT_FOUND',
        messageAr: 'الموازنة غير موجودة',
      });
    }
    return budget;
  }

  /**
   * Create a budget header with optional initial lines. Validates each line's
   * accountCode against the company chart of accounts and ensures the fiscal
   * year has at least one accounting period configured.
   */
  async create(dto: CreateBudgetDto, session: UserSession) {
    if (!dto.name?.trim()) {
      throw new BadRequestException({
        code: 'INVALID_NAME',
        messageAr: 'اسم الموازنة مطلوب',
      });
    }
    if (!Number.isInteger(dto.fiscalYear) || dto.fiscalYear < 2000 || dto.fiscalYear > 2100) {
      throw new BadRequestException({
        code: 'INVALID_FISCAL_YEAR',
        messageAr: 'السنة المالية غير صالحة',
      });
    }

    const periodExists = await this.prisma.accountingPeriod.findFirst({
      where: { companyId: session.companyId, year: dto.fiscalYear },
      select: { id: true },
    });
    if (!periodExists) {
      throw new BadRequestException({
        code: 'NO_PERIODS_FOR_YEAR',
        messageAr: `لا توجد فترات محاسبية للسنة ${dto.fiscalYear}`,
      });
    }

    if (dto.lines?.length) {
      await this.validateLines(session.companyId, dto.lines);
    }

    const budget = await this.prisma.$transaction(async (tx) => {
      const b = await tx.budget.create({
        data: {
          companyId: session.companyId,
          name: dto.name.trim(),
          fiscalYear: dto.fiscalYear,
          status: 'draft',
          createdBy: session.userId,
        },
      });
      if (dto.lines?.length) {
        await tx.budgetLine.createMany({
          data: dto.lines.map((l) => ({
            budgetId: b.id,
            accountCode: l.accountCode,
            costCenterId: l.costCenterId ?? null,
            period: l.period,
            amount: new Prisma.Decimal(l.amount),
          })),
        });
      }
      return b;
    });

    await this.audit.log({
      companyId: session.companyId,
      userId: session.userId,
      entity: 'Budget',
      entityId: budget.id,
      action: 'create',
      after: { name: budget.name, fiscalYear: budget.fiscalYear },
    });

    return this.get(budget.id, session.companyId);
  }

  /**
   * Update a budget. Only allowed in `draft` status. When `lines` is provided
   * it fully replaces existing lines (clean editor semantics).
   */
  async update(id: string, dto: UpdateBudgetDto, session: UserSession) {
    const existing = await this.get(id, session.companyId);
    if (existing.status !== 'draft') {
      throw new BadRequestException({
        code: 'BUDGET_NOT_DRAFT',
        messageAr: 'لا يمكن تعديل الموازنة بعد التفعيل',
      });
    }
    if (dto.lines) {
      await this.validateLines(session.companyId, dto.lines);
    }

    await this.prisma.$transaction(async (tx) => {
      if (dto.name) {
        await tx.budget.update({ where: { id }, data: { name: dto.name.trim() } });
      }
      if (dto.lines) {
        await tx.budgetLine.deleteMany({ where: { budgetId: id } });
        if (dto.lines.length) {
          await tx.budgetLine.createMany({
            data: dto.lines.map((l) => ({
              budgetId: id,
              accountCode: l.accountCode,
              costCenterId: l.costCenterId ?? null,
              period: l.period,
              amount: new Prisma.Decimal(l.amount),
            })),
          });
        }
      }
    });

    await this.audit.log({
      companyId: session.companyId,
      userId: session.userId,
      entity: 'Budget',
      entityId: id,
      action: 'update',
    });

    return this.get(id, session.companyId);
  }

  /**
   * Activate a budget. Enforces single-active per (company, fiscalYear) — any
   * other active budget for the same year is automatically demoted to closed.
   */
  async activate(id: string, session: UserSession) {
    const b = await this.get(id, session.companyId);
    if (b.status === 'active') return b;
    if (b.status !== 'draft') {
      throw new BadRequestException({
        code: 'CANNOT_ACTIVATE_CLOSED',
        messageAr: 'لا يمكن تفعيل موازنة مغلقة',
      });
    }
    if (b.lines.length === 0) {
      throw new BadRequestException({
        code: 'BUDGET_EMPTY',
        messageAr: 'لا يمكن تفعيل موازنة بدون بنود',
      });
    }

    await this.prisma.$transaction(async (tx) => {
      const otherActive = await tx.budget.findFirst({
        where: {
          companyId: session.companyId,
          fiscalYear: b.fiscalYear,
          status: 'active',
          id: { not: id },
        },
        select: { id: true },
      });
      if (otherActive) {
        // Auto-close the previously active budget so the partial unique index
        // (one active per year) does not collide.
        await tx.budget.update({
          where: { id: otherActive.id },
          data: { status: 'closed' },
        });
      }
      await tx.budget.update({ where: { id }, data: { status: 'active' } });
    });

    await this.audit.log({
      companyId: session.companyId,
      userId: session.userId,
      entity: 'Budget',
      entityId: id,
      action: 'activate',
    });
    return this.get(id, session.companyId);
  }

  /** Close a budget. Active or draft → closed. Irreversible. */
  async close(id: string, session: UserSession) {
    const b = await this.get(id, session.companyId);
    if (b.status === 'closed') return b;
    await this.prisma.budget.update({ where: { id }, data: { status: 'closed' } });
    await this.audit.log({
      companyId: session.companyId,
      userId: session.userId,
      entity: 'Budget',
      entityId: id,
      action: 'close',
    });
    return this.get(id, session.companyId);
  }

  // ─── helpers ─────────────────────────────────────────────────────────────

  /**
   * Validate that every line refers to an existing, postable account in the
   * company CoA, and a valid cost center if specified, and a sane period.
   */
  private async validateLines(companyId: string, lines: BudgetLineInput[]) {
    if (lines.some((l) => !Number.isInteger(l.period) || l.period < 1 || l.period > 12)) {
      throw new BadRequestException({
        code: 'INVALID_PERIOD',
        messageAr: 'الشهر يجب أن يكون بين 1 و 12',
      });
    }
    const codes = Array.from(new Set(lines.map((l) => l.accountCode)));
    const accounts = await this.prisma.chartOfAccount.findMany({
      where: { companyId, code: { in: codes }, isActive: true },
      select: { code: true },
    });
    const known = new Set(accounts.map((a) => a.code));
    const missing = codes.filter((c) => !known.has(c));
    if (missing.length) {
      throw new BadRequestException({
        code: 'UNKNOWN_ACCOUNTS',
        messageAr: `حسابات غير معروفة: ${missing.join(', ')}`,
      });
    }
    const ccIds = Array.from(
      new Set(lines.map((l) => l.costCenterId).filter((x): x is string => !!x)),
    );
    if (ccIds.length) {
      const ccs = await this.prisma.costCenter.findMany({
        where: { companyId, id: { in: ccIds }, isActive: true },
        select: { id: true },
      });
      const knownCc = new Set(ccs.map((c) => c.id));
      const missingCc = ccIds.filter((c) => !knownCc.has(c));
      if (missingCc.length) {
        throw new BadRequestException({
          code: 'UNKNOWN_COST_CENTERS',
          messageAr: `مراكز تكلفة غير معروفة: ${missingCc.join(', ')}`,
        });
      }
    }
  }
}
